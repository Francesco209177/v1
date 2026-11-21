// Polpo — app BadUSB: esegue script DuckyScript dalla microSD come tastiera USB.
// Sicurezza: anteprima, conferma esplicita, conto alla rovescia annullabile, mai all'avvio.
#include <Arduino.h>

#include <cstdio>
#include <memory>

#include "apps/apps.h"
#include "core/settings.h"
#include "core/sound.h"
#include "core/storage.h"
#include "core/widgets.h"
#include "hal/usb_kbd.h"
#include "polpo/ducky/ducky.h"
#include "polpo/util/utf8.h"

namespace {

class RunScreen : public Screen {
public:
    using Script = std::shared_ptr<const polpo::DuckyScript>;
    RunScreen(std::string name, Script script, polpo::KbLayout layout)
        : name_(std::move(name)), script_(std::move(script)), layout_(layout) {}
    void on_enter() override { start_ = millis(); }
    void on_event(const InputEvent& ev) override {
        // Qualsiasi tasto interrompe (anche durante l'esecuzione).
        (void)ev;
        if (state_ != State::Done) {
            usb_kbd::release_all();
            state_ = State::Done;
            stopped_ = true;
            return;
        }
        nav.pop();
    }
    void tick(uint32_t now) override {
        if (state_ == State::Countdown) {
            if (now - start_ >= 3000) {
                state_ = State::Running;
                next_ = now;
            }
            invalidate();
            return;
        }
        if (state_ != State::Running || now < next_) return;
        // Un'azione per ciclo, così i tasti del Cardputer restano attivi per fermare lo script.
        if (index_ >= script_->actions.size()) {
            state_ = State::Done;
            usb_kbd::release_all();
            sound::ok();
            settings::add_xp(2);
            invalidate();
            return;
        }
        const auto& a = script_->actions[index_];
        line_ = a.line;
        switch (a.type) {
            case polpo::DuckyActionType::Delay:
                next_ = now + a.ms;
                ++index_;
                break;
            case polpo::DuckyActionType::Key:
                usb_kbd::tap(a.modifiers, a.keycode);
                next_ = millis();
                ++index_;
                break;
            case polpo::DuckyActionType::Text: {
                // Al massimo 8 caratteri per ciclo: il tasto di STOP resta reattivo.
                size_t end = text_pos_;
                uint32_t cp;
                for (int k = 0; k < 8 && end < a.text.size(); ++k) polpo::utf8_next(a.text, end, cp);
                usb_kbd::type(a.text.substr(text_pos_, end - text_pos_), layout_);
                text_pos_ = end;
                if (text_pos_ >= a.text.size()) {
                    text_pos_ = 0;
                    ++index_;
                }
                next_ = millis();
                break;
            }
        }
        invalidate();
    }
    uint32_t redraw_interval_ms() const override { return 200; }
    void draw() override {
        ui::header("BadUSB: " + name_, ui::kWarn);
        char b[64];
        switch (state_) {
            case State::Countdown: {
                const uint32_t left = 3 - std::min<uint32_t>(3, (millis() - start_) / 1000);
                std::snprintf(b, sizeof b, "Avvio tra %u...", static_cast<unsigned>(left));
                ui::big_text_center(ui::kContentY + 10, b, ui::kWarn);
                ui::text_center(ui::kContentY + 50, "Premi un tasto qualsiasi per annullare", ui::kFg);
                break;
            }
            case State::Running:
                std::snprintf(b, sizeof b, "Riga %u di %u", static_cast<unsigned>(line_),
                              static_cast<unsigned>(script_->line_count));
                ui::text(6, ui::kContentY + 8, "In esecuzione sul computer collegato", ui::kFg);
                ui::text(6, ui::kContentY + 28, b, ui::kAccent);
                ui::progress(6, ui::kContentY + 50, ui::kW - 12, 12,
                             script_->actions.empty() ? 1.0f : static_cast<float>(index_) / script_->actions.size());
                break;
            case State::Done:
                ui::text(6, ui::kContentY + 8, stopped_ ? "Interrotto." : "Completato.", stopped_ ? ui::kWarn : ui::kOk);
                break;
        }
        ui::footer(state_ == State::Done ? "un tasto per chiudere" : "UN TASTO QUALSIASI = STOP");
    }

private:
    enum class State { Countdown, Running, Done } state_ = State::Countdown;
    std::string name_;
    Script script_;  // condiviso, mai copiato (memoria limitata)
    polpo::KbLayout layout_;
    uint32_t start_ = 0, next_ = 0;
    size_t index_ = 0;
    size_t text_pos_ = 0;
    uint16_t line_ = 0;
    bool stopped_ = false;
};

void open_script(const std::string& path) {
    std::string src;
    if (!storage::read_text(path, src, polpo::kDuckyMaxBytes)) return show_error("File illeggibile o più grande di 32 KB.");
    const polpo::KbLayout layout = settings::get().layout;
    auto script = std::make_shared<polpo::DuckyScript>(polpo::ducky_parse(src, layout));
    src.clear();
    src.shrink_to_fit();
    const polpo::DuckyScript& s = *script;
    const std::string name = storage::basename(path);
    if (!s.ok()) {
        std::string body = "Lo script ha " + std::to_string(s.errors.size()) + " errori e non verrà eseguito:\n";
        for (size_t i = 0; i < s.errors.size() && i < 6; ++i)
            body += "riga " + std::to_string(s.errors[i].line) + ": " + s.errors[i].message + "\n";
        open<MessageScreen>("Errori", body, ui::kErr);
        return;
    }
    char b[220];
    std::snprintf(b, sizeof b,
                  "%s: %u righe, %u caratteri, attese %u s, layout %s.\n"
                  "Solo sul TUO computer, con la finestra giusta in primo piano.",
                  name.c_str(), static_cast<unsigned>(s.line_count), static_cast<unsigned>(s.total_chars),
                  static_cast<unsigned>(s.total_delay_ms / 1000), polpo::layout_name(layout));
    open<ConfirmScreen>(
        "Eseguire lo script?", b,
        [name, script, layout](bool yes) {
            if (!yes) return;
            if (!usb_kbd::connected()) return show_error("Il computer non vede il Polpo: collega il cavo USB-C dati.");
            open<RunScreen>(name, RunScreen::Script(script), layout);
        },
        "Esegui", "Annulla");
}

}  // namespace

