#include "polpo/util/hex.h"

namespace polpo {

static int hex_val(char c) {
    if (c >= '0' && c <= '9') return c - '0';
    if (c >= 'a' && c <= 'f') return c - 'a' + 10;
    if (c >= 'A' && c <= 'F') return c - 'A' + 10;
    return -1;
}

bool parse_hex_bytes(const std::string& s, std::vector<uint8_t>& out) {
    out.clear();
    int hi = -1;
    for (char c : s) {
        if (c == ' ' || c == '\t' || c == ':' || c == '\r') {
            if (hi >= 0) return false;  // nibble isolato
            continue;
        }
        int v = hex_val(c);
        if (v < 0) return false;
        if (hi < 0) {
            hi = v;
        } else {
            out.push_back(static_cast<uint8_t>((hi << 4) | v));
            hi = -1;
        }
    }
    return hi < 0;
}

std::string to_hex(const uint8_t* data, size_t len, char sep) {
    static const char* digits = "0123456789ABCDEF";
    std::string out;
    out.reserve(len * 3);
    for (size_t i = 0; i < len; ++i) {
        if (i && sep) out.push_back(sep);
        out.push_back(digits[data[i] >> 4]);
        out.push_back(digits[data[i] & 0x0F]);
    }
    return out;
}

std::string to_hex(const std::vector<uint8_t>& v, char sep) { return to_hex(v.data(), v.size(), sep); }

uint32_t le32_from_bytes(const std::vector<uint8_t>& b) {
    uint32_t v = 0;
    for (size_t i = 0; i < b.size() && i < 4; ++i) v |= static_cast<uint32_t>(b[i]) << (8 * i);
    return v;
}

std::vector<uint8_t> le32_to_bytes(uint32_t v) {
    return {static_cast<uint8_t>(v), static_cast<uint8_t>(v >> 8), static_cast<uint8_t>(v >> 16),
            static_cast<uint8_t>(v >> 24)};
}

uint64_t be_from_bytes(const std::vector<uint8_t>& b) {
    uint64_t v = 0;
    for (uint8_t x : b) v = (v << 8) | x;
    return v;
}

std::vector<uint8_t> be_to_bytes(uint64_t v, size_t n) {
    std::vector<uint8_t> out(n, 0);
    for (size_t i = 0; i < n; ++i) out[n - 1 - i] = static_cast<uint8_t>(v >> (8 * i));
    return out;
}

}  // namespace polpo
