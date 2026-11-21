// Polpo — codifica/decodifica dei protocolli infrarossi.
// Tempi e disposizione dei bit seguono le specifiche pubbliche dei protocolli
// (NEC, Samsung, Philips RC5/RC6, Sony SIRC, Kaseikyo/Panasonic, RCA, Pioneer),
// con lo stesso significato dei campi address/command dei file .ir.
#pragma once

#include <cstdint>
#include <vector>

#include "polpo/ir/ir_signal.h"

namespace polpo {

// Converte un segnale (parsed o raw) nei tempi da trasmettere, ripetizioni minime incluse.
// `toggle` serve a RC5/RC6 (va alternato a ogni nuova pressione).
bool ir_encode(const IrSignal& sig, IrTimings& out, bool toggle = false);

// Prova a riconoscere un protocollo dai tempi catturati (impulso/pausa alternati,
// primo elemento = impulso). Se ci riesce riempie protocol/address/command.
// Riconosce: NEC, NECext, NEC42, NEC42ext, Samsung32, SIRC/15/20, Kaseikyo, RCA, Pioneer.
bool ir_decode(const std::vector<uint32_t>& durations, IrSignal& out);

// Durata totale in µs dei tempi.
uint64_t ir_total_us(const std::vector<uint32_t>& durations);

// Divide le durate lunghe per un periferico che accetta al massimo `max_ticks` per voce
// (es. RMT dell'ESP32: 32767). Restituisce coppie (livello, durata).
struct IrLevelDuration {
    bool mark;
    uint16_t us;
};
std::vector<IrLevelDuration> ir_split_for_rmt(const std::vector<uint32_t>& durations, uint16_t max_ticks = 32767);

}  // namespace polpo
