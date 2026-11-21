"""Modulo App: catalogo con permessi, compatibilità e stato; app integrate; app di terze parti
(solo in modalità laboratorio, Sperimentali, non isolate)."""

from __future__ import annotations

from pathlib import Path

from PySide6.QtCore import Qt
from PySide6.QtWidgets import (
    QComboBox,
    QDialog,
    QFileDialog,
    QHeaderView,
    QLineEdit,
    QMessageBox,
    QTableWidget,
    QTableWidgetItem,
    QVBoxLayout,
)

from ... import apps as builtin_apps
from ...core.apps import APP_CATEGORIES, PERMISSIONS, AppApi, AppError, Manifest, ThirdPartyApps, parse_manifest
from ...core.capability import evaluate
from ...core.hardware import hardware_names
from ...core.i18n import tr
from ..widgets import Note, StatusBadge, label
from . import common
from .common import ToolBase, button_row

ID_ROLE = Qt.ItemDataRole.UserRole


class AppWindow(QDialog):
    def __init__(self, parent, m: Manifest, widget, third_party: bool) -> None:
        super().__init__(parent)
        self.setWindowTitle(m.name + (" · " + tr("app di terze parti", "third-party app") if third_party else ""))
        self.setMinimumSize(520, 360)
        v = QVBoxLayout(self)
        if third_party:
            v.addWidget(Note(tr("App di terze parti, Sperimentale e non isolata: gira con gli stessi permessi di Polpo Studio.", "Third-party app, Experimental and not sandboxed: it runs with the same permissions as Polpo Studio.")))
        v.addWidget(widget)


