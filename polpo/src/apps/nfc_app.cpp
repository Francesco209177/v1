// Polpo — app NFC con il modulo M5Stack RFID2: identificazione carte, lettura di tag
// NTAG/Ultralight e scrittura di link o testo (NDEF) su tag propri non bloccati.
#include <Arduino.h>

#include <cstdio>

#include "apps/apps.h"
#include "core/settings.h"
#include "core/sound.h"
#include "core/storage.h"
#include "core/widgets.h"
#include "hal/nfc.h"
#include "polpo/nfc/ndef.h"
#include "polpo/nfc/type2.h"
#include "polpo/util/hex.h"
#include "polpo/util/utf8.h"

namespace {

std::string uid_text(const nfc::Card& c) { return polpo::to_hex(c.uid, c.uid_len, ':'); }

struct TagDump {
    nfc::Card card;
    polpo::Type2Model model = polpo::Type2Model::Unknown;
    std::vector<uint8_t> pages;  // dalla pagina 0
    bool read_ok = false;
};

// Legge tutta la memoria di un tag Type 2 (identificato con GET_VERSION).
bool read_type2(nfc::Card& c, TagDump& d) {
    d.card = c;
    d.model = c.has_version ? polpo::type2_model_from_version(c.version) : polpo::Type2Model::Ultralight;
    const auto& info = polpo::type2_info(d.model);
    d.read_ok = nfc::read_pages(0, info.user_last + 1, d.pages);
    return d.read_ok;
}

std::string describe(const TagDump& d) {
    char b[96];
    std::string s;
    std::snprintf(b, sizeof b, "UID: %s\nATQA: %04X   SAK: %02X\n", uid_text(d.card).c_str(), d.card.atqa, d.card.sak);
    s += b;
    s += "Tipo: " + polpo::card_family(d.card.sak, d.card.atqa) + "\n";
    if (d.card.sak != 0x00) {
        s += "Questa carta usa crittografia o un protocollo che il Polpo non legge: si vede solo l'identificativo.";
        return s;
    }
    s += std::string("Modello: ") + polpo::type2_info(d.model).name + "\n";
    if (!d.read_ok || d.pages.size() < 16) {
        s += "Memoria non leggibile (pagine protette da password?).";
        return s;
    }
    const auto cc = polpo::type2_parse_cc(&d.pages[12]);
    if (!cc.ndef) {
        s += "Non formattato NDEF (tag vuoto o con dati proprietari).";
        return s;
    }
    std::snprintf(b, sizeof b, "NDEF: %u byte, %s\n", cc.data_bytes, cc.writable ? "scrivibile" : "sola lettura");
    s += b;
    std::vector<uint8_t> msg;
    if (polpo::ndef_find_in_tlv(d.pages.data() + 16, d.pages.size() - 16, msg)) {
        std::vector<polpo::NdefRecord> recs;
        std::string err;
        if (msg.empty()) {
            s += "Messaggio NDEF vuoto.";
        } else if (polpo::ndef_parse(msg, recs, err)) {
            for (const auto& r : recs) s += polpo::ndef_describe(r) + "\n";
        } else {
            s += "NDEF illeggibile: " + err;
        }
    }
    return s;
}

std::string dump_file(const TagDump& d) {
    // Sottoinsieme del formato testo chiave:valore, solo per consultazione.
    std::string out = "Filetype: Polpo NFC dump\nVersion: 1\n";
    out += "UID: " + polpo::to_hex(d.card.uid, d.card.uid_len) + "\n";
    char b[48];
    std::snprintf(b, sizeof b, "ATQA: %02X %02X\nSAK: %02X\n", d.card.atqa >> 8, d.card.atqa & 0xFF, d.card.sak);
    out += b;
    out += std::string("Model: ") + polpo::type2_info(d.model).name + "\n";
    for (size_t p = 0; p * 4 + 4 <= d.pages.size(); ++p) {
        std::snprintf(b, sizeof b, "Page %u: ", static_cast<unsigned>(p));
        out += b + polpo::to_hex(&d.pages[p * 4], 4) + "\n";
    }
    return out;
}

// ---------- Lettura ----------

class ReadScreen : public Screen {
public:
    void on_enter() override { ready_ = nfc::begin(); }
    void on_resume() override { ready_ = nfc::begin(); }
    void on_exit() override { nfc::end(); }
    void tick(uint32_t now) override {
        if (!ready_ || have_ || now < next_) return;
        next_ = now + 250;
        nfc::Card c;
        if (!nfc::poll(c)) return;
        dump_ = TagDump{};
        dump_.card = c;
        if (c.sak == 0x00) read_type2(c, dump_);
        nfc::halt();
        text_ = describe(dump_);
        have_ = true;
        sound::ok();
        settings::add_xp(1);
        invalidate();
    }
    void on_event(const InputEvent& ev) override {
        if (ev.key == Key::Back || ev.key == Key::Backspace) {
            nav.pop();
        } else if (have_ && ev.key == Key::Ok) {
            open<TextViewScreen>("Tag NFC", text_);
        } else if (have_ && (ev.ch == 's' || ev.ch == 'S')) {
            save();
        } else if (have_ && (ev.ch == 'r' || ev.ch == 'R')) {
            have_ = false;
        }
    }
    void draw() override {
        ui::header("Leggi NFC");
        if (!ready_) {
            ui::wrap(6, ui::kContentY + 6, ui::kW - 12,
                     "Modulo RFID2 non trovato. Collegalo alla porta Grove (indirizzo I2C 0x28) e riapri.", ui::kErr);
            ui::footer("` indietro");
            return;
        }
        if (!have_) {
            ui::wrap(6, ui::kContentY + 6, ui::kW - 12,
                     "Appoggia la carta o il tag sul modulo RFID2 (distanza massima circa 2 cm).", ui::kFg);
            ui::footer("in attesa...   ` indietro");
            return;
        }
        ui::wrap(6, ui::kContentY + 2, ui::kW - 12, text_, ui::kFg, 14, 7);
        ui::footer(dump_.card.sak == 0x00 && dump_.read_ok ? "OK tutto   s salva   r altra" : "OK tutto   r altra");
    }

private:
    void save() {
        if (dump_.card.sak != 0x00 || !dump_.read_ok) return show_error("Si salvano solo i tag NTAG/Ultralight letti.");
        if (!storage::ok()) return show_error("Serve la microSD.");
        const std::string base = "tag_" + polpo::to_hex(dump_.card.uid, dump_.card.uid_len, 0);
        const std::string path = storage::unique_path(storage::kNfcDir, base, ".nfc");
        if (!storage::write_text(path, dump_file(dump_))) return show_error("Scrittura non riuscita.");
        sound::ok();
        show_message("Salvato", path, ui::kOk);
    }
    bool ready_ = false, have_ = false;
    uint32_t next_ = 0;
    TagDump dump_;
    std::string text_;
};

// ---------- Scrittura NDEF ----------

class WriteScreen : public Screen {
public:
    WriteScreen(std::vector<uint8_t> tlv, std::string what) : tlv_(std::move(tlv)), what_(std::move(what)) {}
    void on_enter() override { ready_ = nfc::begin(); }
    void on_exit() override { nfc::end(); }
    void tick(uint32_t now) override {
        if (!ready_ || done_ || now < next_) return;
        next_ = now + 300;
        nfc::Card c;
        if (!nfc::poll(c)) return;
        done_ = true;
        result_ = write(c);
        nfc::halt();
        if (ok_) {
            sound::ok();
            settings::add_xp(3);
        } else {
            sound::error();
        }
        invalidate();
    }
    void on_event(const InputEvent& ev) override {
        if (ev.key == Key::Back || ev.key == Key::Backspace || (done_ && ev.key == Key::Ok)) nav.pop();
        if (done_ && (ev.ch == 'r' || ev.ch == 'R')) done_ = false;
    }
    void draw() override {
        ui::header("Scrivi NFC");
        if (!ready_) {
            ui::wrap(6, ui::kContentY + 6, ui::kW - 12, "Modulo RFID2 non trovato sulla porta Grove.", ui::kErr);
        } else if (!done_) {
            ui::wrap(6, ui::kContentY + 4, ui::kW - 12,
                     "Appoggia un tag NTAG213/215/216 TUO e tienilo fermo.\nContenuto: " + what_, ui::kFg, 14, 6);
        } else {
            ui::wrap(6, ui::kContentY + 4, ui::kW - 12, result_, ok_ ? ui::kOk : ui::kErr, 14, 6);
        }
        ui::footer(done_ ? "OK chiudi   r altro tag" : "` annulla");
    }

private:
    std::string write(nfc::Card& c) {
        ok_ = false;
        if (c.sak != 0x00) return "Questa carta non è un tag NFC Type 2: non si può scrivere.";
        TagDump d;
        if (!read_type2(c, d) || d.pages.size() < 16) return "Impossibile leggere il tag prima di scriverlo.";
        const auto& info = polpo::type2_info(d.model);
        std::vector<uint8_t> dyn;
        const uint8_t* dyn_ptr = nullptr;
        if (info.dyn_lock_page) {
            if (!nfc::read_pages(info.dyn_lock_page, 1, dyn) || dyn.size() < 4)
                return "Impossibile verificare i blocchi del tag: scrittura annullata.";
            dyn_ptr = dyn.data();
        }
        std::vector<polpo::PageWrite> plan;
        const auto e = polpo::type2_plan_ndef_write(info, &d.pages[8], &d.pages[12], dyn_ptr, tlv_, plan);
        if (e != polpo::WritePlanError::None) return std::string("Scrittura rifiutata: ") + polpo::write_plan_error_text(e) + ".";
        for (const auto& w : plan)
            if (!nfc::write_page(w.page, w.data)) return "Errore durante la scrittura: tieni fermo il tag e riprova.";
        // Verifica rileggendo.
        std::vector<uint8_t> back;
        if (!nfc::read_pages(4, static_cast<uint16_t>(plan.size()), back)) return "Scritto, ma la verifica non è riuscita.";
        for (size_t i = 0; i < plan.size(); ++i)
            for (int k = 0; k < 4; ++k)
                if (back[i * 4 + k] != plan[i].data[k]) return "Verifica fallita: i dati letti sono diversi.";
        ok_ = true;
        return std::string("Fatto! ") + info.name + " scritto e verificato (" + std::to_string(tlv_.size()) + " byte).";
    }
    std::vector<uint8_t> tlv_;
    std::string what_, result_;
    bool ready_ = false, done_ = false, ok_ = false;
    uint32_t next_ = 0;
};

}  // namespace

