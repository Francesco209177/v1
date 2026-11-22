"""Modulo iButton (Sperimentale): ricerca ROM e presenza con il Polpo Bridge, famiglia e CRC8,
analisi di codici scritti a mano, archivio. Emulazione e scrittura: non disponibili."""

from __future__ import annotations

import json
import time

from PySide6.QtWidgets import QHeaderView, QLineEdit, QTableWidget, QTableWidgetItem

from ...core.i18n import tr
from ...protocols import onewire
from ..widgets import Card, label
from .bridge_panel import BridgePanel, bridge_req
from .common import ToolBase, button_row


class IButtonTools(ToolBase):
    category = "ibutton"

    def __init__(self, ctx, bridge) -> None:
        super().__init__(ctx, bridge)
        self.roms: list[onewire.Rom] = []
        c = Card(tr("Polpo Bridge", "Polpo Bridge"))
        self.panel = BridgePanel(self)
        c.body.addWidget(self.panel)
        c.body.addWidget(label(tr("Collega il lettore iButton al pin 1-Wire del Bridge con una resistenza da 4,7 kΩ verso 5 V (Arduino) o 3,3 V (ESP32), e la massa in comune.", "Wire the iButton reader to the Bridge 1-Wire pin with a 4.7 kΩ resistor to 5 V (Arduino) or 3.3 V (ESP32), and a common ground."), muted=True, wrap=True))
        self.root.addWidget(c)
        c = Card(tr("Chiavi sul bus", "Keys on the bus"))
        row, _ = button_row((tr("Cerca chiavi", "Search keys"), self.search), (tr("Controlla presenza", "Check presence"), self.presence), (tr("Salva la selezionata", "Save the selected"), self.save_selected))
        c.body.addLayout(row)
        self.table = QTableWidget(0, 4)
        self.table.setHorizontalHeaderLabels(["ROM", tr("Famiglia", "Family"), tr("Numero di serie", "Serial number"), "CRC8"])
        self.table.verticalHeader().setVisible(False)
        self.table.setEditTriggers(QTableWidget.EditTrigger.NoEditTriggers)
        self.table.setSelectionBehavior(QTableWidget.SelectionBehavior.SelectRows)
        self.table.horizontalHeader().setSectionResizeMode(1, QHeaderView.ResizeMode.Stretch)
        c.body.addWidget(self.table)
        self.root.addWidget(c)
        c = Card(tr("Analizza un codice", "Analyse a code"))
        self.manual = QLineEdit()
        self.manual.setPlaceholderText("01 A2 B3 C4 D5 E6 00 7F")
        self.manual.returnPressed.connect(self.analyse)
        c.body.addWidget(self.manual)
        row, _ = button_row((tr("Analizza", "Analyse"), self.analyse))
        c.body.addLayout(row)
        self.manual_out = label("", wrap=True, selectable=True)
        c.body.addWidget(self.manual_out)
        self.root.addWidget(c)
        self.root.addWidget(label(tr("Emulazione e scrittura di chiavi: non disponibili, per scelta.", "Key emulation and writing: not available, by design."), muted=True))
        self.finish()

    def show_roms(self, roms: list[onewire.Rom]) -> None:
        self.roms = roms
        self.table.setRowCount(len(roms))
        for r, rom in enumerate(roms):
            for c, val in enumerate([rom.text, f"0x{rom.family:02X} · {rom.family_name}", rom.serial, tr("valido", "valid") if rom.crc_ok else tr("ERRATO", "WRONG")]):
                self.table.setItem(r, c, QTableWidgetItem(val))

    def search(self) -> None:
        def ok(d: dict) -> None:
            roms = [r for r in (onewire.parse_rom(x.get("rom", "")) for x in d.get("roms", [])) if r]
            self.show_roms(roms)
            self.say(tr("{n} dispositivi 1-Wire trovati.", "{n} 1-Wire devices found.", n=len(roms)) if roms else tr("Nessuna chiave: appoggiala al lettore e riprova.", "No key: touch it to the reader and retry."))
            if roms:
                self.ctx.activity.add("ibutton", tr("Letta una chiave iButton", "Read an iButton key"), "ok")

        bridge_req(self, "ow.search", None, ok)

    def presence(self) -> None:
        bridge_req(self, "ow.reset", None, lambda d: self.say(tr("Presenza rilevata sul bus.", "Presence detected on the bus.") if d.get("presence") else tr("Nessun dispositivo sul bus.", "No device on the bus.")))

    def analyse(self) -> str:
        rom = onewire.parse_rom(self.manual.text())
        if rom is None:
            text = tr("Servono 16 cifre esadecimali (8 byte), famiglia per prima.", "16 hex digits (8 bytes) are needed, family first.")
        else:
            text = tr(
                "Famiglia 0x{f:02X}: {n}\nNumero di serie: {s}\nCRC8: {c}",
                "Family 0x{f:02X}: {n}\nSerial number: {s}\nCRC8: {c}",
                f=rom.family, n=rom.family_name, s=rom.serial, c=tr("valido", "valid") if rom.crc_ok else tr("errato (atteso {e:02X})", "wrong (expected {e:02X})", e=onewire.crc8(rom.raw[:7])),
            )
        self.manual_out.setText(text)
        return text

    def save_selected(self) -> bool:
        rows = self.table.selectionModel().selectedRows()
        if not rows:
            self.say(tr("Seleziona una chiave.", "Select a key."), True)
            return False
        rom = self.roms[rows[0].row()]
        data = json.dumps({"rom": rom.text, "famiglia": rom.family, "crc_ok": rom.crc_ok, "letto_il": time.strftime("%Y-%m-%d %H:%M")}, ensure_ascii=False, indent=2).encode()
        self.ctx.vault.put("ibutton", f"ibutton-{rom.serial}.json", data, meta={"rom": rom.text})
        self.ctx.bus.publish("vault.changed")
        self.say(tr("Chiave salvata nella cassaforte.", "Key saved in the vault."))
        return True
