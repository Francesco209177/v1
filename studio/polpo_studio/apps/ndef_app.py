"""Costruttore di messaggi NDEF: mostra i byte che verrebbero scritti su un tag e quanto spazio occupano."""

from __future__ import annotations

from PySide6.QtWidgets import QComboBox, QFormLayout, QLabel, QLineEdit, QWidget

from ..protocols import ndef

MANIFEST = {
    "id": "costruttore_ndef",
    "name": "Costruttore NDEF",
    "description": "Prepara un link o un testo NDEF e mostra i byte (con TLV) e lo spazio occupato su NTAG213/215/216.",
    "version": "1.0",
    "category": "nfc",
    "author": "Progetto Polpo",
    "icon": "nfc",
}

CAPACITY = {"NTAG213": 144, "NTAG215": 504, "NTAG216": 888}


def build(kind: str, value: str, lang: str = "it") -> bytes:
    msg = ndef.uri_message(value) if kind == "uri" else ndef.text_message(value, lang)
    return ndef.wrap_tlv(msg)


def create(api) -> QWidget:
    w = QWidget()
    f = QFormLayout(w)
    kind = QComboBox()
    kind.addItem("Link", "uri")
    kind.addItem("Testo", "text")
    val = QLineEdit("https://example.org")
    out = QLabel()
    out.setWordWrap(True)
    fits = QLabel()
    f.addRow("Tipo", kind)
    f.addRow("Contenuto", val)
    f.addRow("Byte", out)
    f.addRow("Spazio", fits)

    def update() -> None:
        tlv = build(kind.currentData(), val.text())
        out.setText(tlv.hex(" ").upper())
        fits.setText(" · ".join(f"{m}: {'entra' if len(tlv) <= c else 'troppo grande'}" for m, c in CAPACITY.items()) + f" ({len(tlv)} byte)")

    val.textChanged.connect(update)
    kind.currentIndexChanged.connect(update)
    update()
    return w
