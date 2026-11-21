// Polpo — tastiera USB (BadUSB): il Cardputer collegato al PC si presenta come tastiera.
#pragma once

#include <cstdint>
#include <string>

#include "polpo/hid/hid_keys.h"

namespace usb_kbd {

void begin();                   // da chiamare in setup()
bool connected();               // il PC ha configurato il dispositivo USB?
void tap(uint8_t modifiers, uint8_t keycode);
bool type(const std::string& utf8, polpo::KbLayout layout, uint16_t key_delay_ms = 8);
void release_all();

}  // namespace usb_kbd
