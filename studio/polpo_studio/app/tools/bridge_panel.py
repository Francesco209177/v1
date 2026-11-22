"""Pannello di collegamento al Polpo Bridge, condiviso da GPIO e iButton."""

from __future__ import annotations

from PySide6.QtWidgets import QComboBox, QHBoxLayout, QPushButton, QVBoxLayout, QWidget

from ...core.i18n import tr
from ...devices.serial_ports import list_ports
from ..widgets import label


class BridgePanel(QWidget):
    def __init__(self, tool) -> None:
        super().__init__()
        self.tool = tool
        self.ctx = tool.ctx
        v = QVBoxLayout(self)
        v.setContentsMargins(0, 0, 0, 0)
        row = QHBoxLayout()
        self.port = QComboBox()
        row.addWidget(self.port, 1)
        for text, fn in ((tr("Aggiorna", "Refresh"), self.refresh_ports), (tr("Collega il Bridge", "Connect the Bridge"), self.connect), (tr("Scollega", "Disconnect"), self.disconnect)):
            b = QPushButton(text)
            b.clicked.connect(lambda _=False, f=fn: f())
            row.addWidget(b)
        v.addLayout(row)
        self.info = label("", muted=True, wrap=True)
        v.addWidget(self.info)
        tool.bridge.event.connect(lambda topic, _p: self.update_info() if topic == "bridge.state" else None)
        self.refresh_ports()
        self.update_info()

    def refresh_ports(self) -> None:
        self.port.clear()
        busy = getattr(getattr(self.ctx.devices.client, "transport", None), "port", None) if self.ctx.devices.client else None
        for p in list_ports():
            if p.device != busy:
                self.port.addItem(f"{p.device} {('· ' + p.chip) if p.chip else ''}", p.device)

    def update_info(self) -> None:
        info = self.ctx.bridge.info
        if info:
            self.info.setText(
                tr("Collegato: {b}, versione {v}. 1-Wire sul pin {o}. Pin utilizzabili: {p}", "Connected: {b}, version {v}. 1-Wire on pin {o}. Usable pins: {p}", b=info.get("board"), v=info.get("version"), o=info.get("onewire_pin"), p=", ".join(str(x) for x in info.get("pins", [])))
            )
        else:
            self.info.setText(
                tr(
                    "Polpo Bridge non collegato. Carica lo sketch studio/bridge/polpo_bridge su un Arduino Uno/Nano o un ESP32 e collegalo via USB.",
                    "Polpo Bridge not connected. Upload the studio/bridge/polpo_bridge sketch to an Arduino Uno/Nano or an ESP32 and plug it in via USB.",
                )
            )

    def connect(self, port: str | None = None, transport=None) -> None:
        port = port or self.port.currentData()
        if not port:
            self.tool.say(tr("Nessuna porta seriale.", "No serial port."), True)
            return
        self.tool.say(tr("Cerco il Polpo Bridge su {p}…", "Looking for the Polpo Bridge on {p}…", p=port))
        self.tool.bridge.watch(self.ctx.bridge.connect(port, transport), lambda _i: self.tool.say(tr("Polpo Bridge collegato.", "Polpo Bridge connected.")), self.tool.fail)

    def disconnect(self) -> None:
        self.tool.bridge.watch(self.ctx.bridge.disconnect(), lambda _r: self.tool.say(tr("Polpo Bridge scollegato.", "Polpo Bridge disconnected.")))


def bridge_req(tool, cmd: str, args: dict | None, ok, timeout: float = 5.0) -> bool:
    if not tool.ctx.bridge.connected:
        tool.say(tr("Collega prima il Polpo Bridge.", "Connect the Polpo Bridge first."), True)
        return False
    def err(e: BaseException) -> None:
        # Il Bridge non ha schermo: "denied" qui è un rifiuto dello sketch, si mostra il suo messaggio.
        text = tr("Polpo Bridge: {m}", "Polpo Bridge: {m}", m=str(e))
        tool.say(text, True)
        tool.ctx.activity.add(tool.category, text, "errore")

    tool.bridge.watch(tool.ctx.bridge.request(cmd, args, timeout), ok, err)
    return True
