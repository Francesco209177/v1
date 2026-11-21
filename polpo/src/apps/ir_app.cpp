// Polpo — app Infrarossi: telecomando universale, telecomandi salvati, apprendimento.
#include <Arduino.h>

#include <cstdio>

#include "apps/apps.h"
#include "core/settings.h"
#include "core/sound.h"
#include "core/storage.h"
#include "core/widgets.h"
#include "hal/ir.h"
#include "polpo/ir/ir_codec.h"
#include "polpo/ir/ir_file.h"
#include "polpo/ir/ir_library.h"
#include "polpo/util/utf8.h"

namespace {

bool send_signal(const polpo::IrSignal& s) {
    bool ok = true;
    for (uint8_t i = 0; i < settings::get().ir_repeats; ++i) {
        ok = ir::send(s) && ok;
        if (i + 1 < settings::get().ir_repeats) delay(40);
    }
    return ok;
}

// ---------- Telecomando universale: invia lo stesso tasto per tutte le marche ----------

class UniversalSendScreen : public Screen {
public:
    UniversalSendScreen(polpo::IrCategory cat, polpo::IrButton button)
        : codes_(polpo::ir_library_lookup(cat, button)), title_(polpo::ir_button_name(button)) {}
    void on_event(const InputEvent& ev) override {
        if (ev.key == Key::Back || ev.key == Key::Backspace || ev.key == Key::Ok) {
            ir::tx_end();
            nav.pop();
        }
    }
    void tick(uint32_t now) override {
        if (index_ >= codes_.size() || now < next_) return;
        send_signal(polpo::ir_library_signal(codes_[index_]));
        sound::send();
        ++index_;
        next_ = now + 350;  // pausa tra una marca e l'altra
        invalidate();
        if (index_ == codes_.size()) {
            ir::tx_end();
            settings::add_xp(1);
        }
    }
    void draw() override {
        ui::header("Universale: " + title_);
        const size_t n = codes_.size();
        const bool done = index_ >= n;
        ui::text(6, ui::kContentY + 6, done ? "Fatto: inviati tutti i codici." : "Punta il Cardputer verso il dispositivo.",
                 done ? ui::kOk : ui::kFg);
        if (!done && index_ < n) ui::text(6, ui::kContentY + 26, std::string("Marca: ") + codes_[index_].brand, ui::kAccent);
        ui::progress(6, ui::kContentY + 48, ui::kW - 12, 12, n ? static_cast<float>(index_) / n : 1.0f);
        char b[32];
        std::snprintf(b, sizeof b, "%u / %u", static_cast<unsigned>(index_), static_cast<unsigned>(n));
        ui::text_center(ui::kContentY + 66, b, ui::kDim);
        ui::footer(done ? "OK chiudi" : "Il dispositivo ha reagito?  OK = ferma");
    }

private:
    std::vector<polpo::IrLibraryCode> codes_;
    std::string title_;
    size_t index_ = 0;
    uint32_t next_ = 0;
};

void open_universal(polpo::IrCategory cat) {
    std::vector<MenuItem> items;
    for (auto b : polpo::ir_library_buttons(cat)) {
        const size_t n = polpo::ir_library_lookup(cat, b).size();
        items.push_back({polpo::ir_button_name(b), std::to_string(n) + " marche",
                         [cat, b] { open<UniversalSendScreen>(cat, b); }});
    }
    open<MenuScreen>(std::string("Universale: ") + polpo::ir_category_name(cat), items);
}

// ---------- Telecomando da file .ir ----------

class RemoteScreen : public MenuScreen {
public:
    RemoteScreen(std::string path, polpo::IrFile file)
        : MenuScreen(storage::basename(path), {}, "OK invia   ` indietro"), path_(std::move(path)), file_(std::move(file)) {
        std::vector<MenuItem> items;
        for (size_t i = 0; i < file_.signals.size(); ++i) {
            const auto& s = file_.signals[i];
            items.push_back({s.name, s.raw ? "RAW" : polpo::ir_protocol_info(s.protocol).name, [this, i] {
                                 if (send_signal(file_.signals[i])) {
                                     sound::send();
                                     last_ = file_.signals[i].name;
                                     settings::add_xp(1);
                                 } else {
                                     show_error("Invio non riuscito.");
                                 }
                             }});
        }
        set_items(items);
        empty_text_ = "Nessun tasto valido nel file";
    }
    void on_exit() override { ir::tx_end(); }
    void draw() override {
        MenuScreen::draw();
        if (!last_.empty()) ui::text_right(ui::kW - 30, 1, "inviato", ui::kOk);
    }

private:
    std::string path_;
    polpo::IrFile file_;
    std::string last_;
};

void open_remote_file(const std::string& path) {
    // Senza PSRAM la memoria è poca: file al massimo 48 KB e una sola copia dei dati.
    if (ESP.getMaxAllocHeap() < 60 * 1024) return show_error("Memoria insufficiente: torna al menu e riprova.");
    polpo::IrFile f;
    std::string err;
    {
        std::string text;
        if (!storage::read_text(path, text, 48 * 1024))
            return show_error("Impossibile leggere il file (max 48 KB). Dividi i telecomandi grandi in più file.");
        if (!polpo::ir_file_parse(text, f, err)) return show_error(err);
    }  // il testo viene liberato qui
    std::string w;
    if (!f.warnings.empty()) {
        w = std::to_string(f.warnings.size()) + " tasti saltati:\n";
        for (size_t i = 0; i < f.warnings.size() && i < 4; ++i) w += "- " + f.warnings[i] + "\n";
        f.warnings.clear();
    }
    open<RemoteScreen>(path, std::move(f));
    if (!w.empty()) show_message("Attenzione", w, ui::kWarn);
}

// ---------- Apprendimento con la IR Unit ----------

class LearnScreen : public Screen {
public:
    void on_enter() override {
        if (!ir::rx_start()) state_ = State::Error;
    }
    void on_exit() override { ir::rx_end(); }
    void tick(uint32_t) override {
        if (state_ != State::Listening) return;
        std::vector<uint32_t> d;
        if (!ir::rx_poll(d)) return;
        sig_ = polpo::IrSignal{};
        if (!polpo::ir_decode(d, sig_)) {
            sig_.raw = true;
            sig_.frequency = 38000;
            sig_.duty = 0.33f;
            if (d.size() > polpo::kIrMaxRawTimings) d.resize(polpo::kIrMaxRawTimings);
            sig_.timings = d;
        }
        captured_ = d.size();
        state_ = State::Captured;
        sound::ok();
        invalidate();
    }
    void on_event(const InputEvent& ev) override {
        if (ev.key == Key::Back || ev.key == Key::Backspace) {
            nav.pop();
            return;
        }
        if (state_ != State::Captured) return;
        if (ev.key == Key::Ok) {
            open<TextInputScreen>("Nome del tasto", "Tasto", 24, TextInputScreen::Kind::FileName,
                                  [this](const std::string& name) { save(name); });
        } else if (ev.ch == 'r' || ev.ch == 'R') {
            state_ = State::Listening;
            ir::rx_start();
        } else if (ev.ch == 't' || ev.ch == 'T') {
            ir::rx_end();
            send_signal(sig_);
            ir::tx_end();
            ir::rx_begin();
            sound::send();
        }
    }
    void draw() override {
        ui::header("Impara (IR Unit)");
        switch (state_) {
            case State::Error:
                ui::wrap(6, ui::kContentY + 6, ui::kW - 12,
                         "Ricevitore non pronto. Collega la M5Stack IR Unit alla porta Grove (il Cardputer da solo non può "
                         "ricevere infrarossi).",
                         ui::kErr);
                ui::footer("` indietro");
                return;
            case State::Listening:
                ui::wrap(6, ui::kContentY + 6, ui::kW - 12,
                         "Punta il telecomando verso la IR Unit da 5-10 cm e premi brevemente un tasto.", ui::kFg);
                ui::footer("in ascolto...   ` indietro");
                return;
            case State::Captured: {
                const std::string what =
                    sig_.raw ? "Segnale RAW (" + std::to_string(sig_.timings.size()) + " tempi)"
                             : std::string("Protocollo ") + polpo::ir_protocol_info(sig_.protocol).name;
                ui::text(6, ui::kContentY + 6, "Ricevuto!", ui::kOk);
                ui::text(6, ui::kContentY + 22, what, ui::kFg);
                if (!sig_.raw) {
                    char b[64];
                    std::snprintf(b, sizeof b, "indirizzo 0x%X  comando 0x%X", static_cast<unsigned>(sig_.address),
                                  static_cast<unsigned>(sig_.command));
                    ui::text(6, ui::kContentY + 38, b, ui::kDim);
                }
                if (captured_ >= 380)
                    ui::text(6, ui::kContentY + 54, "Segnale lungo: potrebbe essere troncato.", ui::kWarn);
                ui::footer("OK salva   t prova   r riascolta");
                return;
            }
        }
    }

private:
    void save(const std::string& raw_name) {
        if (!storage::ok()) return show_error("Serve la microSD per salvare.");
        sig_.name = polpo::safe_filename(raw_name, 24);
        const std::string path = storage::join(storage::kIrDir, "imparati.ir");
        // Si aggiunge in coda senza riscrivere il file: i tasti già salvati non si possono perdere.
        bool ok;
        if (storage::exists(path)) {
            ok = storage::append_text(path, polpo::ir_signal_block(sig_));
        } else {
            polpo::IrFile f;
            f.signals.push_back(sig_);
            ok = storage::write_text(path, polpo::ir_file_serialize(f));
        }
        if (!ok) return show_error("Scrittura su microSD non riuscita.");
        settings::add_xp(2);
        sound::ok();
        show_message("Salvato", "Tasto \"" + sig_.name + "\" aggiunto a /polpo/ir/imparati.ir", ui::kOk);
        state_ = State::Listening;
        ir::rx_start();
    }
    enum class State { Listening, Captured, Error } state_ = State::Listening;
    polpo::IrSignal sig_;
    size_t captured_ = 0;
};

}  // namespace

void open_ir_app() {
    std::vector<MenuItem> items = {
        {"Universale: televisori", "", [] { open_universal(polpo::IrCategory::TV); }},
        {"Universale: audio", "", [] { open_universal(polpo::IrCategory::Audio); }},
        {"I miei telecomandi (.ir)", "SD", [] {
             if (!storage::ok() && !storage::retry()) return show_error("microSD non trovata.");
             open<FileBrowserScreen>("Telecomandi", storage::kIrDir, ".ir", open_remote_file);
         }},
        {"Impara un telecomando", "IR Unit", [] { open<LearnScreen>(); }},
        {"Come funziona", "", [] {
             show_message("Infrarossi",
                          "Il LED IR è sul lato del Cardputer: puntalo verso il dispositivo (portata 3-5 m).\n"
                          "Copia in /polpo/ir/ i file .ir: protocolli NEC, Samsung32, RC5, RC6, SIRC, Kaseikyo, "
                          "RCA, Pioneer o RAW.\n"
                          "Per imparare serve la IR Unit (ricevitore) sulla porta Grove.");
         }},
    };
    open<MenuScreen>("Infrarossi", items);
}
