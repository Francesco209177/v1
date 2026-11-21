#include "core/settings.h"

#include <Preferences.h>

namespace settings {
namespace {

Settings g;
Preferences prefs;
uint32_t pending_xp = 0;

}  // namespace

Settings& get() { return g; }

void load() {
    prefs.begin("polpo", true);
    g.brightness = prefs.getUChar("bright", 3);
    g.sound = prefs.getBool("sound", true);
    g.layout = static_cast<polpo::KbLayout>(prefs.getUChar("layout", 1));
    g.ir_repeats = prefs.getUChar("irrep", 1);
    g.rf_repeats = prefs.getUChar("rfrep", 8);
    g.xp = prefs.getUInt("xp", 0);
    g.boots = prefs.getUInt("boots", 0);
    prefs.end();
    if (g.brightness > 4) g.brightness = 3;
    if (g.ir_repeats < 1 || g.ir_repeats > 5) g.ir_repeats = 1;
    if (g.rf_repeats < 3 || g.rf_repeats > 20) g.rf_repeats = 8;
    if (static_cast<uint8_t>(g.layout) > 1) g.layout = polpo::KbLayout::IT;
}

void save() {
    prefs.begin("polpo", false);
    prefs.putUChar("bright", g.brightness);
    prefs.putBool("sound", g.sound);
    prefs.putUChar("layout", static_cast<uint8_t>(g.layout));
    prefs.putUChar("irrep", g.ir_repeats);
    prefs.putUChar("rfrep", g.rf_repeats);
    prefs.putUInt("xp", g.xp);
    prefs.putUInt("boots", g.boots);
    prefs.end();
    pending_xp = 0;
}

void add_xp(uint32_t points) {
    g.xp += points;
    pending_xp += points;
    if (pending_xp >= 5) save();  // si limita il numero di scritture sulla flash
}

uint8_t level() {
    static const uint32_t kSteps[] = {0, 20, 80, 200, 500};
    uint8_t lv = 1;
    for (uint8_t i = 1; i < 5; ++i)
        if (g.xp >= kSteps[i]) lv = static_cast<uint8_t>(i + 1);
    return lv;
}

}  // namespace settings
