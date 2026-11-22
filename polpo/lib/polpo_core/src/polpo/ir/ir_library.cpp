#include "polpo/ir/ir_library.h"

namespace polpo {
namespace {

using C = IrCategory;
using B = IrButton;
using P = IrProtocol;

// Codici pubblici molto diffusi (documentati in numerose raccolte e librerie IR).
const IrLibraryCode kCodes[] = {
    // Televisori Samsung (Samsung32, indirizzo 0x07)
    {C::TV, "Samsung", B::Power, P::Samsung32, 0x07, 0x02},
    {C::TV, "Samsung", B::VolUp, P::Samsung32, 0x07, 0x07},
    {C::TV, "Samsung", B::VolDown, P::Samsung32, 0x07, 0x0B},
    {C::TV, "Samsung", B::Mute, P::Samsung32, 0x07, 0x0F},
    {C::TV, "Samsung", B::ChUp, P::Samsung32, 0x07, 0x12},
    {C::TV, "Samsung", B::ChDown, P::Samsung32, 0x07, 0x10},
    // Televisori LG (NEC, indirizzo 0x04)
    {C::TV, "LG", B::Power, P::NEC, 0x04, 0x08},
    {C::TV, "LG", B::VolUp, P::NEC, 0x04, 0x02},
    {C::TV, "LG", B::VolDown, P::NEC, 0x04, 0x03},
    {C::TV, "LG", B::Mute, P::NEC, 0x04, 0x09},
    {C::TV, "LG", B::ChUp, P::NEC, 0x04, 0x00},
    {C::TV, "LG", B::ChDown, P::NEC, 0x04, 0x01},
    // Televisori Sony (SIRC 12 bit, indirizzo 1)
    {C::TV, "Sony", B::Power, P::SIRC, 0x01, 0x15},
    {C::TV, "Sony", B::VolUp, P::SIRC, 0x01, 0x12},
    {C::TV, "Sony", B::VolDown, P::SIRC, 0x01, 0x13},
    {C::TV, "Sony", B::Mute, P::SIRC, 0x01, 0x14},
    {C::TV, "Sony", B::ChUp, P::SIRC, 0x01, 0x10},
    {C::TV, "Sony", B::ChDown, P::SIRC, 0x01, 0x11},
    // Televisori Philips (RC5 e RC6, indirizzo 0)
    {C::TV, "Philips RC5", B::Power, P::RC5, 0x00, 0x0C},
    {C::TV, "Philips RC5", B::VolUp, P::RC5, 0x00, 0x10},
    {C::TV, "Philips RC5", B::VolDown, P::RC5, 0x00, 0x11},
    {C::TV, "Philips RC5", B::Mute, P::RC5, 0x00, 0x0D},
    {C::TV, "Philips RC5", B::ChUp, P::RC5, 0x00, 0x20},
    {C::TV, "Philips RC5", B::ChDown, P::RC5, 0x00, 0x21},
    {C::TV, "Philips RC6", B::Power, P::RC6, 0x00, 0x0C},
    {C::TV, "Philips RC6", B::VolUp, P::RC6, 0x00, 0x10},
    {C::TV, "Philips RC6", B::VolDown, P::RC6, 0x00, 0x11},
    {C::TV, "Philips RC6", B::Mute, P::RC6, 0x00, 0x0D},
    // Televisori Panasonic (Kaseikyo, costruttore 0x2002)
    {C::TV, "Panasonic", B::Power, P::Kaseikyo, 0x200280, 0x3D0},
    // Televisori Toshiba (NEC, indirizzo 0x40)
    {C::TV, "Toshiba", B::Power, P::NEC, 0x40, 0x12},
    // Impianti audio Sony (SIRC, indirizzo 16)
    {C::Audio, "Sony", B::Power, P::SIRC, 0x10, 0x15},
    {C::Audio, "Sony", B::VolUp, P::SIRC, 0x10, 0x12},
    {C::Audio, "Sony", B::VolDown, P::SIRC, 0x10, 0x13},
    {C::Audio, "Sony", B::Mute, P::SIRC, 0x10, 0x14},
    // Amplificatori Yamaha (NEC, indirizzo 0x7A)
    {C::Audio, "Yamaha", B::Power, P::NEC, 0x7A, 0x1F},
    {C::Audio, "Yamaha", B::VolUp, P::NEC, 0x7A, 0x1A},
    {C::Audio, "Yamaha", B::VolDown, P::NEC, 0x7A, 0x1B},
    {C::Audio, "Yamaha", B::Mute, P::NEC, 0x7A, 0x1C},
};

}  // namespace

const char* ir_button_name(IrButton b) {
    switch (b) {
        case B::Power: return "Accendi / spegni";
        case B::VolUp: return "Volume +";
        case B::VolDown: return "Volume -";
        case B::Mute: return "Muto";
        case B::ChUp: return "Canale +";
        case B::ChDown: return "Canale -";
    }
    return "?";
}

const char* ir_category_name(IrCategory c) { return c == C::TV ? "Televisori" : "Audio"; }

std::vector<IrLibraryCode> ir_library_lookup(IrCategory c, IrButton b) {
    std::vector<IrLibraryCode> out;
    for (const auto& k : kCodes)
        if (k.category == c && k.button == b) out.push_back(k);
    return out;
}

std::vector<IrButton> ir_library_buttons(IrCategory c) {
    std::vector<IrButton> out;
    for (const auto& k : kCodes) {
        if (k.category != c) continue;
        bool seen = false;
        for (auto b : out) seen = seen || b == k.button;
        if (!seen) out.push_back(k.button);
    }
    return out;
}

size_t ir_library_size() { return sizeof(kCodes) / sizeof(kCodes[0]); }

IrSignal ir_library_signal(const IrLibraryCode& code) {
    IrSignal s;
    s.name = std::string(code.brand) + " " + ir_button_name(code.button);
    s.protocol = code.protocol;
    s.address = code.address;
    s.command = code.command;
    return s;
}

}  // namespace polpo
