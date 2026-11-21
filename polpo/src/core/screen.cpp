#include "core/screen.h"

#include "core/gfx.h"

ScreenStack nav;

void ScreenStack::push(std::unique_ptr<Screen> s) { pending_.push_back({Op::Push, std::move(s)}); }
void ScreenStack::pop() { pending_.push_back({Op::Pop, nullptr}); }
void ScreenStack::replace(std::unique_ptr<Screen> s) { pending_.push_back({Op::Replace, std::move(s)}); }
void ScreenStack::pop_to_root() { pending_.push_back({Op::Root, nullptr}); }

void ScreenStack::apply_pending() {
    while (!pending_.empty()) {
        Op op = std::move(pending_.front());
        pending_.erase(pending_.begin());
        switch (op.kind) {
            case Op::Push:
                stack_.push_back(std::move(op.screen));
                stack_.back()->on_enter();
                stack_.back()->invalidate();
                break;
            case Op::Pop:
                if (stack_.size() > 1) {
                    stack_.back()->on_exit();
                    stack_.pop_back();
                    stack_.back()->on_resume();
                    stack_.back()->invalidate();
                }
                break;
            case Op::Replace:
                if (!stack_.empty()) {
                    stack_.back()->on_exit();
                    stack_.pop_back();
                }
                stack_.push_back(std::move(op.screen));
                stack_.back()->on_enter();
                stack_.back()->invalidate();
                break;
            case Op::Root:
                while (stack_.size() > 1) {
                    stack_.back()->on_exit();
                    stack_.pop_back();
                }
                if (!stack_.empty()) {
                    stack_.back()->on_resume();
                    stack_.back()->invalidate();
                }
                break;
        }
    }
}

void ScreenStack::run_once(uint32_t now) {
    apply_pending();
    Screen* s = top();
    if (!s) return;
    InputEvent ev;
    while (input.pop(ev)) {
        s->on_event(ev);
        s->invalidate();
        if (!pending_.empty()) break;  // la schermata è cambiata: gli altri eventi aspettano
    }
    apply_pending();
    s = top();
    if (!s) return;
    s->tick(now);
    const uint32_t every = s->redraw_interval_ms();
    if (every && now - last_draw_ >= every) s->invalidate();
    if (s->dirty()) {
        ui::clear();
        s->draw();
        ui::present();
        s->clean();
        last_draw_ = now;
    }
}
