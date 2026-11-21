// Polpo — conversioni esadecimali ("AA BB CC").
#pragma once

#include <cstdint>
#include <string>
#include <vector>

namespace polpo {

// Accetta byte separati da spazi ("07 00 00 00") o attaccati ("07000000").
bool parse_hex_bytes(const std::string& s, std::vector<uint8_t>& out);

// "07 00 00 00" (maiuscolo, separato da spazi).
std::string to_hex(const uint8_t* data, size_t len, char sep = ' ');
std::string to_hex(const std::vector<uint8_t>& v, char sep = ' ');

// 4 byte little-endian <-> uint32 (formato address/command dei file .ir).
uint32_t le32_from_bytes(const std::vector<uint8_t>& b);
std::vector<uint8_t> le32_to_bytes(uint32_t v);

// N byte big-endian <-> uint64 (formato Key dei file .sub).
uint64_t be_from_bytes(const std::vector<uint8_t>& b);
std::vector<uint8_t> be_to_bytes(uint64_t v, size_t n);

}  // namespace polpo
