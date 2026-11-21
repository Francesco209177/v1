// Polpo — lettore NFC M5Stack RFID2 (WS1850S, compatibile MFRC522) su I2C 0x28.
// Solo ISO 14443-A: identificazione, lettura di tag Type 2 (NTAG/Ultralight), scrittura NDEF.
#pragma once

#include <cstdint>
#include <vector>

namespace nfc {

bool begin();   // porta Grove in I2C + inizializzazione del chip
void end();
bool present(); // il modulo risponde su 0x28?

struct Card {
    uint8_t uid[10] = {};
    uint8_t uid_len = 0;
    uint8_t sak = 0;
    uint16_t atqa = 0;
    bool has_version = false;
    uint8_t version[8] = {};
};

// Cerca una carta nel campo e la seleziona. Chiede anche GET_VERSION (solo Type 2).
bool poll(Card& out);
// Legge `count` pagine da 4 byte a partire da `first` (la carta deve essere selezionata).
bool read_pages(uint16_t first, uint16_t count, std::vector<uint8_t>& out);
bool write_page(uint16_t page, const uint8_t data[4]);
// Riseleziona la stessa carta (dopo un comando non supportato la carta si "addormenta").
bool reselect(Card& c);
void halt();

}  // namespace nfc
