"""Modulo RFID 125 kHz: lettore USB "tipo tastiera" (cattura veloce con controllo dei tempi),
modulo RDM6300 seriale (controllo XOR), convertitore di formati, archivio e supporti di prova."""

from __future__ import annotations

import html
import json
import time
from pathlib import Path

from PySide6.QtCore import Qt
from PySide6.QtWidgets import (
    QCheckBox,
    QComboBox,
    QFileDialog,
    QHeaderView,
    QLineEdit,
    QTableWidget,
    QTableWidgetItem,
    QTabWidget,
    QVBoxLayout,
    QWidget,
)

from ...core.i18n import tr
from ...devices.serial_console import ConsoleError, SerialConsole
from ...devices.serial_ports import list_ports
from ...protocols import rfid125
from ...security.vault import VaultError
from ..widgets import label
from .common import ToolBase, button_row

ID_ROLE = Qt.ItemDataRole.UserRole


class WedgeField(QLineEdit):
    """Campo che misura i tempi tra i tasti: un lettore scrive in pochi millisecondi."""

    def __init__(self, on_burst) -> None:
        super().__init__()
        self.on_burst = on_burst
        self.chars: list[tuple[str, float]] = []
        self.setPlaceholderText(tr("Fai clic qui e avvicina la tessera al lettore USB…", "Click here and bring the card to the USB reader…"))

    def keyPressEvent(self, e) -> None:  # noqa: N802 (Qt)
        if e.key() in (Qt.Key.Key_Return, Qt.Key.Key_Enter):
            burst = rfid125.burst_from_times(self.chars)
            self.chars = []
            self.clear()
            self.on_burst(burst)
            return
        if e.text():
            self.chars.append((e.text(), time.monotonic()))
        super().keyPressEvent(e)


