// Polpo — desktop con la mascotte e menu principale.
#include <cstdio>

#include "apps/apps.h"
#include "apps/mascot.h"
#include "core/settings.h"
#include "core/storage.h"
#include "core/widgets.h"

namespace {

class DesktopScreen : public Screen {
public:
    void on_event(const InputEvent& ev) override {
        if (ev.key == Key::Ok || ev.key == Key::Down || ev.key == Key::Right) {
            open_main_menu();
        } else if (ev.ch == 'i') {
            open_about_app();
        } else if (ev.ch == 'p') {
            poke_ = millis();
            settings::add_xp(1);
        }
    }
    uint32_t redraw_interval_ms() const override { return 80; }

    void draw() override {
        const uint32_t now = millis();
        const uint32_t idle = now - input.last_activity_ms();
        mascot::Mood mood = mascot::Mood::Happy;
        if (now - poke_ < 1500) {
            mood = mascot::Mood::Excited;
        } else if (!storage::ok()) {
            mood = mascot::Mood::Worried;
        } else if (idle > 60000) {
            mood = mascot::Mood::Sleepy;
        }
        // Fondale marino: qualche bolla che sale.
        auto& g = ui::c();
        for (int b = 0; b < 6; ++b) {
            const int x = 12 + b * 19;
            const int y = 130 - static_cast<int>((now / (14 + b * 3) + b * 37) % 140);
            g.drawCircle(x, y, 2 + b % 3, ui::kPanel);
        }
        mascot::draw(62, 52, 28, now, mood);

        g.setFont(&fonts::FreeSansBold12pt7b);
        g.setTextColor(ui::kFg);
        g.drawString("POLPO", 128, 14);
        g.setFont(&fonts::efontCN_12);

        char buf[48];
        const uint8_t lv = settings::level();
        std::snprintf(buf, sizeof buf, "Livello %u", lv);
        ui::text(130, 44, buf, ui::kAccent);
        static const uint32_t kSteps[] = {0, 20, 80, 200, 500, 500};
        const uint32_t lo = kSteps[lv - 1], hi = kSteps[lv < 5 ? lv : 5];
        const float frac = lv >= 5 ? 1.0f : static_cast<float>(settings::get().xp - lo) / static_cast<float>(hi - lo);
        ui::progress(130, 60, 96, 8, frac);

        ui::text(130, 74, storage::ok() ? "microSD ok" : "microSD assente", storage::ok() ? ui::kOk : ui::kWarn);
        const int bat = ui::battery_level();
        if (bat >= 0) {
            std::snprintf(buf, sizeof buf, "Batteria %d%%", bat);
            ui::text(130, 89, buf, ui::kDim);
        }
        // Al massimo 18 caratteri: la colonna destra è larga 110 pixel.
        const char* msg = mood == mascot::Mood::Sleepy    ? "Zzz..."
                          : mood == mascot::Mood::Worried ? "Manca la microSD"
                                                          : "Pronto!";
        ui::text(130, 104, msg, ui::kDim);
        ui::footer("OK menu   p coccola   i info");
    }

private:
    uint32_t poke_ = 0;
};

}  // namespace

void open_desktop() { open<DesktopScreen>(); }

void open_main_menu() {
    std::vector<MenuItem> items = {
        {"Infrarossi", "IR", [] { open_ir_app(); }},
        {"Radio 433 MHz", "RF", [] { open_rf_app(); }},
        {"NFC", "13,56", [] { open_nfc_app(); }},
        {"BadUSB", "USB", [] { open_badusb_app(); }},
        {"Bluetooth", "BLE", [] { open_ble_app(); }},
        {"Wi-Fi", "2,4 GHz", [] { open_wifi_app(); }},
        {"GPIO e I2C", "Grove", [] { open_gpio_app(); }},
        {"File", "SD", [] { open_files_app(); }},
        {"Diagnostica", "", [] { open_diag_app(); }},
        {"Impostazioni", "", [] { open_settings_app(); }},
        {"Info", "", [] { open_about_app(); }},
    };
    open<MenuScreen>("Menu", items);
}
