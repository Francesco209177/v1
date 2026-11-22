"""Modulo NFC: lettura (Polpo + RFID2 oppure lettore PC/SC sperimentale), analisi di sicurezza,
analizzatore NDEF, scrittura NDEF su tag propri, archivio e report."""

from __future__ import annotations

import html
import json
import time
from pathlib import Path

from PySide6.QtCore import Qt
from PySide6.QtWidgets import (
    QComboBox,
    QFileDialog,
    QFormLayout,
    QHeaderView,
    QLineEdit,
    QPlainTextEdit,
    QTableWidget,
    QTableWidgetItem,
    QTabWidget,
    QTextBrowser,
    QVBoxLayout,
    QWidget,
)

from ...core.i18n import tr
from ...devices import pcsc
from ...protocols import ndef, type2
from ...security.vault import VaultError
from ..widgets import label
from . import common
from .common import ToolBase, button_row, sim_suffix

ID_ROLE = Qt.ItemDataRole.UserRole


def render(card: dict, simulated: bool) -> str:
    if not card.get("present", True):
        return "<p>" + tr("Nessun tag vicino al modulo RFID2.", "No tag near the RFID2 unit.") + "</p>"
    a = type2.analyze(card)
    rows = [
        ("UID", a.uid + ("" if a.uid_ok in (None, True) else " ⚠")),
        (tr("Famiglia", "Family"), a.family),
        (tr("Modello", "Model"), a.model or "—"),
        ("ATQA / SAK", f"0x{int(card.get('atqa', 0)):04X} / 0x{int(card.get('sak', 0)):02X}"),
    ]
    if card.get("atr"):
        rows.append(("ATR", card["atr"]))
    if card.get("version"):
        rows.append((tr("Versione", "Version"), card["version"]))
    if a.cc_version:
        rows += [
            (tr("Formattato NDEF", "NDEF formatted"), tr("sì", "yes") if a.ndef_formatted else tr("no", "no")),
            (tr("Spazio dati (CC)", "Data space (CC)"), f"{a.capacity} byte"),
            (tr("Scrivibile", "Writable"), tr("sì", "yes") if a.writable else tr("no", "no")),
            (tr("Blocchi statici", "Static locks"), tr("attivi", "set") if a.static_locked else tr("nessuno", "none")),
        ]
    out = "<table cellspacing='4'>" + "".join(f"<tr><td><b>{k}</b></td><td>{html.escape(str(v))}</td></tr>" for k, v in rows) + "</table>"
    if a.records:
        out += "<h3>NDEF</h3><ul>" + "".join(f"<li>{html.escape(r.kind)}: {html.escape(r.value or r.payload.hex())}</li>" for r in a.records) + "</ul>"
    if a.ndef_error:
        out += f"<p>NDEF: {html.escape(a.ndef_error)}</p>"
    if a.notes:
        out += "<h3>" + tr("Analisi", "Analysis") + "</h3><ul>" + "".join(f"<li>{html.escape(n)}</li>" for n in a.notes) + "</ul>"
    if simulated or card.get("simulated"):
        out += "<p><b>" + tr("SIMULATO: tag inventato dal Polpo virtuale.", "SIMULATED: tag made up by the virtual Polpo.") + "</b></p>"
    return out


