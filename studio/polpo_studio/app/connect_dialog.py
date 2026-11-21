"""Scelta della porta USB del Polpo."""

from __future__ import annotations

import sys

from PySide6.QtCore import Qt
from PySide6.QtWidgets import QDialog, QDialogButtonBox, QHBoxLayout, QListWidget, QListWidgetItem, QPushButton, QVBoxLayout

from ..core.i18n import tr
from ..devices.serial_ports import list_ports
from .widgets import label


class ConnectDialog(QDialog):
    def __init__(self, parent=None, last_port: str = "") -> None:
        super().__init__(parent)
        self.setWindowTitle(tr("Collega il Polpo via USB", "Connect the Polpo via USB"))
        self.setMinimumWidth(560)
        self.last_port = last_port
        lay = QVBoxLayout(self)
        lay.addWidget(label(tr("Collega il Polpo", "Connect the Polpo"), heading=2))
        steps = tr(
            "1. Accendi il Cardputer con il firmware Polpo.\n"
            "2. Collegalo con un cavo USB <i>dati</i> (alcuni cavi servono solo a ricaricare).\n"
            "3. Scegli la porta qui sotto e premi Collega.\n"
            "4. Sullo schermo del Polpo comparirà «Collegare al PC?»: premi Sì.",
            "1. Switch on the Cardputer running the Polpo firmware.\n"
            "2. Connect it with a USB <i>data</i> cable (some cables only charge).\n"
            "3. Pick the port below and press Connect.\n"
            "4. The Polpo screen will show “Connect to PC?”: press Yes.",
        )
        st = label(steps.replace("\n", "<br>"), wrap=True)
        st.setTextFormat(Qt.TextFormat.RichText)
        lay.addWidget(st)
        self.list = QListWidget()
        self.list.itemDoubleClicked.connect(lambda _i: self.accept())
        lay.addWidget(self.list, 1)
        self.hint = label("", muted=True, wrap=True)
        lay.addWidget(self.hint)
        row = QHBoxLayout()
        refresh = QPushButton(tr("Aggiorna l'elenco", "Refresh list"))
        refresh.clicked.connect(self.refresh)
        row.addWidget(refresh)
        row.addStretch(1)
        self.buttons = QDialogButtonBox(QDialogButtonBox.StandardButton.Ok | QDialogButtonBox.StandardButton.Cancel)
        self.buttons.button(QDialogButtonBox.StandardButton.Ok).setText(tr("Collega", "Connect"))
        self.buttons.button(QDialogButtonBox.StandardButton.Cancel).setText(tr("Annulla", "Cancel"))
        self.buttons.accepted.connect(self.accept)
        self.buttons.rejected.connect(self.reject)
        row.addWidget(self.buttons)
        lay.addLayout(row)
        self.refresh()

    def refresh(self) -> None:
        self.list.clear()
        ports = list_ports()
        for p in ports:
            extra = " · ".join(x for x in (p.chip, p.usb_id, p.manufacturer) if x)
            text = f"{p.device} — {p.description}" + (f"\n{extra}" if extra else "")
            if p.maybe_polpo:
                text += "\n" + tr("Scheda Espressif: potrebbe essere il Polpo", "Espressif board: may be the Polpo")
            it = QListWidgetItem(text)
            it.setData(Qt.ItemDataRole.UserRole, p.device)
            self.list.addItem(it)
            if p.device == self.last_port or (self.list.currentRow() < 0 and p.maybe_polpo):
                self.list.setCurrentItem(it)
        if ports and self.list.currentRow() < 0:
            self.list.setCurrentRow(0)
        ok = self.buttons.button(QDialogButtonBox.StandardButton.Ok)
        ok.setEnabled(bool(ports))
        if not ports:
            if sys.platform.startswith("linux"):
                extra = tr(" Su Linux controlla anche di essere nel gruppo «dialout».", " On Linux also check you are in the “dialout” group.")
            else:
                extra = ""
            self.hint.setText(
                tr(
                    "Nessuna porta seriale trovata. Controlla il cavo (deve essere un cavo dati) e che il Polpo sia acceso.",
                    "No serial port found. Check the cable (it must be a data cable) and that the Polpo is on.",
                )
                + extra
            )
        else:
            self.hint.setText(
                tr(
                    "Il Polpo si riconosce davvero solo quando risponde: se la porta è sbagliata, Polpo Studio te lo dirà.",
                    "The Polpo is only truly recognised when it answers: if the port is wrong, Polpo Studio will tell you.",
                )
            )

    def selected_port(self) -> str:
        it = self.list.currentItem()
        return it.data(Qt.ItemDataRole.UserRole) if it else ""
