// Polpo — firmware multi-tool per M5Stack Cardputer.
// Infrarossi, radio 433 MHz, NFC, BadUSB, Bluetooth, Wi-Fi e GPIO, con interfaccia in italiano.
// Da usare solo su dispositivi propri o con autorizzazione.
#include <M5Cardputer.h>

#include "apps/apps.h"
#include "core/gfx.h"
#include "core/input.h"
#include "core/screen.h"
#include "core/settings.h"
#include "core/storage.h"
#include "hal/usb_kbd.h"
#include "link/link.h"

void setup() {
    usb_kbd::begin();  // l'interfaccia USB tastiera va registrata subito

    auto cfg = M5.config();
    cfg.serial_baudrate = 0;  // la seriale USB è già gestita dal core
    M5Cardputer.begin(cfg, true);
    M5Cardputer.Speaker.setVolume(90);

    settings::load();
    settings::get().boots++;
    settings::save();

    ui::begin();
    ui::set_brightness(settings::get().brightness);
    storage::begin();
    pclink::begin();

    open_desktop();
}

void loop() {
    M5Cardputer.update();
    const uint32_t now = millis();
    input.update(now);
    pclink::poll(now);
    nav.run_once(now);
    delay(5);
}
