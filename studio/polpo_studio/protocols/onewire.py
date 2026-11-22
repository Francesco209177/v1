"""1-Wire e iButton: codice ROM a 64 bit (famiglia, numero di serie, CRC8 Dallas/Maxim)."""

from __future__ import annotations

from dataclasses import dataclass

# Codici famiglia pubblicati nei datasheet Maxim/Analog Devices.
FAMILIES = {
    0x01: "DS1990A / DS2401 (solo numero di serie)",
    0x02: "DS1991 (memoria con password)",
    0x04: "DS1994 / DS2404 (orologio + memoria)",
    0x06: "DS1993 (memoria 4 kbit)",
    0x08: "DS1992 (memoria 1 kbit)",
    0x09: "DS1982 / DS2502 (memoria OTP)",
    0x0A: "DS1995 (memoria 16 kbit)",
    0x0B: "DS1985 / DS2505 (memoria OTP)",
    0x0C: "DS1996 (memoria 64 kbit)",
    0x10: "DS18S20 (sensore di temperatura)",
    0x14: "DS1971 / DS2430A (EEPROM)",
    0x1D: "DS2423 (contatore)",
    0x22: "DS1822 (sensore di temperatura)",
    0x23: "DS1973 / DS2433 (EEPROM 4 kbit)",
    0x26: "DS2438 (monitor batteria)",
    0x28: "DS18B20 (sensore di temperatura)",
    0x29: "DS2408 (8 ingressi/uscite)",
    0x2D: "DS2431 (EEPROM 1 kbit)",
    0x33: "DS1961S / DS2432 (EEPROM con SHA-1)",
    0x3A: "DS2413 (2 ingressi/uscite)",
    0x3B: "MAX31826 (sensore di temperatura)",
    0x41: "DS1923 (registratore di temperatura e umidità)",
}


def crc8(data: bytes) -> int:
    """CRC8 Dallas/Maxim (polinomio x^8 + x^5 + x^4 + 1, bit riflessi)."""
    crc = 0
    for byte in data:
        b = byte
        for _ in range(8):
            mix = (crc ^ b) & 1
            crc >>= 1
            if mix:
                crc ^= 0x8C
            b >>= 1
    return crc


@dataclass(frozen=True)
class Rom:
    raw: bytes  # 8 byte, nell'ordine in cui escono dal bus (famiglia per prima)

    @property
    def family(self) -> int:
        return self.raw[0]

    @property
    def family_name(self) -> str:
        return FAMILIES.get(self.family, "famiglia sconosciuta")

    @property
    def serial(self) -> str:
        return self.raw[6:0:-1].hex().upper()

    @property
    def crc_ok(self) -> bool:
        return crc8(self.raw[:7]) == self.raw[7]

    @property
    def text(self) -> str:
        return self.raw.hex(" ").upper()


def parse_rom(text: str) -> Rom | None:
    """Accetta 16 cifre esadecimali (con o senza spazi, trattini, due punti), famiglia per prima."""
    t = "".join(c for c in text if c not in " -:\t").strip()
    if len(t) != 16:
        return None
    try:
        return Rom(bytes.fromhex(t))
    except ValueError:
        return None


def make_rom(family: int, serial48: int) -> Rom:
    body = bytes([family]) + serial48.to_bytes(6, "little")
    return Rom(body + bytes([crc8(body)]))
