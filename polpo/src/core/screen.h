// Polpo — schermate e pila di navigazione.
// Le operazioni push/pop sono differite alla fine del ciclo, così una schermata
// può chiudere sé stessa dentro on_event() senza problemi.
#pragma once

#include <functional>
#include <memory>
#include <vector>

#include "core/input.h"

class Screen {
public:
    virtual ~Screen() = default;
    virtual void on_enter() {}
    virtual void on_resume() {}  // si torna a questa schermata da una figlia
    virtual void on_exit() {}
    virtual void on_event(const InputEvent& ev) = 0;
    virtual void tick(uint32_t /*now_ms*/) {}
    virtual void draw() = 0;
    // Le schermate animate chiedono un ridisegno periodico (ms, 0 = solo quando cambia qualcosa).
    virtual uint32_t redraw_interval_ms() const { return 0; }

    void invalidate() { dirty_ = true; }
    bool dirty() const { return dirty_; }
    void clean() { dirty_ = false; }

private:
    bool dirty_ = true;
};

class ScreenStack {
public:
    void push(std::unique_ptr<Screen> s);
    void pop();
    void replace(std::unique_ptr<Screen> s);
    void pop_to_root();
    Screen* top() const { return stack_.empty() ? nullptr : stack_.back().get(); }
    size_t depth() const { return stack_.size(); }

    // Un giro del ciclo principale: eventi, tick, ridisegno, poi operazioni differite.
    void run_once(uint32_t now_ms);

private:
    void apply_pending();
    struct Op {
        enum Kind { Push, Pop, Replace, Root } kind;
        std::unique_ptr<Screen> screen;
    };
    std::vector<std::unique_ptr<Screen>> stack_;
    std::vector<Op> pending_;
    uint32_t last_draw_ = 0;
};

extern ScreenStack nav;

template <typename T, typename... Args>
void open(Args&&... args) {
    nav.push(std::unique_ptr<Screen>(new T(std::forward<Args>(args)...)));
}
