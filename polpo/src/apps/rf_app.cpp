// Polpo — app Radio 433 MHz con i moduli RF433R / RF433T.
// Solo codici fissi e registrazioni RAW dei TUOI dispositivi; nessuna funzione di disturbo,
// nessuna ricerca per forza bruta, rolling code non salvabili.
#include <Arduino.h>

#include <cstdio>

#include "apps/apps.h"
#include "core/settings.h"
#include "core/sound.h"
#include "core/storage.h"
#include "core/widgets.h"
#include "hal/rf433.h"
#include "polpo/rf/subghz.h"
#include "polpo/util/utf8.h"

namespace {

std::string code_text(const polpo::RcCode& c) {
    char b[64];
    std::snprintf(b, sizeof b, "0x%llX  %u bit  P%u  %u us", static_cast<unsigned long long>(c.value),
                  static_cast<unsigned>(c.bits), static_cast<unsigned>(c.protocol), static_cast<unsigned>(c.pulse_us));
    return b;
}

void save_sub(const polpo::SubFile& f, const std::string& suggested) {
    if (!storage::ok()) return show_error("Serve la microSD per salvare.");
    open<TextInputScreen>("Nome del segnale", suggested, 24, TextInputScreen::Kind::FileName,
                          [f](const std::string& name) {
                              const std::string path =
                                  storage::unique_path(storage::kRfDir, polpo::safe_filename(name, 24), ".sub");
                              if (!storage::write_text(path, polpo::sub_serialize(f)))
                                  return show_error("Scrittura su microSD non riuscita.");
                              settings::add_xp(2);
                              sound::ok();
                              show_message("Salvato", path, ui::kOk);
                          });
}

void transmit(const polpo::SubFile& f) {
    const uint8_t rep = settings::get().rf_repeats;
    const auto r = f.raw ? rf433::send_raw(f.raw_timings, rep < 3 ? 3 : (rep > 5 ? 5 : rep))
                         : rf433::send_code(f.code, rep);
    if (!r.ok) return show_error(r.error);
    sound::send();
    settings::add_xp(1);
}

// ---------- Ricezione codici fissi ----------

class ReceiveScreen : public MenuScreen {
public:
    ReceiveScreen() : MenuScreen("Ricevi 433,92 MHz", {}, "OK dettagli   ` indietro") {
        empty_text_ = "In ascolto... premi il tuo telecomando";
    }
    void on_enter() override { rf433::rx_begin(); }
    void on_resume() override { rf433::rx_begin(); }
    void on_exit() override { rf433::rx_end(); }
    void tick(uint32_t) override {
        polpo::RcCode c;
        if (!rf433::rx_poll(c)) return;
        // Ignora i duplicati consecutivi (un telecomando ripete il codice più volte).
        int shift = 0;
        if (!codes_.empty() && codes_.front().value == c.value && codes_.front().bits == c.bits) {
            ++hits_.front();
        } else {
            shift = codes_.empty() ? 0 : 1;  // il nuovo codice va in cima: la selezione scende di uno
            codes_.insert(codes_.begin(), c);
            hits_.insert(hits_.begin(), 1);
            if (codes_.size() > 30) {
                codes_.pop_back();
                hits_.pop_back();
            }
            sound::click();
        }
        rebuild(shift);
    }

private:
    void rebuild(int shift) {
        std::vector<MenuItem> items;
        for (size_t i = 0; i < codes_.size(); ++i) {
            char r[16];
            std::snprintf(r, sizeof r, "x%u", static_cast<unsigned>(hits_[i]));
            const polpo::RcCode c = codes_[i];
            items.push_back({code_text(c), r, [c] { open_code_actions(c); }});
        }
        const int sel = model_.selected + shift;
        set_items(items);
        model_.select(sel);
    }
    static void open_code_actions(const polpo::RcCode& c) {
        polpo::SubFile f;
        f.code = c;
        std::vector<MenuItem> items = {
            {"Salva su microSD", "", [f] { save_sub(f, "telecomando"); }},
            {"Ritrasmetti (solo tuoi dispositivi)", "", [f] {
                 rf433::rx_end();
                 transmit(f);
                 rf433::rx_begin();
             }},
            {"Dettagli", "", [c] {
                 char b[200];
                 std::snprintf(b, sizeof b,
                               "Valore: 0x%llX\nBit: %u\nProtocollo rc-switch: %u%s\nImpulso base (TE): %u us\n"
                               "Codice fisso: chiunque lo registri può ripeterlo. Non è sicuro per porte e allarmi.",
                               static_cast<unsigned long long>(c.value), static_cast<unsigned>(c.bits),
                               static_cast<unsigned>(c.protocol), c.protocol == 1 ? " (PT2262/EV1527)" : "",
                               static_cast<unsigned>(c.pulse_us));
                 show_message("Codice", b);
             }},
        };
        open<MenuScreen>("Codice ricevuto", items);
    }
    std::vector<polpo::RcCode> codes_;
    std::vector<uint32_t> hits_;
};

// ---------- Registrazione RAW con grafico degli impulsi ----------

class RawScreen : public Screen {
public:
    void on_enter() override { rf433::raw_begin(); }
    void on_resume() override {
        if (!frozen_) rf433::raw_begin();
    }
    void on_exit() override { rf433::raw_end(); }
    uint32_t redraw_interval_ms() const override { return frozen_ ? 0 : 200; }
    void on_event(const InputEvent& ev) override {
        if (ev.key == Key::Back || ev.key == Key::Backspace) {
            nav.pop();
            return;
        }
        if (ev.key == Key::Ok && !frozen_) {
            rf433::raw_snapshot(data_, 1024);
            rf433::raw_end();
            stats_ = polpo::pulse_analyze(data_);
            frozen_ = true;
            sound::ok();
        } else if (ev.key == Key::Ok && frozen_) {
            open_actions();
        } else if (ev.ch == 'r' || ev.ch == 'R') {
            frozen_ = false;
            data_.clear();
            rf433::raw_begin();
        } else if (frozen_ && ev.key == Key::Left) {
            offset_ = offset_ > 20 ? offset_ - 20 : 0;
        } else if (frozen_ && ev.key == Key::Right) {
            if (offset_ + 20 < data_.size()) offset_ += 20;
        }
    }
    void draw() override {
        ui::header(frozen_ ? "RAW registrato" : "Registra RAW");
        if (!frozen_) {
            ui::wrap(6, ui::kContentY + 4, ui::kW - 12,
                     "Tieni premuto il tasto del TUO telecomando vicino all'RF433R e, mentre lo tieni, premi OK.",
                     ui::kFg, 14, 4);
            char b[40];
            std::snprintf(b, sizeof b, "fronti: %u", static_cast<unsigned>(rf433::raw_edge_count()));
            ui::text(6, ui::kContentY + 64, b, ui::kDim);
            ui::footer("OK cattura   ` indietro");
            return;
        }
        // Forma d'onda: ogni durata è un tratto alto o basso, scala logaritmica ridotta.
        auto& g = ui::c();
        const int y_hi = ui::kContentY + 8, y_lo = ui::kContentY + 30;
        int x = 2;
        for (size_t i = offset_; i < data_.size() && x < ui::kW - 2; ++i) {
            const int32_t v = data_[i];
            const uint32_t a = static_cast<uint32_t>(v < 0 ? -v : v);
            int w = static_cast<int>(a / 100);
            if (w < 1) w = 1;
            if (w > 60) w = 60;
            const int y = v > 0 ? y_hi : y_lo;
            g.drawFastHLine(x, y, w, v > 0 ? ui::kAccent : ui::kAccent2);
            g.drawFastVLine(x + w, y_hi, y_lo - y_hi, ui::kPanel);
            x += w;
        }
        char b[96];
        std::snprintf(b, sizeof b, "%u tempi   min %u us   max %u us", static_cast<unsigned>(data_.size()),
                      static_cast<unsigned>(stats_.min_us), static_cast<unsigned>(stats_.max_us));
        ui::text(4, ui::kContentY + 40, b, ui::kFg);
        std::snprintf(b, sizeof b, "impulso base ~%u us, lungo ~%u us (x%.1f)", static_cast<unsigned>(stats_.short_us),
                      static_cast<unsigned>(stats_.long_us), static_cast<double>(stats_.ratio));
        ui::text(4, ui::kContentY + 56, b, ui::kDim);
        ui::text(4, ui::kContentY + 72,
                 stats_.ratio > 2.5f && stats_.ratio < 3.5f ? "Rapporto 1:3: probabile codice fisso PT2262/EV1527" : "",
                 ui::kOk);
        ui::footer("OK azioni   , / scorri   r riprova");
    }

private:
    void open_actions() {
        polpo::SubFile f;
        f.raw = true;
        f.raw_timings = data_;
        if (f.raw_timings.size() > polpo::kSubRawMaxTimings) f.raw_timings.resize(polpo::kSubRawMaxTimings);
        if (!f.raw_timings.empty() && f.raw_timings.size() % 2 == 0) f.raw_timings.pop_back();
        std::vector<MenuItem> items = {
            {"Salva su microSD", "", [f] { save_sub(f, "registrazione"); }},
            {"Ritrasmetti (solo tuoi dispositivi)", "", [f] { transmit(f); }},
        };
        open<MenuScreen>("RAW", items);
    }
    std::vector<int32_t> data_;
    polpo::PulseStats stats_;
    bool frozen_ = false;
    size_t offset_ = 0;
};

// ---------- Segnali salvati ----------

void open_saved(const std::string& path) {
    std::string text, err;
    if (!storage::read_text(path, text, 96 * 1024)) return show_error("Impossibile leggere il file.");
    polpo::SubFile f;
    if (!polpo::sub_parse(text, f, err)) return show_error(err);
    if (f.frequency < 433050000 || f.frequency > 434790000)
        return show_error("Il file è per " + std::to_string(f.frequency / 1000) +
                          " kHz: i moduli RF433 trasmettono solo a 433,92 MHz.");
    const std::string name = storage::basename(path);
    std::vector<MenuItem> items = {
        {"Trasmetti", f.raw ? "RAW" : "codice", [f] { transmit(f); }},
        {"Informazioni", "", [f] {
             std::string body;
             if (f.raw) {
                 const auto st = polpo::pulse_analyze(f.raw_timings);
                 char b[160];
                 std::snprintf(b, sizeof b, "Registrazione RAW\n%u tempi, durata %u ms\nimpulso base ~%u us",
                               static_cast<unsigned>(f.raw_timings.size()),
                               static_cast<unsigned>(polpo::rf_total_us(f.raw_timings) / 1000),
                               static_cast<unsigned>(st.short_us));
                 body = b;
             } else {
                 body = "Codice fisso\n" + code_text(f.code);
             }
             show_message("Segnale", body);
         }},
        {"Elimina", "", [path] {
             ask_confirm("Eliminare?", "Il segnale verrà cancellato dalla microSD.", [path](bool yes) {
                 if (yes && storage::remove(path)) nav.pop();
             });
         }},
    };
    open<MenuScreen>(name, items);
}

}  // namespace

