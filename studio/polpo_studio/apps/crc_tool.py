"""Calcolatore di controlli: CRC8 Dallas/Maxim, CRC16 (CCITT e Modbus), CRC32, SHA-256."""

from __future__ import annotations

import hashlib
import zlib

from PySide6.QtWidgets import QCheckBox, QFormLayout, QLabel, QPlainTextEdit, QWidget

from ..protocols.onewire import crc8

MANIFEST = {
    "id": "calcolatore_crc",
    "name": "Calcolatore CRC e impronte",
    "description": "CRC8 Dallas/Maxim, CRC16-CCITT, CRC16-Modbus, CRC32 e SHA-256 di testo o byte esadecimali.",
    "version": "1.0",
    "category": "strumenti",
    "author": "Progetto Polpo",
    "icon": "apps",
}


def crc16_ccitt(data: bytes, crc: int = 0xFFFF) -> int:
    for b in data:
        crc ^= b << 8
        for _ in range(8):
            crc = ((crc << 1) ^ 0x1021) & 0xFFFF if crc & 0x8000 else (crc << 1) & 0xFFFF
    return crc


def crc16_modbus(data: bytes) -> int:
    crc = 0xFFFF
    for b in data:
        crc ^= b
        for _ in range(8):
            crc = (crc >> 1) ^ 0xA001 if crc & 1 else crc >> 1
    return crc


def checks(data: bytes) -> dict[str, str]:
    return {
        "CRC8 Dallas/Maxim": f"{crc8(data):02X}",
        "CRC16-CCITT (FFFF)": f"{crc16_ccitt(data):04X}",
        "CRC16-Modbus": f"{crc16_modbus(data):04X}",
        "CRC32": f"{zlib.crc32(data) & 0xFFFFFFFF:08X}",
        "SHA-256": hashlib.sha256(data).hexdigest(),
    }


def create(api) -> QWidget:
    w = QWidget()
    f = QFormLayout(w)
    is_hex = QCheckBox("I dati sono byte esadecimali")
    inp = QPlainTextEdit("123456789")
    inp.setMaximumHeight(90)
    outs = {k: QLabel() for k in checks(b"")}
    f.addRow(is_hex)
    f.addRow("Dati", inp)
    for k, lb in outs.items():
        f.addRow(k, lb)

    def update() -> None:
        t = inp.toPlainText()
        try:
            data = bytes.fromhex("".join(t.split())) if is_hex.isChecked() else t.encode("utf-8")
        except ValueError:
            for lb in outs.values():
                lb.setText("esadecimale non valido")
            return
        for k, v in checks(data).items():
            outs[k].setText(v)

    inp.textChanged.connect(update)
    is_hex.toggled.connect(update)
    update()
    return w
