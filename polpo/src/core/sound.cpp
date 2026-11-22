#include "core/sound.h"

#include <M5Cardputer.h>

#include "core/settings.h"

namespace sound {
namespace {

void tone(float hz, uint32_t ms) {
    if (!settings::get().sound) return;
    M5Cardputer.Speaker.tone(hz, ms);
}

}  // namespace

void click() { tone(2400, 12); }
void ok() { tone(1760, 60); }
void error() { tone(330, 180); }
void send() { tone(2900, 25); }

}  // namespace sound
