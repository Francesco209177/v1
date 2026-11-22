// Polpo — tag NFC Forum Type 2 (NTAG21x, MIFARE Ultralight) e identificazione carte.
#pragma once

#include <cstdint>
#include <string>
#include <vector>

namespace polpo {

enum class Type2Model : uint8_t {
    Unknown,
    Ultralight,       // MIFARE Ultralight originale (senza GET_VERSION)
    UltralightEV1_11, // MF0UL11
    UltralightEV1_21, // MF0UL21
    NTAG210,
    NTAG212,
    NTAG213,
    NTAG215,
    NTAG216,
};

struct Type2Info {
    Type2Model model;
    const char* name;
    uint16_t total_pages;
    uint16_t user_first;  // prima pagina di memoria utente (sempre 4)
    uint16_t user_last;   // ultima pagina utente (inclusa)
    uint16_t dyn_lock_page;  // 0 se il chip non ha lock dinamici
};

// Dalla risposta a 8 byte del comando GET_VERSION (0x60).
Type2Model type2_model_from_version(const uint8_t version[8]);
const Type2Info& type2_info(Type2Model m);

// Nome della famiglia di carta da SAK/ATQA (ISO 14443-A). Solo identificazione.
std::string card_family(uint8_t sak, uint16_t atqa);

struct CapabilityContainer {
    bool ndef = false;       // magic 0xE1
    uint8_t version = 0;
    uint16_t data_bytes = 0; // dimensione area dati dichiarata
    bool writable = false;   // accesso in scrittura 0x00
};
CapabilityContainer type2_parse_cc(const uint8_t page3[4]);

struct PageWrite {
    uint16_t page;
    uint8_t data[4];
};

enum class WritePlanError : uint8_t {
    None,
    UnknownModel,
    NotNdefFormatted,
    ReadOnly,
    StaticLocked,
    DynamicLocked,
    TooBig,
};

// Prepara le scritture pagina per pagina di un TLV NDEF, SOLO nella memoria utente
// e solo se il tag è formattato NDEF, scrivibile e senza bit di blocco.
// Non tocca mai le pagine 0-3 (UID, lock, CC) né le pagine di configurazione/password.
WritePlanError type2_plan_ndef_write(const Type2Info& info, const uint8_t page2[4], const uint8_t page3[4],
                                     const uint8_t* dyn_lock /* 4 byte o nullptr */,
                                     const std::vector<uint8_t>& tlv, std::vector<PageWrite>& out);

const char* write_plan_error_text(WritePlanError e);

}  // namespace polpo
