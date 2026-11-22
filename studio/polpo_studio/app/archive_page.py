"""Strumenti del modulo Archivio: file della cassaforte per categoria, ricerca, import/export, verifica."""

from __future__ import annotations

import json
import time
from pathlib import Path

from PySide6.QtCore import Qt
from PySide6.QtWidgets import (
    QComboBox,
    QFileDialog,
    QHBoxLayout,
    QHeaderView,
    QInputDialog,
    QLineEdit,
    QMessageBox,
    QPushButton,
    QTableWidget,
    QTableWidgetItem,
    QVBoxLayout,
    QWidget,
)

from ..core.i18n import tr
from ..security.vault import CATEGORIES, VaultError
from .context import AppContext
from .qt_bridge import GuiBridge
from .widgets import Card, human_bytes, label

CATEGORY_NAMES = {
    "nfc": ("NFC", "NFC"),
    "rfid": ("RFID 125 kHz", "125 kHz RFID"),
    "radio": ("Radio", "Radio"),
    "ir": ("Infrarossi", "Infrared"),
    "ibutton": ("iButton", "iButton"),
    "diagnostica": ("Diagnostica", "Diagnostics"),
    "configurazioni": ("Configurazioni", "Settings"),
    "app": ("App", "Apps"),
    "backup": ("Backup", "Backups"),
    "altro": ("Altro", "Other"),
}
BY_EXTENSION = {".ir": "ir", ".sub": "radio", ".nfc": "nfc", ".rfid": "rfid", ".ibtn": "ibutton", ".json": "configurazioni", ".txt": "altro"}
MAX_IMPORT = 16 * 1024 * 1024


def category_name(c: str) -> str:
    return tr(*CATEGORY_NAMES.get(c, (c, c)))


