"""Convertitore di numeri e testo: decimale, esadecimale, binario, ASCII, Base64."""

from __future__ import annotations

import base64
import binascii

from PySide6.QtWidgets import QComboBox, QFormLayout, QLabel, QLineEdit, QWidget

MANIFEST = {
    "id": "convertitore",
    "name": "Convertitore",
    "description": "Converte numeri e byte tra decimale, esadecimale, binario, testo ASCII e Base64.",
    "version": "1.0",
    "category": "convertitori",
    "author": "Progetto Polpo",
    "icon": "apps",
}


def convert(text: str, kind: str) -> dict[str, str]:
    """Interpreta ``text`` come ``kind`` e restituisce tutte le rappresentazioni."""
    t = text.strip()
    if kind == "dec":
        data = int(t).to_bytes(max(1, (int(t).bit_length() + 7) // 8), "big")
    elif kind == "hex":
        h = "".join(t.split()).removeprefix("0x")
        data = bytes.fromhex(h if len(h) % 2 == 0 else "0" + h)
    elif kind == "bin":
        b = "".join(t.split()).removeprefix("0b")
        data = int(b, 2).to_bytes(max(1, (len(b) + 7) // 8), "big")
    elif kind == "b64":
        data = base64.b64decode(t, validate=True)
    else:
        data = t.encode("utf-8")
    value = int.from_bytes(data, "big")
    return {
        "dec": str(value),
        "hex": data.hex(" ").upper(),
        "bin": " ".join(f"{b:08b}" for b in data),
        "ascii": "".join(chr(b) if 32 <= b < 127 else "·" for b in data),
        "b64": base64.b64encode(data).decode(),
    }


def create(api) -> QWidget:
    w = QWidget()
    f = QFormLayout(w)
    kind = QComboBox()
    for k, name in (("hex", "Esadecimale"), ("dec", "Decimale"), ("bin", "Binario"), ("text", "Testo"), ("b64", "Base64")):
        kind.addItem(name, k)
    inp = QLineEdit("50 6F 6C 70 6F")
    outs = {k: QLabel() for k in ("dec", "hex", "bin", "ascii", "b64")}
    for lb in outs.values():
        lb.setTextInteractionFlags(lb.textInteractionFlags() | lb.textInteractionFlags().TextSelectableByMouse)
    f.addRow("Da", kind)
    f.addRow("Valore", inp)
    for k, name in (("dec", "Decimale"), ("hex", "Esadecimale"), ("bin", "Binario"), ("ascii", "ASCII"), ("b64", "Base64")):
        f.addRow(name, outs[k])

    def update() -> None:
        try:
            res = convert(inp.text(), kind.currentData())
        except (ValueError, binascii.Error):
            for lb in outs.values():
                lb.setText("—")
            return
        for k, lb in outs.items():
            lb.setText(res[k])

    inp.textChanged.connect(update)
    kind.currentIndexChanged.connect(update)
    update()
    w.convert = convert  # per i test
    return w
