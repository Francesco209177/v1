// Polpo — codici tasto USB HID (Usage Page 0x07) e layout di tastiera.
#pragma once

#include <cstdint>

namespace polpo {
namespace hid {

// Modificatori (byte 0 del report tastiera).
constexpr uint8_t kModLCtrl = 0x01;
constexpr uint8_t kModLShift = 0x02;
constexpr uint8_t kModLAlt = 0x04;
constexpr uint8_t kModLGui = 0x08;
constexpr uint8_t kModRCtrl = 0x10;
constexpr uint8_t kModRShift = 0x20;
constexpr uint8_t kModRAlt = 0x40;  // AltGr sui layout europei
constexpr uint8_t kModRGui = 0x80;

constexpr uint8_t kKeyA = 0x04;  // ... 'z' = 0x1D
constexpr uint8_t kKey1 = 0x1E;  // ... '9' = 0x26
constexpr uint8_t kKey0 = 0x27;
constexpr uint8_t kKeyEnter = 0x28;
constexpr uint8_t kKeyEsc = 0x29;
constexpr uint8_t kKeyBackspace = 0x2A;
constexpr uint8_t kKeyTab = 0x2B;
constexpr uint8_t kKeySpace = 0x2C;
constexpr uint8_t kKeyMinus = 0x2D;
constexpr uint8_t kKeyEqual = 0x2E;
constexpr uint8_t kKeyLeftBracket = 0x2F;
constexpr uint8_t kKeyRightBracket = 0x30;
constexpr uint8_t kKeyBackslash = 0x31;
constexpr uint8_t kKeyNonUsHash = 0x32;
constexpr uint8_t kKeySemicolon = 0x33;
constexpr uint8_t kKeyQuote = 0x34;
constexpr uint8_t kKeyGrave = 0x35;
constexpr uint8_t kKeyComma = 0x36;
constexpr uint8_t kKeyPeriod = 0x37;
constexpr uint8_t kKeySlash = 0x38;
constexpr uint8_t kKeyCapsLock = 0x39;
constexpr uint8_t kKeyF1 = 0x3A;  // ... F12 = 0x45
constexpr uint8_t kKeyPrintScreen = 0x46;
constexpr uint8_t kKeyScrollLock = 0x47;
constexpr uint8_t kKeyPause = 0x48;
constexpr uint8_t kKeyInsert = 0x49;
constexpr uint8_t kKeyHome = 0x4A;
constexpr uint8_t kKeyPageUp = 0x4B;
constexpr uint8_t kKeyDelete = 0x4C;
constexpr uint8_t kKeyEnd = 0x4D;
constexpr uint8_t kKeyPageDown = 0x4E;
constexpr uint8_t kKeyRight = 0x4F;
constexpr uint8_t kKeyLeft = 0x50;
constexpr uint8_t kKeyDown = 0x51;
constexpr uint8_t kKeyUp = 0x52;
constexpr uint8_t kKeyNumLock = 0x53;
constexpr uint8_t kKeyNonUsBackslash = 0x64;
constexpr uint8_t kKeyApplication = 0x65;

}  // namespace hid

enum class KbLayout : uint8_t { US = 0, IT = 1 };

struct KeyStroke {
    uint8_t modifiers = 0;
    uint8_t keycode = 0;
};

// Come si digita il carattere `cp` (Unicode) sul layout scelto. false se non è digitabile
// (es. '`' e '~' non esistono sulla tastiera italiana standard).
bool layout_lookup(KbLayout layout, uint32_t cp, KeyStroke& out);
const char* layout_name(KbLayout layout);

}  // namespace polpo
