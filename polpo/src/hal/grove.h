// Polpo — la porta Grove (G1/G2) è condivisa: I2C (RFID2) oppure GPIO (RF433, IR Unit).
// Prima di usare un modulo si chiama la funzione giusta; release() libera i pin.
#pragma once

#include <cstdint>
#include <vector>

namespace grove {

enum class Mode : uint8_t { Free, I2C, Gpio };

bool use_i2c(uint32_t hz = 100000);
void use_gpio();
void release();
Mode mode();

// Scansione I2C degli indirizzi 0x08-0x77.
std::vector<uint8_t> i2c_scan();
bool i2c_probe(uint8_t addr);
const char* i2c_device_name(uint8_t addr);  // nome tipico per indirizzo noto, "" se sconosciuto

}  // namespace grove
