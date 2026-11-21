#include "link/link.h"

#include <Arduino.h>
#include <ArduinoJson.h>
#include <SD.h>
#include <WiFi.h>

#include <functional>
#include <string>
#include <vector>

#include "board_pins.h"
#include "core/gfx.h"
#include "core/screen.h"
#include "core/settings.h"
#include "core/sound.h"
#include "core/storage.h"
#include "hal/ble.h"
#include "hal/grove.h"
#include "hal/ir.h"
#include "hal/nfc.h"
#include "hal/rf433.h"
#include "polpo/ir/ir_codec.h"
#include "polpo/ir/ir_file.h"
#include "polpo/link/link_proto.h"
#include "polpo/nfc/ndef.h"
#include "polpo/nfc/type2.h"
#include "polpo/rf/subghz.h"
#include "polpo/util/hex.h"

#ifndef POLPO_VERSION
#define POLPO_VERSION "dev"
#endif

using polpo::link::make_error;
using polpo::link::make_ok;

namespace pclink {
namespace {

// ---------------- stato ----------------

polpo::link::LineFramer framer;
bool session = false;
std::string client_name;
uint32_t last_rx_ms = 0;
uint32_t commands_done = 0;
std::string last_cmd = "-";
std::string activity;  // cosa sta facendo adesso (mostrato sullo schermo)
bool rf_rx_on = false, rf_raw_on = false, ir_learn_on = false;
polpo::RcCode last_code{};
uint32_t last_code_ms = 0;

struct Pending {
    enum Kind { None, Confirm, Wifi, Ble, NfcWrite } kind = None;
    uint32_t id = 0;
    uint32_t deadline = 0;
    std::vector<uint8_t> tlv;
    std::string what;
};
Pending pending;

bool busy() { return pending.kind != Pending::None; }

void send_line(const std::string& line) {
    Serial.write(reinterpret_cast<const uint8_t*>(line.data()), line.size());
    Serial.write('\n');
}

void reply_ok(uint32_t id, JsonDocument& data) { send_line(make_ok(id, data)); }
void reply_ok(uint32_t id) { send_line(make_ok(id)); }
void reply_err(uint32_t id, const char* code, const char* msg) { send_line(make_error(id, code, msg)); }
void emit(const char* ev, JsonDocument& data) { send_line(polpo::link::make_event(ev, data)); }

// ---------------- schermate ----------------

// Conferma con scadenza: dopo 20 s senza risposta vale "No".
class LinkConfirmScreen : public Screen {
public:
    LinkConfirmScreen(std::string title, std::string body, std::function<void(bool)> done)
        : title_(std::move(title)), body_(std::move(body)), done_(std::move(done)), deadline_(millis() + 20000) {}
    uint32_t redraw_interval_ms() const override { return 500; }
    void tick(uint32_t now) override {
        if (!answered_ && static_cast<int32_t>(now - deadline_) >= 0) finish(false);
    }
    void on_event(const InputEvent& ev) override {
        if (ev.key == Key::Left || ev.key == Key::Right || ev.key == Key::Tab) choice_ = !choice_;
        else if (ev.key == Key::Ok) finish(choice_);
        else if (ev.key == Key::Back || ev.key == Key::Backspace) finish(false);
    }
    void draw() override {
        ui::header(title_, ui::kWarn);
        ui::wrap(6, ui::kContentY + 3, ui::kW - 12, body_, ui::kFg, 14, 5);
        const int y = ui::kH - ui::kFooterH - 22, w = 90;
        auto button = [&](int x, const char* label, bool sel) {
            ui::c().fillRoundRect(x, y, w, 18, 4, sel ? ui::kWarn : ui::kPanel);
            ui::text(x + (w - ui::text_width(label)) / 2, y + 3, label, sel ? ui::kBg : ui::kFg);
        };
        button(22, "No", !choice_);
        button(ui::kW - 22 - w, "Sì", choice_);
        const int left = static_cast<int>((static_cast<int32_t>(deadline_ - millis()) + 999) / 1000);
        ui::footer(", / scegli   OK conferma   no tra " + std::to_string(left < 0 ? 0 : left) + " s");
    }

private:
    void finish(bool yes) {
        if (answered_) return;
        answered_ = true;
        auto cb = done_;
        nav.pop();
        if (cb) cb(yes);
    }
    std::string title_, body_;
    std::function<void(bool)> done_;
    uint32_t deadline_;
    bool choice_ = false, answered_ = false;
};

void stop_all_hardware();

class LinkScreen : public Screen {
public:
    uint32_t redraw_interval_ms() const override { return 300; }
    void on_exit() override { on_link_screen_closed(); }
    void on_event(const InputEvent& ev) override {
        if (ev.key == Key::Back || ev.key == Key::Backspace) nav.pop();
    }
    void draw() override {
        ui::header("Collegato al PC", ui::kAccent2);
        ui::text(6, ui::kContentY + 4, client_name.empty() ? "Polpo Studio" : client_name, ui::kAccent2);
        ui::text(6, ui::kContentY + 22, "Comandi eseguiti: " + std::to_string(commands_done), ui::kFg);
        ui::text(6, ui::kContentY + 38, "Ultimo: " + last_cmd, ui::kDim);
        ui::text(6, ui::kContentY + 56, activity.empty() ? "In attesa di comandi" : activity,
                 activity.empty() ? ui::kDim : ui::kAccent);
        ui::wrap(6, ui::kContentY + 76, ui::kW - 12, "Le operazioni che trasmettono o scrivono chiedono sempre conferma qui.",
                 ui::kDim, 13, 2);
        ui::footer("` scollega il PC");
    }
};

void end_session_from_pc() {
    if (!session) return;
    nav.pop_to_root();  // la schermata del collegamento chiama on_link_screen_closed()
}

void ask(const std::string& title, const std::string& body, uint32_t id, std::function<void(bool)> then) {
    pending.kind = Pending::Confirm;
    pending.id = id;
    sound::ok();
    nav.push(std::unique_ptr<Screen>(new LinkConfirmScreen(title, body, [then](bool yes) {
        pending.kind = Pending::None;
        then(yes);
    })));
}

// ---------------- informazioni ----------------

const char* board_name() {
    switch (M5.getBoard()) {
        case m5::board_t::board_M5Cardputer: return "Cardputer v1.x";
        case m5::board_t::board_M5CardputerADV: return "Cardputer Adv";
        default: return "sconosciuta";
    }
}

void fill_info(JsonDocument& d) {
    d["proto"] = polpo::link::kProtocolVersion;
    d["firmware"] = POLPO_VERSION;
    d["board"] = board_name();
    d["battery"] = ui::battery_level();
    d["charging"] = ui::battery_charging();
    d["heap_free"] = ESP.getFreeHeap();
    d["uptime_s"] = millis() / 1000;
    JsonObject sd = d["sd"].to<JsonObject>();
    sd["ok"] = storage::ok();
    sd["total"] = static_cast<double>(storage::total_bytes());
    sd["used"] = static_cast<double>(storage::used_bytes());
    JsonObject m = d["modules"].to<JsonObject>();
    m["ir_tx"] = "available";
    m["wifi"] = "available";
    m["ble"] = "available";
    m["usb_hid"] = "available";
    const bool rfid = grove::i2c_probe(pins::kRfid2Addr);
    grove::release();
    m["rfid2"] = rfid ? "available" : "missing";
    m["rf433"] = "unverifiable";  // moduli a GPIO: il Polpo non può sapere se sono collegati
    m["ir_unit"] = "unverifiable";
    JsonObject b = d["rf_budget"].to<JsonObject>();
    b["used_ms"] = rf433::budget_used_ms();
    b["limit_ms"] = rf433::budget_limit_ms();
    d["level"] = settings::level();
    d["layout"] = polpo::layout_name(settings::get().layout);
}

// ---------------- file ----------------

bool check_path(uint32_t id, JsonObjectConst a, std::string& path) {
    path = a["path"] | "";
    if (!polpo::link::valid_sd_path(path)) {
        reply_err(id, "bad_args", "percorso non valido (solo dentro /polpo)");
        return false;
    }
    if (!storage::ok()) {
        reply_err(id, "no_hardware", "microSD assente");
        return false;
    }
    return true;
}

void cmd_fs_list(uint32_t id, JsonObjectConst a) {
    std::string path;
    if (!check_path(id, a, path)) return;
    std::vector<storage::Entry> entries;
    if (!storage::list(path, entries)) return reply_err(id, "io_error", "cartella non leggibile");
    JsonDocument d;
    d["path"] = path;
    JsonArray arr = d["entries"].to<JsonArray>();
    for (const auto& e : entries) {
        JsonObject o = arr.add<JsonObject>();
        o["name"] = e.name;
        o["dir"] = e.dir;
        o["size"] = e.size;
    }
    reply_ok(id, d);
}

void cmd_fs_read(uint32_t id, JsonObjectConst a) {
    std::string path;
    if (!check_path(id, a, path)) return;
    const uint32_t offset = a["offset"] | 0u;
    uint32_t len = a["len"] | static_cast<uint32_t>(polpo::link::kMaxChunk);
    if (len > polpo::link::kMaxChunk) len = polpo::link::kMaxChunk;
    File f = SD.open(path.c_str(), FILE_READ);
    if (!f || f.isDirectory()) return reply_err(id, "io_error", "file non trovato");
    const uint32_t size = f.size();
    std::vector<uint8_t> buf;
    if (offset < size) {
        buf.resize(std::min<uint32_t>(len, size - offset));
        f.seek(offset);
        buf.resize(f.read(buf.data(), buf.size()));
    }
    f.close();
    JsonDocument d;
    d["size"] = size;
    d["offset"] = offset;
    d["data"] = polpo::link::base64_encode(buf.data(), buf.size());
    d["crc32"] = polpo::link::crc32(buf.data(), buf.size());
    d["eof"] = offset + buf.size() >= size;
    reply_ok(id, d);
}

void do_fs_write(uint32_t id, const std::string& path, uint32_t offset, const std::vector<uint8_t>& data, bool final) {
    const std::string tmp = path + ".part";
    File f = SD.open(tmp.c_str(), offset == 0 ? FILE_WRITE : FILE_APPEND);
    if (!f) return reply_err(id, "io_error", "scrittura non riuscita");
    if (f.size() != offset) {
        f.close();
        return reply_err(id, "bad_args", "offset non coerente: riparti da 0");
    }
    if (offset + data.size() > polpo::link::kMaxFileSize) {
        f.close();
        SD.remove(tmp.c_str());
        return reply_err(id, "too_large", "file oltre 256 KB");
    }
    const size_t w = f.write(data.data(), data.size());
    f.close();
    if (w != data.size()) return reply_err(id, "io_error", "scrittura incompleta (microSD piena?)");
    if (final) {
        if (SD.exists(path.c_str())) SD.remove(path.c_str());
        if (!SD.rename(tmp.c_str(), path.c_str())) return reply_err(id, "io_error", "rinomina non riuscita");
    }
    JsonDocument d;
    d["written"] = offset + data.size();
    d["final"] = final;
    reply_ok(id, d);
}

void cmd_fs_write(uint32_t id, JsonObjectConst a) {
    std::string path;
    if (!check_path(id, a, path)) return;
    std::vector<uint8_t> data;
    if (!polpo::link::base64_decode(a["data"] | "", data) || data.size() > polpo::link::kMaxChunk)
        return reply_err(id, "bad_args", "dati base64 non validi o blocco troppo grande");
    if (polpo::link::crc32(data.data(), data.size()) != (a["crc32"] | 0u))
        return reply_err(id, "bad_args", "CRC32 diverso: blocco danneggiato");
    const uint32_t offset = a["offset"] | 0u;
    const bool final = a["final"] | false;
    if (offset == 0 && polpo::link::is_sensitive_path(path)) {
        ask("Script dal PC", "Il PC vuole salvare uno script BadUSB:\n" + path + "\nAccetti?", id,
            [id, path, data, final](bool yes) {
                if (!yes) return reply_err(id, "denied", "rifiutato sul Polpo");
                do_fs_write(id, path, 0, data, final);
            });
        return;
    }
    do_fs_write(id, path, offset, data, final);
}

void cmd_fs_delete(uint32_t id, JsonObjectConst a) {
    std::string path;
    if (!check_path(id, a, path)) return;
    if (!storage::remove(path)) return reply_err(id, "io_error", "file non trovato");
    reply_ok(id);
}

// ---------------- infrarossi ----------------

void cmd_ir_send(uint32_t id, JsonObjectConst a) {
    polpo::IrSignal sig;
    if (a["file"].is<const char*>()) {
        const std::string path = a["file"].as<const char*>();
        const std::string name = a["name"] | "";
        if (!polpo::link::valid_sd_path(path)) return reply_err(id, "bad_args", "percorso non valido");
        std::string text, err;
        if (!storage::read_text(path, text, 48 * 1024)) return reply_err(id, "io_error", "file .ir non leggibile");
        polpo::IrFile f;
        if (!polpo::ir_file_parse(text, f, err)) return reply_err(id, "bad_args", err.c_str());
        bool found = false;
        for (const auto& s : f.signals)
            if (s.name == name) {
                sig = s;
                found = true;
                break;
            }
        if (!found) return reply_err(id, "bad_args", "tasto non trovato nel file");
    } else if (a["raw"] | false) {
        sig.raw = true;
        sig.name = "pc";
        sig.frequency = a["frequency"] | 38000u;
        sig.duty = a["duty"] | 0.33f;
        for (JsonVariantConst v : a["timings"].as<JsonArrayConst>()) sig.timings.push_back(v.as<uint32_t>());
    } else {
        sig.name = "pc";
        sig.protocol = polpo::ir_protocol_from_name(a["protocol"] | "");
        sig.address = a["address"] | 0u;
        sig.command = a["command"] | 0u;
    }
    std::string why;
    if (!polpo::ir_signal_validate(sig, why)) return reply_err(id, "bad_args", why.c_str());
    activity = "Invio IR: " + sig.name;
    bool ok = true;
    for (uint8_t i = 0; i < settings::get().ir_repeats; ++i) {
        ok = ir::send(sig) && ok;
        delay(40);
    }
    ir::tx_end();
    if (!ok) return reply_err(id, "io_error", "invio non riuscito");
    sound::send();
    reply_ok(id);
}

// ---------------- radio 433 MHz ----------------

void cmd_rf_tx(uint32_t id, JsonObjectConst a) {
    const std::string path = a["file"] | "";
    if (!polpo::link::valid_sd_path(path)) return reply_err(id, "bad_args", "percorso non valido");
    std::string text, err;
    if (!storage::read_text(path, text, 96 * 1024)) return reply_err(id, "io_error", "file .sub non leggibile");
    polpo::SubFile f;
    if (!polpo::sub_parse(text, f, err)) return reply_err(id, "unsupported", err.c_str());
    if (f.frequency < 433050000 || f.frequency > 434790000)
        return reply_err(id, "unsupported", "il modulo RF433T trasmette solo a 433,92 MHz");
    const uint8_t rep = settings::get().rf_repeats;
    const std::string name = storage::basename(path);
    ask("Trasmettere?", "Il PC chiede di trasmettere a 433,92 MHz:\n" + name + "\nSolo dispositivi tuoi.", id,
        [id, f, rep](bool yes) {
            if (!yes) return reply_err(id, "denied", "rifiutato sul Polpo");
            rf_rx_on = false;
            const auto r = f.raw ? rf433::send_raw(f.raw_timings, rep < 3 ? 3 : (rep > 5 ? 5 : rep))
                                 : rf433::send_code(f.code, rep);
            if (!r.ok) return reply_err(id, "budget", r.error);
            sound::send();
            JsonDocument d;
            d["budget_used_ms"] = rf433::budget_used_ms();
            reply_ok(id, d);
        });
}

void cmd_rf_raw_snapshot(uint32_t id) {
    if (!rf_raw_on) return reply_err(id, "bad_args", "avvia prima rf.raw.start");
    std::vector<int32_t> t;
    rf433::raw_snapshot(t, 1024);
    const auto st = polpo::pulse_analyze(t);
    JsonDocument d;
    d["count"] = t.size();
    JsonArray arr = d["timings"].to<JsonArray>();
    for (size_t i = 0; i < t.size() && i < 300; ++i) arr.add(t[i]);  // riga ~2 KB al massimo
    JsonObject s = d["stats"].to<JsonObject>();
    s["short_us"] = st.short_us;
    s["long_us"] = st.long_us;
    s["ratio"] = st.ratio;
    s["min_us"] = st.min_us;
    s["max_us"] = st.max_us;
    reply_ok(id, d);
}

// ---------------- NFC ----------------

void fill_card(JsonDocument& d, nfc::Card& c, bool read_memory) {
    d["present"] = true;
    d["uid"] = polpo::to_hex(c.uid, c.uid_len, 0);
    d["atqa"] = c.atqa;
    d["sak"] = c.sak;
    d["family"] = polpo::card_family(c.sak, c.atqa);
    if (c.sak != 0x00) return;
    const auto model = c.has_version ? polpo::type2_model_from_version(c.version) : polpo::Type2Model::Ultralight;
    const auto& info = polpo::type2_info(model);
    d["model"] = info.name;
    if (c.has_version) d["version"] = polpo::to_hex(c.version, 8, 0);
    if (!read_memory) return;
    std::vector<uint8_t> pages;
    if (!nfc::read_pages(0, info.user_last + 1, pages)) {
        d["read_error"] = "memoria non leggibile (pagine protette?)";
        return;
    }
    d["pages"] = polpo::to_hex(pages, 0);
}

void cmd_nfc_read(uint32_t id) {
    if (!nfc::begin()) return reply_err(id, "no_hardware", "modulo RFID2 non trovato sulla porta Grove");
    nfc::Card c;
    JsonDocument d;
    if (!nfc::poll(c)) {
        d["present"] = false;
    } else {
        fill_card(d, c, true);
        nfc::halt();
    }
    nfc::end();
    reply_ok(id, d);
}

void finish_nfc_write() {
    const uint32_t id = pending.id;
    const std::vector<uint8_t> tlv = pending.tlv;
    nfc::Card c;
    if (!nfc::poll(c)) {
        if (static_cast<int32_t>(millis() - pending.deadline) >= 0) {
            pending.kind = Pending::None;
            nfc::end();
            activity.clear();
            reply_err(id, "timeout", "nessun tag appoggiato entro 15 s");
        }
        return;
    }
    pending.kind = Pending::None;
    activity.clear();
    auto fail = [&](const char* code, const std::string& msg) {
        nfc::halt();
        nfc::end();
        sound::error();
        reply_err(id, code, msg.c_str());
    };
    if (c.sak != 0x00) return fail("unsupported", "la carta non è un tag NFC Type 2");
    const auto model = c.has_version ? polpo::type2_model_from_version(c.version) : polpo::Type2Model::Ultralight;
    const auto& info = polpo::type2_info(model);
    std::vector<uint8_t> head, dyn;
    if (!nfc::read_pages(0, 16, head) || head.size() < 16) return fail("io_error", "tag non leggibile");
    const uint8_t* dyn_ptr = nullptr;
    if (info.dyn_lock_page) {
        if (!nfc::read_pages(info.dyn_lock_page, 1, dyn) || dyn.size() < 4)
            return fail("io_error", "impossibile verificare i blocchi del tag");
        dyn_ptr = dyn.data();
    }
    std::vector<polpo::PageWrite> plan;
    const auto e = polpo::type2_plan_ndef_write(info, &head[8], &head[12], dyn_ptr, tlv, plan);
    if (e != polpo::WritePlanError::None) return fail("denied", std::string("scrittura rifiutata: ") + polpo::write_plan_error_text(e));
    for (const auto& w : plan)
        if (!nfc::write_page(w.page, w.data)) return fail("io_error", "errore di scrittura: tieni fermo il tag");
    std::vector<uint8_t> back;
    if (!nfc::read_pages(4, static_cast<uint16_t>(plan.size()), back)) return fail("io_error", "verifica non riuscita");
    for (size_t i = 0; i < plan.size(); ++i)
        for (int k = 0; k < 4; ++k)
            if (back[i * 4 + k] != plan[i].data[k]) return fail("io_error", "verifica fallita");
    nfc::halt();
    nfc::end();
    sound::ok();
    JsonDocument d;
    d["model"] = info.name;
    d["bytes"] = tlv.size();
    d["uid"] = polpo::to_hex(c.uid, c.uid_len, 0);
    reply_ok(id, d);
}

void cmd_nfc_write_ndef(uint32_t id, JsonObjectConst a) {
    const std::string kind = a["kind"] | "";
    const std::string value = a["value"] | "";
    if (value.empty() || value.size() > 400) return reply_err(id, "bad_args", "contenuto vuoto o troppo lungo");
    std::vector<uint8_t> msg;
    if (kind == "uri") msg = polpo::ndef_uri_message(value);
    else if (kind == "text") msg = polpo::ndef_text_message(value, a["lang"] | "it");
    else return reply_err(id, "bad_args", "kind deve essere uri o text");
    std::vector<uint8_t> tlv = polpo::ndef_wrap_tlv(msg);
    ask("Scrivere un tag?", "Il PC vuole scrivere su un tag NFC TUO:\n" + value, id, [id, tlv](bool yes) {
        if (!yes) return reply_err(id, "denied", "rifiutato sul Polpo");
        if (!nfc::begin()) return reply_err(id, "no_hardware", "modulo RFID2 non trovato sulla porta Grove");
        pending.kind = Pending::NfcWrite;
        pending.id = id;
        pending.tlv = tlv;
        pending.deadline = millis() + 15000;
        activity = "Appoggia il tag sul modulo RFID2";
    });
}

// ---------------- radio Wi-Fi / Bluetooth ----------------

void finish_wifi() {
    const int16_t n = WiFi.scanComplete();
    if (n == WIFI_SCAN_RUNNING) return;
    const uint32_t id = pending.id;
    pending.kind = Pending::None;
    activity.clear();
    JsonDocument d;
    JsonArray arr = d["networks"].to<JsonArray>();
    for (int i = 0; i < n && i < 30; ++i) {
        JsonObject o = arr.add<JsonObject>();
        o["ssid"] = WiFi.SSID(i).c_str();
        o["bssid"] = WiFi.BSSIDstr(i).c_str();
        o["rssi"] = WiFi.RSSI(i);
        o["channel"] = WiFi.channel(i);
        o["auth"] = static_cast<int>(WiFi.encryptionType(i));
    }
    WiFi.scanDelete();
    WiFi.mode(WIFI_OFF);
    if (n < 0) return reply_err(id, "io_error", "scansione Wi-Fi non riuscita");
    reply_ok(id, d);
}

void finish_ble() {
    if (ble::scanning()) return;
    const uint32_t id = pending.id;
    pending.kind = Pending::None;
    activity.clear();
    JsonDocument d;
    JsonArray arr = d["devices"].to<JsonArray>();
    int n = 0;
    for (const auto& dev : ble::scan_results()) {
        if (++n > 40) break;
        JsonObject o = arr.add<JsonObject>();
        o["name"] = dev.name;
        o["addr"] = dev.addr;
        o["rssi"] = dev.rssi;
        o["mfr_id"] = dev.mfr_id;
        o["connectable"] = dev.connectable;
    }
    ble::end();
    reply_ok(id, d);
}

// ---------------- smistamento ----------------

void handle(polpo::link::Request& r) {
    const uint32_t id = r.id;
    const std::string& c = r.cmd;
    JsonObjectConst a = r.args();
    last_cmd = c;
    ++commands_done;
    if (c == "hello") {
        client_name = a["client"] | "Polpo Studio";
        if (session) {
            JsonDocument d;
            fill_info(d);
            return reply_ok(id, d);
        }
        ask("Collegare al PC?", "\"" + client_name + "\" chiede di controllare il Polpo via USB. Accetti?", id,
            [id](bool yes) {
                if (!yes) return reply_err(id, "denied", "collegamento rifiutato sul Polpo");
                session = true;
                last_rx_ms = millis();
                settings::add_xp(1);
                nav.pop_to_root();  // chiude le app aperte: liberano la porta Grove
                nav.push(std::unique_ptr<Screen>(new LinkScreen()));
                JsonDocument d;
                fill_info(d);
                reply_ok(id, d);
            });
        return;
    }
    if (c == "info") {
        JsonDocument d;
        fill_info(d);
        return reply_ok(id, d);
    }
    if (c == "bye") {
        reply_ok(id);
        return end_session_from_pc();
    }
    if (c == "diag") {
        JsonDocument d;
        fill_info(d);
        bool sd_ok = false;
        if (storage::ok()) {
            const std::string p = "/polpo/logs/link_test.txt", v = "polpo " + std::to_string(millis());
            std::string back;
            sd_ok = storage::write_text(p, v) && storage::read_text(p, back) && back == v;
            storage::remove(p);
        }
        d["sd_test"] = sd_ok;
        JsonArray i2c = d["i2c"].to<JsonArray>();
        for (uint8_t addr : grove::i2c_scan()) i2c.add(addr);
        grove::release();
        return reply_ok(id, d);
    }
    if (c == "fs.list") return cmd_fs_list(id, a);
    if (c == "fs.read") return cmd_fs_read(id, a);
    if (c == "fs.write") return cmd_fs_write(id, a);
    if (c == "fs.delete") return cmd_fs_delete(id, a);
    if (c == "ir.send") return cmd_ir_send(id, a);
    if (c == "ir.learn.start") {
        if (!ir::rx_start()) return reply_err(id, "no_hardware", "ricevitore IR non pronto");
        ir_learn_on = true;
        activity = "In ascolto IR (IR Unit)";
        return reply_ok(id);
    }
    if (c == "ir.learn.stop") {
        ir_learn_on = false;
        ir::rx_end();
        activity.clear();
        return reply_ok(id);
    }
    if (c == "rf.rx.start") {
        rf_raw_on = false;
        rf433::raw_end();
        rf433::rx_begin();
        rf_rx_on = true;
        activity = "In ascolto a 433,92 MHz";
        return reply_ok(id);
    }
    if (c == "rf.rx.stop") {
        rf_rx_on = false;
        rf433::rx_end();
        activity.clear();
        return reply_ok(id);
    }
    if (c == "rf.raw.start") {
        rf_rx_on = false;
        rf433::rx_end();
        rf433::raw_begin();
        rf_raw_on = true;
        activity = "Registrazione RAW a 433,92 MHz";
        return reply_ok(id);
    }
    if (c == "rf.raw.snapshot") return cmd_rf_raw_snapshot(id);
    if (c == "rf.raw.stop") {
        rf_raw_on = false;
        rf433::raw_end();
        activity.clear();
        return reply_ok(id);
    }
    if (c == "rf.tx") return cmd_rf_tx(id, a);
    if (c == "nfc.read") return cmd_nfc_read(id);
    if (c == "nfc.write_ndef") return cmd_nfc_write_ndef(id, a);
    if (c == "wifi.scan") {
        WiFi.mode(WIFI_STA);
        WiFi.disconnect();
        if (WiFi.scanNetworks(true, true) != WIFI_SCAN_RUNNING) return reply_err(id, "io_error", "scansione non avviata");
        pending.kind = Pending::Wifi;
        pending.id = id;
        activity = "Scansione Wi-Fi";
        return;
    }
    if (c == "ble.scan") {
        uint32_t ms = a["ms"] | 4000u;
        if (ms > 10000) ms = 10000;
        if (!ble::scan_start(ms)) return reply_err(id, "io_error", "Bluetooth non disponibile");
        pending.kind = Pending::Ble;
        pending.id = id;
        activity = "Scansione Bluetooth";
        return;
    }
    if (c == "gpio.i2c_scan") {
        JsonDocument d;
        JsonArray arr = d["devices"].to<JsonArray>();
        for (uint8_t addr : grove::i2c_scan()) {
            JsonObject o = arr.add<JsonObject>();
            o["addr"] = addr;
            o["name"] = grove::i2c_device_name(addr);
        }
        grove::release();
        return reply_ok(id, d);
    }
    if (c == "gpio.pins") {
        grove::use_gpio();
        JsonDocument d;
        d["g1"] = digitalRead(pins::kGroveWhite);
        d["g2"] = digitalRead(pins::kGroveYellow);
        grove::release();
        return reply_ok(id, d);
    }
    reply_err(id, "unknown_cmd", "comando non gestito");
}

void stop_all_hardware() {
    rf_rx_on = rf_raw_on = ir_learn_on = false;
    rf433::rx_end();
    rf433::raw_end();
    ir::rx_end();
    ir::tx_end();
    nfc::end();
    ble::end();
    WiFi.mode(WIFI_OFF);
    grove::release();
    activity.clear();
}

void poll_events(uint32_t now) {
    if (rf_rx_on) {
        polpo::RcCode code;
        if (rf433::rx_poll(code)) {
            // Un telecomando ripete il codice: un evento ogni 400 ms al massimo per lo stesso valore.
            if (code.value != last_code.value || code.bits != last_code.bits || now - last_code_ms > 400) {
                JsonDocument d;
                d["protocol"] = code.protocol;
                d["bits"] = code.bits;
                d["value"] = polpo::to_hex(polpo::be_to_bytes(code.value, 8), 0);
                d["pulse_us"] = code.pulse_us;
                emit("rf.code", d);
            }
            last_code = code;
            last_code_ms = now;
        }
    }
    if (ir_learn_on) {
        std::vector<uint32_t> dur;
        if (ir::rx_poll(dur)) {
            polpo::IrSignal sig;
            JsonDocument d;
            if (polpo::ir_decode(dur, sig)) {
                d["protocol"] = polpo::ir_protocol_info(sig.protocol).name;
                d["address"] = sig.address;
                d["command"] = sig.command;
            } else {
                d["raw"] = true;
                JsonArray arr = d["timings"].to<JsonArray>();
                for (size_t i = 0; i < dur.size() && i < 300; ++i) arr.add(dur[i]);
            }
            emit("ir.learned", d);
            ir::rx_start();
        }
    }
}

}  // namespace

void begin() {
    Serial.setRxBufferSize(4096);
    Serial.setTxTimeoutMs(20);  // senza PC in ascolto non si blocca l'interfaccia
}

bool session_active() { return session; }

void on_link_screen_closed() {
    if (!session) return;
    session = false;
    stop_all_hardware();
    JsonDocument d;
    d["reason"] = "closed_on_device";
    emit("link.closed", d);
}

void poll(uint32_t now) {
    int budget = 512;  // byte letti per giro: l'interfaccia resta reattiva
    while (Serial.available() && budget-- > 0) {
        const int ch = Serial.read();
        if (ch < 0) break;
        const auto res = framer.feed(static_cast<char>(ch));
        if (res == polpo::link::LineFramer::Result::Overflow) {
            send_line(make_error(0, "line_too_long", "riga oltre 2048 byte"));
        } else if (res == polpo::link::LineFramer::Result::Line) {
            last_rx_ms = now;
            polpo::link::Request r;
            const std::string pre = polpo::link::preprocess(framer.take(), session, busy(), r);
            if (!pre.empty()) {
                send_line(pre);
            } else {
                handle(r);
            }
        }
    }
    switch (pending.kind) {
        case Pending::Wifi: finish_wifi(); break;
        case Pending::Ble: finish_ble(); break;
        case Pending::NfcWrite: finish_nfc_write(); break;
        default: break;
    }
    if (session) {
        poll_events(now);
        // Polpo Studio invia un ping ogni 10 s: dopo 2 minuti di silenzio il collegamento si chiude.
        if (now - last_rx_ms > 120000 && !busy()) end_session_from_pc();
    }
}

}  // namespace pclink
