#include <cstddef>

#include "polpo/hid/hid_keys.h"

namespace polpo {
namespace {

using namespace hid;

constexpr uint8_t S = kModLShift;
constexpr uint8_t G = kModRAlt;  // AltGr

struct Entry {
    uint32_t cp;
    uint8_t mods;
    uint8_t key;
};

bool letters_digits_space(uint32_t cp, KeyStroke& out) {
    if (cp >= 'a' && cp <= 'z') {
        out = {0, static_cast<uint8_t>(kKeyA + (cp - 'a'))};
        return true;
    }
    if (cp >= 'A' && cp <= 'Z') {
        out = {S, static_cast<uint8_t>(kKeyA + (cp - 'A'))};
        return true;
    }
    if (cp >= '1' && cp <= '9') {
        out = {0, static_cast<uint8_t>(kKey1 + (cp - '1'))};
        return true;
    }
    if (cp == '0') {
        out = {0, kKey0};
        return true;
    }
    if (cp == ' ') {
        out = {0, kKeySpace};
        return true;
    }
    if (cp == '\n') {
        out = {0, kKeyEnter};
        return true;
    }
    if (cp == '\t') {
        out = {0, kKeyTab};
        return true;
    }
    return false;
}

// Layout US (ANSI).
const Entry kUs[] = {
    {'!', S, kKey1},          {'@', S, kKey1 + 1},         {'#', S, kKey1 + 2},        {'$', S, kKey1 + 3},
    {'%', S, kKey1 + 4},      {'^', S, kKey1 + 5},         {'&', S, kKey1 + 6},        {'*', S, kKey1 + 7},
    {'(', S, kKey1 + 8},      {')', S, kKey0},             {'-', 0, kKeyMinus},        {'_', S, kKeyMinus},
    {'=', 0, kKeyEqual},      {'+', S, kKeyEqual},         {'[', 0, kKeyLeftBracket},  {'{', S, kKeyLeftBracket},
    {']', 0, kKeyRightBracket}, {'}', S, kKeyRightBracket}, {'\\', 0, kKeyBackslash},  {'|', S, kKeyBackslash},
    {';', 0, kKeySemicolon},  {':', S, kKeySemicolon},     {'\'', 0, kKeyQuote},       {'"', S, kKeyQuote},
    {'`', 0, kKeyGrave},      {'~', S, kKeyGrave},         {',', 0, kKeyComma},        {'<', S, kKeyComma},
    {'.', 0, kKeyPeriod},     {'>', S, kKeyPeriod},        {'/', 0, kKeySlash},        {'?', S, kKeySlash},
};

// Layout italiano (ISO, tasti chiamati con la posizione US equivalente).
const Entry kIt[] = {
    {'!', S, kKey1},
    {'"', S, kKey1 + 1},
    {0x00A3, S, kKey1 + 2},  // £
    {'$', S, kKey1 + 3},
    {'%', S, kKey1 + 4},
    {'&', S, kKey1 + 5},
    {'/', S, kKey1 + 6},
    {'(', S, kKey1 + 7},
    {')', S, kKey1 + 8},
    {'=', S, kKey0},
    {'\'', 0, kKeyMinus},
    {'?', S, kKeyMinus},
    {0x00EC, 0, kKeyEqual},  // ì
    {'^', S, kKeyEqual},
    {0x00E8, 0, kKeyLeftBracket},  // è
    {0x00E9, S, kKeyLeftBracket},  // é
    {'[', G, kKeyLeftBracket},
    {'{', G | S, kKeyLeftBracket},
    {'+', 0, kKeyRightBracket},
    {'*', S, kKeyRightBracket},
    {']', G, kKeyRightBracket},
    {'}', G | S, kKeyRightBracket},
    {0x00F2, 0, kKeySemicolon},  // ò
    {0x00E7, S, kKeySemicolon},  // ç
    {'@', G, kKeySemicolon},
    {0x00E0, 0, kKeyQuote},  // à
    {0x00B0, S, kKeyQuote},  // °
    {'#', G, kKeyQuote},
    {0x00F9, 0, kKeyNonUsHash},  // ù
    {0x00A7, S, kKeyNonUsHash},  // §
    {'\\', 0, kKeyGrave},
    {'|', S, kKeyGrave},
    {'<', 0, kKeyNonUsBackslash},
    {'>', S, kKeyNonUsBackslash},
    {',', 0, kKeyComma},
    {';', S, kKeyComma},
    {'.', 0, kKeyPeriod},
    {':', S, kKeyPeriod},
    {'-', 0, kKeySlash},
    {'_', S, kKeySlash},
    {0x20AC, G, kKeyA + ('e' - 'a')},  // €
};

template <size_t N>
bool find(const Entry (&table)[N], uint32_t cp, KeyStroke& out) {
    for (const auto& e : table) {
        if (e.cp == cp) {
            out = {e.mods, e.key};
            return true;
        }
    }
    return false;
}

}  // namespace

bool layout_lookup(KbLayout layout, uint32_t cp, KeyStroke& out) {
    if (letters_digits_space(cp, out)) return true;
    return layout == KbLayout::IT ? find(kIt, cp, out) : find(kUs, cp, out);
}

const char* layout_name(KbLayout layout) { return layout == KbLayout::IT ? "IT" : "US"; }

}  // namespace polpo
