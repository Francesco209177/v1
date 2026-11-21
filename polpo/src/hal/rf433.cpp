#include "hal/rf433.h"

#include <Arduino.h>
#include <Preferences.h>
#include <RCSwitch.h>
#include <soc/gpio_reg.h>

#include <cstdlib>

#include "board_pins.h"
#include "hal/grove.h"

namespace rf433 {
namespace {

RCSwitch rcs;
bool rx_on = false;
bool tx_on = false;
bool raw_on = false;
polpo::TxBudget budget(3600000, 0.08f);
bool budget_loaded = false;

// Il tempo di trasmissione usato viene salvato: dopo un riavvio conta ancora per un'ora.
void budget_load() {
    if (budget_loaded) return;
    budget_loaded = true;
    Preferences p;
    p.begin("polpo_rf", true);
    const uint32_t used = p.getUInt("used", 0);
    p.end();
    budget.preload(millis(), used);
}

bool budget_take(uint32_t ms) {
    budget_load();
    if (!budget.try_consume(millis(), ms)) return false;
    Preferences p;
    p.begin("polpo_rf", false);
    p.putUInt("used", budget.used_ms(millis()));
    p.end();
    return true;
}

// Buffer circolare dei fronti per la registrazione RAW (scritto da interrupt).
constexpr size_t kRing = 2048;
volatile int32_t ring[kRing];
volatile uint32_t ring_head = 0;
volatile uint32_t edges = 0;
volatile uint32_t last_edge_us = 0;

void IRAM_ATTR on_edge() {
    const uint32_t now = micros();
    const uint32_t dt = now - last_edge_us;
    last_edge_us = now;
    // Il livello è già cambiato: la durata appena finita apparteneva al livello opposto.
    // Lettura diretta del registro (G1 < 32): sicura dentro un interrupt in IRAM.
    const bool was_high = ((REG_READ(GPIO_IN_REG) >> pins::kRf433Rx) & 1u) == 0;
    const int32_t v = static_cast<int32_t>(dt > 1000000 ? 1000000 : dt);
    ring[ring_head % kRing] = was_high ? v : -v;
    ring_head = ring_head + 1;
    edges = edges + 1;
}

bool tx_ready() {
    // Sempre riconfigurato: un'altra app può aver rimesso il pin G2 in ingresso (porta Grove condivisa).
    grove::use_gpio();
    pinMode(pins::kRf433Tx, OUTPUT);
    digitalWrite(pins::kRf433Tx, LOW);
    rcs.enableTransmit(pins::kRf433Tx);
    tx_on = true;
    return true;
}

}  // namespace

bool rx_begin() {
    if (rx_on) return true;
    raw_end();
    grove::use_gpio();
    pinMode(pins::kRf433Rx, INPUT);
    rcs.enableReceive(digitalPinToInterrupt(pins::kRf433Rx));
    rx_on = true;
    return true;
}

void rx_end() {
    if (!rx_on) return;
    rcs.disableReceive();
    rx_on = false;
}

bool rx_poll(polpo::RcCode& out) {
    if (!rx_on || !rcs.available()) return false;
    out.value = rcs.getReceivedValue();
    out.bits = static_cast<uint8_t>(rcs.getReceivedBitlength());
    out.pulse_us = static_cast<uint16_t>(rcs.getReceivedDelay());
    out.protocol = static_cast<uint8_t>(rcs.getReceivedProtocol());
    rcs.resetAvailable();
    return out.bits > 0 && out.value != 0;
}

bool raw_begin() {
    if (raw_on) return true;
    rx_end();
    grove::use_gpio();
    pinMode(pins::kRf433Rx, INPUT);
    ring_head = 0;
    last_edge_us = micros();
    attachInterrupt(digitalPinToInterrupt(pins::kRf433Rx), on_edge, CHANGE);
    raw_on = true;
    return true;
}

void raw_end() {
    if (!raw_on) return;
    detachInterrupt(digitalPinToInterrupt(pins::kRf433Rx));
    raw_on = false;
}

uint32_t raw_edge_count() { return edges; }

size_t raw_snapshot(std::vector<int32_t>& out, size_t max) {
    out.clear();
    // Memoria allocata prima di sospendere gli interrupt.
    std::vector<int32_t> tmp(max < kRing ? max : kRing);
    noInterrupts();
    const uint32_t head = ring_head;
    const size_t n = head < kRing ? head : kRing;
    const size_t take = n < tmp.size() ? n : tmp.size();
    for (size_t i = 0; i < take; ++i) tmp[i] = ring[(head - take + i) % kRing];
    interrupts();
    tmp.resize(take);
    // Si parte dal primo impulso positivo e si fondono valori consecutivi dello stesso segno.
    for (int32_t v : tmp) {
        if (out.empty()) {
            if (v > 0) out.push_back(v);
            continue;
        }
        if ((v > 0) == (out.back() > 0)) {
            out.back() += v;
        } else {
            out.push_back(v);
        }
    }
    return out.size();
}

TxResult send_code(const polpo::RcCode& code, uint8_t repeats) {
    if (code.protocol < 1 || code.protocol > polpo::kRcSwitchProtocols || code.bits == 0 ||
        code.bits > polpo::kRcMaxBits)
        return {false, "codice non valido (protocollo 1-12, massimo 32 bit)"};
    // Durata reale in aria calcolata dalla tabella dei protocolli di rc-switch.
    const uint64_t us = polpo::rcswitch_airtime_us(code, repeats);
    if (us == 0) return {false, "codice non valido"};
    if (us > 2000000ull) return {false, "trasmissione troppo lunga (max 2 s): riduci le ripetizioni"};
    const uint32_t ms = static_cast<uint32_t>(us / 1000) + 1;
    if (!budget_take(ms)) return {false, "limite orario di trasmissione raggiunto: riprova più tardi"};
    rx_end();
    raw_end();
    tx_ready();
    rcs.setProtocol(code.protocol);
    rcs.setPulseLength(code.pulse_us);
    rcs.setRepeatTransmit(repeats);
    rcs.send(static_cast<unsigned long>(code.value), code.bits);
    digitalWrite(pins::kRf433Tx, LOW);
    return {true, nullptr};
}

TxResult send_raw(const std::vector<int32_t>& t, uint8_t repeats) {
    if (!polpo::sub_raw_valid(t)) return {false, "dati RAW non validi"};
    const uint64_t once_us = polpo::rf_total_us(t);
    const uint64_t total_us = once_us * repeats;
    if (total_us > 2000000ull) return {false, "trasmissione troppo lunga (max 2 s)"};
    const uint32_t ms = static_cast<uint32_t>(total_us / 1000) + 1;
    if (!budget_take(ms)) return {false, "limite orario di trasmissione raggiunto: riprova più tardi"};
    rx_end();
    raw_end();
    grove::use_gpio();
    // Temporizzazione hardware con la periferica RMT (nessuna portante: modulazione OOK diretta).
    if (tx_on) {
        rcs.disableTransmit();
        tx_on = false;
    }
    if (!rmtInit(pins::kRf433Tx, RMT_TX_MODE, RMT_MEM_NUM_BLOCKS_1, 1000000)) return {false, "RMT non disponibile"};
    rmtSetEOT(pins::kRf433Tx, 0);
    std::vector<rmt_data_t> sym;
    sym.reserve(t.size() / 2 + 8);
    // Ogni durata può superare il massimo di 32767 µs per simbolo: si spezza.
    std::vector<std::pair<bool, uint16_t>> parts;
    for (int32_t v : t) {
        uint32_t left = static_cast<uint32_t>(std::abs(static_cast<long>(v)));
        while (left) {
            const uint16_t chunk = left > 32767 ? 32767 : static_cast<uint16_t>(left);
            parts.push_back({v > 0, chunk});
            left -= chunk;
        }
    }
    for (size_t i = 0; i < parts.size(); i += 2) {
        rmt_data_t d;
        d.val = 0;
        d.level0 = parts[i].first;
        d.duration0 = parts[i].second;
        d.level1 = i + 1 < parts.size() ? parts[i + 1].first : 0;
        d.duration1 = i + 1 < parts.size() ? parts[i + 1].second : 1;
        sym.push_back(d);
    }
    bool ok = true;
    for (uint8_t r = 0; r < repeats && ok; ++r) {
        ok = rmtWrite(pins::kRf433Tx, sym.data(), sym.size(), static_cast<uint32_t>(once_us / 1000) + 100);
        delay(10);
    }
    rmtDeinit(pins::kRf433Tx);
    pinMode(pins::kRf433Tx, OUTPUT);
    digitalWrite(pins::kRf433Tx, LOW);
    return ok ? TxResult{true, nullptr} : TxResult{false, "errore di trasmissione"};
}

uint32_t budget_used_ms() {
    budget_load();
    return budget.used_ms(millis());
}
uint32_t budget_limit_ms() { return budget.limit_ms(); }

}  // namespace rf433
