// Polpo — app Bluetooth (scansione, telecomando multimediale) e Wi-Fi (scansione, canali).
// Solo ascolto e funzioni verso i propri dispositivi: nessun invio di pacchetti arbitrari.
#include <Arduino.h>
#include <Network.h>  // incluso esplicitamente: serve alla ricerca delle dipendenze di WiFi
#include <WiFi.h>

#include <algorithm>
#include <cstdio>

#include "apps/apps.h"
#include "core/settings.h"
#include "core/sound.h"
#include "core/storage.h"
#include "core/widgets.h"
#include "hal/ble.h"
#include "polpo/wifi/channels.h"

namespace {

const char* vendor_name(uint16_t id) {
    switch (id) {
        case 0x004C: return "Apple";
        case 0x0006: return "Microsoft";
        case 0x0075: return "Samsung";
        case 0x00E0: return "Google";
        case 0x0157: return "Huami/Xiaomi";
        case 0x038F: return "Xiaomi";
        case 0x0087: return "Garmin";
        case 0x02E5: return "Espressif";
        case 0x0059: return "Nordic";
        case 0x000F: return "Broadcom";
        case 0x0171: return "Amazon";
        default: return nullptr;
    }
}

// ---------------- Bluetooth: scansione ----------------

class BleScanScreen : public MenuScreen {
public:
    BleScanScreen() : MenuScreen("Dispositivi Bluetooth", {}, "OK dettagli  r ripeti  s salva") {
        empty_text_ = "Scansione in corso (5 s)...";
    }
    void on_enter() override { start(); }
    void on_exit() override { ble::end(); }
    void tick(uint32_t) override {
        if (scanning_ && !ble::scanning()) {
            scanning_ = false;
            devices_ = ble::scan_results();
            rebuild();
            sound::ok();
            settings::add_xp(1);
        }
    }
    uint32_t redraw_interval_ms() const override { return scanning_ ? 500 : 0; }

protected:
    bool on_extra_key(const InputEvent& ev) override {
        if (ev.ch == 'r' && !scanning_) {
            start();
            return true;
        }
        if (ev.ch == 's' && !scanning_) {
            save_csv();
            return true;
        }
        return false;
    }
    void draw_empty() override {
        ui::text_center(ui::kContentY + 40, scanning_ ? "Scansione in corso (5 s)..." : "Nessun dispositivo trovato",
                        ui::kDim);
    }

private:
    void start() {
        devices_.clear();
        set_items({});
        scanning_ = ble::scan_start(5000);
        if (!scanning_) show_error("Bluetooth non disponibile.");
    }
    void rebuild() {
        std::vector<MenuItem> items;
        for (const auto& d : devices_) {
            std::string name = d.name;
            if (name.empty()) {
                const char* v = d.has_mfr ? vendor_name(d.mfr_id) : nullptr;
                name = v ? std::string("(") + v + ")" : "(senza nome)";
            }
            char r[16];
            std::snprintf(r, sizeof r, "%d dBm", d.rssi);
            const ble::Device copy = d;
            items.push_back({name, r, [copy] {
                                 char b[220];
                                 const char* v = copy.has_mfr ? vendor_name(copy.mfr_id) : nullptr;
                                 std::snprintf(b, sizeof b,
                                               "Nome: %s\nIndirizzo: %s\nSegnale: %d dBm\nProduttore: %s (0x%04X)\n"
                                               "Servizi annunciati: %u\nConnettibile: %s",
                                               copy.name.empty() ? "-" : copy.name.c_str(), copy.addr.c_str(), copy.rssi,
                                               v ? v : "?", copy.mfr_id, copy.services, copy.connectable ? "sì" : "no");
                                 show_message("Dispositivo", b);
                             }});
        }
        set_items(items);
    }
    void save_csv() {
        if (!storage::ok()) return show_error("Serve la microSD.");
        std::string csv = "nome,indirizzo,rssi,produttore\n";
        for (const auto& d : devices_) {
            char b[120];
            std::snprintf(b, sizeof b, "\"%s\",%s,%d,0x%04X\n", d.name.c_str(), d.addr.c_str(), d.rssi, d.mfr_id);
            csv += b;
        }
        const std::string p = storage::unique_path(storage::kLogDir, "ble", ".csv");
        if (storage::write_text(p, csv)) {
            show_message("Salvato", p, ui::kOk);
        } else {
            show_error("Scrittura non riuscita.");
        }
    }
    std::vector<ble::Device> devices_;
    bool scanning_ = false;
};

// ---------------- Bluetooth: telecomando multimediale ----------------

class MediaRemoteScreen : public Screen {
public:
    void on_enter() override { ok_ = ble::remote_begin("Polpo Remote"); }
    void on_exit() override { ble::end(); }
    uint32_t redraw_interval_ms() const override { return 500; }
    void on_event(const InputEvent& ev) override {
        if (ev.key == Key::Back || ev.key == Key::Backspace) {
            nav.pop();
            return;
        }
        uint16_t u = 0;
        const char* what = nullptr;
        switch (ev.key) {
            case Key::Up: u = ble::kVolUp; what = "Volume +"; break;
            case Key::Down: u = ble::kVolDown; what = "Volume -"; break;
            case Key::Left: u = ble::kPrev; what = "Precedente"; break;
            case Key::Right: u = ble::kNext; what = "Successivo"; break;
            case Key::Ok: u = ble::kPlayPause; what = "Play / pausa"; break;
            default:
                if (ev.ch == 'm') {
                    u = ble::kMute;
                    what = "Muto";
                }
                break;
        }
        if (u && ble::remote_connected()) {
            ble::remote_press(u);
            last_ = what;
            sound::click();
        }
    }
    void draw() override {
        ui::header("Telecomando Bluetooth", ui::kAccent2);
        if (!ok_) {
            ui::text(6, ui::kContentY + 8, "Bluetooth non disponibile.", ui::kErr);
            ui::footer("` indietro");
            return;
        }
        const bool conn = ble::remote_connected();
        ui::text(6, ui::kContentY + 4, conn ? "Collegato" : "In attesa di abbinamento...", conn ? ui::kOk : ui::kWarn);
        ui::wrap(6, ui::kContentY + 20, ui::kW - 12,
                 conn ? "; volume+  . volume-  , precedente  / successivo  OK play/pausa  m muto"
                      : "Sul telefono o PC apri Bluetooth e abbina \"Polpo Remote\".",
                 ui::kFg, 14, 4);
        if (!last_.empty()) ui::text(6, ui::kContentY + 80, "Inviato: " + last_, ui::kAccent);
        ui::footer("` indietro (scollega)");
    }

private:
    bool ok_ = false;
    std::string last_;
};

// ---------------- Wi-Fi ----------------

struct Net {
    std::string ssid, bssid;
    int rssi;
    uint8_t channel;
    wifi_auth_mode_t auth;
};

const char* auth_name(wifi_auth_mode_t a) {
    switch (a) {
        case WIFI_AUTH_OPEN: return "aperta";
        case WIFI_AUTH_WEP: return "WEP (insicura)";
        case WIFI_AUTH_WPA_PSK: return "WPA";
        case WIFI_AUTH_WPA2_PSK: return "WPA2";
        case WIFI_AUTH_WPA_WPA2_PSK: return "WPA/WPA2";
        case WIFI_AUTH_WPA2_ENTERPRISE: return "WPA2 Enterprise";
        case WIFI_AUTH_WPA3_PSK: return "WPA3";
        case WIFI_AUTH_WPA2_WPA3_PSK: return "WPA2/WPA3";
        default: return "altro";
    }
}

class ChannelGraphScreen : public Screen {
public:
    explicit ChannelGraphScreen(std::vector<Net> nets) {
        std::vector<polpo::WifiSeen> seen;
        for (const auto& n : nets) seen.push_back({n.channel, static_cast<int8_t>(n.rssi)});
        load_ = polpo::wifi_channel_load(seen);
        count_ = nets.size();
    }
    void on_event(const InputEvent& ev) override {
        if (ev.key == Key::Back || ev.key == Key::Ok || ev.key == Key::Backspace) nav.pop();
    }
    void draw() override {
        ui::header("Occupazione canali 2,4 GHz");
        auto& g = ui::c();
        const int base = ui::kContentY + 80, top = ui::kContentY + 14, w = 16, gap = 1, x0 = 10;
        const float maxv = load_.max_load > 0.5f ? load_.max_load : 0.5f;
        for (int ch = 1; ch <= 13; ++ch) {
            const int x = x0 + (ch - 1) * (w + gap);
            const int h = static_cast<int>((base - top) * load_.load[ch] / maxv);
            const uint16_t col = ch == load_.best ? ui::kOk : (load_.load[ch] > maxv * 0.66f ? ui::kErr : ui::kAccent2);
            if (h > 0) g.fillRect(x, base - h, w, h, col);
            g.setFont(&fonts::Font0);
            g.setTextColor(ch == 1 || ch == 6 || ch == 11 ? ui::kFg : ui::kDim);
            g.drawString(std::to_string(ch).c_str(), x + 3, base + 3);
            g.setFont(&fonts::efontCN_12);
        }
        char b[64];
        std::snprintf(b, sizeof b, "%u reti. Canale consigliato: %u", static_cast<unsigned>(count_), load_.best);
        ui::text(6, ui::kContentY + 1, b, ui::kOk);
        ui::footer("Per il TUO router scegli 1, 6 o 11");
    }

private:
    polpo::ChannelLoad load_;
    size_t count_ = 0;
};

class WifiScanScreen : public MenuScreen {
public:
    WifiScanScreen() : MenuScreen("Reti Wi-Fi", {}, "OK dettagli  c canali  r ripeti  s salva") {}
    void on_enter() override { start(); }
    void on_exit() override {
        WiFi.scanDelete();
        WiFi.mode(WIFI_OFF);
    }
    void tick(uint32_t) override {
        if (!scanning_) return;
        const int16_t n = WiFi.scanComplete();
        if (n == WIFI_SCAN_RUNNING) return;
        scanning_ = false;
        nets_.clear();
        for (int i = 0; i < n; ++i) {
            Net x;
            x.ssid = WiFi.SSID(i).c_str();
            x.bssid = WiFi.BSSIDstr(i).c_str();
            x.rssi = WiFi.RSSI(i);
            x.channel = static_cast<uint8_t>(WiFi.channel(i));
            x.auth = WiFi.encryptionType(i);
            nets_.push_back(x);
        }
        WiFi.scanDelete();
        std::sort(nets_.begin(), nets_.end(), [](const Net& a, const Net& b) { return a.rssi > b.rssi; });
        rebuild();
        sound::ok();
        settings::add_xp(1);
    }
    uint32_t redraw_interval_ms() const override { return scanning_ ? 500 : 0; }

protected:
    bool on_extra_key(const InputEvent& ev) override {
        if (scanning_) return false;
        if (ev.ch == 'r') {
            start();
            return true;
        }
        if (ev.ch == 'c') {
            open<ChannelGraphScreen>(nets_);
            return true;
        }
        if (ev.ch == 's') {
            save_csv();
            return true;
        }
        return false;
    }
    void draw_empty() override {
        ui::text_center(ui::kContentY + 40, scanning_ ? "Scansione in corso..." : "Nessuna rete trovata", ui::kDim);
    }

private:
    void start() {
        WiFi.mode(WIFI_STA);
        WiFi.disconnect();
        nets_.clear();
        set_items({});
        scanning_ = WiFi.scanNetworks(true, true) == WIFI_SCAN_RUNNING;
        if (!scanning_) show_error("Scansione Wi-Fi non avviata.");
    }
    void rebuild() {
        std::vector<MenuItem> items;
        for (const auto& n : nets_) {
            char r[16];
            std::snprintf(r, sizeof r, "c%u %d", n.channel, n.rssi);
            const Net copy = n;
            items.push_back({n.ssid.empty() ? "(rete nascosta)" : n.ssid, r,
                             [copy] {
                                 char b[220];
                                 std::snprintf(b, sizeof b,
                                               "Nome: %s\nBSSID: %s\nCanale: %u\nSegnale: %d dBm\nSicurezza: %s",
                                               copy.ssid.empty() ? "(nascosta)" : copy.ssid.c_str(), copy.bssid.c_str(),
                                               copy.channel, copy.rssi, auth_name(copy.auth));
                                 show_message("Rete", b);
                             },
                             n.auth == WIFI_AUTH_OPEN || n.auth == WIFI_AUTH_WEP ? ui::kWarn : ui::kFg});
        }
        set_items(items);
    }
    void save_csv() {
        if (!storage::ok()) return show_error("Serve la microSD.");
        std::string csv = "ssid,bssid,canale,rssi,sicurezza\n";
        for (const auto& n : nets_) {
            char b[160];
            std::snprintf(b, sizeof b, "\"%s\",%s,%u,%d,%s\n", n.ssid.c_str(), n.bssid.c_str(), n.channel, n.rssi,
                          auth_name(n.auth));
            csv += b;
        }
        const std::string p = storage::unique_path(storage::kLogDir, "wifi", ".csv");
        if (storage::write_text(p, csv)) {
            show_message("Salvato", p, ui::kOk);
        } else {
            show_error("Scrittura non riuscita.");
        }
    }
    std::vector<Net> nets_;
    bool scanning_ = false;
};

}  // namespace

void open_ble_app() {
    std::vector<MenuItem> items = {
        {"Scansione dispositivi", "", [] { open<BleScanScreen>(); }},
        {"Telecomando multimediale", "HID", [] { open<MediaRemoteScreen>(); }},
        {"Cosa fa", "", [] {
             show_message("Bluetooth",
                          "La scansione ascolta gli annunci Bluetooth LE dei dispositivi vicini (nome, potenza, "
                          "produttore): utile per trovare i tuoi auricolari o capire quanti dispositivi ci sono.\n"
                          "Il telecomando si abbina al TUO telefono o PC e controlla musica e volume.");
         }},
    };
    open<MenuScreen>("Bluetooth", items);
}

void open_wifi_app() {
    std::vector<MenuItem> items = {
        {"Scansione reti", "", [] { open<WifiScanScreen>(); }},
        {"Cosa fa", "", [] {
             show_message("Wi-Fi",
                          "Elenca le reti a 2,4 GHz con canale, segnale e sicurezza, e mostra quali canali sono "
                          "più affollati: serve a scegliere il canale migliore per il TUO router.\nIl Polpo non si "
                          "collega a reti altrui e non invia pacchetti di disturbo.");
         }},
    };
    open<MenuScreen>("Wi-Fi", items);
}