class AppsTools(ToolBase):
    category = "app"

    def __init__(self, ctx, bridge) -> None:
        super().__init__(ctx, bridge)
        self.third = ThirdPartyApps(ctx.data_dir / "app", ctx.settings)
        self.builtin = {m.MANIFEST["id"]: m for m in builtin_apps.BUILTIN}
        self.windows: list[AppWindow] = []
        row, _ = button_row()
        self.cat = QComboBox()
        self.cat.addItem(tr("Tutte le categorie", "All categories"), None)
        for c in APP_CATEGORIES:
            self.cat.addItem(c, c)
        self.cat.currentIndexChanged.connect(self.refresh)
        self.search = QLineEdit()
        self.search.setPlaceholderText(tr("Cerca un'app…", "Search an app…"))
        self.search.textChanged.connect(self.refresh)
        row.insertWidget(0, self.cat)
        row.insertWidget(1, self.search, 1)
        self.root.addLayout(row)
        self.table = QTableWidget(0, 7)
        self.table.setHorizontalHeaderLabels([tr("App", "App"), tr("Versione", "Version"), tr("Categoria", "Category"), tr("Autore", "Author"), tr("Permessi", "Permissions"), tr("Stato", "Status"), tr("Tipo", "Kind")])
        self.table.verticalHeader().setVisible(False)
        self.table.setEditTriggers(QTableWidget.EditTrigger.NoEditTriggers)
        self.table.setSelectionBehavior(QTableWidget.SelectionBehavior.SelectRows)
        self.table.horizontalHeader().setSectionResizeMode(0, QHeaderView.ResizeMode.Stretch)
        self.table.setMinimumHeight(260)
        self.table.cellDoubleClicked.connect(lambda *_: self.open_selected())
        self.root.addWidget(self.table)
        row, _ = button_row(
            (tr("Apri", "Open"), self.open_selected),
            (tr("Dettagli", "Details"), self.details),
            (tr("Installa da cartella…", "Install from folder…"), self.install),
            (tr("Disinstalla", "Uninstall"), self.uninstall),
        )
        self.root.addLayout(row)
        self.root.addWidget(
            label(
                tr(
                    "Le app di terze parti si installano e si aprono solo in modalità laboratorio. Non sono isolate: installa solo quelle di cui conosci l'autore.",
                    "Third-party apps can only be installed and opened in lab mode. They are not sandboxed: only install apps whose author you know.",
                ),
                muted=True,
                wrap=True,
            )
        )
        bridge.event.connect(lambda topic, _p: self.refresh() if topic in ("hardware.changed", "lab.changed") else None)
        self.finish()
        self.refresh()

    def manifests(self) -> list[Manifest]:
        out = [parse_manifest(m.MANIFEST, builtin=True) for m in builtin_apps.BUILTIN]
        return out + self.third.installed()

    def refresh(self) -> None:
        q = self.search.text().strip().lower()
        cat = self.cat.currentData()
        items = [m for m in self.manifests() if (cat is None or m.category == cat) and (not q or q in m.name.lower() or q in m.description.lower())]
        self.table.setRowCount(len(items))
        snap, names = self.ctx.hardware.snapshot(), hardware_names()
        for r, m in enumerate(items):
            ev = evaluate(m.capability(), snap, names)
            vals = [m.name, m.version, m.category, m.author, ", ".join(m.permissions) or "—", "", tr("integrata", "built-in") if m.builtin else tr("terze parti", "third-party")]
            for c, v in enumerate(vals):
                cell = QTableWidgetItem(v)
                cell.setData(ID_ROLE, m.id)
                if c == 0:
                    cell.setToolTip(m.description)
                self.table.setItem(r, c, cell)
            self.table.setCellWidget(r, 5, StatusBadge(ev.status))
        self._items = items

    def _selected(self) -> Manifest | None:
        rows = self.table.selectionModel().selectedRows()
        if not rows:
            self.say(tr("Seleziona un'app.", "Select an app."), True)
            return None
        return self._items[rows[0].row()]

    def open_selected(self) -> QDialog | None:
        m = self._selected()
        if m is None:
            return None
        api = AppApi(self.ctx, m, say=self.say)
        try:
            if m.builtin:
                widget = self.builtin[m.id].create(api)
            else:
                if not self.require_lab("apps.third_party"):
                    return None
                widget = self.third.load(m).create(api)
        except (AppError, Exception) as e:  # noqa: BLE001 - il codice di un'app può fallire in qualsiasi modo
            self.say(tr("Impossibile aprire «{n}»: {e}", "Cannot open “{n}”: {e}", n=m.name, e=e), True)
            return None
        win = AppWindow(self, m, widget, not m.builtin)
        win.show()
        self.windows.append(win)
        self.ctx.activity.add("app", tr("Aperta l'app «{n}»", "Opened the app “{n}”", n=m.name), "info")
        return win

    def details(self) -> None:
        m = self._selected()
        if m is None:
            return
        perms = "".join(f"<li>{p}: {PERMISSIONS[p]}</li>" for p in m.permissions) or "<li>" + tr("nessuno", "none") + "</li>"
        hw = " " + tr("oppure", "or") + " "
        need = hw.join(" + ".join(hardware_names().get(h, h) for h in alt) for alt in m.hardware) or tr("nessuno", "none")
        integrity = ""
        if not m.builtin:
            probs = self.third.verify(m.id)
            integrity = "<p>" + (tr("Integrità: file come all'installazione.", "Integrity: files as installed.") if not probs else tr("Integrità: ", "Integrity: ") + "; ".join(probs)) + "</p>"
        QMessageBox.information(self, m.name, f"<b>{m.name}</b> {m.version} · {m.author}<p>{m.description}</p><p>{tr('Permessi', 'Permissions')}:</p><ul>{perms}</ul><p>{tr('Hardware', 'Hardware')}: {need}</p>{integrity}")

    def install(self, folder: str | None = None) -> Manifest | None:
        if not self.require_lab("apps.third_party"):
            return None
        if folder is None:
            folder = QFileDialog.getExistingDirectory(self, tr("Cartella dell'app (con manifest.json e main.py)", "App folder (with manifest.json and main.py)"))
            if not folder:
                return None
        try:
            cand = self.third.read_candidate(Path(folder))
        except AppError as e:
            self.say(str(e), True)
            return None
        if any(m.id == cand.id for m in self.manifests() if m.builtin):
            self.say(tr("Esiste già un'app integrata con questo id.", "A built-in app with this id already exists."), True)
            return None
        perms = ", ".join(str(PERMISSIONS[p]) for p in cand.permissions) or tr("nessuno", "none")
        text = tr(
            "«{n}» {v} di {a}\nPermessi dichiarati: {p}\n\nL'app NON è isolata: il suo codice può fare tutto ciò che può fare Polpo Studio. Installala solo se ti fidi dell'autore.",
            "“{n}” {v} by {a}\nDeclared permissions: {p}\n\nThe app is NOT sandboxed: its code can do anything Polpo Studio can. Only install it if you trust the author.",
            n=cand.name, v=cand.version, a=cand.author, p=perms,
        )
        if not common.confirm_sensitive(self, tr("Installare l'app?", "Install the app?"), text, own_device=False):
            return None
        try:
            m = self.third.install(Path(folder))
        except (AppError, OSError) as e:
            self.say(str(e), True)
            return None
        self.ctx.activity.add("app", tr("Installata l'app di terze parti «{n}» {v}", "Installed third-party app “{n}” {v}", n=m.name, v=m.version), "avviso")
        self.say(tr("App installata.", "App installed."))
        self.refresh()
        return m

    def uninstall(self) -> None:
        m = self._selected()
        if m is None:
            return
        if m.builtin:
            self.say(tr("Le app integrate non si disinstallano.", "Built-in apps cannot be uninstalled."), True)
            return
        self.third.uninstall(m.id)
        self.ctx.activity.add("app", tr("Disinstallata l'app «{n}»", "Uninstalled the app “{n}”", n=m.name), "info")
        self.refresh()
