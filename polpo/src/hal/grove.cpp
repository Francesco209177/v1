#include "hal/grove.h"

#include <Arduino.h>
#include <Wire.h>

#include "board_pins.h"

namespace grove {
namespace {

Mode g_mode = Mode::Free;

}  // namespace

bool use_i2c(uint32_t hz) {
    if (g_mode == Mode::I2C) return true;
    release();
    g_mode = Wire.begin(pins::kGroveSda, pins::kGroveScl, hz) ? Mode::I2C : Mode::Free;
    if (g_mode == Mode::I2C) Wire.setTimeOut(50);
    return g_mode == Mode::I2C;
}

void use_gpio() {
    if (g_mode == Mode::Gpio) return;
    release();
    pinMode(pins::kGroveYellow, INPUT);
    pinMode(pins::kGroveWhite, INPUT);
    g_mode = Mode::Gpio;
}

void release() {
    if (g_mode == Mode::I2C) Wire.end();
    pinMode(pins::kGroveYellow, INPUT);
    pinMode(pins::kGroveWhite, INPUT);
    g_mode = Mode::Free;
}

Mode mode() { return g_mode; }

bool i2c_probe(uint8_t addr) {
    if (g_mode != Mode::I2C && !use_i2c()) return false;
    Wire.beginTransmission(addr);
    return Wire.endTransmission() == 0;
}

std::vector<uint8_t> i2c_scan() {
    std::vector<uint8_t> found;
    if (g_mode != Mode::I2C && !use_i2c()) return found;
    for (uint8_t a = 0x08; a <= 0x77; ++a)
        if (i2c_probe(a)) found.push_back(a);
    return found;
}

const char* i2c_device_name(uint8_t a) {
    switch (a) {
        case 0x28: return "M5 RFID2 (WS1850S)";
        case 0x23: return "BH1750 luce";
        case 0x29: return "VL53L0X distanza";
        case 0x38: return "AHT20 / ENV";
        case 0x3C: case 0x3D: return "Display OLED";
        case 0x40: return "INA219 / HDC1080";
        case 0x44: case 0x45: return "SHT3x / SHT4x";
        case 0x48: return "ADS1115 / TMP102";
        case 0x50: return "EEPROM / NFC ST25";
        case 0x51: return "RTC BM8563";
        case 0x57: return "MAX30102";
        case 0x5A: return "MLX90614 / CCS811";
        case 0x5C: return "AM2320";
        case 0x68: return "MPU6050 / DS3231";
        case 0x69: return "BMI270 / MPU6050";
        case 0x70: return "PCA9548 hub I2C";
        case 0x76: case 0x77: return "BME280 / BMP280";
        default: return "";
    }
}

}  // namespace grove
