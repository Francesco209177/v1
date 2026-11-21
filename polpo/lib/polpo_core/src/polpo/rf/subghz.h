// Polpo — segnali radio a 433,92 MHz: file .sub (sottoinsieme del formato pubblico
// "Flipper SubGhz Key/RAW File") e analisi degli impulsi.
#pragma once

#include <cstdint>
#include <string>
#include <vector>

namespace polpo {

constexpr uint32_t kRfFrequencyHz = 433920000;  // unica frequenza dei moduli RF433T/R
constexpr size_t kSubRawMaxPerLine = 512;
constexpr size_t kSubRawMaxTimings = 4096;

// Codice fisso decodificato dalla libreria rc-switch.
struct RcCode {
    uint8_t protocol = 1;    // numero di protocollo rc-switch (1 = PT2262/EV1527 "Princeton")
    uint16_t pulse_us = 350; // durata dell'impulso base (TE)
    uint8_t bits = 24;
    uint64_t value = 0;
};

struct SubFile {
    uint32_t frequency = kRfFrequencyHz;
    std::string preset = "FuriHalSubGhzPresetOok650Async";
    bool raw = false;
    RcCode code;                     // se !raw
    std::vector<int32_t> raw_timings;  // se raw: µs, positivo = portante, negativo = pausa
};

std::string sub_serialize(const SubFile& f);
bool sub_parse(const std::string& text, SubFile& out, std::string& err);

// RAW valido: valori non nulli, inizia positivo, segni alternati.
bool sub_raw_valid(const std::vector<int32_t>& t);

struct PulseStats {
    size_t count = 0;     // impulsi considerati (50 µs - 20 ms)
    uint32_t min_us = 0, max_us = 0;
    uint32_t short_us = 0;  // centro del gruppo più corto (TE stimato)
    uint32_t long_us = 0;   // centro del secondo gruppo
    float ratio = 0.0f;     // long/short (es. 3.0 per PT2262)
    uint8_t clusters = 0;
};

// Analizza durate (segno ignorato) raggruppandole per lunghezza simile.
PulseStats pulse_analyze(const std::vector<int32_t>& timings);

// Tempo in aria (µs) di un codice rc-switch ripetuto `repeats` volte, calcolato dalla tabella
// dei protocolli della libreria (sincronismo + bit più lungo). 0 se il protocollo non esiste.
uint64_t rcswitch_airtime_us(const RcCode& code, uint8_t repeats);
constexpr uint8_t kRcSwitchProtocols = 12;
constexpr uint8_t kRcMaxBits = 32;  // rc-switch invia al massimo 32 bit

// Durata totale (µs) e frazione di tempo con portante accesa: servono per il limite di duty-cycle.
uint64_t rf_total_us(const std::vector<int32_t>& t);
uint64_t rf_on_us(const std::vector<int32_t>& t);

// Budget di trasmissione: max `fraction` del tempo in una finestra scorrevole di `window_ms`.
class TxBudget {
public:
    TxBudget(uint32_t window_ms = 3600000, float fraction = 0.08f) : window_ms_(window_ms), fraction_(fraction) {}
    // true se si può trasmettere `on_ms` adesso (now_ms monotono); se sì, lo registra.
    bool try_consume(uint32_t now_ms, uint32_t on_ms);
    uint32_t used_ms(uint32_t now_ms);
    uint32_t limit_ms() const { return static_cast<uint32_t>(window_ms_ * fraction_); }
    // Dopo un riavvio: il tempo già usato (salvato) si considera consumato all'istante `now_ms`.
    void preload(uint32_t now_ms, uint32_t used_ms) {
        if (used_ms) log_.push_back({now_ms, used_ms});
    }

private:
    struct Entry {
        uint32_t t, ms;
    };
    void expire(uint32_t now_ms);
    uint32_t window_ms_;
    float fraction_;
    std::vector<Entry> log_;
};

}  // namespace polpo
