// Polpo — infrarossi: trasmissione dal LED integrato (G44) con la periferica RMT
// (portante e duty cycle esatti) e ricezione dalla IR Unit sulla porta Grove.
#pragma once

#include <cstdint>
#include <vector>

#include "polpo/ir/ir_signal.h"

namespace ir {

bool tx_begin();
void tx_end();
bool send(const polpo::IrTimings& t);
bool send(const polpo::IrSignal& s);  // codifica + invio (con il bit toggle alternato per RC5/RC6)

// Ricezione (serve la IR Unit collegata alla porta Grove).
bool rx_begin();
void rx_end();
// Avvia l'ascolto; poi rx_poll() restituisce true quando un segnale è completo.
bool rx_start();
bool rx_poll(std::vector<uint32_t>& durations);

}  // namespace ir
