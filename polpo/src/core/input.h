// Polpo — eventi di tastiera del Cardputer.
// Le frecce sono stampate sui tasti ; . , /  — il tasto ` (ESC) torna indietro.
#pragma once

#include <cstdint>
#include <deque>
#include <vector>

#include "polpo/ui_model/menu.h"

enum class Key : uint8_t { None, Up, Down, Left, Right, Ok, Back, Backspace, Tab, Char };

struct InputEvent {
    Key key = Key::None;
    char ch = 0;  // carattere stampabile (shift applicato), 0 se non c'è
    bool fn = false, shift = false, ctrl = false, alt = false, opt = false;
    bool repeat = false;
    bool nav() const { return key == Key::Up || key == Key::Down || key == Key::Left || key == Key::Right; }
};

class Input {
public:
    // Da chiamare dopo M5Cardputer.update(): legge la tastiera e accoda gli eventi.
    void update(uint32_t now_ms);
    bool pop(InputEvent& ev);
    void clear() { queue_.clear(); }
    uint32_t last_activity_ms() const { return last_activity_; }

private:
    void emit(uint8_t code, char shifted, bool repeat);
    std::vector<uint8_t> prev_;
    std::deque<InputEvent> queue_;
    polpo::KeyRepeat repeat_{380, 70};
    uint8_t repeat_code_ = 0;
    char repeat_char_ = 0;
    bool fn_ = false, shift_ = false, ctrl_ = false, alt_ = false, opt_ = false;
    uint32_t last_activity_ = 0;
};

extern Input input;