class NfcTools(ToolBase):
    category = "nfc"

    def __init__(self, ctx, bridge) -> None:
        super().__init__(ctx, bridge)
        self.card: dict | None = None
        self.card_sim = False
        self.tabs = QTabWidget()
        self.root.addWidget(self.tabs)
        self.tabs.addTab(self._read_tab(), tr("Leggi", "Read"))
        self.tabs.addTab(self._write_tab(), tr("Scrivi NDEF", "Write NDEF"))
        self.tabs.addTab(self._ndef_tab(), tr("Analizzatore NDEF", "NDEF analyser"))
        self.tabs.addTab(self._archive_tab(), tr("Archivio", "Archive"))
        bridge.event.connect(lambda topic, _p: self.refresh_archive() if topic in ("vault.changed", "vault.unlocked") else None)
        self.finish()
        self.refresh_archive()

    # ---------------- lettura ----------------

    def _read_tab(self) -> QWidget:
        w = QWidget()
        v = QVBoxLayout(w)
        row, _ = button_row((tr("Leggi dal Polpo", "Read from the Polpo"), self.read_polpo), (tr("Salva nella cassaforte", "Save in the vault"), self.save_card))
        v.addLayout(row)
        ok, why = pcsc.available()
        self.reader = QComboBox()
        if ok:
            for r in pcsc.list_readers():
                self.reader.addItem(r)
        row, btns = button_row((tr("Leggi con il lettore PC/SC (sperimentale)", "Read with the PC/SC reader (experimental)"), self.read_pcsc))
        row.insertWidget(0, self.reader)
        btns[0].setEnabled(ok)
        self.reader.setVisible(ok)
        v.addLayout(row)
        if not ok:
            v.addWidget(label(tr("Lettore PC/SC: {w}.", "PC/SC reader: {w}.", w=why), muted=True))
        self.view = QTextBrowser()
        self.view.setHtml(tr("<p>Appoggia un tag sul modulo RFID2 e premi «Leggi dal Polpo».</p>", "<p>Place a tag on the RFID2 unit and press “Read from the Polpo”.</p>"))
        v.addWidget(self.view)
        return w

    def _show_card(self, card: dict, simulated: bool) -> None:
        self.card, self.card_sim = card, simulated or bool(card.get("simulated"))
        self.view.setHtml(render(card, self.card_sim))

    def read_polpo(self) -> None:
        def ok(d: dict) -> None:
            self._show_card(d, self.simulated)
            if d.get("present"):
                self.say(tr("Tag letto: {u}", "Tag read: {u}", u=d.get("uid")) + sim_suffix(self.card_sim))
                self.ctx.activity.add("nfc", tr("Letto un tag NFC ({m})", "Read an NFC tag ({m})", m=d.get("model") or d.get("family")), "ok", self.card_sim)
            else:
                self.say(tr("Nessun tag.", "No tag."))

        self.req("nfc.read", None, ok)

    def read_pcsc(self) -> None:
        name = self.reader.currentText()
        try:
            card = pcsc.read_from_reader(name)
        except (pcsc.PcscError, Exception) as e:  # noqa: BLE001 - il lettore può dare errori di ogni tipo
            self.say(tr("Lettore PC/SC: {e}", "PC/SC reader: {e}", e=e), True)
            return
        self._show_card(card, False)
        self.say(tr("Letto con {r} (sperimentale).", "Read with {r} (experimental).", r=name))

    def save_card(self, name: str | None = None) -> bool:
        if not self.card or not self.card.get("present"):
            self.say(tr("Leggi prima un tag.", "Read a tag first."), True)
            return False
        name = name or f"tag-{self.card.get('uid', 'x')}-{time.strftime('%Y%m%d-%H%M')}.json"
        data = json.dumps({**self.card, "letto_il": time.strftime("%Y-%m-%d %H:%M")}, ensure_ascii=False, indent=2).encode()
        self.ctx.vault.put("nfc", name, data, origin="simulato" if self.card_sim else "reale", meta={"uid": self.card.get("uid", ""), "model": self.card.get("model", "")})
        self.ctx.bus.publish("vault.changed")
        self.say(tr("Lettura salvata nella cassaforte.", "Read saved in the vault."))
        return True

    # ---------------- scrittura ----------------

    def _write_tab(self) -> QWidget:
        w = QWidget()
        v = QVBoxLayout(w)
        v.addWidget(label(tr("Scrive un link o un testo su un tag NTAG/Ultralight TUO. Serve la modalità laboratorio; il Polpo chiede conferma sul suo schermo e poi verifica la scrittura.", "Writes a link or text on YOUR NTAG/Ultralight tag. Needs lab mode; the Polpo asks for confirmation on its screen and then verifies the write."), muted=True, wrap=True))
        f = QFormLayout()
        self.kind = QComboBox()
        self.kind.addItem(tr("Link", "Link"), "uri")
        self.kind.addItem(tr("Testo", "Text"), "text")
        self.value = QLineEdit("https://")
        self.lang = QLineEdit("it")
        self.lang.setMaxLength(5)
        f.addRow(tr("Tipo", "Type"), self.kind)
        f.addRow(tr("Contenuto", "Content"), self.value)
        f.addRow(tr("Lingua (solo testo)", "Language (text only)"), self.lang)
        v.addLayout(f)
        self.size_info = label("", muted=True)
        v.addWidget(self.size_info)
        self.value.textChanged.connect(self._size)
        self.kind.currentIndexChanged.connect(self._size)
        row, _ = button_row((tr("Scrivi sul tag…", "Write the tag…"), self.write))
        v.addLayout(row)
        v.addStretch(1)
        self._size()
        return w

    def _message(self) -> bytes:
        return ndef.uri_message(self.value.text()) if self.kind.currentData() == "uri" else ndef.text_message(self.value.text(), self.lang.text() or "it")

    def _size(self) -> None:
        n = len(ndef.wrap_tlv(self._message()))
        self.size_info.setText(tr("Occupa {n} byte (NTAG213: 144, NTAG215: 504, NTAG216: 888).", "Takes {n} bytes (NTAG213: 144, NTAG215: 504, NTAG216: 888).", n=n))

    def write(self) -> None:
        value = self.value.text().strip()
        if not value or len(value.encode()) > 400:
            self.say(tr("Contenuto vuoto o oltre 400 byte.", "Content empty or over 400 bytes."), True)
            return
        if not self.need_polpo() or not self.require_lab("nfc.write"):
            return
        if not common.confirm_sensitive(self, tr("Scrivere il tag?", "Write the tag?"), tr("Contenuto: {v}\nDopo la conferma sullo schermo del Polpo, appoggia il tag sul modulo RFID2 entro 15 secondi.", "Content: {v}\nAfter confirming on the Polpo screen, place the tag on the RFID2 unit within 15 seconds.", v=value)):
            return
        args = {"kind": self.kind.currentData(), "value": value}
        if args["kind"] == "text":
            args["lang"] = self.lang.text() or "it"
        self.say(tr("Conferma sullo schermo del Polpo, poi appoggia il tag…", "Confirm on the Polpo screen, then place the tag…"))

        def ok(d: dict) -> None:
            self.say(tr("Scritto e verificato: {b} byte su {m} ({u}).", "Written and verified: {b} bytes on {m} ({u}).", b=d.get("bytes"), m=d.get("model"), u=d.get("uid")) + sim_suffix(self.simulated))
            self.ctx.activity.add("nfc", tr("Scritto un tag NFC ({u})", "Wrote an NFC tag ({u})", u=d.get("uid")), "avviso", self.simulated)

        self.req("nfc.write_ndef", args, ok, timeout=45.0)

    # ---------------- analizzatore NDEF ----------------

    def _ndef_tab(self) -> QWidget:
        w = QWidget()
        v = QVBoxLayout(w)
        v.addWidget(label(tr("Incolla i byte in esadecimale: un messaggio NDEF oppure la memoria dalla pagina 4 (con TLV).", "Paste the bytes in hex: an NDEF message or the memory from page 4 (with TLV)."), muted=True, wrap=True))
        self.ndef_in = QPlainTextEdit()
        self.ndef_in.setPlaceholderText("03 11 D1 01 0D 55 04 65 78 61 6D 70 6C 65 2E 6F 72 67 FE")
        v.addWidget(self.ndef_in)
        row, _ = button_row((tr("Analizza", "Analyse"), self.analyse_ndef))
        v.addLayout(row)
        self.ndef_out = QTextBrowser()
        v.addWidget(self.ndef_out)
        return w

    def analyse_ndef(self) -> str:
        try:
            raw = bytes.fromhex("".join(self.ndef_in.toPlainText().split()))
        except ValueError:
            self.ndef_out.setHtml(tr("Esadecimale non valido.", "Invalid hex."))
            return "error"
        msg = ndef.find_in_tlv(raw) if raw[:1] in (b"\x00", b"\x01", b"\x02", b"\x03", b"\xfd") else raw
        try:
            recs = ndef.parse(msg or b"")
        except ValueError as e:
            self.ndef_out.setHtml(html.escape(str(e)))
            return "error"
        out = "<ol>" + "".join(
            f"<li><b>{html.escape(r.kind)}</b> TNF {r.tnf} · tipo {html.escape(r.type.decode('ascii', 'replace'))} · {html.escape(r.value or r.payload.hex())}"
            + (f" · lingua {html.escape(r.lang)}" if r.lang else "")
            + "</li>"
            for r in recs
        ) + "</ol>"
        self.ndef_out.setHtml(out)
        return out

    # ---------------- archivio ----------------

    def _archive_tab(self) -> QWidget:
        w = QWidget()
        v = QVBoxLayout(w)
        self.arch = QTableWidget(0, 4)
        self.arch.setHorizontalHeaderLabels([tr("Nome", "Name"), "UID", tr("Modello", "Model"), tr("Origine", "Source")])
        self.arch.verticalHeader().setVisible(False)
        self.arch.setEditTriggers(QTableWidget.EditTrigger.NoEditTriggers)
        self.arch.setSelectionBehavior(QTableWidget.SelectionBehavior.SelectRows)
        self.arch.horizontalHeader().setSectionResizeMode(0, QHeaderView.ResizeMode.Stretch)
        v.addWidget(self.arch)
        row, _ = button_row((tr("Apri l'analisi", "Open the analysis"), self.open_saved), (tr("Report…", "Report…"), self.report))
        v.addLayout(row)
        return w

    def _items(self):
        try:
            return [i for i in self.ctx.vault.items("nfc") if i.name.endswith(".json")]
        except VaultError:
            return []

    def refresh_archive(self) -> None:
        items = self._items()
        self.arch.setRowCount(len(items))
        for r, it in enumerate(items):
            for c, val in enumerate([it.name, it.meta.get("uid", ""), it.meta.get("model", ""), tr("SIMULATO", "SIMULATED") if it.simulated else tr("reale", "real")]):
                cell = QTableWidgetItem(val)
                cell.setData(ID_ROLE, it.id)
                self.arch.setItem(r, c, cell)

    def open_saved(self) -> None:
        rows = self.arch.selectionModel().selectedRows()
        if not rows:
            self.say(tr("Seleziona una lettura salvata.", "Select a saved read."), True)
            return
        it = self.ctx.vault.item(self.arch.item(rows[0].row(), 0).data(ID_ROLE))
        self._show_card(json.loads(self.ctx.vault.get(it.id)), it.simulated)
        self.tabs.setCurrentIndex(0)

    def report(self, dest: str | None = None) -> bool:
        parts = []
        for it in self._items():
            card = json.loads(self.ctx.vault.get(it.id))
            parts.append(f"<h2>{html.escape(it.name)}</h2>" + render(card, it.simulated))
        doc = "<!doctype html><meta charset='utf-8'><title>Report NFC</title><style>body{font-family:sans-serif;margin:2em}</style><h1>Report NFC</h1>" + "".join(parts)
        if dest is None:
            dest, _ = QFileDialog.getSaveFileName(self, tr("Salva il report", "Save the report"), "report-nfc.html", "HTML (*.html)")
            if not dest:
                return False
        Path(dest).write_text(doc, encoding="utf-8")
        self.say(tr("Report salvato (non cifrato): {d}", "Report saved (not encrypted): {d}", d=dest))
        return True
