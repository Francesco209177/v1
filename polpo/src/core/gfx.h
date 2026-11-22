// Polpo — disegno su schermo: un'unica tela 240x135 a 16 bit, inviata al display
// solo quando qualcosa è cambiato. Testo UTF-8 con font efont (lettere accentate).
#pragma once

#include <M5Cardputer.h>

#include <string>

namespace ui {

constexpr int kW = 240;
constexpr int kH = 135;
constexpr int kHeaderH = 16;
constexpr int kFooterH = 12;
constexpr int kContentY = kHeaderH;
constexpr int kContentH = kH - kHeaderH - kFooterH;  // 107
constexpr int kRowH = 15;
constexpr int kVisibleRows = kContentH / kRowH;  // 7
constexpr int kCharW = 6;                        // larghezza dei caratteri latini nel font 12 px

// Colori (RGB565). Tema scuro con accento "corallo" (il colore del polpo).
constexpr uint16_t rgb(uint8_t r, uint8_t g, uint8_t b) {
    return static_cast<uint16_t>(((r & 0xF8) << 8) | ((g & 0xFC) << 3) | (b >> 3));
}
constexpr uint16_t kBg = rgb(10, 14, 22);
constexpr uint16_t kPanel = rgb(24, 31, 44);
constexpr uint16_t kFg = rgb(232, 236, 241);
constexpr uint16_t kDim = rgb(132, 144, 160);
constexpr uint16_t kAccent = rgb(255, 122, 89);   // corallo
constexpr uint16_t kAccent2 = rgb(92, 200, 255);  // azzurro
constexpr uint16_t kOk = rgb(96, 214, 128);
constexpr uint16_t kWarn = rgb(255, 196, 64);
constexpr uint16_t kErr = rgb(255, 84, 84);
constexpr uint16_t kSel = rgb(58, 38, 40);

void begin();
M5Canvas& c();
void clear();
void present();
void set_brightness(uint8_t level_0_4);

int text_width(const std::string& s);
// Accorcia con "…" per stare in `max_w` pixel.
std::string ellipsize(const std::string& s, int max_w);
void text(int x, int y, const std::string& s, uint16_t color = kFg);
void text_right(int x_right, int y, const std::string& s, uint16_t color = kFg);
void text_center(int y, const std::string& s, uint16_t color = kFg);
// Testo a capo automatico; restituisce le righe usate.
int wrap(int x, int y, int w, const std::string& s, uint16_t color = kFg, int line_h = 14, int max_lines = 99,
         int skip_lines = 0);
int wrap_count(int w, const std::string& s);
void big_text_center(int y, const char* ascii, uint16_t color);  // titoli solo ASCII

void header(const std::string& title, uint16_t accent = kAccent);
void footer(const std::string& hints);
void row(int index_on_screen, bool selected, const std::string& left, const std::string& right = "",
         uint16_t left_color = kFg);
void scrollbar(int top, int visible, int count);
void progress(int x, int y, int w, int h, float frac, uint16_t color = kAccent);
void battery(int x, int y);
int battery_level();  // 0-100, -1 se non disponibile (aggiornato al massimo ogni 3 s)
bool battery_charging();
void bars(int x, int y, uint8_t level_0_4, uint16_t color = kOk);
void panel(int x, int y, int w, int h, uint16_t color = kPanel);

}  // namespace ui
