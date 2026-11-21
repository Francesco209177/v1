"""Modulo USB: periferiche, porte seriali (con controllo dei driver), HID, tester, DuckyScript."""

from __future__ import annotations

import re

from PySide6.QtCore import Qt
from PySide6.QtWidgets import (
    QComboBox,
    QFrame,
    QHeaderView,
    QLineEdit,
    QPlainTextEdit,
    QTableWidget,
    QTableWidgetItem,
    QTabWidget,
    QVBoxLayout,
    QWidget,
)

from ...core.i18n import tr
from ...devices import usb_list
from ...devices.serial_ports import list_ports
from ...protocols import ducky
from ..widgets import label
from .common import ToolBase, button_row, sim_suffix


def table(headers: list[str], stretch: int = 0) -> QTableWidget:
    t = QTableWidget(0, len(headers))
    t.setHorizontalHeaderLabels(headers)
    t.verticalHeader().setVisible(False)
    t.setEditTriggers(QTableWidget.EditTrigger.NoEditTriggers)
    t.setSelectionBehavior(QTableWidget.SelectionBehavior.SelectRows)
    t.horizontalHeader().setSectionResizeMode(stretch, QHeaderView.ResizeMode.Stretch)
    return t


def fill(t: QTableWidget, rows: list[list[str]]) -> None:
    t.setRowCount(len(rows))
    for r, row in enumerate(rows):
        for c, v in enumerate(row):
            t.setItem(r, c, QTableWidgetItem(v))


class InputTester(QFrame):
    """Mostra i tasti e i clic che il PC riceve: utile per provare tastiere, mouse e il Polpo come tastiera."""

    def __init__(self) -> None:
        super().__init__()
        self.setObjectName("capRow")
        self.setFocusPolicy(Qt.FocusPolicy.StrongFocus)
        self.setMinimumHeight(220)
        self.setMouseTracking(True)
        v = QVBoxLayout(self)
        v.addWidget(label(tr("Fai clic qui, poi premi tasti o usa il mouse.", "Click here, then press keys or use the mouse."), muted=True))
        self.last = label("", heading=2)
        self.log = QPlainTextEdit()
        self.log.setReadOnly(True)
        self.log.setFocusPolicy(Qt.FocusPolicy.NoFocus)
        self.pos = label("", muted=True)
        v.addWidget(self.last)
        v.addWidget(self.pos)
        v.addWidget(self.log)
        self.count = 0

    def _add(self, text: str) -> None:
        self.count += 1
        self.last.setText(text)
        self.log.appendPlainText(text)

    def keyPressEvent(self, e) -> None:  # noqa: N802 (Qt)
        mods = []
        m = e.modifiers()
        for flag, name in ((Qt.KeyboardModifier.ControlModifier, "Ctrl"), (Qt.KeyboardModifier.ShiftModifier, "Shift"), (Qt.KeyboardModifier.AltModifier, "Alt"), (Qt.KeyboardModifier.MetaModifier, "Meta")):
            if m & flag:
                mods.append(name)
        txt = e.text().replace("\r", "⏎").replace("\t", "⇥")
        self._add(tr("Tasto", "Key") + f": {'+'.join(mods + [txt or hex(e.key())])} · {tr('codice', 'code')} {e.nativeScanCode()}")

    def mousePressEvent(self, e) -> None:  # noqa: N802 (Qt)
        self.setFocus()
        names = {Qt.MouseButton.LeftButton: tr("sinistro", "left"), Qt.MouseButton.RightButton: tr("destro", "right"), Qt.MouseButton.MiddleButton: tr("centrale", "middle")}
        self._add(tr("Clic {b}", "{b} click", b=names.get(e.button(), str(e.button()))) + f" @ {int(e.position().x())},{int(e.position().y())}")

    def mouseMoveEvent(self, e) -> None:  # noqa: N802 (Qt)
        self.pos.setText(tr("Puntatore", "Pointer") + f": {int(e.position().x())}, {int(e.position().y())}")

    def wheelEvent(self, e) -> None:  # noqa: N802 (Qt)
        self._add(tr("Rotella", "Wheel") + f": {e.angleDelta().y()}")


