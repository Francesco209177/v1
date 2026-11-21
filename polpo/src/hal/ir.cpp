#include "hal/ir.h"

#include <Arduino.h>

#include "board_pins.h"
#include "hal/grove.h"
#include "polpo/ir/ir_codec.h"

namespace ir {
namespace {

bool tx_ready = false;
bool rx_ready = false;
bool toggle = false;
uint32_t current_freq = 0;
float current_duty = 0.0f;

constexpr size_t kRxSymbols = RMT_SYMBOLS_PER_CHANNEL_BLOCK * 4;  // 4 blocchi = 192 simboli
rmt_data_t rx_buf[kRxSymbols];
size_t rx_count = kRxSymbols;
bool rx_listening = false;

}  // namespace

bool tx_begin() {
    if (tx_ready) return true;
    tx_ready = rmtInit(pins::kIrTx, RMT_TX_MODE, RMT_MEM_NUM_BLOCKS_1, 1000000);  // 1 tick = 1 µs
    if (tx_ready) rmtSetEOT(pins::kIrTx, 0);
    current_freq = 0;
    return tx_ready;
}

void tx_end() {
    if (!tx_ready) return;
    rmtDeinit(pins::kIrTx);
    pinMode(pins::kIrTx, OUTPUT);
    digitalWrite(pins::kIrTx, LOW);
    tx_ready = false;
}

bool send(const polpo::IrTimings& t) {
    if (!tx_begin() || t.durations.empty()) return false;
    if (t.frequency != current_freq || t.duty != current_duty) {
        // carrier_level=false: la portante modula il livello alto (gli impulsi), non le pause.
        if (!rmtSetCarrier(pins::kIrTx, true, false, t.frequency, t.duty)) return false;
        current_freq = t.frequency;
        current_duty = t.duty;
    }
    const auto parts = polpo::ir_split_for_rmt(t.durations);
    std::vector<rmt_data_t> sym((parts.size() + 1) / 2);
    for (size_t i = 0; i < parts.size(); i += 2) {
        rmt_data_t d;
        d.val = 0;
        d.level0 = parts[i].mark ? 1 : 0;
        d.duration0 = parts[i].us;
        if (i + 1 < parts.size()) {
            d.level1 = parts[i + 1].mark ? 1 : 0;
            d.duration1 = parts[i + 1].us;
        } else {
            d.level1 = 0;
            d.duration1 = 1;
        }
        sym[i / 2] = d;
    }
    const uint32_t timeout = static_cast<uint32_t>(polpo::ir_total_us(t.durations) / 1000) + 200;
    return rmtWrite(pins::kIrTx, sym.data(), sym.size(), timeout);
}

bool send(const polpo::IrSignal& s) {
    polpo::IrTimings t;
    if (!polpo::ir_encode(s, t, toggle)) return false;
    toggle = !toggle;
    return send(t);
}

bool rx_begin() {
    if (rx_ready) return true;
    grove::use_gpio();
    rx_ready = rmtInit(pins::kIrUnitRx, RMT_RX_MODE, RMT_MEM_NUM_BLOCKS_4, 1000000);
    if (!rx_ready) return false;
    rmtSetRxMaxThreshold(pins::kIrUnitRx, 15000);  // 15 ms di silenzio = fine del segnale
    rmtSetRxMinThreshold(pins::kIrUnitRx, 3);
    return true;
}

void rx_end() {
    if (!rx_ready) return;
    rmtDeinit(pins::kIrUnitRx);
    rx_ready = false;
    rx_listening = false;
    grove::release();
}

bool rx_start() {
    if (!rx_begin()) return false;
    rx_count = kRxSymbols;
    rx_listening = rmtReadAsync(pins::kIrUnitRx, rx_buf, &rx_count);
    return rx_listening;
}

bool rx_poll(std::vector<uint32_t>& out) {
    if (!rx_listening || !rmtReceiveCompleted(pins::kIrUnitRx)) return false;
    rx_listening = false;
    out.clear();
    // Il ricevitore della IR Unit è attivo basso: livello 0 = portante presente (impulso).
    bool started = false;
    for (size_t i = 0; i < rx_count; ++i) {
        const uint32_t dur[2] = {rx_buf[i].duration0, rx_buf[i].duration1};
        const bool mark[2] = {rx_buf[i].level0 == 0, rx_buf[i].level1 == 0};
        for (int k = 0; k < 2; ++k) {
            if (dur[k] == 0) goto done;
            if (!started) {
                if (!mark[k]) continue;
                started = true;
            }
            const bool expect_mark = (out.size() % 2) == 0;
            if (mark[k] == expect_mark) {
                out.push_back(dur[k]);
            } else if (!out.empty()) {
                out.back() += dur[k];
            }
        }
    }
done:
    if (!out.empty() && out.size() % 2 == 0) out.pop_back();  // pausa finale inutile
    // Segnali troppo corti sono quasi sempre disturbi.
    return out.size() >= 7;
}

}  // namespace ir
