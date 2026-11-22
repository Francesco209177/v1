"""Modulo Infrarossi: libreria per produttore e categoria, telecomandi personali (.ir nella cassaforte),
importazione, telecomando grafico, invio e apprendimento con il Polpo."""

from __future__ import annotations

from pathlib import Path

from PySide6.QtCore import Qt
from PySide6.QtWidgets import (
    QComboBox,
    QFileDialog,
    QGridLayout,
    QHBoxLayout,
    QInputDialog,
    QPushButton,
    QSplitter,
    QTreeWidget,
    QTreeWidgetItem,
    QVBoxLayout,
    QWidget,
)

from ...core.i18n import tr
from ...protocols import flipper_format as ff
from ...protocols import ir
from ...security.vault import VaultError
from ..widgets import Card, clear_layout, label
from .common import NotSendable, ToolBase, button_row, check_sendable, sim_suffix

SRC_ROLE = Qt.ItemDataRole.UserRole


class IrTools(ToolBase):
    category = "infrarossi"

    def __init__(self, ctx, bridge) -> None:
        super().__init__(ctx, bridge)
        self.current: tuple[str, str] | None = None  # ("lib", "tv|Samsung") oppure ("item", id)
        self.signals: list[ir.Signal] = []
        self.learning = False
        split = QSplitter()
        left = QWidget()
        lv = QVBoxLayout(left)
        lv.setContentsMargins(0, 0, 0, 0)
        self.tree = QTreeWidget()
        self.tree.setHeaderHidden(True)
        self.tree.itemClicked.connect(lambda it, _c: self.open_source(it.data(0, SRC_ROLE)))
        lv.addWidget(self.tree)
        row, _ = button_row((tr("Importa .ir…", "Import .ir…"), self.import_ir), (tr("Nuovo…", "New…"), self.new_remote))
        lv.addLayout(row)
        split.addWidget(left)
        right = QWidget()
        rv = QVBoxLayout(right)
        rv.setContentsMargins(0, 0, 0, 0)
        self.remote = Card(tr("Telecomando", "Remote"))
        self.remote_note = label("", muted=True, wrap=True)
        self.remote.body.addWidget(self.remote_note)
        self.grid = QGridLayout()
        self.remote.body.addLayout(self.grid)
        rv.addWidget(self.remote)
        row, self.edit_btns = button_row(
            (tr("Impara un tasto…", "Learn a button…"), self.learn),
            (tr("Ferma apprendimento", "Stop learning"), self.stop_learning),
            (tr("Copia nei miei telecomandi", "Copy to my remotes"), self.copy_to_mine),
        )
        rv.addLayout(row)
        row2 = QHBoxLayout()
        self.del_combo = QComboBox()
        row2.addWidget(self.del_combo, 1)
        b = QPushButton(tr("Elimina tasto", "Delete button"))
        b.clicked.connect(self.delete_signal)
        row2.addWidget(b)
        rv.addLayout(row2)
        rv.addStretch(1)
        split.addWidget(right)
        split.setSizes([260, 640])
        self.root.addWidget(split)
        self.on_polpo_event("ir.learned", self._on_learned)
        bridge.event.connect(lambda topic, _p: self.refresh_tree() if topic in ("vault.changed", "vault.unlocked") else None)
        self.finish()
        self.refresh_tree()
        self.show_remote()

    # ---------------- sorgenti ----------------

    def refresh_tree(self) -> None:
        self.tree.clear()
        lib = QTreeWidgetItem([tr("Libreria (codici pubblici)", "Library (public codes)")])
        self.tree.addTopLevelItem(lib)
        for cat, names in ir.CATEGORIES.items():
            c = QTreeWidgetItem([tr(*names)])
            lib.addChild(c)
            for brand in ir.brands(cat):
                b = QTreeWidgetItem([brand])
                b.setData(0, SRC_ROLE, ("lib", f"{cat}|{brand}"))
                c.addChild(b)
        mine = QTreeWidgetItem([tr("I miei telecomandi", "My remotes")])
        self.tree.addTopLevelItem(mine)
        try:
            items = self.ctx.vault.items("ir")
        except VaultError:
            items = []
        for it in items:
            x = QTreeWidgetItem([it.name + (" · " + tr("SIMULATO", "SIMULATED") if it.simulated else "")])
            x.setData(0, SRC_ROLE, ("item", it.id))
            mine.addChild(x)
        self.tree.expandAll()

    def open_source(self, src) -> None:
        if not src:
            return
        kind, key = src
        self.current = src
        if kind == "lib":
            cat, brand = key.split("|", 1)
            self.signals = [c.signal() for c in ir.codes(cat, brand)]
            for s, c in zip(self.signals, ir.codes(cat, brand)):
                s.name = tr(*ir.BUTTONS[c.button])
            self.remote.title.setText(f"{brand} · {tr(*ir.CATEGORIES[cat])}")
            self.remote_note.setText(tr("Codici pubblici molto diffusi: possono non funzionare con tutti i modelli.", "Widely published codes: they may not work with every model."))
        else:
            it = self.ctx.vault.item(key)
            try:
                f = ir.parse(self.ctx.vault.get(key).decode("utf-8", "replace"))
            except ff.FormatError as e:
                self.say(str(e), True)
                return
            self.signals = f.signals
            self.remote.title.setText(it.name)
            note = tr("Telecomando personale.", "Personal remote.")
            if f.warnings:
                note += " " + tr("Tasti saltati: ", "Skipped buttons: ") + "; ".join(f.warnings)
            if it.simulated:
                note += " " + tr("Creato col Polpo virtuale: non si invia al Polpo vero.", "Made with the virtual Polpo: never sent to the real Polpo.")
            self.remote_note.setText(note)
        self.show_remote()

    def show_remote(self) -> None:
        clear_layout(self.grid)
        self.del_combo.clear()
        if not self.signals:
            self.grid.addWidget(label(tr("Scegli un telecomando a sinistra.", "Pick a remote on the left."), muted=True), 0, 0)
            return
        for i, s in enumerate(self.signals):
            b = QPushButton(s.name)
            b.setMinimumHeight(44)
            b.setToolTip("RAW" if s.raw else f"{s.protocol} · {tr('indirizzo', 'address')} 0x{s.address:X} · {tr('comando', 'command')} 0x{s.command:X}")
            b.clicked.connect(lambda _=False, sig=s: self.send(sig))
            self.grid.addWidget(b, i // 3, i % 3)
            self.del_combo.addItem(s.name)
        mine = self.current is not None and self.current[0] == "item"
        self.del_combo.setEnabled(mine)

    # ---------------- invio ----------------

    def send(self, sig: ir.Signal) -> None:
        if self.current and self.current[0] == "item":
            try:
                check_sendable(self.ctx, self.ctx.vault.item(self.current[1]))
            except NotSendable as e:
                self.say(str(e), True)
                return
        why = sig.validate()
        if why:
            self.say(why, True)
            return

        def ok(_d) -> None:
            self.say(tr("Inviato «{n}».", "Sent “{n}”.", n=sig.name) + sim_suffix(self.simulated))
            self.ctx.activity.add("infrarossi", tr("Inviato IR «{n}»", "Sent IR “{n}”", n=sig.name), "ok", self.simulated)

        self.req("ir.send", sig.link_args(), ok)

    # ---------------- telecomandi personali ----------------

    def _save_mine(self, item_id: str) -> None:
        text = ir.serialize(ir.IrFile(signals=self.signals))
        self.ctx.vault.update(item_id, data=text.encode())
        self.ctx.bus.publish("vault.changed")

    def new_remote(self, name: str | None = None) -> str | None:
        if name is None:
            name, ok = QInputDialog.getText(self, tr("Nuovo telecomando", "New remote"), tr("Nome (es. «tv camera»):", "Name (e.g. “bedroom TV”):"))
            if not ok or not name.strip():
                return None
        fname = name.strip() if name.strip().endswith(".ir") else name.strip() + ".ir"
        it = self.ctx.vault.put("ir", fname, ir.serialize(ir.IrFile()).encode(), origin=self.origin() if self.connected else "reale")
        self.ctx.bus.publish("vault.changed")
        self.refresh_tree()
        self.open_source(("item", it.id))
        return it.id

    def copy_to_mine(self, name: str | None = None) -> str | None:
        if not self.signals:
            self.say(tr("Apri prima un telecomando.", "Open a remote first."), True)
            return None
        sigs = list(self.signals)
        new_id = self.new_remote(name or self.remote.title.text().replace(" · ", " "))
        if new_id:
            self.signals = sigs
            self._save_mine(new_id)
            self.show_remote()
        return new_id

    def import_ir(self, path: str | None = None) -> bool:
        if path is None:
            path, _ = QFileDialog.getOpenFileName(self, tr("Importa un file .ir", "Import an .ir file"), "", "Infrarossi (*.ir)")
            if not path:
                return False
        text = Path(path).read_text(encoding="utf-8", errors="replace")
        try:
            f = ir.parse(text)
        except ff.FormatError as e:
            self.say(str(e), True)
            return False
        self.ctx.vault.put("ir", Path(path).name, text.encode(), meta={"importato_da": Path(path).name})
        self.ctx.bus.publish("vault.changed")
        msg = tr("Importato: {n} tasti.", "Imported: {n} buttons.", n=len(f.signals))
        if f.warnings:
            msg += " " + tr("Saltati: ", "Skipped: ") + "; ".join(f.warnings)
        self.say(msg)
        self.refresh_tree()
        return True

    def delete_signal(self) -> None:
        if not (self.current and self.current[0] == "item") or self.del_combo.currentIndex() < 0:
            return
        del self.signals[self.del_combo.currentIndex()]
        self._save_mine(self.current[1])
        self.show_remote()

    # ---------------- apprendimento ----------------

    def learn(self) -> None:
        if not (self.current and self.current[0] == "item"):
            self.say(tr("Apri o crea prima un telecomando personale (Nuovo…).", "Open or create a personal remote first (New…)."), True)
            return

        def ok(_d) -> None:
            self.learning = True
            self.say(tr("Punta il telecomando verso l'IR Unit del Polpo e premi il tasto…", "Point the remote at the Polpo's IR Unit and press the button…") + sim_suffix(self.simulated))

        self.req("ir.learn.start", None, ok)

    def stop_learning(self) -> None:
        self.learning = False
        if self.connected:
            self.req("ir.learn.stop", None, lambda _d: None)

    def _on_learned(self, d: dict, simulated: bool) -> None:
        if not self.learning or not (self.current and self.current[0] == "item"):
            return
        n = len(self.signals) + 1
        if d.get("raw"):
            sig = ir.Signal(tr("tasto {n}", "button {n}", n=n), raw=True, timings=[int(x) for x in d.get("timings", [])])
        else:
            sig = ir.Signal(tr("tasto {n}", "button {n}", n=n), protocol=str(d.get("protocol")), address=int(d.get("address", 0)), command=int(d.get("command", 0)))
        why = sig.validate()
        if why:
            self.say(tr("Segnale ricevuto ma non valido: {w}", "Signal received but invalid: {w}", w=why), True)
            return
        item = self.ctx.vault.item(self.current[1])
        if (simulated or d.get("simulated")) and not item.simulated:
            self.ctx.vault.update(item.id, mark_simulated=True)  # un tasto inventato rende SIMULATO tutto il telecomando
        self.signals.append(sig)
        self._save_mine(self.current[1])
        self.show_remote()
        self.stop_learning()
        self.say(tr("Imparato «{n}» ({p}). Rinominalo dal file se vuoi.", "Learned “{n}” ({p}). Rename it in the file if you like.", n=sig.name, p="RAW" if sig.raw else sig.protocol) + sim_suffix(simulated))
        self.ctx.activity.add("infrarossi", tr("Imparato un tasto IR", "Learned an IR button"), "ok", simulated)
