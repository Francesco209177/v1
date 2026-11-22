// Polpo — Bluetooth Low Energy: scansione dei dispositivi vicini e telecomando
// multimediale (HID Consumer Control) da abbinare al proprio telefono o PC.
#pragma once

#include <cstdint>
#include <string>
#include <vector>

namespace ble {

struct Device {
    std::string name;
    std::string addr;
    int rssi = -127;
    bool has_mfr = false;
    uint16_t mfr_id = 0;
    bool connectable = false;
    uint8_t services = 0;
};

bool scan_start(uint32_t duration_ms);
bool scanning();
std::vector<Device> scan_results();  // ordinati per segnale

// Codici "Consumer" HID più usati.
constexpr uint16_t kPlayPause = 0xCD;
constexpr uint16_t kNext = 0xB5;
constexpr uint16_t kPrev = 0xB6;
constexpr uint16_t kVolUp = 0xE9;
constexpr uint16_t kVolDown = 0xEA;
constexpr uint16_t kMute = 0xE2;

bool remote_begin(const char* name);
bool remote_connected();
void remote_press(uint16_t usage);

void end();  // spegne il Bluetooth e libera la memoria

}  // namespace ble
