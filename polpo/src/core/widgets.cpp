#include "core/widgets.h"

#include <cstdio>

#include "core/sound.h"
#include "core/storage.h"

// ---------------- MenuScreen ----------------

MenuScreen::MenuScreen(std::string title, std::vector<MenuItem> items, std::string hints)
    : title_(std::move(title)), hints_(std::move(hints)) {
    model_.visible = ui::kVisibleRows;
    set_items(std::move(items));
}

void MenuScreen::set_items(std::vector<MenuItem> items) {
    items_ = std::move(items);
    model_.set_count(static_cast<int>(items_.size()));
    invalidate();
}

void MenuScreen::on_event(const InputEvent& ev) {
    if (on_extra_key(ev)) return;
    switch (ev.key) {
        case Key::Up: model_.up(); break;
        case Key::Down: model_.down(); break;
        case Key::Left: model_.page_up(); break;
        case Key::Right: model_.page_down(); break;
        case Key::Ok:
            if (!items_.empty() && items_[model_.selected].action) {
                sound::click();
                // Copia: l'azione può ricostruire il menu (e quindi distruggere l'originale).
                const auto action = items_[model_.selected].action;
                action();
            }
            break;
        case Key::Back:
        case Key::Backspace: on_back(); break;
        default: break;
    }
}

void MenuScreen::draw_empty() { ui::text_center(ui::kContentY + 40, empty_text_, ui::kDim); }

void MenuScreen::draw() {
    ui::header(title_);
    if (items_.empty()) {
        draw_empty();
    } else {
        for (int i = 0; i < ui::kVisibleRows; ++i) {
            const int idx = model_.top + i;
            if (idx >= static_cast<int>(items_.size())) break;
            const auto& it = items_[idx];
            ui::row(i, idx == model_.selected, it.label, it.right, it.color);
        }
        ui::scrollbar(model_.top, ui::kVisibleRows, static_cast<int>(items_.size()));
    }
    ui::footer(hints_);
}

// ---------------- MessageScreen ----------------

MessageScreen::MessageScreen(std::string title, std::string body, uint16_t accent, std::function<void()> on_close)
    : title_(std::move(title)), body_(std::move(body)), accent_(accent), on_close_(std::move(on_close)) {}

void MessageScreen::on_event(const InputEvent& ev) {
    if (ev.key == Key::Up && scroll_ > 0) {
        --scroll_;
    } else if (ev.key == Key::Down) {
        const int lines = ui::wrap_count(ui::kW - 12, body_);
        if (scroll_ + 7 < lines) ++scroll_;
    } else if (ev.key == Key::Ok || ev.key == Key::Back || ev.key == Key::Backspace) {
        nav.pop();
        if (on_close_) on_close_();
    }
}

void MessageScreen::draw() {
    ui::header(title_, accent_);
    ui::wrap(6, ui::kContentY + 3, ui::kW - 12, body_, ui::kFg, 14, 7, scroll_);
    ui::footer("OK chiudi   ; . scorri");
}

// ---------------- ConfirmScreen ----------------

ConfirmScreen::ConfirmScreen(std::string title, std::string body, std::function<void(bool)> done, std::string yes,
                             std::string no, uint16_t accent)
    : title_(std::move(title)),
      body_(std::move(body)),
      yes_(std::move(yes)),
      no_(std::move(no)),
      done_(std::move(done)),
      accent_(accent) {}

void ConfirmScreen::on_event(const InputEvent& ev) {
    if (ev.key == Key::Left || ev.key == Key::Right || ev.key == Key::Tab) {
        choice_ = !choice_;
    } else if (ev.key == Key::Ok) {
        const bool c = choice_;
        auto cb = done_;
        nav.pop();
        if (cb) cb(c);
    } else if (ev.key == Key::Back || ev.key == Key::Backspace) {
        auto cb = done_;
        nav.pop();
        if (cb) cb(false);
    } else if (ev.ch == 's' || ev.ch == 'S' || ev.ch == 'y' || ev.ch == 'Y') {
        choice_ = true;
    } else if (ev.ch == 'n' || ev.ch == 'N') {
        choice_ = false;
    }
}

