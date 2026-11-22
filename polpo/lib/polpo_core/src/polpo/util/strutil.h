// Polpo — utilità per stringhe (nessuna dipendenza hardware).
#pragma once

#include <cstdint>
#include <string>
#include <vector>

namespace polpo {

// Rimuove spazi, tab, \r e \n all'inizio e alla fine.
std::string trim(const std::string& s);

// Divide su spazi/tab consecutivi; nessun token vuoto.
std::vector<std::string> split_ws(const std::string& s);

bool starts_with(const std::string& s, const std::string& prefix);
std::string to_upper_ascii(std::string s);
std::string to_lower_ascii(std::string s);
bool iequals(const std::string& a, const std::string& b);

// Numeri decimali senza segno; rifiuta stringhe vuote, segni e caratteri spuri.
bool parse_u32(const std::string& s, uint32_t& out);
// Interi con segno (per i tempi RAW, es. "-1050").
bool parse_i32(const std::string& s, int32_t& out);
// Numero decimale semplice tipo "0.33" o "0.330000".
bool parse_float(const std::string& s, float& out);

// Formatta un float con 6 decimali (come i file Flipper: "0.330000").
std::string format_float6(float v);

}  // namespace polpo
