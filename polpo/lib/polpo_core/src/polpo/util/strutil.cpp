#include "polpo/util/strutil.h"

#include <cstdio>
#include <cstdlib>

namespace polpo {

static bool is_space(char c) { return c == ' ' || c == '\t' || c == '\r' || c == '\n'; }

std::string trim(const std::string& s) {
    size_t b = 0, e = s.size();
    while (b < e && is_space(s[b])) ++b;
    while (e > b && is_space(s[e - 1])) --e;
    return s.substr(b, e - b);
}

std::vector<std::string> split_ws(const std::string& s) {
    std::vector<std::string> out;
    std::string cur;
    for (char c : s) {
        if (is_space(c)) {
            if (!cur.empty()) {
                out.push_back(cur);
                cur.clear();
            }
        } else {
            cur.push_back(c);
        }
    }
    if (!cur.empty()) out.push_back(cur);
    return out;
}

bool starts_with(const std::string& s, const std::string& prefix) {
    return s.size() >= prefix.size() && s.compare(0, prefix.size(), prefix) == 0;
}

std::string to_upper_ascii(std::string s) {
    for (char& c : s)
        if (c >= 'a' && c <= 'z') c = static_cast<char>(c - 'a' + 'A');
    return s;
}

std::string to_lower_ascii(std::string s) {
    for (char& c : s)
        if (c >= 'A' && c <= 'Z') c = static_cast<char>(c - 'A' + 'a');
    return s;
}

bool iequals(const std::string& a, const std::string& b) {
    return a.size() == b.size() && to_lower_ascii(a) == to_lower_ascii(b);
}

bool parse_u32(const std::string& s, uint32_t& out) {
    if (s.empty() || s.size() > 10) return false;
    uint64_t v = 0;
    for (char c : s) {
        if (c < '0' || c > '9') return false;
        v = v * 10 + static_cast<uint64_t>(c - '0');
    }
    if (v > 0xFFFFFFFFull) return false;
    out = static_cast<uint32_t>(v);
    return true;
}

bool parse_i32(const std::string& s, int32_t& out) {
    if (s.empty()) return false;
    bool neg = s[0] == '-';
    uint32_t mag = 0;
    if (!parse_u32(neg ? s.substr(1) : s, mag)) return false;
    if (neg) {
        if (mag > 2147483648u) return false;
        out = static_cast<int32_t>(-static_cast<int64_t>(mag));
    } else {
        if (mag > 2147483647u) return false;
        out = static_cast<int32_t>(mag);
    }
    return true;
}

bool parse_float(const std::string& s, float& out) {
    if (s.empty() || s.size() > 24) return false;
    bool dot = false, digit = false;
    for (size_t i = 0; i < s.size(); ++i) {
        char c = s[i];
        if (c >= '0' && c <= '9') {
            digit = true;
        } else if (c == '.' && !dot) {
            dot = true;
        } else if (c == '-' && i == 0) {
        } else {
            return false;
        }
    }
    if (!digit) return false;
    out = std::strtof(s.c_str(), nullptr);
    return true;
}

std::string format_float6(float v) {
    char buf[32];
    std::snprintf(buf, sizeof buf, "%.6f", static_cast<double>(v));
    return buf;
}

}  // namespace polpo
