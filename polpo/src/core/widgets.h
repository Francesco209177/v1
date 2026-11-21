// Polpo — schermate riutilizzabili: menu, messaggi, conferme, testo, file.
#pragma once

#include <functional>
#include <string>
#include <vector>

#include "core/gfx.h"
#include "core/screen.h"
#include "polpo/ui_model/menu.h"

struct MenuItem {
    std::string label;
    std::string right;  // testo a destra (stato, valore)
    std::function<void()> action;
    uint16_t color = ui::kFg;
};

class MenuScreen : public Screen {
public:
    MenuScreen(std::string title, std::vector<MenuItem> items = {}, std::string hints = "OK apri   ` indietro");
    void on_event(const InputEvent& ev) override;
    void draw() override;

protected:
    void set_items(std::vector<MenuItem> items);
    // Le sottoclassi possono gestire tasti extra (es. Tab); true = gestito.
    virtual bool on_extra_key(const InputEvent& /*ev*/) { return false; }
    // Chiamato da Back: di default chiude la schermata.
    virtual void on_back() { nav.pop(); }
    virtual void draw_empty();
    std::string title_;
    std::vector<MenuItem> items_;
    std::string hints_;
    std::string empty_text_ = "Nessun elemento";
    polpo::MenuModel model_;
};

class MessageScreen : public Screen {
public:
    MessageScreen(std::string title, std::string body, uint16_t accent = ui::kAccent,
                  std::function<void()> on_close = nullptr);
    void on_event(const InputEvent& ev) override;
    void draw() override;

private:
    std::string title_, body_;
    uint16_t accent_;
    std::function<void()> on_close_;
    int scroll_ = 0;
};

class ConfirmScreen : public Screen {
public:
    ConfirmScreen(std::string title, std::string body, std::function<void(bool)> done,
                  std::string yes = "Sì", std::string no = "No", uint16_t accent = ui::kWarn);
    void on_event(const InputEvent& ev) override;
    void draw() override;

private:
    std::string title_, body_, yes_, no_;
    std::function<void(bool)> done_;
    uint16_t accent_;
    bool choice_ = false;  // parte da "No": scelta prudente
};

class TextInputScreen : public Screen {
public:
    enum class Kind { Any, FileName, Url };
    TextInputScreen(std::string title, std::string initial, size_t max_len, Kind kind,
                    std::function<void(const std::string&)> done);
    void on_event(const InputEvent& ev) override;
    void draw() override;
    uint32_t redraw_interval_ms() const override { return 500; }

private:
    bool allowed(char c) const;
    std::string title_, text_;
    size_t max_len_;
    Kind kind_;
    std::function<void(const std::string&)> done_;
};

// Testo lungo con scorrimento (file di testo, risultati).
class TextViewScreen : public Screen {
public:
    TextViewScreen(std::string title, std::string body);
    void on_event(const InputEvent& ev) override;
    void draw() override;

private:
    std::string title_, body_;
    int top_ = 0;
    int lines_ = -1;
};

// Elenco file di una cartella della microSD, con filtro sull'estensione.
class FileBrowserScreen : public MenuScreen {
public:
    using Pick = std::function<void(const std::string& path)>;
    FileBrowserScreen(std::string title, std::string dir, const char* ext, Pick pick, bool allow_subdirs = true);
    void on_enter() override;
    void on_resume() override;

protected:
    void on_back() override;
    void reload();
    std::string root_, dir_, base_title_;
    const char* ext_;
    Pick pick_;
    bool subdirs_;
};

// Utilità per aprire velocemente le schermate comuni.
void show_message(const std::string& title, const std::string& body, uint16_t accent = ui::kAccent);
void show_error(const std::string& body);
void ask_confirm(const std::string& title, const std::string& body, std::function<void(bool)> done);
std::string human_size(uint64_t bytes);
