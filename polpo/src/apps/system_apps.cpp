// Polpo — app di sistema: impostazioni, info, diagnostica, file.
#include <Arduino.h>
#include <esp_chip_info.h>

#include <cstdio>

#include "apps/apps.h"
#include "board_pins.h"
#include "core/settings.h"
#include "core/sound.h"
#include "core/storage.h"
#include "core/widgets.h"
#include "hal/grove.h"
#include "hal/ir.h"
#include "hal/rf433.h"
#include "polpo/ir/ir_codec.h"

#ifndef POLPO_VERSION
#define POLPO_VERSION "dev"
#endif
#ifndef POLPO_GIT
#define POLPO_GIT "nogit"
#endif

namespace {

const char* board_name() {
    switch (M5.getBoard()) {
        case m5::board_t::board_M5Cardputer: return "Cardputer v1.x";
        case m5::board_t::board_M5CardputerADV: return "Cardputer Adv";
        default: return "sconosciuta";
    }
}

// ---------------- Impostazioni ----------------

class SettingsScreen : public MenuScreen {
public:
    SettingsScreen() : MenuScreen("Impostazioni") { rebuild(); }

private:
    void rebuild() {
        auto& s = settings::get();
        char b[16];
        std::vector<MenuItem> items;
        std::snprintf(b, sizeof b, "%u/5", s.brightness + 1);
        items.push_back({"Luminosità", b, [this] {
                             auto& st = settings::get();
                             st.brightness = (st.brightness + 1) % 5;
                             ui::set_brightness(st.brightness);
                             settings::save();
                             rebuild();
                         }});
        items.push_back({"Suoni", s.sound ? "sì" : "no", [this] {
                             settings::get().sound = !settings::get().sound;
                             settings::save();
                             sound::ok();
                             rebuild();
                         }});
        items.push_back({"Layout BadUSB", polpo::layout_name(s.layout), [this] {
                             auto& st = settings::get();
                             st.layout = st.layout == polpo::KbLayout::IT ? polpo::KbLayout::US : polpo::KbLayout::IT;
                             settings::save();
                             rebuild();
                         }});
        std::snprintf(b, sizeof b, "%u", s.ir_repeats);
        items.push_back({"Invii IR per tasto", b, [this] {
                             auto& st = settings::get();
                             st.ir_repeats = st.ir_repeats % 5 + 1;
                             settings::save();
                             rebuild();
                         }});
        std::snprintf(b, sizeof b, "%u", s.rf_repeats);
        items.push_back({"Ripetizioni 433 MHz", b, [this] {
                             auto& st = settings::get();
                             st.rf_repeats = st.rf_repeats >= 20 ? 3 : st.rf_repeats + 1;
                             settings::save();
                             rebuild();
                         }});
        items.push_back({"Ricrea cartelle SD", "", [] {
                             if (!storage::ok() && !storage::retry()) return show_error("microSD non trovata.");
                             storage::ensure_layout();
                             show_message("microSD", "Cartelle /polpo e file di esempio pronti.", ui::kOk);
                         }});
        const int sel = model_.selected;
        set_items(items);
        model_.select(sel);
    }
};

// ---------------- Info ----------------

class AboutScreen : public Screen {
public:
    void on_event(const InputEvent& ev) override {
        if (ev.key == Key::Back || ev.key == Key::Ok || ev.key == Key::Backspace) nav.pop();
    }
    void draw() override {
        ui::header("Info");
        char b[64];
        int y = ui::kContentY + 2;
        auto line = [&](const std::string& k, const std::string& v) {
            ui::text(6, y, k, ui::kDim);
            ui::text(96, y, v, ui::kFg);
            y += 14;
        };
        line("Firmware", std::string("Polpo ") + POLPO_VERSION);
        line("Commit", POLPO_GIT);
        line("Scheda", board_name());
        std::snprintf(b, sizeof b, "%u KB liberi", static_cast<unsigned>(ESP.getFreeHeap() / 1024));
        line("Memoria", b);
        line("microSD", storage::ok() ? human_size(storage::used_bytes()) + " / " + human_size(storage::total_bytes())
                                      : "assente");
        line("Licenza", "MIT (codice Polpo)");
        ui::text(6, y + 2, "Usalo solo su dispositivi tuoi.", ui::kAccent);
        ui::footer("` indietro");
    }
};

// ---------------- Diagnostica ----------------

class DiagScreen : public MenuScreen {
public:
    DiagScreen() : MenuScreen("Diagnostica") {
        set_items({
            {"Tastiera", "", [] { open_key_test(); }},
            {"microSD: scrivi e rileggi", "", [] { sd_test(); }},
            {"Scansione I2C (Grove)", "", [] { i2c_test(); }},
            {"LED infrarosso", "", [] { ir_test(); }},
            {"Ricevitore RF433R", "", [] { rf_test(); }},
            {"Riepilogo", "", [] { summary(); }},
        });
    }

private:
    static void open_key_test();
    static void sd_test() {
        if (!storage::ok() && !storage::retry()) return show_error("microSD non trovata. Formattala in FAT32 e reinseriscila.");
        const std::string p = "/polpo/logs/test_sd.txt";
        const std::string data = "Polpo test " + std::to_string(millis());
        std::string back;
        const bool ok = storage::write_text(p, data) && storage::read_text(p, back) && back == data;
        storage::remove(p);
        if (ok) {
            sound::ok();
            show_message("microSD", "Scrittura e lettura riuscite.", ui::kOk);
        } else {
            show_error("La microSD non ha superato il test.");
        }
    }
    static void i2c_test() {
        const auto found = grove::i2c_scan();
        grove::release();
        std::string body;
        if (found.empty()) body = "Nessun dispositivo I2C sulla porta Grove.";
        for (uint8_t a : found) {
            char b[64];
            std::snprintf(b, sizeof b, "0x%02X  %s\n", a, grove::i2c_device_name(a));
            body += b;
        }
        show_message("I2C", body);
    }
    static void ir_test() {
        // Invia per 5 secondi un segnale NEC innocuo: il LED si vede con la fotocamera del telefono.
        polpo::IrSignal s;
        s.protocol = polpo::IrProtocol::NEC;
        s.address = 0xEE;
        s.command = 0xEE;
        const uint32_t start = millis();
        int n = 0;
        while (millis() - start < 5000) {
            if (ir::send(s)) ++n;
            delay(60);
        }
        ir::tx_end();
        show_message("LED IR", "Inviati " + std::to_string(n) +
                                   " segnali. Guardando il LED con la fotocamera del telefono dovevi vedere un lampeggio viola.");
    }
    static void rf_test();
    static void summary() {
        char b[220];
        std::snprintf(b, sizeof b,
                      "Scheda: %s\nmicroSD: %s\nRFID2 (0x28): %s\nMemoria libera: %u KB\nAvvii: %u\n"
                      "Se qualcosa non va, annota questi dati.",
                      board_name(), storage::ok() ? "ok" : "assente",
                      grove::i2c_probe(pins::kRfid2Addr) ? "trovato" : "non collegato",
                      static_cast<unsigned>(ESP.getFreeHeap() / 1024), static_cast<unsigned>(settings::get().boots));
        grove::release();
        show_message("Riepilogo", b);
    }
};

class KeyTestScreen : public Screen {
public:
    void on_event(const InputEvent& ev) override {
        if (ev.key == Key::Back && ev.ch == 0) {  // solo G0 esce: tutti gli altri tasti si provano
            nav.pop();
            return;
        }
        char b[48];
        const char* name = "Carattere";
        switch (ev.key) {
            case Key::Up: name = "Su"; break;
            case Key::Down: name = "Giù"; break;
            case Key::Left: name = "Sinistra"; break;
            case Key::Right: name = "Destra"; break;
            case Key::Ok: name = "Invio"; break;
            case Key::Back: name = "Esc"; break;
            case Key::Backspace: name = "Cancella"; break;
            case Key::Tab: name = "Tab"; break;
            default: break;
        }
        std::snprintf(b, sizeof b, "%s  '%c'%s%s%s", name, ev.ch ? ev.ch : ' ', ev.fn ? " +Fn" : "",
                      ev.shift ? " +Shift" : "", ev.ctrl ? " +Ctrl" : "");
        last_ = b;
        ++count_;
    }
    void draw() override {
        ui::header("Test tastiera");
        ui::text(6, ui::kContentY + 6, "Premi i tasti uno alla volta.", ui::kDim);
        ui::text(6, ui::kContentY + 30, last_.empty() ? "-" : last_, ui::kAccent);
        ui::text(6, ui::kContentY + 54, "Tasti letti: " + std::to_string(count_), ui::kFg);
        ui::footer("tasto G0 (laterale) per uscire");
    }

private:
    std::string last_;
    int count_ = 0;
};

void DiagScreen::open_key_test() { open<KeyTestScreen>(); }

class RfCounterScreen : public Screen {
public:
    void on_enter() override {
        rf433::raw_begin();
        base_ = rf433::raw_edge_count();
        t0_ = millis();
    }
    void on_exit() override { rf433::raw_end(); }
    void on_event(const InputEvent& ev) override {
        if (ev.key == Key::Back || ev.key == Key::Backspace || ev.key == Key::Ok) nav.pop();
    }
    uint32_t redraw_interval_ms() const override { return 250; }
    void draw() override {
        const uint32_t now = millis();
        const uint32_t edges = rf433::raw_edge_count();
        if (now - t_last_ >= 1000) {
            rate_ = edges - last_edges_;
            last_edges_ = edges;
            t_last_ = now;
        }
        ui::header("RF433R: fronti al secondo");
        char b[48];
        std::snprintf(b, sizeof b, "%u /s", static_cast<unsigned>(rate_));
        ui::big_text_center(ui::kContentY + 14, b, ui::kAccent);
        ui::wrap(6, ui::kContentY + 50, ui::kW - 12,
                 "Collega l'RF433R. A riposo il numero oscilla (rumore); premendo un telecomando a 433 MHz "
                 "vicino deve cambiare in modo evidente.",
                 ui::kDim, 13, 4);
        ui::footer("` indietro");
    }

private:
    uint32_t base_ = 0, t0_ = 0, t_last_ = 0, last_edges_ = 0, rate_ = 0;
};

void DiagScreen::rf_test() { open<RfCounterScreen>(); }

// ---------------- File ----------------

void open_file_actions(const std::string& path);

class FilesScreen : public FileBrowserScreen {
public:
    FilesScreen() : FileBrowserScreen("File  /polpo", storage::kRoot, nullptr, open_file_actions) {}
};

void open_file_actions(const std::string& path) {
    const std::string name = storage::basename(path);
    std::vector<MenuItem> items = {
        {"Mostra contenuto", "", [path, name] {
             std::string text;
             if (!storage::read_text(path, text, 24 * 1024)) return show_error("File troppo grande o illeggibile (max 24 KB).");
             open<TextViewScreen>(name, text);
         }},
        {"Elimina", "", [path, name] {
             ask_confirm("Eliminare?", "Il file \"" + name + "\" verrà cancellato dalla microSD.", [path](bool yes) {
                 if (!yes) return;
                 if (storage::remove(path)) {
                     nav.pop();  // chiude il menu azioni
                     sound::ok();
                 } else {
                     show_error("Impossibile eliminare il file.");
                 }
             });
         }},
    };
    open<MenuScreen>(name, items);
}

}  // namespace

void open_settings_app() { open<SettingsScreen>(); }
void open_about_app() { open<AboutScreen>(); }
void open_diag_app() { open<DiagScreen>(); }
void open_files_app() {
    if (!storage::ok() && !storage::retry()) return show_error("microSD non trovata. Inseriscila (FAT32) e riprova.");
    open<FilesScreen>();
}
