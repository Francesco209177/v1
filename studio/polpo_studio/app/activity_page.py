"""Registro delle attività con filtro."""

from __future__ import annotations

import time

from PySide6.QtWidgets import QHBoxLayout, QHeaderView, QLineEdit, QTableWidget, QTableWidgetItem, QVBoxLayout, QWidget

from ..core.i18n import tr
from .context import AppContext
from .qt_bridge import GuiBridge
from .widgets import label

LEVEL_NAMES = {"info": ("Info", "Info"), "ok": ("Fatto", "Done"), "avviso": ("Avviso", "Warning"), "errore": ("Errore", "Error")}


class ActivityPage(QWidget):
    def __init__(self, ctx: AppContext, bridge: GuiBridge) -> None:
        super().__init__()
        self.ctx = ctx
        lay = QVBoxLayout(self)
        lay.setContentsMargins(24, 20, 24, 24)
        lay.addWidget(label(tr("Registro attività", "Activity log"), heading=1))
        lay.addWidget(
            label(
                tr(
                    "Tutto ciò che Polpo Studio ha fatto con il Polpo e con l'hardware. Le righe SIMULATO vengono dal Polpo virtuale.",
                    "Everything Polpo Studio did with the Polpo and the hardware. SIMULATED rows come from the virtual Polpo.",
                ),
                muted=True,
                wrap=True,
            )
        )
        row = QHBoxLayout()
        self.filter = QLineEdit()
        self.filter.setPlaceholderText(tr("Cerca nel registro…", "Search the log…"))
        self.filter.textChanged.connect(self.refresh)
        row.addWidget(self.filter)
        lay.addLayout(row)
        self.table = QTableWidget(0, 5)
        self.table.setHorizontalHeaderLabels([tr("Ora", "Time"), tr("Area", "Area"), tr("Messaggio", "Message"), tr("Livello", "Level"), tr("Origine", "Source")])
        self.table.verticalHeader().setVisible(False)
        self.table.setEditTriggers(QTableWidget.EditTrigger.NoEditTriggers)
        self.table.setAlternatingRowColors(True)
        self.table.horizontalHeader().setSectionResizeMode(2, QHeaderView.ResizeMode.Stretch)
        lay.addWidget(self.table, 1)
        bridge.event.connect(lambda topic, _p: self.refresh() if topic == "activity.added" else None)
        self.refresh()

    def refresh(self) -> None:
        q = self.filter.text().strip().lower()
        rows = [e for e in reversed(self.ctx.activity.entries()) if not q or q in e.message.lower() or q in e.category.lower()]
        self.table.setRowCount(len(rows))
        for r, e in enumerate(rows):
            vals = [
                time.strftime("%d/%m %H:%M:%S", time.localtime(e.ts)),
                e.category,
                e.message,
                tr(*LEVEL_NAMES.get(e.level, ("Info", "Info"))),
                tr("SIMULATO", "SIMULATED") if e.simulated else tr("reale", "real"),
            ]
            for c, v in enumerate(vals):
                self.table.setItem(r, c, QTableWidgetItem(v))
        self.table.resizeColumnToContents(0)