class ArchiveTools(QWidget):
    def __init__(self, ctx: AppContext, bridge: GuiBridge) -> None:
        super().__init__()
        self.ctx = ctx
        card = Card(tr("I tuoi file", "Your files"))
        outer = QVBoxLayout(self)
        outer.setContentsMargins(0, 0, 0, 0)
        outer.addWidget(card)
        self.info = label("", muted=True)
        card.header.addWidget(self.info)
        row = QHBoxLayout()
        self.cat = QComboBox()
        self.cat.addItem(tr("Tutte le categorie", "All categories"), None)
        for c in CATEGORIES:
            self.cat.addItem(category_name(c), c)
        self.cat.currentIndexChanged.connect(self.refresh)
        self.search = QLineEdit()
        self.search.setPlaceholderText(tr("Cerca per nome o note…", "Search by name or notes…"))
        self.search.textChanged.connect(self.refresh)
        row.addWidget(self.cat)
        row.addWidget(self.search, 1)
        card.body.addLayout(row)
        self.table = QTableWidget(0, 6)
        self.table.setHorizontalHeaderLabels(
            [tr("Nome", "Name"), tr("Categoria", "Category"), tr("Origine", "Source"), tr("Dimensione", "Size"), tr("Modificato", "Modified"), "SHA-256"]
        )
        self.table.verticalHeader().setVisible(False)
        self.table.setEditTriggers(QTableWidget.EditTrigger.NoEditTriggers)
        self.table.setSelectionBehavior(QTableWidget.SelectionBehavior.SelectRows)
        self.table.setSelectionMode(QTableWidget.SelectionMode.SingleSelection)
        self.table.horizontalHeader().setSectionResizeMode(0, QHeaderView.ResizeMode.Stretch)
        self.table.setMinimumHeight(280)
        self.table.cellDoubleClicked.connect(lambda *_: self.details())
        card.body.addWidget(self.table)
        row = QHBoxLayout()
        for text, fn in (
            (tr("Importa…", "Import…"), self.import_files),
            (tr("Esporta…", "Export…"), self.export_file),
            (tr("Rinomina…", "Rename…"), self.rename),
            (tr("Note…", "Notes…"), self.edit_notes),
            (tr("Dettagli", "Details"), self.details),
            (tr("Elimina", "Delete"), self.delete),
        ):
            b = QPushButton(text)
            b.clicked.connect(lambda _=False, f=fn: f())
            row.addWidget(b)
        row.addStretch(1)
        card.body.addLayout(row)
        bridge.event.connect(lambda topic, _p: self.refresh() if topic in ("vault.changed", "vault.unlocked") else None)
        self.refresh()

    # ---------------- elenco ----------------

    def _items(self):
        try:
            return self.ctx.vault.items(self.cat.currentData(), self.search.text())
        except VaultError:
            return []

    def refresh(self) -> None:
        items = self._items()
        self.table.setRowCount(len(items))
        for r, it in enumerate(items):
            vals = [
                it.name,
                category_name(it.category),
                tr("SIMULATO", "SIMULATED") if it.simulated else tr("reale", "real"),
                human_bytes(it.size),
                time.strftime("%d/%m/%Y %H:%M", time.localtime(it.modified)),
                it.sha256[:16] + "…",
            ]
            for c, v in enumerate(vals):
                cell = QTableWidgetItem(v)
                cell.setData(Qt.ItemDataRole.UserRole, it.id)
                self.table.setItem(r, c, cell)
        if self.ctx.vault.unlocked:
            st = self.ctx.vault.stats()
            self.info.setText(tr("{n} file, {b}", "{n} files, {b}", n=st["count"], b=human_bytes(st["bytes"])))

    def selected_id(self) -> str | None:
        rows = self.table.selectionModel().selectedRows()
        if not rows:
            return None
        return self.table.item(rows[0].row(), 0).data(Qt.ItemDataRole.UserRole)

    def _need_selection(self) -> str | None:
        iid = self.selected_id()
        if iid is None:
            QMessageBox.information(self, "Polpo Studio", tr("Seleziona prima un file.", "Select a file first."))
        return iid

    # ---------------- azioni ----------------

    def import_files(self, paths: list[str] | None = None) -> int:
        if paths is None:
            paths, _ = QFileDialog.getOpenFileNames(self, tr("Importa nella cassaforte", "Import into the vault"))
        n = 0
        for p in paths:
            path = Path(p)
            try:
                if path.stat().st_size > MAX_IMPORT:
                    QMessageBox.warning(self, "Polpo Studio", tr("{f}: oltre 16 MB, saltato.", "{f}: over 16 MB, skipped.", f=path.name))
                    continue
                data = path.read_bytes()
            except OSError as e:
                QMessageBox.warning(self, "Polpo Studio", str(e))
                continue
            cat = self.cat.currentData() or BY_EXTENSION.get(path.suffix.lower(), "altro")
            self.ctx.vault.put(cat, path.name, data, meta={"importato_da": path.name, "importato_il": time.strftime("%Y-%m-%d %H:%M")})
            n += 1
        if n:
            self.ctx.activity.add("archivio", tr("Importati {n} file nella cassaforte", "Imported {n} files into the vault", n=n), "ok")
            self.refresh()
        return n

    def export_file(self, dest: str | None = None) -> bool:
        iid = self._need_selection()
        if iid is None:
            return False
        it = self.ctx.vault.item(iid)
        if dest is None:
            if (
                QMessageBox.question(
                    self,
                    "Polpo Studio",
                    tr(
                        "Il file esportato NON sarà cifrato: chiunque abbia accesso alla cartella potrà leggerlo. Continuare?",
                        "The exported file will NOT be encrypted: anyone with access to the folder can read it. Continue?",
                    ),
                )
                != QMessageBox.StandardButton.Yes
            ):
                return False
            dest, _ = QFileDialog.getSaveFileName(self, tr("Esporta", "Export"), it.name)
            if not dest:
                return False
        Path(dest).write_bytes(self.ctx.vault.get(iid))
        self.ctx.activity.add("archivio", tr("Esportato «{n}» (SHA-256 {h}…)", "Exported “{n}” (SHA-256 {h}…)", n=it.name, h=it.sha256[:12]), "avviso", it.simulated)
        return True

    def rename(self) -> None:
        iid = self._need_selection()
        if iid is None:
            return
        it = self.ctx.vault.item(iid)
        name, ok = QInputDialog.getText(self, tr("Rinomina", "Rename"), tr("Nuovo nome:", "New name:"), text=it.name)
        if ok and name.strip():
            self.ctx.vault.update(iid, name=name.strip())
            self.refresh()

    def edit_notes(self) -> None:
        iid = self._need_selection()
        if iid is None:
            return
        it = self.ctx.vault.item(iid)
        text, ok = QInputDialog.getMultiLineText(self, tr("Note", "Notes"), tr("Note su questo file:", "Notes on this file:"), it.meta.get("note", ""))
        if ok:
            meta = dict(it.meta)
            meta["note"] = text
            self.ctx.vault.update(iid, meta=meta)
            self.refresh()

    def details(self) -> None:
        iid = self._need_selection()
        if iid is None:
            return
        it = self.ctx.vault.item(iid)
        text = (
            f"<b>{it.name}</b><br>{category_name(it.category)} · "
            + (tr("SIMULATO (dal Polpo virtuale: non si invia al Polpo vero)", "SIMULATED (from the virtual Polpo: never sent to the real Polpo)") if it.simulated else tr("reale", "real"))
            + f"<br>{human_bytes(it.size)} · {tr('versione', 'version')} {it.version}<br>SHA-256: <tt>{it.sha256}</tt>"
            + f"<br>{tr('Creato', 'Created')}: {time.strftime('%d/%m/%Y %H:%M', time.localtime(it.created))}"
            + (f"<pre>{json.dumps(it.meta, ensure_ascii=False, indent=2)}</pre>" if it.meta else "")
        )
        QMessageBox.information(self, tr("Dettagli", "Details"), text)

    def delete(self, confirm: bool = True) -> bool:
        iid = self._need_selection()
        if iid is None:
            return False
        it = self.ctx.vault.item(iid)
        if confirm and (
            QMessageBox.question(self, "Polpo Studio", tr("Eliminare «{n}» dalla cassaforte?", "Delete “{n}” from the vault?", n=it.name))
            != QMessageBox.StandardButton.Yes
        ):
            return False
        self.ctx.vault.delete(iid)
        self.ctx.activity.add("archivio", tr("Eliminato «{n}»", "Deleted “{n}”", n=it.name), "avviso", it.simulated)
        self.refresh()
        return True
