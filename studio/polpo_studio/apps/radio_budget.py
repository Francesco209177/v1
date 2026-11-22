"""Stima del tempo di trasmissione di un codice rc-switch e di quante volte rientra nel limite orario."""

from __future__ import annotations

from PySide6.QtWidgets import QFormLayout, QLabel, QSpinBox, QWidget

from ..devices.virtual_polpo import RF_BUDGET_LIMIT_MS
from ..protocols.subghz import RcCode, rc_airtime_us

MANIFEST = {
    "id": "tempo_radio",
    "name": "Tempo radio a 433 MHz",
    "description": "Calcola quanto dura in aria un codice fisso e quante trasmissioni rientrano nel limite orario del Polpo (8%).",
    "version": "1.0",
    "category": "radio",
    "author": "Progetto Polpo",
    "icon": "radio",
}


def estimate(protocol: int, bits: int, pulse_us: int, repeats: int) -> tuple[float, int]:
    us = rc_airtime_us(RcCode(protocol, bits, 0, pulse_us), repeats)
    ms = us / 1000
    return ms, int(RF_BUDGET_LIMIT_MS // ms) if ms else 0


def create(api) -> QWidget:
    w = QWidget()
    f = QFormLayout(w)
    proto, bits, pulse, rep = QSpinBox(), QSpinBox(), QSpinBox(), QSpinBox()
    proto.setRange(1, 12)
    bits.setRange(1, 32)
    bits.setValue(24)
    pulse.setRange(50, 5000)
    pulse.setValue(350)
    pulse.setSuffix(" µs")
    rep.setRange(1, 20)
    rep.setValue(4)
    out = QLabel()
    for name, s in (("Protocollo rc-switch", proto), ("Bit", bits), ("Impulso", pulse), ("Ripetizioni", rep)):
        f.addRow(name, s)
        s.valueChanged.connect(lambda _v: update())
    f.addRow(out)

    def update() -> None:
        ms, n = estimate(proto.value(), bits.value(), pulse.value(), rep.value())
        out.setText(f"Un invio dura circa {ms:.1f} ms. Nel limite di {RF_BUDGET_LIMIT_MS / 1000:.0f} s all'ora ne rientrano circa {n}.")

    update()
    return w
