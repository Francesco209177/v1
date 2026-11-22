// Polpo — app GPIO e I2C sulla porta Grove: scanner I2C e monitor dei pin G1/G2.
#include <Arduino.h>

#include <cstdio>

#include "apps/apps.h"
#include "board_pins.h"
#include "core/sound.h"
#include "core/widgets.h"
#include "hal/grove.h"

namespace {

class I2cScanScreen : public MenuScreen {
public:
    I2cScanScreen() : MenuScreen("Scanner I2C (Grove)", {}, "r ripeti   ` indietro") {}
    void on_enter() override { scan(); }
    void on_exit() override { grove::release(); }

protected:
    bool on_extra_key(const InputEvent& ev) override {
        if (ev.ch == 'r') {
            scan();
            return true;
        }
        return false;
    }

private:
    void scan() {
        const auto found = grove::i2c_scan();
        std::vector<MenuItem> items;
        for (uint8_t a : found) {
            char b[8];
            std::snprintf(b, sizeof b, "0x%02X", a);
            const char* n = grove::i2c_device_name(a);
            items.push_back({*n ? n : "dispositivo sconosciuto", b, nullptr});
        }
        empty_text_ = "Nessun dispositivo: controlla il cavo";
        set_items(items);
        sound::click();
    }
};

class PinMonitorScreen : public Screen {
public:
    void on_enter() override {
        grove::use_gpio();
        pinMode(pins::kGroveWhite, INPUT_PULLDOWN);
        pinMode(pins::kGroveYellow, INPUT_PULLDOWN);
    }
    void on_exit() override { grove::release(); }
    uint32_t redraw_interval_ms() const override { return 100; }
    void tick(uint32_t) override {
        const bool w = digitalRead(pins::kGroveWhite), y = digitalRead(pins::kGroveYellow);
        if (w != last_w_) ++changes_w_;
        if (y != last_y_) ++changes_y_;
        last_w_ = w;
        last_y_ = y;
    }
    void on_event(const InputEvent& ev) override {
        if (ev.key == Key::Back || ev.key == Key::Backspace || ev.key == Key::Ok) nav.pop();
    }
    void draw() override {
        ui::header("Monitor pin Grove");
        auto pin = [&](int y, const char* name, bool level, uint32_t changes) {
            ui::text(6, y, name, ui::kFg);
            ui::c().fillRoundRect(120, y, 40, 14, 3, level ? ui::kOk : ui::kPanel);
            ui::text(126, y + 1, level ? "ALTO" : "basso", level ? ui::kBg : ui::kDim);
            ui::text(168, y + 1, std::to_string(changes), ui::kDim);
        };
        pin(ui::kContentY + 8, "G1 (filo bianco)", last_w_, changes_w_);
        pin(ui::kContentY + 30, "G2 (filo giallo)", last_y_, changes_y_);
        ui::wrap(6, ui::kContentY + 54, ui::kW - 12,
                 "Ingressi a 3,3 V con resistenza verso massa. Non collegare mai 5 V ai pin di segnale.", ui::kDim, 13, 3);
        ui::footer("numero = cambi di livello   ` indietro");
    }

private:
    bool last_w_ = false, last_y_ = false;
    uint32_t changes_w_ = 0, changes_y_ = 0;
};

}  // namespace

void open_gpio_app() {
    std::vector<MenuItem> items = {
        {"Scanner I2C", "", [] { open<I2cScanScreen>(); }},
        {"Monitor pin G1 / G2", "", [] { open<PinMonitorScreen>(); }},
        {"Piedinatura Grove", "", [] {
             show_message("Porta Grove",
                          "Nero: GND\nRosso: 5 V\nGiallo: G2 (SDA in I2C)\nBianco: G1 (SCL in I2C)\n"
                          "I segnali lavorano a 3,3 V. Sul Cardputer Adv l'interruttore vicino alla porta deve "
                          "essere su uscita 5 V per alimentare i moduli.");
         }},
    };
    open<MenuScreen>("GPIO e I2C", items);
}
