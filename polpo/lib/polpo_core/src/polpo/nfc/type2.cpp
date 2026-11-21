#include "polpo/nfc/type2.h"

#include <cstring>

namespace polpo {
namespace {

// Mappe di memoria dai datasheet pubblici NXP (NTAG213/215/216, NTAG210/212, MF0ULx1).
const Type2Info kInfos[] = {
    {Type2Model::Unknown, "Type 2 sconosciuto", 16, 4, 15, 0},
    {Type2Model::Ultralight, "MIFARE Ultralight", 16, 4, 15, 0},
    {Type2Model::UltralightEV1_11, "MIFARE Ultralight EV1 (MF0UL11)", 20, 4, 15, 0},
    {Type2Model::UltralightEV1_21, "MIFARE Ultralight EV1 (MF0UL21)", 41, 4, 35, 36},
    {Type2Model::NTAG210, "NTAG210", 20, 4, 15, 0},
    {Type2Model::NTAG212, "NTAG212", 41, 4, 35, 36},
    {Type2Model::NTAG213, "NTAG213", 45, 4, 39, 40},
    {Type2Model::NTAG215, "NTAG215", 135, 4, 129, 130},
    {Type2Model::NTAG216, "NTAG216", 231, 4, 225, 226},
};

}  // namespace

Type2Model type2_model_from_version(const uint8_t v[8]) {
    if (v[0] != 0x00 || v[1] != 0x04) return Type2Model::Unknown;  // intestazione + produttore NXP
    const uint8_t product = v[2], storage = v[6];
    if (product == 0x04) {  // NTAG
        switch (storage) {
            case 0x0B: return Type2Model::NTAG210;
            case 0x0E: return Type2Model::NTAG212;
            case 0x0F: return Type2Model::NTAG213;
            case 0x11: return Type2Model::NTAG215;
            case 0x13: return Type2Model::NTAG216;
            default: return Type2Model::Unknown;
        }
    }
    if (product == 0x03) {  // MIFARE Ultralight
        switch (storage) {
            case 0x0B: return Type2Model::UltralightEV1_11;
            case 0x0E: return Type2Model::UltralightEV1_21;
            default: return Type2Model::Unknown;
        }
    }
    return Type2Model::Unknown;
}

const Type2Info& type2_info(Type2Model m) {
    for (const auto& i : kInfos)
        if (i.model == m) return i;
    return kInfos[0];
}

std::string card_family(uint8_t sak, uint16_t atqa) {
    switch (sak) {
        case 0x00:
            return "NFC Type 2 (NTAG / MIFARE Ultralight)";
        case 0x08:
            return "MIFARE Classic 1K (o compatibile)";
        case 0x09:
            return "MIFARE Mini";
        case 0x18:
            return "MIFARE Classic 4K (o compatibile)";
        case 0x10:
        case 0x11:
            return "MIFARE Plus (SL2)";
        case 0x20:
            if (atqa == 0x0344) return "MIFARE DESFire";
            return "Smart card ISO 14443-4 (DESFire, Plus SL3, carta bancaria, documento...)";
        case 0x28:
        case 0x38:
            return "Smart card con emulazione MIFARE Classic";
        default:
            return "Carta ISO 14443-A non riconosciuta";
    }
}

CapabilityContainer type2_parse_cc(const uint8_t p[4]) {
    CapabilityContainer cc;
    cc.ndef = p[0] == 0xE1;
    cc.version = p[1];
    cc.data_bytes = static_cast<uint16_t>(p[2]) * 8;
    cc.writable = p[3] == 0x00;
    return cc;
}

WritePlanError type2_plan_ndef_write(const Type2Info& info, const uint8_t page2[4], const uint8_t page3[4],
                                     const uint8_t* dyn_lock, const std::vector<uint8_t>& tlv,
                                     std::vector<PageWrite>& out) {
    out.clear();
    if (info.model == Type2Model::Unknown) return WritePlanError::UnknownModel;
    const CapabilityContainer cc = type2_parse_cc(page3);
    if (!cc.ndef) return WritePlanError::NotNdefFormatted;
    if (!cc.writable) return WritePlanError::ReadOnly;
    if (page2[2] != 0x00 || page2[3] != 0x00) return WritePlanError::StaticLocked;
    if (info.dyn_lock_page) {
        if (!dyn_lock) return WritePlanError::DynamicLocked;  // senza lettura non si rischia
        if (dyn_lock[0] || dyn_lock[1] || dyn_lock[2]) return WritePlanError::DynamicLocked;
    }
    const size_t user_bytes = static_cast<size_t>(info.user_last - info.user_first + 1) * 4;
    size_t limit = cc.data_bytes < user_bytes ? cc.data_bytes : user_bytes;
    if (tlv.empty() || tlv.size() > limit) return WritePlanError::TooBig;
    const size_t pages = (tlv.size() + 3) / 4;
    for (size_t p = 0; p < pages; ++p) {
        PageWrite w{};
        w.page = static_cast<uint16_t>(info.user_first + p);
        for (size_t k = 0; k < 4; ++k) {
            const size_t idx = p * 4 + k;
            w.data[k] = idx < tlv.size() ? tlv[idx] : 0x00;
        }
        if (w.page < 4 || w.page > info.user_last) return WritePlanError::TooBig;  // difesa in profondità
        out.push_back(w);
    }
    return WritePlanError::None;
}

const char* write_plan_error_text(WritePlanError e) {
    switch (e) {
        case WritePlanError::None: return "ok";
        case WritePlanError::UnknownModel: return "modello di tag non riconosciuto";
        case WritePlanError::NotNdefFormatted: return "tag non formattato NDEF";
        case WritePlanError::ReadOnly: return "tag in sola lettura";
        case WritePlanError::StaticLocked: return "tag con pagine bloccate";
        case WritePlanError::DynamicLocked: return "tag con blocchi dinamici attivi";
        case WritePlanError::TooBig: return "contenuto troppo grande per questo tag";
    }
    return "errore";
}

}  // namespace polpo