void open_rf_app() {
    std::vector<MenuItem> items = {
        {"Ricevi codici fissi", "RF433R", [] { open<ReceiveScreen>(); }},
        {"Registra RAW", "RF433R", [] { open<RawScreen>(); }},
        {"Segnali salvati", "RF433T", [] {
             if (!storage::ok() && !storage::retry()) return show_error("microSD non trovata.");
             open<FileBrowserScreen>("Segnali 433 MHz", storage::kRfDir, ".sub", open_saved);
         }},
        {"Limite di trasmissione", "", [] {
             char b[200];
             std::snprintf(b, sizeof b,
                           "Usati %u s su %u s nell'ultima ora.\nLa norma europea per 433,05-434,79 MHz consente al "
                           "massimo il 10%% del tempo a 10 mW: il Polpo si ferma all'8%%.",
                           static_cast<unsigned>(rf433::budget_used_ms() / 1000),
                           static_cast<unsigned>(rf433::budget_limit_ms() / 1000));
             show_message("Trasmissione", b);
         }},
        {"Collegamenti e regole", "", [] {
             show_message("Radio 433 MHz",
                          "RF433R (ricevitore) e RF433T (trasmettitore) vanno sulla porta Grove: uno alla volta, "
                          "oppure insieme con una Unit HUB. Niente moduli I2C sulla stessa HUB.\n"
                          "Funzionano solo i codici fissi (es. prese radiocomandate, campanelli). Cancelli e auto "
                          "moderni usano codici variabili: non si possono e non si devono copiare.\n"
                          "Ritrasmetti solo segnali di dispositivi tuoi.");
         }},
    };
    open<MenuScreen>("Radio 433 MHz", items);
}
