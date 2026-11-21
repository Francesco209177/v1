// Polpo — impostazioni salvate nella memoria interna (Preferences / NVS).
#pragma once

#include <cstdint>

#include "polpo/hid/hid_keys.h"

struct Settings {
    uint8_t brightness = 3;  // 0..4
    bool sound = true;
    polpo::KbLayout layout = polpo::KbLayout::IT;
    uint8_t ir_repeats = 1;  // invii per pressione (1..5)
    uint8_t rf_repeats = 8;  // ripetizioni di un codice 433 MHz (3..20)
    uint32_t xp = 0;         // esperienza della mascotte
    uint32_t boots = 0;
};

namespace settings {

Settings& get();
void load();
void save();
void add_xp(uint32_t points);
uint8_t level();  // 1..5 dall'esperienza

}  // namespace settings