class RfidTools(ToolBase):
    category = "rfid"

    def __init__(self, ctx, bridge) -> None:
        super().__init__(ctx, bridge)
        self.last: rfid125.Em4100 | None = None
        self.last_source = ""
        self.console: SerialConsole | None = None
        self.parser = rfid125.Rdm6300Parser()
        self.tabs = QTabWidget()
        self.root.addWidget(self.tabs)
        self.tabs.addTab(self._wedge_tab(), tr("Lettore USB", "USB reader"))
        self.tabs.addTab(self._rdm_tab(), "RDM6300")
        self.tabs.addTab(self._convert_tab(), tr("Formati", "Formats"))
        self.tabs.addTab(self._archive_tab(), tr("Archivio", "Archive"))
        self.root.addWidget(label(tr("Scrittura su T5577 e copia di tessere: non disponibili (i lettori previsti non scrivono; la copia è esclusa per scelta).", "T5577 writing and card copying: not available (the supported readers cannot write; copying is excluded by design)."), muted=True, wrap=True))
        bridge.event.connect(lambda topic, _p: self.refresh_archive() if topic in ("vault.changed", "vault.unlocked") else None)
        self.finish()
        self.refresh_archive()

    # ---------------- risultato ----------------

    def show_card(self, card: rfid125.Em4100, source: str, fmt: str = "") -> None:
        self.last, self.last_source = card, source
        fc, cn = card.w26
        self.result.setText(
            f"<b>EM4100</b> · {html.escape(source)}" + (f" · {html.escape(fmt)}" if fmt else "")
            + "<table cellspacing='4'>"
            + f"<tr><td>{tr('Esadecimale (40 bit)', 'Hex (40 bit)')}</td><td><tt>{card.hex}</tt></td></tr>"
            + f"<tr><td>{tr('Decimale (32 bit)', 'Decimal (32 bit)')}</td><td><tt>{card.decimal10}</tt></td></tr>"
            + f"<tr><td>Wiegand 26</td><td><tt>{card.w26_text}</tt> ({tr('impianto', 'facility')} {fc}, {tr('numero', 'number')} {cn})</td></tr>"
            + f"<tr><td>{tr('Bit Wiegand', 'Wiegand bits')}</td><td><tt>{card.w26_bits}</tt></td></tr></table>"
        )

    # ---------------- lettore tipo tastiera ----------------

    def _wedge_tab(self) -> QWidget:
        w = QWidget()
        v = QVBoxLayout(w)
        v.addWidget(label(tr("I lettori USB economici «scrivono» il codice come una tastiera. Polpo Studio misura la velocità: un lettore scrive tutto in pochi millisecondi.", "Cheap USB readers “type” the code like a keyboard. Polpo Studio measures the speed: a reader types everything in a few milliseconds."), muted=True, wrap=True))
        self.wedge = WedgeField(self.on_burst)
        v.addWidget(self.wedge)
        self.result = label("", wrap=True, selectable=True)
        self.result.setTextFormat(Qt.TextFormat.RichText)
        v.addWidget(self.result)
        row, _ = button_row((tr("Salva nella cassaforte…", "Save in the vault…"), self.save_card))
        self.test_media = QCheckBox(tr("È un supporto di prova", "It is a test medium"))
        row.insertWidget(0, self.test_media)
        self.card_name = QLineEdit()
        self.card_name.setPlaceholderText(tr("Nome (es. «badge palestra mio»)", "Name (e.g. “my gym badge”)"))
        row.insertWidget(0, self.card_name)
        v.addLayout(row)
        v.addStretch(1)
        return w

    def on_burst(self, burst: rfid125.Burst) -> None:
        card, fmt = rfid125.parse_code(burst.text)
        if card is None:
            self.say(tr("«{t}» non è un codice 125 kHz riconosciuto.", "“{t}” is not a recognised 125 kHz code.", t=burst.text), True)
            return
        if burst.looks_like_reader:
            src = tr("lettore USB ({ms:.0f} ms)", "USB reader ({ms:.0f} ms)", ms=burst.duration_ms)
            self.say(tr("Tessera letta.", "Card read."))
            if not self.ctx.settings.get("declared_hardware").get("rfid125.usb"):
                self.say(tr("Tessera letta. Sembra un lettore USB: puoi dichiararlo in Impostazioni › Hardware.", "Card read. It looks like a USB reader: you can declare it in Settings › Hardware."))
        else:
            src = tr("digitato a mano?", "typed by hand?")
            self.say(tr("Codice accettato, ma è arrivato lentamente: sembra digitato a mano, non da un lettore.", "Code accepted, but it arrived slowly: it looks typed by hand, not by a reader."))
        self.show_card(card, src, fmt)

    def save_card(self) -> bool:
        if self.last is None:
            self.say(tr("Leggi prima una tessera.", "Read a card first."), True)
            return False
        name = self.card_name.text().strip() or f"tessera-{self.last.hex}"
        data = json.dumps(
            {"formato": "EM4100", "hex": self.last.hex, "decimale": self.last.decimal10, "w26": self.last.w26_text, "fonte": self.last_source, "supporto_di_prova": self.test_media.isChecked(), "letto_il": time.strftime("%Y-%m-%d %H:%M")},
            ensure_ascii=False,
            indent=2,
        ).encode()
        self.ctx.vault.put("rfid", name + ".json", data, meta={"hex": self.last.hex, "prova": self.test_media.isChecked()})
        self.ctx.bus.publish("vault.changed")
        self.ctx.activity.add("rfid", tr("Tessera 125 kHz salvata: {n}", "125 kHz card saved: {n}", n=name), "ok")
        self.say(tr("Salvata nella cassaforte.", "Saved in the vault."))
        return True

    # ---------------- RDM6300 ----------------

    def _rdm_tab(self) -> QWidget:
        w = QWidget()
        v = QVBoxLayout(w)
        v.addWidget(label(tr("Modulo RDM6300 collegato a un adattatore USB-seriale (TX del modulo → RX dell'adattatore, 5 V, 9600 baud).", "RDM6300 module wired to a USB-serial adapter (module TX → adapter RX, 5 V, 9600 baud)."), muted=True, wrap=True))
        self.rdm_port = QComboBox()
        row, _ = button_row((tr("Aggiorna", "Refresh"), self._rdm_ports), (tr("Apri", "Open"), self.rdm_open), (tr("Chiudi", "Close"), self.rdm_close))
        row.insertWidget(0, self.rdm_port, 1)
        v.addLayout(row)
        self.rdm_info = label("", muted=True)
        v.addWidget(self.rdm_info)
        v.addStretch(1)
        self._rdm_ports()
        return w

    def _rdm_ports(self) -> None:
        self.rdm_port.clear()
        for p in list_ports():
            self.rdm_port.addItem(f"{p.device} {('· ' + p.chip) if p.chip else ''}", p.device)

    def rdm_feed(self, data: bytes) -> None:
        for card in self.parser.feed(data):
            self.show_card(card, "RDM6300", tr("trama con controllo XOR valido", "frame with valid XOR check"))
            self.say(tr("Tessera letta dall'RDM6300.", "Card read by the RDM6300."))
        self.rdm_info.setText(tr("Trame scartate (controllo errato): {n}", "Frames discarded (bad check): {n}", n=self.parser.bad_frames))

    def rdm_open(self, port: str | None = None) -> None:
        port = port or self.rdm_port.currentData()
        if not port:
            self.say(tr("Nessuna porta seriale.", "No serial port."), True)
            return
        self.rdm_close()
        try:
            self.console = SerialConsole(port, 9600, lambda d: self.bridge.call_in_gui(lambda: self.rdm_feed(d)), lambda _r: self.bridge.call_in_gui(lambda: self.say(tr("RDM6300 scollegato.", "RDM6300 disconnected."), True)), reset_on_open=False)
            self.console.open()
        except ConsoleError as e:
            self.console = None
            self.say(str(e), True)
            return
        self.say(tr("In ascolto su {p} a 9600 baud.", "Listening on {p} at 9600 baud.", p=port))

    def rdm_close(self) -> None:
        if self.console is not None:
            self.console.close()
            self.console = None

    # ---------------- formati ----------------

    def _convert_tab(self) -> QWidget:
        w = QWidget()
        v = QVBoxLayout(w)
        v.addWidget(label(tr("Scrivi il codice stampato sulla TUA tessera: 10 cifre decimali, 10 esadecimali, oppure «impianto,numero».", "Type the code printed on YOUR card: 10 decimal digits, 10 hex digits, or “facility,number”."), muted=True, wrap=True))
        self.conv_in = QLineEdit()
        self.conv_in.returnPressed.connect(self.convert)
        v.addWidget(self.conv_in)
        row, _ = button_row((tr("Converti", "Convert"), self.convert))
        v.addLayout(row)
        v.addStretch(1)
        return w

    def convert(self) -> bool:
        card, fmt = rfid125.parse_code(self.conv_in.text())
        if card is None:
            self.say(tr("Formato non riconosciuto.", "Format not recognised."), True)
            return False
        self.show_card(card, tr("scritto a mano", "typed by hand"), fmt)
        self.tabs.setCurrentIndex(0)
        return True

    # ---------------- archivio ----------------

    def _archive_tab(self) -> QWidget:
        w = QWidget()
        v = QVBoxLayout(w)
        self.arch = QTableWidget(0, 4)
        self.arch.setHorizontalHeaderLabels([tr("Nome", "Name"), tr("Esadecimale", "Hex"), "W26", tr("Prova", "Test")])
        self.arch.verticalHeader().setVisible(False)
        self.arch.setEditTriggers(QTableWidget.EditTrigger.NoEditTriggers)
        self.arch.setSelectionBehavior(QTableWidget.SelectionBehavior.SelectRows)
        self.arch.horizontalHeader().setSectionResizeMode(0, QHeaderView.ResizeMode.Stretch)
        v.addWidget(self.arch)
        row, _ = button_row((tr("Report…", "Report…"), self.report))
        v.addLayout(row)
        return w

    def _items(self):
        try:
            return self.ctx.vault.items("rfid")
        except VaultError:
            return []

    def refresh_archive(self) -> None:
        items = self._items()
        self.arch.setRowCount(len(items))
        for r, it in enumerate(items):
            card, _ = rfid125.parse_code(it.meta.get("hex", ""))
            vals = [it.name, it.meta.get("hex", ""), card.w26_text if card else "", tr("sì", "yes") if it.meta.get("prova") else ""]
            for c, val in enumerate(vals):
                cell = QTableWidgetItem(val)
                cell.setData(ID_ROLE, it.id)
                self.arch.setItem(r, c, cell)

    def report(self, dest: str | None = None) -> bool:
        rows = []
        for it in self._items():
            card, _ = rfid125.parse_code(it.meta.get("hex", ""))
            if card:
                rows.append(f"<tr><td>{html.escape(it.name)}</td><td><tt>{card.hex}</tt></td><td><tt>{card.decimal10}</tt></td><td><tt>{card.w26_text}</tt></td><td>{'sì' if it.meta.get('prova') else ''}</td></tr>")
        doc = (
            "<!doctype html><meta charset='utf-8'><title>Report RFID 125 kHz</title><style>body{font-family:sans-serif;margin:2em}td,th{border-bottom:1px solid #ccc;padding:4px 8px}</style>"
            f"<h1>Tessere 125 kHz</h1><p>{time.strftime('%d/%m/%Y %H:%M')} · solo tessere proprie.</p><table><tr><th>Nome</th><th>Esadecimale</th><th>Decimale</th><th>W26</th><th>Prova</th></tr>{''.join(rows)}</table>"
        )
        if dest is None:
            dest, _ = QFileDialog.getSaveFileName(self, tr("Salva il report", "Save the report"), "report-rfid.html", "HTML (*.html)")
            if not dest:
                return False
        Path(dest).write_text(doc, encoding="utf-8")
        self.say(tr("Report salvato (non cifrato): {d}", "Report saved (not encrypted): {d}", d=dest))
        return True
