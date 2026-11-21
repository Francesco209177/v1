// Polpo — pin del M5Stack Cardputer (v1.1 e Adv), verificati sulla documentazione M5Stack.
#pragma once

namespace pins {

// LED infrarosso integrato (solo trasmissione: il Cardputer non ha ricevitore IR).
constexpr int kIrTx = 44;

// microSD (bus SPI2/FSPI; il display usa SPI3).
constexpr int kSdSck = 40;
constexpr int kSdMiso = 39;
constexpr int kSdMosi = 14;
constexpr int kSdCs = 12;

// Porta Grove (HY2.0-4P): giallo = G2, bianco = G1, più 5 V e GND.
constexpr int kGroveYellow = 2;  // I2C SDA
constexpr int kGroveWhite = 1;   // I2C SCL
constexpr int kGroveSda = kGroveYellow;
constexpr int kGroveScl = kGroveWhite;

// Moduli 433 MHz: RF433T usa il filo giallo, RF433R il bianco (si possono usare insieme con Unit HUB).
constexpr int kRf433Tx = kGroveYellow;
constexpr int kRf433Rx = kGroveWhite;

// IR Unit M5Stack: il ricevitore è sul filo bianco.
constexpr int kIrUnitRx = kGroveWhite;

// Indirizzi I2C dei moduli supportati sulla porta Grove.
constexpr int kRfid2Addr = 0x28;

}  // namespace pins