void ConfirmScreen::draw() {
    ui::header(title_, accent_);
    ui::wrap(6, ui::kContentY + 4, ui::kW - 12, body_, ui::kFg, 14, 5);
    const int y = ui::kH - ui::kFooterH - 22;
    const int w = 90;
    auto button = [&](int x, const std::string& label, bool sel) {
        ui::c().fillRoundRect(x, y, w, 18, 4, sel ? accent_ : ui::kPanel);
        ui::text(x + (w - ui::text_width(label)) / 2, y + 3, label, sel ? ui::kBg : ui::kFg);
    };
    button(22, no_, !choice_);
    button(ui::kW - 22 - w, yes_, choice_);
    ui::footer(", / scegli   OK conferma   ` annulla");
}

// ---------------- TextInputScreen ----------------

TextInputScreen::TextInputScreen(std::string title, std::string initial, size_t max_len, Kind kind,
                                 std::function<void(const std::string&)> done)
    : title_(std::move(title)), text_(std::move(initial)), max_len_(max_len), kind_(kind), done_(std::move(done)) {}

bool TextInputScreen::allowed(char c) const {
    if (c < 0x20 || c > 0x7E) return false;
    switch (kind_) {
        case Kind::FileName:
            return (c >= 'a' && c <= 'z') || (c >= 'A' && c <= 'Z') || (c >= '0' && c <= '9') || c == '_' ||
                   c == '-' || c == ' ';
        case Kind::Url:
            return c != ' ' && c != '`';
        default:
            return c != '`';
    }
}

void TextInputScreen::on_event(const InputEvent& ev) {
    if (ev.key == Key::Back && ev.ch == '`' && !ev.fn) {
        nav.pop();
        return;
    }
    if (ev.key == Key::Back && ev.ch == 0) {  // tasto G0
        nav.pop();
        return;
    }
    if (ev.key == Key::Ok) {
        auto cb = done_;
        const std::string t = text_;
        nav.pop();
        if (cb) cb(t);
        return;
    }
    if (ev.key == Key::Backspace) {
        if (!text_.empty()) {
            size_t n = text_.size() - 1;
            while (n > 0 && (static_cast<uint8_t>(text_[n]) & 0xC0) == 0x80) --n;
            text_.erase(n);
        }
        return;
    }
    // Con Fn premuto le frecce non scrivono; altrimenti ; . , / sono caratteri normali.
    if (ev.fn) return;
    if (ev.ch && allowed(ev.ch) && text_.size() < max_len_) text_.push_back(ev.ch);
}

void TextInputScreen::draw() {
    ui::header(title_);
    ui::panel(4, ui::kContentY + 8, ui::kW - 8, 40);
    const bool cursor_on = (millis() / 500) % 2 == 0;
    std::string shown = text_;
    // Mostra la parte finale se il testo non entra in due righe.
    while (ui::text_width(shown) > 2 * (ui::kW - 20) && shown.size() > 1) shown.erase(0, 1);
    const int lines = ui::wrap(10, ui::kContentY + 12, ui::kW - 20, shown + (cursor_on ? "_" : " "), ui::kFg, 15, 2);
    (void)lines;
    char count[24];
    std::snprintf(count, sizeof count, "%u/%u", static_cast<unsigned>(text_.size()), static_cast<unsigned>(max_len_));
    ui::text_right(ui::kW - 6, ui::kContentY + 52, count, ui::kDim);
    if (kind_ == Kind::FileName) ui::text(6, ui::kContentY + 52, "lettere, numeri, _ e -", ui::kDim);
    if (kind_ == Kind::Url) ui::text(6, ui::kContentY + 52, "es. https://example.com", ui::kDim);
    ui::footer("OK conferma   DEL cancella   ` annulla");
}

// ---------------- TextViewScreen ----------------

TextViewScreen::TextViewScreen(std::string title, std::string body) : title_(std::move(title)), body_(std::move(body)) {}