void open_badusb_app() {
    std::vector<MenuItem> items = {
        {"Script dalla microSD", "", [] {
             if (!storage::ok() && !storage::retry()) return show_error("microSD non trovata.");
             open<FileBrowserScreen>("Script BadUSB", storage::kBadUsbDir, ".txt", open_script);
         }},
        {"Layout tastiera", polpo::layout_name(settings::get().layout), [] {
             auto& s = settings::get();
             s.layout = s.layout == polpo::KbLayout::IT ? polpo::KbLayout::US : polpo::KbLayout::IT;
             settings::save();
             nav.pop();
             open_badusb_app();
         }},
        {"Prova: scrivi \"Ciao\"", "", [] {
             if (!usb_kbd::connected()) return show_error("Collega il Cardputer al computer con un cavo USB dati.");
             ask_confirm("Prova", "Il Polpo scriverà \"Ciao dal Polpo\" nella finestra attiva del computer, dopo il "
                                  "solito conto alla rovescia annullabile.",
                         [](bool yes) {
                             if (!yes) return;
                             const auto layout = settings::get().layout;
                             auto script = std::make_shared<polpo::DuckyScript>(
                                 polpo::ducky_parse("STRING Ciao dal Polpo\n", layout));
                             open<RunScreen>("prova", RunScreen::Script(script), layout);
                         });
         }},
        {"Comandi supportati", "", [] {
             open<TextViewScreen>("DuckyScript",
                                  "REM commento\nDELAY ms\nDEFAULT_DELAY ms\nSTRING testo\nSTRINGLN testo (+Invio)\n"
                                  "REPEAT n\nENTER TAB ESC SPACE BACKSPACE DELETE INSERT\nHOME END PAGEUP PAGEDOWN\n"
                                  "UP DOWN LEFT RIGHT  F1-F12\nCAPSLOCK NUMLOCK PRINTSCREEN PAUSE MENU\n"
                                  "Combinazioni: GUI r, CTRL ALT DELETE, CTRL-SHIFT ESC, ALT F4\n"
                                  "Limiti: 32 KB, 2000 righe, 1200 azioni, DELAY max 60 s.\nCon layout IT i caratteri ` e ~ "
                                  "non esistono e danno errore.");
         }},
    };
    open<MenuScreen>("BadUSB", items);
}
