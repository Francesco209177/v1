#include "hal/nfc.h"

#include <Arduino.h>
#include <MFRC522_I2C.h>
#include <Wire.h>

#include <cstring>

#include "board_pins.h"
#include "hal/grove.h"

namespace nfc {
namespace {

MFRC522_I2C* reader = nullptr;
bool ready = false;

bool wake_and_select(Card& c) {
    byte atqa[2] = {0, 0};
    byte size = sizeof(atqa);
    const byte r = reader->PICC_WakeupA(atqa, &size);
    if (r != MFRC522_I2C::STATUS_OK && r != MFRC522_I2C::STATUS_COLLISION) return false;
    c.atqa = static_cast<uint16_t>(atqa[0] | (atqa[1] << 8));
    if (reader->PICC_Select(&reader->uid) != MFRC522_I2C::STATUS_OK) return false;
    c.uid_len = reader->uid.size > 10 ? 10 : reader->uid.size;
    std::memcpy(c.uid, reader->uid.uidByte, c.uid_len);
    c.sak = reader->uid.sak;
    return true;
}

bool get_version(uint8_t out[8]) {
    byte cmd[3] = {0x60, 0, 0};
    if (reader->PCD_CalculateCRC(cmd, 1, &cmd[1]) != MFRC522_I2C::STATUS_OK) return false;
    byte back[12];
    byte back_len = sizeof(back);
    const byte r = reader->PCD_TransceiveData(cmd, 3, back, &back_len, nullptr, 0, true);
    if (r != MFRC522_I2C::STATUS_OK || back_len < 8) return false;
    std::memcpy(out, back, 8);
    return true;
}

}  // namespace

bool present() { return grove::i2c_probe(pins::kRfid2Addr); }

bool begin() {
    if (!grove::use_i2c(100000)) return false;
    if (!present()) return false;
    if (!reader) reader = new MFRC522_I2C(pins::kRfid2Addr, -1, &Wire);
    reader->PCD_Reset();  // senza pin di reset la libreria salterebbe il reset software
    reader->PCD_Init();
    ready = true;
    return true;
}

void end() {
    if (ready && reader) {
        reader->PCD_AntennaOff();
    }
    ready = false;
    grove::release();
}

bool poll(Card& out) {
    if (!ready) return false;
    out = Card{};
    if (!wake_and_select(out)) return false;
    if (out.sak == 0x00) {  // Type 2: si chiede il modello
        out.has_version = get_version(out.version);
        if (!out.has_version) {
            // Un Ultralight originale risponde NAK e torna in attesa: va riselezionato.
            Card again;
            if (!wake_and_select(again)) return false;
        }
    }
    return true;
}

bool reselect(Card& c) {
    if (!ready) return false;
    Card tmp;
    if (!wake_and_select(tmp)) return false;
    if (tmp.uid_len != c.uid_len || std::memcmp(tmp.uid, c.uid, c.uid_len) != 0) return false;
    return true;
}

bool read_pages(uint16_t first, uint16_t count, std::vector<uint8_t>& out) {
    out.clear();
    if (!ready) return false;
    for (uint16_t p = first; p < first + count; p += 4) {
        byte buf[18];
        byte size = sizeof(buf);
        if (reader->MIFARE_Read(static_cast<byte>(p), buf, &size) != MFRC522_I2C::STATUS_OK) return false;
        // READ restituisce 4 pagine (16 byte); si tiene solo ciò che serve.
        const uint16_t need = static_cast<uint16_t>(first + count - p);
        const uint16_t pages = need < 4 ? need : 4;
        out.insert(out.end(), buf, buf + pages * 4);
    }
    return true;
}

bool write_page(uint16_t page, const uint8_t data[4]) {
    if (!ready || page < 4) return false;  // mai UID, lock o capability container
    byte buf[4];
    std::memcpy(buf, data, 4);
    return reader->MIFARE_Ultralight_Write(static_cast<byte>(page), buf, 4) == MFRC522_I2C::STATUS_OK;
}

void halt() {
    if (ready) reader->PICC_HaltA();
}

}  // namespace nfc
