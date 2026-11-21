#include "core/input.h"

#include <M5Cardputer.h>

#include <algorithm>

Input input;

namespace {

bool is_modifier(uint8_t code) {
    return code == KEY_FN || code == KEY_OPT || code == KEY_LEFT_CTRL || code == KEY_LEFT_SHIFT ||
           code == KEY_LEFT_ALT;
}

Key map_key(uint8_t code) {
    switch (code) {
        case KEY_ENTER: return Key::Ok;
        case KEY_BACKSPACE: return Key::Backspace;
        case KEY_TAB: return Key::Tab;
        case '`': return Key::Back;
        case ';': return Key::Up;
        case '.': return Key::Down;
        case ',': return Key::Left;
        case '/': return Key::Right;
        default: return Key::Char;
    }
}

}  // namespace

void Input::emit(uint8_t code, char shifted, bool repeat) {
    InputEvent ev;
    ev.key = map_key(code);
    ev.fn = fn_;
    ev.shift = shift_;
    ev.ctrl = ctrl_;
    ev.alt = alt_;
    ev.opt = opt_;
    ev.repeat = repeat;
    // Invio, Cancella e Tab hanno codici HID (0x28, 0x2A, 0x2B) che coincidono con '(' '*' '+'.
    const bool special = code == KEY_ENTER || code == KEY_BACKSPACE || code == KEY_TAB;
    if (!special && code >= 0x20 && code < 0x7F) ev.ch = shift_ ? shifted : static_cast<char>(code);
    if (queue_.size() < 32) queue_.push_back(ev);
}

void Input::update(uint32_t now) {
    auto& kb = M5Cardputer.Keyboard;
    const auto& list = kb.keyList();
    std::vector<uint8_t> codes;
    std::vector<char> seconds;
    codes.reserve(list.size());
    fn_ = shift_ = ctrl_ = alt_ = opt_ = false;
    for (const auto& p : list) {
        const auto kv = kb.getKeyValue(p);
        const uint8_t code = static_cast<uint8_t>(kv.value_first);
        switch (code) {
            case KEY_FN: fn_ = true; break;
            case KEY_OPT: opt_ = true; break;
            case KEY_LEFT_CTRL: ctrl_ = true; break;
            case KEY_LEFT_SHIFT: shift_ = true; break;
            case KEY_LEFT_ALT: alt_ = true; break;
            default: break;
        }
        codes.push_back(code);
        seconds.push_back(kv.value_second);
    }

    // Tasti appena premuti.
    for (size_t i = 0; i < codes.size(); ++i) {
        const uint8_t c = codes[i];
        if (is_modifier(c)) continue;
        if (std::find(prev_.begin(), prev_.end(), c) != prev_.end()) continue;
        emit(c, seconds[i], false);
        last_activity_ = now;
        repeat_code_ = c;
        repeat_char_ = seconds[i];
        repeat_.update(false, now);
        repeat_.update(true, now);  // primo evento già emesso: parte il ritardo
    }

    // Ripetizione automatica per frecce e cancella, se resta premuto un solo tasto.
    size_t non_mod = 0;
    uint8_t held = 0;
    for (uint8_t c : codes)
        if (!is_modifier(c)) {
            ++non_mod;
            held = c;
        }
    const Key k = map_key(held);
    const bool repeatable = k == Key::Up || k == Key::Down || k == Key::Left || k == Key::Right || k == Key::Backspace;
    if (non_mod == 1 && held == repeat_code_ && repeatable) {
        if (repeat_.update(true, now)) {
            emit(held, repeat_char_, true);
            last_activity_ = now;
        }
    } else {
        repeat_.update(false, now);
    }

    // Il tasto G0 (BtnA) sul lato funziona come "indietro".
    if (M5Cardputer.BtnA.wasPressed()) {
        InputEvent ev;
        ev.key = Key::Back;
        queue_.push_back(ev);
        last_activity_ = now;
    }
    prev_ = codes;
}

bool Input::pop(InputEvent& ev) {
    if (queue_.empty()) return false;
    ev = queue_.front();
    queue_.pop_front();
    return true;
}
