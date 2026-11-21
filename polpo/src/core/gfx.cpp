#include "core/gfx.h"

#include "polpo/util/utf8.h"

namespace ui {
namespace {

M5Canvas* canvas = nullptr;
const lgfx::IFont* kFont = &fonts::efontCN_12;

}  // namespace

void begin() {
    auto& d = M5Cardputer.Display;
    d.setRotation(1);
    d.fillScreen(kBg);
    canvas = new M5Canvas(&d);
    canvas->setColorDepth(16);
    canvas->createSprite(kW, kH);
    canvas->setFont(kFont);
    canvas->setTextWrap(false);
    canvas->setTextDatum(top_left);
}

M5Canvas& c() { return *canvas; }

void clear() {
    canvas->fillScreen(kBg);
    canvas->setFont(kFont);
    canvas->setTextSize(1);
}

void present() { canvas->pushSprite(0, 0); }

void set_brightness(uint8_t level) {
    static const uint8_t kLevels[] = {20, 60, 110, 170, 250};
    M5Cardputer.Display.setBrightness(kLevels[level > 4 ? 4 : level]);
}

int text_width(const std::string& s) { return canvas->textWidth(s.c_str()); }

std::string ellipsize(const std::string& s, int max_w) {
    if (text_width(s) <= max_w) return s;
    std::string out;
    size_t i = 0;
    uint32_t cp;
    while (i < s.size()) {
        size_t before = i;
        if (!polpo::utf8_next(s, i, cp)) continue;
        std::string candidate = s.substr(0, i) + "…";
        if (text_width(candidate) > max_w) {
            out = s.substr(0, before) + "…";
            return out;
        }
    }
    return s;
}

void text(int x, int y, const std::string& s, uint16_t color) {
    canvas->setTextColor(color);
    canvas->drawString(s.c_str(), x, y);
}

void text_right(int x_right, int y, const std::string& s, uint16_t color) {
    text(x_right - text_width(s), y, s, color);
}

void text_center(int y, const std::string& s, uint16_t color) { text((kW - text_width(s)) / 2, y, s, color); }

static void wrap_lines(int w, const std::string& s, std::vector<std::string>& lines) {
    lines.clear();
    std::string line, word;
    auto flush_word = [&]() {
        if (word.empty()) return;
        std::string candidate = line.empty() ? word : line + " " + word;
        if (text_width(candidate) <= w) {
            line = candidate;
        } else {
            if (!line.empty()) lines.push_back(line);
            line = word;
            while (text_width(line) > w && line.size() > 1) {  // parola più lunga della riga
                size_t cut = line.size();
                while (cut > 1 && text_width(line.substr(0, cut)) > w) --cut;
                while (cut > 1 && (static_cast<uint8_t>(line[cut]) & 0xC0) == 0x80) --cut;  // non spezzare UTF-8
                lines.push_back(line.substr(0, cut));
                line = line.substr(cut);
            }
        }
        word.clear();
    };
    for (char ch : s) {
        if (ch == '\r') continue;  // file di testo Windows
        if (ch == '\n') {
            flush_word();
            lines.push_back(line);
            line.clear();
        } else if (ch == ' ') {
            flush_word();
        } else {
            word.push_back(ch);
        }
    }
    flush_word();
    if (!line.empty()) lines.push_back(line);
}

int wrap(int x, int y, int w, const std::string& s, uint16_t color, int line_h, int max_lines, int skip) {
    std::vector<std::string> lines;
    wrap_lines(w, s, lines);
    int drawn = 0;
    for (size_t i = static_cast<size_t>(skip); i < lines.size() && drawn < max_lines; ++i, ++drawn)
        text(x, y + drawn * line_h, lines[i], color);
    return static_cast<int>(lines.size());
}

int wrap_count(int w, const std::string& s) {
    std::vector<std::string> lines;
    wrap_lines(w, s, lines);
    return static_cast<int>(lines.size());
}

void big_text_center(int y, const char* ascii, uint16_t color) {
    canvas->setFont(&fonts::FreeSansBold12pt7b);
    canvas->setTextColor(color);
    canvas->drawString(ascii, (kW - canvas->textWidth(ascii)) / 2, y);
    canvas->setFont(kFont);
}

void header(const std::string& title, uint16_t accent) {
    canvas->fillRect(0, 0, kW, kHeaderH, kPanel);
    canvas->fillRect(0, kHeaderH - 2, kW, 2, accent);
    text(4, 1, ellipsize(title, kW - 40), kFg);
    battery(kW - 26, 3);
}

void footer(const std::string& hints) {
    const int y = kH - kFooterH;
    canvas->fillRect(0, y, kW, kFooterH, kPanel);
    canvas->setFont(&fonts::Font0);  // 6x8 ASCII, compatto
    canvas->setTextColor(kDim);
    std::string ascii;
    size_t i = 0;
    uint32_t cp;
    while (i < hints.size()) {  // il font piccolo è solo ASCII: si tolgono gli accenti
        if (!polpo::utf8_next(hints, i, cp)) continue;
        if (cp < 0x80) {
            ascii.push_back(static_cast<char>(cp));
        } else if (char f = polpo::ascii_fallback(cp)) {
            ascii.push_back(f);
        }
    }
    canvas->drawString(ascii.c_str(), 3, y + 2);
    canvas->setFont(kFont);
}

void row(int i, bool selected, const std::string& left, const std::string& right, uint16_t left_color) {
    const int y = kContentY + i * kRowH;
    if (selected) {
        canvas->fillRoundRect(1, y + 1, kW - 8, kRowH - 1, 3, kSel);
        canvas->fillRect(1, y + 2, 3, kRowH - 3, kAccent);
    }
    const int right_w = right.empty() ? 0 : text_width(right) + 6;
    text(8, y + 2, ellipsize(left, kW - 16 - right_w), selected ? kFg : left_color);
    if (!right.empty()) text_right(kW - 10, y + 2, right, selected ? kAccent : kDim);
}

void scrollbar(int top, int visible, int count) {
    if (count <= visible) return;
    const int x = kW - 4, y = kContentY + 2, h = kContentH - 4;
    canvas->fillRect(x, y, 2, h, kPanel);
    const int bh = std::max(6, h * visible / count);
    const int by = y + (h - bh) * top / std::max(1, count - visible);
    canvas->fillRect(x, by, 2, bh, kDim);
}

void progress(int x, int y, int w, int h, float frac, uint16_t color) {
    if (frac < 0) frac = 0;
    if (frac > 1) frac = 1;
    canvas->drawRoundRect(x, y, w, h, 3, kDim);
    const int fw = static_cast<int>((w - 4) * frac);
    if (fw > 0) canvas->fillRoundRect(x + 2, y + 2, fw, h - 4, 2, color);
}

namespace {
uint32_t bat_last = 0;
int bat_level = -1;
bool bat_charging = false;
void bat_refresh() {
    // La lettura della batteria è lenta: si aggiorna al massimo ogni 3 secondi.
    const uint32_t now = millis();
    if (bat_last == 0 || now - bat_last > 3000) {
        bat_last = now ? now : 1;
        bat_level = M5Cardputer.Power.getBatteryLevel();
        bat_charging = M5Cardputer.Power.isCharging() == m5::Power_Class::is_charging_t::is_charging;
    }
}
}  // namespace

int battery_level() {
    bat_refresh();
    return bat_level;
}

bool battery_charging() {
    bat_refresh();
    return bat_charging;
}

void battery(int x, int y) {
    const int level = battery_level();
    const bool charging = battery_charging();
    canvas->drawRect(x, y, 20, 10, kFg);
    canvas->fillRect(x + 20, y + 3, 2, 4, kFg);
    const uint16_t col = level < 0 ? kDim : (level < 20 ? kErr : (level < 50 ? kWarn : kOk));
    const int w = level < 0 ? 0 : (16 * level / 100);
    if (w > 0) canvas->fillRect(x + 2, y + 2, w, 6, col);
    if (charging) canvas->fillTriangle(x + 8, y + 1, x + 12, y + 1, x + 8, y + 8, kAccent2);
}

void bars(int x, int y, uint8_t level, uint16_t color) {
    for (int i = 0; i < 4; ++i) {
        const int h = 3 + i * 2;
        canvas->fillRect(x + i * 4, y + 10 - h, 3, h, i < level ? color : kPanel);
    }
}

void panel(int x, int y, int w, int h, uint16_t color) { canvas->fillRoundRect(x, y, w, h, 4, color); }

}  // namespace ui
