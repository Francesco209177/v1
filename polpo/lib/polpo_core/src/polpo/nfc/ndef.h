// Polpo — messaggi NDEF (NFC Forum): creazione di record URI/Testo e lettura.
#pragma once

#include <cstdint>
#include <string>
#include <vector>

namespace polpo {

enum class NdefKind : uint8_t { Uri, Text, Other };

struct NdefRecord {
    uint8_t tnf = 0;
    std::string type;
    std::vector<uint8_t> payload;
    NdefKind kind = NdefKind::Other;
    std::string value;  // URI completo o testo
    std::string lang;   // solo per Text
};

// Messaggio NDEF con un solo record (senza TLV).
std::vector<uint8_t> ndef_uri_message(const std::string& uri);
std::vector<uint8_t> ndef_text_message(const std::string& text, const std::string& lang = "it");

// Avvolge il messaggio nel TLV NDEF (03 L ... FE) per i tag Type 2.
std::vector<uint8_t> ndef_wrap_tlv(const std::vector<uint8_t>& message);

// Cerca il TLV NDEF nella memoria utente di un tag Type 2 (dalla pagina 4 in poi).
// Restituisce false se non c'è un TLV NDEF (tag vuoto o non formattato).
bool ndef_find_in_tlv(const uint8_t* mem, size_t len, std::vector<uint8_t>& message);

bool ndef_parse(const std::vector<uint8_t>& message, std::vector<NdefRecord>& out, std::string& err);

// Descrizione breve in italiano, es. "Link: https://example.com".
std::string ndef_describe(const NdefRecord& r);

}  // namespace polpo
