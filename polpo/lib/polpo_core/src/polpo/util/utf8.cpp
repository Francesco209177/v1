#include "polpo/util/utf8.h"

namespace polpo {

bool utf8_next(const std::string& s, size_t& i, uint32_t& cp) {
    if (i >= s.size()) return false;
    const auto b0 = static_cast<uint8_t>(s[i]);
    size_t n;
    if (b0 < 0x80) {
        cp = b0;
        i += 1;
        return true;
    } else if ((b0 & 0xE0) == 0xC0) {
        n = 2;
        cp = b0 & 0x1F;
    } else if ((b0 & 0xF0) == 0xE0) {
        n = 3;
        cp = b0 & 0x0F;
    } else if ((b0 & 0xF8) == 0xF0) {
        n = 4;
        cp = b0 & 0x07;
    } else {
        i += 1;
        return false;
    }
    if (i + n > s.size()) {
        i += 1;
        return false;
    }
    for (size_t k = 1; k < n; ++k) {
        const auto b = static_cast<uint8_t>(s[i + k]);
        if ((b & 0xC0) != 0x80) {
            i += 1;
            return false;
        }
        cp = (cp << 6) | (b & 0x3F);
    }
    // Rifiuta forme troppo lunghe e surrogati.
    if ((n == 2 && cp < 0x80) || (n == 3 && cp < 0x800) || (n == 4 && cp < 0x10000) || cp > 0x10FFFF ||
        (cp >= 0xD800 && cp <= 0xDFFF)) {
        i += 1;
        return false;
    }
    i += n;
    return true;
}

bool utf8_valid(const std::string& s) {
    size_t i = 0;
    uint32_t cp;
    while (i < s.size())
        if (!utf8_next(s, i, cp)) return false;
    return true;
}

size_t utf8_length(const std::string& s) {
    size_t i = 0, n = 0;
    uint32_t cp;
    while (i < s.size()) {
        utf8_next(s, i, cp);
        ++n;
    }
    return n;
}

void utf8_append(std::string& out, uint32_t cp) {
    if (cp < 0x80) {
        out.push_back(static_cast<char>(cp));
    } else if (cp < 0x800) {
        out.push_back(static_cast<char>(0xC0 | (cp >> 6)));
        out.push_back(static_cast<char>(0x80 | (cp & 0x3F)));
    } else if (cp < 0x10000) {
        out.push_back(static_cast<char>(0xE0 | (cp >> 12)));
        out.push_back(static_cast<char>(0x80 | ((cp >> 6) & 0x3F)));
        out.push_back(static_cast<char>(0x80 | (cp & 0x3F)));
    } else {
        out.push_back(static_cast<char>(0xF0 | (cp >> 18)));
        out.push_back(static_cast<char>(0x80 | ((cp >> 12) & 0x3F)));
        out.push_back(static_cast<char>(0x80 | ((cp >> 6) & 0x3F)));
        out.push_back(static_cast<char>(0x80 | (cp & 0x3F)));
    }
}

char ascii_fallback(uint32_t cp) {
    switch (cp) {
        case 0xE0: case 0xE1: case 0xE2: case 0xE4: return 'a';
        case 0xE8: case 0xE9: case 0xEA: case 0xEB: return 'e';
        case 0xEC: case 0xED: case 0xEE: case 0xEF: return 'i';
        case 0xF2: case 0xF3: case 0xF4: case 0xF6: return 'o';
        case 0xF9: case 0xFA: case 0xFB: case 0xFC: return 'u';
        case 0xC0: case 0xC1: case 0xC2: case 0xC4: return 'A';
        case 0xC8: case 0xC9: case 0xCA: case 0xCB: return 'E';
        case 0xCC: case 0xCD: case 0xCE: case 0xCF: return 'I';
        case 0xD2: case 0xD3: case 0xD4: case 0xD6: return 'O';
        case 0xD9: case 0xDA: case 0xDB: case 0xDC: return 'U';
        case 0xE7: return 'c';
        case 0xC7: return 'C';
        default: return 0;
    }
}

std::string safe_filename(const std::string& in, size_t maxlen) {
    std::string out;
    size_t i = 0;
    uint32_t cp;
    while (i < in.size() && out.size() < maxlen) {
        if (!utf8_next(in, i, cp)) continue;
        char c = 0;
        if ((cp >= 'a' && cp <= 'z') || (cp >= 'A' && cp <= 'Z') || (cp >= '0' && cp <= '9') || cp == '_' ||
            cp == '-' || cp == '.') {
            c = static_cast<char>(cp);
        } else if (cp == ' ') {
            c = '_';
        } else {
            c = ascii_fallback(cp);
        }
        if (!c) continue;
        if (out.empty() && c == '.') continue;
        out.push_back(c);
    }
    if (out.empty()) out = "senza_nome";
    return out;
}

}  // namespace polpo
