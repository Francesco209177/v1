"""Base comune per gli strumenti dei moduli: richieste al Polpo, messaggi in linea, regole di invio."""

from __future__ import annotations

import time
from collections.abc import Callable
from typing import Any

from PySide6.QtWidgets import QHBoxLayout, QLabel, QPushButton, QVBoxLayout, QWidget

from ...core.i18n import tr
from ...devices.link_client import LinkError
from ...security.lab import PermissionDenied
from ...security.vault import Item
from ..context import AppContext
from ..qt_bridge import GuiBridge
from ..security_dialogs import confirm_sensitive  # noqa: F401  (i test lo sostituiscono qui)
from ..widgets import label

I2C_NAMES = {
    0x28: "M5 RFID2 (WS1850S)", 0x23: "BH1750 luce", 0x29: "VL53L0X distanza", 0x38: "AHT20 / ENV",
    0x3C: "Display OLED", 0x3D: "Display OLED", 0x40: "INA219 / HDC1080", 0x44: "SHT3x / SHT4x",
    0x45: "SHT3x / SHT4x", 0x48: "ADS1115 / TMP102", 0x50: "EEPROM / NFC ST25", 0x51: "RTC BM8563",
    0x57: "MAX30102", 0x5A: "MLX90614 / CCS811", 0x5C: "AM2320", 0x68: "MPU6050 / DS3231",
    0x69: "BMI270 / MPU6050", 0x70: "PCA9548 hub I2C", 0x76: "BME280 / BMP280", 0x77: "BME280 / BMP280",
}  # fmt: skip


class NotSendable(Exception):
    pass


def check_sendable(ctx: AppContext, item: Item) -> None:
    """I dati inventati dal Polpo virtuale non vanno mai al Polpo vero."""
    if item.simulated and ctx.devices.connected and not ctx.devices.simulated:
        raise NotSendable(
            tr(
                "«{n}» viene dal Polpo virtuale (SIMULATO): non si invia al Polpo vero.",
                "“{n}” comes from the virtual Polpo (SIMULATED): it is never sent to the real Polpo.",
                n=item.name,
            )
        )


def stamp() -> str:
    return time.strftime("%H:%M:%S")


class ToolBase(QWidget):
    """Uno strumento con una riga di stato in basso (niente finestre che bloccano)."""

    category = "polpo"

    def __init__(self, ctx: AppContext, bridge: GuiBridge) -> None:
        super().__init__()
        self.ctx, self.bridge = ctx, bridge
        self.root = QVBoxLayout(self)
        self.root.setContentsMargins(0, 0, 0, 0)
        self.status = label("", wrap=True, selectable=True)
        self._event_handlers: dict[str, list[Callable[[dict, bool], None]]] = {}
        bridge.event.connect(self._on_bus)

    def finish(self) -> None:
        """Da chiamare alla fine del costruttore: aggiunge la riga di stato."""
        self.root.addWidget(self.status)

    # ---------------- messaggi ----------------

    def say(self, text: str, error: bool = False) -> None:
        self.status.setProperty("error", "true" if error else "false")
        self.status.style().unpolish(self.status)
        self.status.style().polish(self.status)
        self.status.setText(f"{stamp()} · {text}")

    def fail(self, exc: BaseException) -> None:
        if isinstance(exc, LinkError) and exc.code == "denied":
            text = tr("Rifiutato sullo schermo del Polpo.", "Refused on the Polpo screen.")
        else:
            text = str(exc)
        self.say(text, error=True)
        self.ctx.activity.add(self.category, text, "errore", self.ctx.devices.simulated)

    # ---------------- Polpo ----------------

    @property
    def connected(self) -> bool:
        return self.ctx.devices.connected

    @property
    def simulated(self) -> bool:
        return self.ctx.devices.simulated

    def need_polpo(self) -> bool:
        if not self.connected:
            self.say(tr("Collega prima il Polpo (Home › Collega via USB, oppure il Polpo virtuale).", "Connect the Polpo first (Home › Connect via USB, or the virtual Polpo)."), True)
            return False
        return True

    def req(self, cmd: str, args: dict[str, Any] | None, ok: Callable[[dict], None], *, timeout: float | None = None, err: Callable[[BaseException], None] | None = None) -> bool:
        if not self.need_polpo():
            return False
        self.bridge.watch(self.ctx.devices.request(cmd, args, timeout), ok, err or self.fail)
        return True

    def job(self, fn: Callable, ok: Callable[[Any], None], err: Callable[[BaseException], None] | None = None) -> bool:
        if not self.need_polpo():
            return False
        self.bridge.watch(self.ctx.devices.run(fn), ok, err or self.fail)
        return True

    def on_polpo_event(self, ev: str, handler: Callable[[dict, bool], None]) -> None:
        self._event_handlers.setdefault(ev, []).append(handler)

    def _on_bus(self, topic: str, payload: dict) -> None:
        if topic == "polpo.event":
            for h in self._event_handlers.get(payload.get("ev", ""), []):
                h(payload.get("data") or {}, bool(payload.get("simulated")))
        elif topic in ("polpo.state", "polpo.info", "hardware.changed"):
            self.on_connection_changed()

    def on_connection_changed(self) -> None:
        """Da ridefinire: aggiorna i pulsanti quando il Polpo si collega o scollega."""

    # ---------------- permessi ----------------

    def require_lab(self, action: str) -> bool:
        try:
            self.ctx.lab.require(action)
            return True
        except PermissionDenied as e:
            self.say(str(e), True)
            return False

    def origin(self) -> str:
        return "simulato" if self.simulated else "reale"


def button_row(*buttons: tuple[str, Callable[[], None]]) -> tuple[QHBoxLayout, list[QPushButton]]:
    row = QHBoxLayout()
    out = []
    for text, fn in buttons:
        b = QPushButton(text)
        b.clicked.connect(lambda _=False, f=fn: f())
        row.addWidget(b)
        out.append(b)
    row.addStretch(1)
    return row, out


def sim_suffix(simulated: bool) -> str:
    return " · " + tr("SIMULATO", "SIMULATED") if simulated else ""


def kv(text_pairs: list[tuple[str, str]]) -> QLabel:
    html = "<table cellspacing='4'>" + "".join(f"<tr><td><b>{k}</b></td><td>{v}</td></tr>" for k, v in text_pairs) + "</table>"
    lb = label(html, wrap=True, selectable=True)
    return lb
