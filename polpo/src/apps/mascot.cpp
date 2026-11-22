#include "apps/mascot.h"

#include <cmath>

#include "core/gfx.h"

namespace mascot {

void draw(int cx, int cy, int r, uint32_t t, Mood mood) {
    auto& g = ui::c();
    const uint16_t body = ui::kAccent;
    const uint16_t shade = ui::rgb(214, 86, 64);
    const float phase = static_cast<float>(t % 2400) / 2400.0f * 6.2832f;
    const float speed = mood == Mood::Excited ? 2.0f : (mood == Mood::Sleepy ? 0.5f : 1.0f);

    // Otto tentacoli: segmenti che ondeggiano con fasi diverse, dal più lontano al più vicino.
    for (int k = 0; k < 8; ++k) {
        const float base = -1.05f + k * 0.30f;  // angolo di partenza sotto la testa
        float x = cx + std::sin(base) * r * 0.75f;
        float y = cy + r * 0.55f;
        float ang = 1.5708f + base * 0.9f;
        int w = r / 4 + 2;
        for (int s = 0; s < 6; ++s) {
            const float wave = std::sin(phase * speed + k * 0.8f + s * 0.7f) * 0.35f;
            const float nx = x + std::cos(ang + wave) * r * 0.22f;
            const float ny = y + std::sin(ang + wave) * r * 0.22f;
            g.fillCircle(static_cast<int>(nx), static_cast<int>(ny), w, (s % 2) ? body : shade);
            x = nx;
            y = ny;
            ang += (k < 4 ? -0.12f : 0.12f);
            if (w > 2) --w;
        }
        g.fillCircle(static_cast<int>(x), static_cast<int>(y), 2, ui::rgb(255, 200, 180));  // ventosa in punta
    }

    // Testa: un ovale con una leggera ombra.
    const int bob = static_cast<int>(std::sin(phase) * 2.0f);
    g.fillEllipse(cx, cy + bob, r, r * 9 / 10, body);
    g.fillEllipse(cx + r / 3, cy - r / 3 + bob, r / 4, r / 5, ui::rgb(255, 170, 150));  // riflesso

    // Occhi: chiusi ogni tanto (battito) o mezzi chiusi se assonnato.
    const bool blink = (t % 3600) < 140;
    const int ey = cy + r / 8 + bob;
    const int ex = r * 4 / 10;
    for (int side = -1; side <= 1; side += 2) {
        const int x = cx + side * ex;
        if (blink || mood == Mood::Sleepy) {
            g.fillRect(x - r / 6, ey, r / 3, 2, ui::kBg);
        } else {
            g.fillCircle(x, ey, r / 5, ui::kFg);
            const int look = static_cast<int>(std::sin(phase * 0.5f) * 2.0f);
            g.fillCircle(x + look, ey + 1, r / 9 + 1, ui::kBg);
        }
    }
    // Bocca secondo l'umore.
    const int my = ey + r / 3;
    switch (mood) {
        case Mood::Happy:
        case Mood::Excited:
            g.drawArc(cx, my - 3, r / 5, r / 5 - 2, 20, 160, ui::kBg);
            break;
        case Mood::Worried:
            g.drawArc(cx, my + 4, r / 6, r / 6 - 2, 200, 340, ui::kBg);
            break;
        case Mood::Sleepy:
            g.fillCircle(cx, my, 2, ui::kBg);
            break;
    }
    // Guance.
    g.fillCircle(cx - ex - r / 6, ey + r / 4, 3, ui::rgb(255, 150, 160));
    g.fillCircle(cx + ex + r / 6, ey + r / 4, 3, ui::rgb(255, 150, 160));
}

}  // namespace mascot
