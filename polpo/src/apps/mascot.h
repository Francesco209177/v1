// Polpo — la mascotte: un polpo disegnato con primitive grafiche (design originale).
#pragma once

#include <cstdint>

namespace mascot {

enum class Mood : uint8_t { Happy, Sleepy, Excited, Worried };

// Disegna il polpo centrato in (cx, cy) con raggio della testa `r`. `t_ms` anima tentacoli e occhi.
void draw(int cx, int cy, int r, uint32_t t_ms, Mood mood);

}  // namespace mascot
