#include "polpo/ui_model/menu.h"

namespace polpo {

void MenuModel::set_count(int n) {
    count = n < 0 ? 0 : n;
    if (selected >= count) selected = count ? count - 1 : 0;
    if (selected < 0) selected = 0;
    ensure_visible();
}

void MenuModel::up() {
    if (!count) return;
    if (selected > 0) {
        --selected;
    } else if (wrap) {
        selected = count - 1;
    }
    ensure_visible();
}

void MenuModel::down() {
    if (!count) return;
    if (selected < count - 1) {
        ++selected;
    } else if (wrap) {
        selected = 0;
    }
    ensure_visible();
}

void MenuModel::page_up() {
    if (!count) return;
    selected -= visible;
    if (selected < 0) selected = 0;
    ensure_visible();
}

void MenuModel::page_down() {
    if (!count) return;
    selected += visible;
    if (selected > count - 1) selected = count - 1;
    ensure_visible();
}

void MenuModel::select(int i) {
    if (!count) return;
    selected = i < 0 ? 0 : (i >= count ? count - 1 : i);
    ensure_visible();
}

void MenuModel::ensure_visible() {
    if (visible < 1) visible = 1;
    if (selected < top) top = selected;
    if (selected >= top + visible) top = selected - visible + 1;
    if (top > count - visible) top = count - visible;
    if (top < 0) top = 0;
}

bool KeyRepeat::update(bool down, uint32_t now) {
    if (!down) {
        down_ = false;
        return false;
    }
    if (!down_) {
        down_ = true;
        next_ = now + first_;
        return true;
    }
    if (static_cast<int32_t>(now - next_) >= 0) {
        next_ = now + interval_;
        return true;
    }
    return false;
}

}  // namespace polpo