void TextViewScreen::on_event(const InputEvent& ev) {
    if (lines_ < 0) lines_ = ui::wrap_count(ui::kW - 12, body_);
    const int page = 7;
    switch (ev.key) {
        case Key::Up: top_ = std::max(0, top_ - 1); break;
        case Key::Down: top_ = std::min(std::max(0, lines_ - page), top_ + 1); break;
        case Key::Left: top_ = std::max(0, top_ - page); break;
        case Key::Right: top_ = std::min(std::max(0, lines_ - page), top_ + page); break;
        case Key::Ok:
        case Key::Back:
        case Key::Backspace: nav.pop(); break;
        default: break;
    }
}

void TextViewScreen::draw() {
    ui::header(title_);
    if (lines_ < 0) lines_ = ui::wrap_count(ui::kW - 12, body_);
    ui::wrap(6, ui::kContentY + 2, ui::kW - 12, body_, ui::kFg, 15, 7, top_);
    ui::scrollbar(top_, 7, lines_);
    ui::footer("; . riga   , / pagina   ` chiudi");
}

// ---------------- FileBrowserScreen ----------------

FileBrowserScreen::FileBrowserScreen(std::string title, std::string dir, const char* ext, Pick pick, bool subdirs)
    : MenuScreen(title, {}, "OK apri   ` indietro"),
      root_(dir),
      dir_(std::move(dir)),
      ext_(ext),
      pick_(std::move(pick)),
      subdirs_(subdirs) {
    base_title_ = title_;
    empty_text_ = "Cartella vuota";
}

void FileBrowserScreen::on_enter() { reload(); }
void FileBrowserScreen::on_resume() { reload(); }

void FileBrowserScreen::reload() {
    // Nel titolo la sottocartella corrente, es. "File  /polpo /logs".
    title_ = dir_ == root_ ? base_title_ : base_title_ + " " + dir_.substr(root_.size());
    std::vector<MenuItem> items;
    if (!storage::ok()) {
        empty_text_ = "microSD non trovata";
        set_items({});
        return;
    }
    std::vector<storage::Entry> entries;
    storage::list(dir_, entries, ext_);
    for (const auto& e : entries) {
        if (e.dir && !subdirs_) continue;
        MenuItem it;
        const std::string path = storage::join(dir_, e.name);
        if (e.dir) {
            it.label = e.name + "/";
            it.color = ui::kAccent2;
            it.action = [this, path]() {
                dir_ = path;
                model_.select(0);
                reload();
            };
        } else {
            it.label = e.name;
            it.right = human_size(e.size);
            it.action = [this, path]() {
                if (pick_) pick_(path);
            };
        }
        items.push_back(it);
    }
    set_items(items);
}

void FileBrowserScreen::on_back() {
    if (dir_ != root_ && dir_.size() > root_.size()) {
        dir_ = dir_.substr(0, dir_.find_last_of('/'));
        if (dir_.empty()) dir_ = "/";
        model_.select(0);
        reload();
        return;
    }
    nav.pop();
}

// ---------------- utilità ----------------

void show_message(const std::string& title, const std::string& body, uint16_t accent) {
    open<MessageScreen>(title, body, accent);
}

void show_error(const std::string& body) {
    sound::error();
    open<MessageScreen>("Errore", body, ui::kErr);
}

void ask_confirm(const std::string& title, const std::string& body, std::function<void(bool)> done) {
    open<ConfirmScreen>(title, body, std::move(done));
}

std::string human_size(uint64_t b) {
    char buf[24];
    if (b < 1024) {
        std::snprintf(buf, sizeof buf, "%u B", static_cast<unsigned>(b));
    } else if (b < 1024 * 1024) {
        std::snprintf(buf, sizeof buf, "%.1f KB", static_cast<double>(b) / 1024.0);
    } else if (b < 1024ull * 1024 * 1024) {
        std::snprintf(buf, sizeof buf, "%.1f MB", static_cast<double>(b) / (1024.0 * 1024.0));
    } else {
        std::snprintf(buf, sizeof buf, "%.1f GB", static_cast<double>(b) / (1024.0 * 1024.0 * 1024.0));
    }
    return buf;
}
