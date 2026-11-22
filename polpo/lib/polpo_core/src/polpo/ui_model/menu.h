// Polpo — logica di navigazione dei menu e ripetizione dei tasti (testabile su PC).
#pragma once

#include <cstdint>

namespace polpo {

struct MenuModel {
    int count = 0;
    int selected = 0;
    int top = 0;      // prima riga visibile
    int visible = 5;  // righe che entrano nello schermo
    bool wrap = true; // dall'ultima voce si torna alla prima

    void set_count(int n);
    void up();
    void down();
    void page_up();
    void page_down();
    void select(int i);
    void ensure_visible();
};

// Ripetizione automatica quando un tasto resta premuto.
class KeyRepeat {
public:
    KeyRepeat(uint32_t first_delay_ms = 400, uint32_t interval_ms = 90)
        : first_(first_delay_ms), interval_(interval_ms) {}
    // Chiamato a ogni ciclo con lo stato del tasto: true quando va generato un evento.
    bool update(bool down, uint32_t now_ms);
    bool held() const { return down_; }

private:
    uint32_t first_, interval_;
    bool down_ = false;
    uint32_t next_ = 0;
};

}  // namespace polpo
