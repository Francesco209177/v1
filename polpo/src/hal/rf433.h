// Polpo — moduli M5Stack RF433R (ricevitore, G1) e RF433T (trasmettitore, G2).
// Solo 433,92 MHz OOK, solo codici fissi o registrazioni RAW di dispositivi propri.
#pragma once

#include <cstdint>
#include <vector>

#include "polpo/rf/subghz.h"

namespace rf433 {

// --- ricezione decodificata (rc-switch) ---
bool rx_begin();
void rx_end();
bool rx_poll(polpo::RcCode& out);

// --- registrazione RAW (interrupt sui fronti) ---
bool raw_begin();
void raw_end();
// Copia gli ultimi fronti registrati (µs, positivo = portante accesa).
size_t raw_snapshot(std::vector<int32_t>& out, size_t max = 1024);
uint32_t raw_edge_count();  // fronti totali dall'avvio (per il contatore della diagnostica)

// --- trasmissione ---
struct TxResult {
    bool ok;
    const char* error;  // nullptr se ok
};
// Limite di duty cycle: max ~8% del tempo in un'ora (la norma europea consente 10%).
TxResult send_code(const polpo::RcCode& code, uint8_t repeats);
TxResult send_raw(const std::vector<int32_t>& timings, uint8_t repeats);
uint32_t budget_used_ms();
uint32_t budget_limit_ms();

}  // namespace rf433