class UsbTools(ToolBase):
    category = "usb"

    def __init__(self, ctx, bridge) -> None:
        super().__init__(ctx, bridge)
        self.tabs = QTabWidget()
        self.root.addWidget(self.tabs)
        self.tabs.addTab(self._devices_tab(), tr("Periferiche", "Devices"))
        self.tabs.addTab(self._serial_tab(), tr("Porte seriali", "Serial ports"))
        self.tabs.addTab(self._hid_tab(), "HID")
        self.tester = InputTester()
        self.tabs.addTab(self.tester, tr("Tester tastiera e mouse", "Keyboard and mouse tester"))
        self.tabs.addTab(self._ducky_tab(), "DuckyScript")
        self.finish()

    # ---------------- elenchi ----------------

    def _devices_tab(self) -> QWidget:
        w = QWidget()
        v = QVBoxLayout(w)
        row, _ = button_row((tr("Aggiorna", "Refresh"), self.refresh_devices))
        v.addLayout(row)
        self.dev_table = table([tr("Nome", "Name"), "VID:PID", tr("Produttore", "Vendor"), tr("Classe", "Class"), tr("Velocità", "Speed"), tr("Driver", "Driver"), tr("Posizione", "Location")])
        v.addWidget(self.dev_table)
        return w

    def refresh_devices(self) -> list[usb_list.UsbDevice]:
        devs = usb_list.list_usb()
        fill(self.dev_table, [[d.name, d.usb_id, d.vendor_name, d.class_name, d.speed, d.driver, d.location] for d in devs])
        self.say(tr("{n} periferiche USB.", "{n} USB devices.", n=len(devs)) if devs else tr("Nessuna periferica elencata (o elenco non disponibile su questo sistema).", "No devices listed (or listing unavailable on this system)."))
        return devs

    def _serial_tab(self) -> QWidget:
        w = QWidget()
        v = QVBoxLayout(w)
        row, _ = button_row((tr("Aggiorna", "Refresh"), self.refresh_serial))
        v.addLayout(row)
        self.ser_table = table([tr("Porta", "Port"), tr("Descrizione", "Description"), "VID:PID", tr("Chip", "Chip"), tr("Produttore", "Manufacturer")], 1)
        v.addWidget(self.ser_table)
        self.ser_note = label("", wrap=True)
        v.addWidget(self.ser_note)
        return w

    def refresh_serial(self) -> None:
        ports = list_ports()
        fill(self.ser_table, [[p.device, p.description, p.usb_id, p.chip, p.manufacturer] for p in ports])
        missing = usb_list.missing_serial_drivers(usb_list.list_usb(), {(p.vid, p.pid) for p in ports if p.vid is not None})
        if missing:
            self.ser_note.setText(
                tr("Possibile driver mancante per: ", "Possibly missing driver for: ")
                + ", ".join(f"{d.name} ({d.usb_id})" for d in missing)
                + tr(". Installa il driver del produttore del chip.", ". Install the chip vendor's driver.")
            )
        else:
            self.ser_note.setText(tr("Nessun problema di driver rilevato.", "No driver problems detected."))

    def _hid_tab(self) -> QWidget:
        w = QWidget()
        v = QVBoxLayout(w)
        v.addWidget(label(tr("Solo elenco: Polpo Studio non apre e non invia nulla ai dispositivi HID.", "List only: Polpo Studio never opens or sends anything to HID devices."), muted=True, wrap=True))
        row, _ = button_row((tr("Aggiorna", "Refresh"), self.refresh_hid))
        v.addLayout(row)
        self.hid_table = table([tr("Prodotto", "Product"), "VID:PID", tr("Produttore", "Manufacturer"), tr("Tipo", "Type"), tr("Interfaccia", "Interface")])
        v.addWidget(self.hid_table)
        return w

    def refresh_hid(self) -> None:
        rows = []
        for d in usb_list.list_hid():
            kind = usb_list.HID_USAGES.get((d.get("usage_page", 0), d.get("usage", 0)), f"0x{d.get('usage_page', 0):04X}/0x{d.get('usage', 0):04X}")
            rows.append([d.get("product_string") or "—", f"{d.get('vendor_id', 0):04X}:{d.get('product_id', 0):04X}", d.get("manufacturer_string") or "", kind, str(d.get("interface_number", ""))])
        fill(self.hid_table, rows)
        self.say(tr("{n} interfacce HID.", "{n} HID interfaces.", n=len(rows)))

    # ---------------- DuckyScript ----------------

    def _ducky_tab(self) -> QWidget:
        w = QWidget()
        v = QVBoxLayout(w)
        v.addWidget(
            label(
                tr(
                    "Scrivi e controlla uno script per la tastiera del Polpo. Polpo Studio NON lo esegue: lo copia sulla microSD e parte solo dal Polpo, "
                    "dopo la sua conferma. Usalo solo sui tuoi computer.",
                    "Write and check a script for the Polpo keyboard. Polpo Studio does NOT run it: it copies it to the microSD and it only starts from the Polpo, "
                    "after its confirmation. Only use it on your own computers.",
                ),
                muted=True,
                wrap=True,
            )
        )
        row, _ = button_row((tr("Controlla", "Check"), self.check_ducky), (tr("Salva nella cassaforte", "Save in the vault"), self.save_ducky), (tr("Copia sul Polpo…", "Copy to the Polpo…"), self.copy_ducky))
        self.layout_box = QComboBox()
        self.layout_box.addItems(["IT", "US"])
        row.insertWidget(0, self.layout_box)
        self.ducky_name = QLineEdit("mio_script")
        self.ducky_name.setMaximumWidth(220)
        row.insertWidget(1, self.ducky_name)
        v.addLayout(row)
        self.ducky = QPlainTextEdit()
        self.ducky.setPlainText("REM Apre il Blocco note e scrive un saluto (Windows)\nDELAY 500\nGUI r\nDELAY 300\nSTRING notepad\nENTER\nDELAY 700\nSTRINGLN Ciao dal Polpo!\n")
        v.addWidget(self.ducky)
        self.ducky_out = label("", wrap=True, selectable=True)
        v.addWidget(self.ducky_out)
        return w

    def check_ducky(self) -> ducky.Script:
        s = ducky.parse(self.ducky.toPlainText(), self.layout_box.currentText())
        if s.ok:
            self.ducky_out.setText(
                tr(
                    "Valido: {a} azioni, {c} caratteri, pause totali {d:.1f} s, durata stimata {t:.1f} s (layout {l}).",
                    "Valid: {a} actions, {c} characters, total pauses {d:.1f} s, estimated time {t:.1f} s (layout {l}).",
                    a=len(s.actions), c=s.total_chars, d=s.total_delay_ms / 1000, t=ducky.estimate_seconds(s), l=self.layout_box.currentText(),
                )
            )
        else:
            self.ducky_out.setText("\n".join(tr("Riga {n}: {m}", "Line {n}: {m}", n=n, m=m) for n, m in s.errors))
        return s

    def _ducky_filename(self) -> str | None:
        name = re.sub(r"[^A-Za-z0-9_-]", "_", self.ducky_name.text().strip())[:40]
        if not name:
            self.say(tr("Scrivi un nome per lo script.", "Type a name for the script."), True)
            return None
        return name + ".txt"

    def save_ducky(self) -> bool:
        name = self._ducky_filename()
        if not name or not self.check_ducky().ok:
            return False
        self.ctx.vault.put("altro", name, self.ducky.toPlainText().encode(), meta={"tipo": "duckyscript", "layout": self.layout_box.currentText()})
        self.ctx.bus.publish("vault.changed")
        self.say(tr("Script salvato nella cassaforte.", "Script saved in the vault."))
        return True

    def copy_ducky(self) -> None:
        name = self._ducky_filename()
        if not name:
            return
        if not self.check_ducky().ok:
            self.say(tr("Correggi prima gli errori.", "Fix the errors first."), True)
            return
        target = f"/polpo/badusb/{name}"
        data = self.ducky.toPlainText().encode()
        self.say(tr("Conferma sullo schermo del Polpo per salvare lo script…", "Confirm on the Polpo screen to save the script…"))

        def ok(_r) -> None:
            self.say(tr("Copiato in {t}. Per eseguirlo usa l'app BadUSB sul Polpo.", "Copied to {t}. To run it use the BadUSB app on the Polpo.", t=target) + sim_suffix(self.simulated))
            self.ctx.activity.add("usb", tr("Script copiato sul Polpo: {t}", "Script copied to the Polpo: {t}", t=target), "avviso", self.simulated)

        self.job(lambda c: c.write_file(target, data), ok)