void open_nfc_app() {
    std::vector<MenuItem> items = {
        {"Leggi carta o tag", "RFID2", [] { open<ReadScreen>(); }},
        {"Scrivi un link", "NDEF", [] {
             open<TextInputScreen>("Link da scrivere", "https://", 120, TextInputScreen::Kind::Url, [](const std::string& url) {
                 if (url.size() < 4) return show_error("Link troppo corto.");
                 open<WriteScreen>(polpo::ndef_wrap_tlv(polpo::ndef_uri_message(url)), url);
             });
         }},
        {"Scrivi un testo", "NDEF", [] {
             open<TextInputScreen>("Testo da scrivere", "", 120, TextInputScreen::Kind::Any, [](const std::string& t) {
                 if (t.empty()) return show_error("Testo vuoto.");
                 open<WriteScreen>(polpo::ndef_wrap_tlv(polpo::ndef_text_message(t, "it")), t);
             });
         }},
        {"Letture salvate", "SD", [] {
             if (!storage::ok() && !storage::retry()) return show_error("microSD non trovata.");
             open<FileBrowserScreen>("Letture NFC", storage::kNfcDir, ".nfc", [](const std::string& p) {
                 std::string t;
                 if (!storage::read_text(p, t, 24 * 1024)) return show_error("File illeggibile.");
                 open<TextViewScreen>(storage::basename(p), t);
             });
         }},
        {"Cosa può fare", "", [] {
             show_message("NFC",
                          "Il modulo RFID2 legge carte ISO 14443-A a 13,56 MHz: identificativo di qualsiasi carta, "
                          "contenuto di tag NTAG e Ultralight.\nScrive link e testi (NDEF) solo su tag scrivibili e "
                          "non bloccati.\nNon emula carte, non legge carte crittografate e non funziona a 125 kHz.");
         }},
    };
    open<MenuScreen>("NFC", items);
}
