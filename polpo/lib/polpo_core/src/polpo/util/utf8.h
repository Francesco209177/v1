// Polpo — utilità UTF-8 e nomi file sicuri.
#pragma once

#include <cstdint>
#include <string>

namespace polpo {

// Legge il prossimo codepoint da `s` a partire da `i` (che avanza).
// Restituisce false su sequenze non valide (e avanza di 1 byte).
bool utf8_next(const std::string& s, size_t& i, uint32_t& cp);
bool utf8_valid(const std::string& s);
size_t utf8_length(const std::string& s);
void utf8_append(std::string& out, uint32_t cp);

// Lettera base per le vocali accentate (à -> a, È -> E); 0 se non è accentata.
char ascii_fallback(uint32_t cp);

// Nome file per la SD: solo [A-Za-z0-9_-.], spazi -> '_', massimo `maxlen` caratteri.
// Mai vuoto (diventa "senza_nome") e mai con '.' iniziale.
std::string safe_filename(const std::string& in, size_t maxlen = 32);

}  // namespace polpo
