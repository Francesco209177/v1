// Polpo — piccola libreria integrata di telecomandi universali con codici pubblici noti.
// Per altre marche si copiano file .ir sulla microSD.
#pragma once

#include <cstdint>
#include <vector>

#include "polpo/ir/ir_signal.h"

namespace polpo {

enum class IrCategory : uint8_t { TV, Audio };
enum class IrButton : uint8_t { Power, VolUp, VolDown, Mute, ChUp, ChDown };

struct IrLibraryCode {
    IrCategory category;
    const char* brand;
    IrButton button;
    IrProtocol protocol;
    uint32_t address;
    uint32_t command;
};

const char* ir_button_name(IrButton b);  // in italiano
const char* ir_category_name(IrCategory c);
// Tutti i codici di una categoria per un tasto (uno per marca).
std::vector<IrLibraryCode> ir_library_lookup(IrCategory c, IrButton b);
// Tasti disponibili in una categoria.
std::vector<IrButton> ir_library_buttons(IrCategory c);
size_t ir_library_size();
IrSignal ir_library_signal(const IrLibraryCode& code);

}  // namespace polpo
