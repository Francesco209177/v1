// Polpo — lettore/scrittore del formato testo "chiave: valore" usato dai file
// .ir / .sub / .nfc (formato documentato pubblicamente da Flipper Devices).
// Implementazione indipendente: nessun codice Flipper è stato copiato.
#pragma once

#include <cstdint>
#include <string>
#include <vector>

namespace polpo {

struct FfLine {
    std::string key;
    std::string value;
    uint16_t line_no = 0;
};

struct FfDoc {
    std::string filetype;  // es. "IR signals file"
    uint32_t version = 0;
    std::vector<FfLine> lines;  // tutte le righe dopo l'intestazione, in ordine
};

// Commenti (#) e righe vuote vengono saltati. Le prime due chiavi devono essere
// Filetype e Version. Restituisce false con un messaggio in `err` se il file è malformato.
bool ff_parse(const std::string& text, FfDoc& out, std::string& err);

// Riga "Chiave: valore\n".
std::string ff_line(const std::string& key, const std::string& value);
std::string ff_header(const std::string& filetype, uint32_t version);

}  // namespace polpo
