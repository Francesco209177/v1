#include "hal/usb_kbd.h"

#include <Arduino.h>
#include <USB.h>
#include <USBHIDKeyboard.h>

#include "polpo/util/utf8.h"

// La tastiera USB richiede la modalità USB-OTG (TinyUSB) del core Arduino.
static_assert(ARDUINO_USB_MODE == 0, "Polpo: serve -DARDUINO_USB_MODE=0 per la tastiera USB");

namespace usb_kbd {
namespace {

// Oggetto globale: l'interfaccia HID viene registrata prima che lo stack USB parta.
USBHIDKeyboard keyboard;

void send(uint8_t mods, uint8_t key) {
    KeyReport r = {};
    r.modifiers = mods;
    r.keys[0] = key;
    keyboard.sendReport(&r);
}

}  // namespace

void begin() {
    keyboard.begin();
    USB.begin();
}

bool connected() { return static_cast<bool>(USB); }

void tap(uint8_t modifiers, uint8_t keycode) {
    send(modifiers, keycode);
    delay(6);
    send(0, 0);
    delay(6);
}

void release_all() { send(0, 0); }

bool type(const std::string& s, polpo::KbLayout layout, uint16_t key_delay_ms) {
    size_t i = 0;
    uint32_t cp;
    while (i < s.size()) {
        if (!polpo::utf8_next(s, i, cp)) return false;
        polpo::KeyStroke ks;
        if (!polpo::layout_lookup(layout, cp, ks)) return false;
        tap(ks.modifiers, ks.keycode);
        if (key_delay_ms) delay(key_delay_ms);
    }
    return true;
}

}  // namespace usb_kbd
