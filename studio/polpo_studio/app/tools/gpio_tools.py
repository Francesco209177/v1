"""Modulo GPIO ed elettronica: porta Grove del Polpo, console seriale, schede, programmazione ESP32
(esptool), calcolatori. Avvisi su 3,3/5 V e conferme prima di flash e uscite."""

from __future__ import annotations

import time
from pathlib import Path

from PySide6.QtCore import QProcess
from PySide6.QtWidgets import (
    QCheckBox,
    QComboBox,
    QDoubleSpinBox,
    QFileDialog,
    QFormLayout,
    QGroupBox,
    QHBoxLayout,
    QLineEdit,
    QPlainTextEdit,
    QTableWidget,
    QTabWidget,
    QVBoxLayout,
    QWidget,
)

from ...core.i18n import T, tr
from ...devices.serial_console import BAUD_RATES, LINE_ENDINGS, ConsoleError, SerialConsole, hexdump
from ...devices.serial_ports import list_ports
from ...protocols import electronics as el
from ..widgets import Note, label
from . import common
from .common import I2C_NAMES, ToolBase, button_row, sim_suffix
from .bridge_panel import BridgePanel, bridge_req
from .usb_tools import fill, table

VOLTAGE_NOTE = T(
    "Attenzione alle tensioni: i pin dell'ESP32 (Polpo e molte schede) lavorano a 3,3 V e NON tollerano 5 V. "
    "Arduino Uno/Nano lavorano a 5 V: per collegarli a una scheda a 3,3 V serve un adattatore di livello.",
    "Mind the voltages: ESP32 pins (Polpo and many boards) work at 3.3 V and are NOT 5 V tolerant. "
    "Arduino Uno/Nano work at 5 V: connecting them to a 3.3 V board needs a level shifter.",
)


class GpioTools(ToolBase):
    category = "gpio"

    def __init__(self, ctx, bridge) -> None:
        super().__init__(ctx, bridge)
        self.console: SerialConsole | None = None
        self.tabs = QTabWidget()
        self.root.addWidget(Note(str(VOLTAGE_NOTE)))
        self.root.addWidget(self.tabs)
        self.tabs.addTab(self._grove_tab(), tr("Porta Grove", "Grove port"))
        self.tabs.addTab(self._console_tab(), tr("Console seriale", "Serial console"))
        self.tabs.addTab(self._boards_tab(), tr("Schede collegate", "Connected boards"))
        self.tabs.addTab(self._flash_tab(), tr("Programma ESP32", "Flash ESP32"))
        self.tabs.addTab(self._calc_tab(), tr("Calcolatori", "Calculators"))
        self.tabs.addTab(self._bridge_tab(), tr("Polpo Bridge (sperimentale)", "Polpo Bridge (experimental)"))
        self.finish()

    # ---------------- Grove ----------------

    def _grove_tab(self) -> QWidget:
        w = QWidget()
        v = QVBoxLayout(w)
        v.addWidget(label(tr("G1 = filo bianco (SCL), G2 = filo giallo (SDA). Alimentazione Grove 5 V, segnali 3,3 V.", "G1 = white wire (SCL), G2 = yellow wire (SDA). Grove power 5 V, signals 3.3 V."), muted=True, wrap=True))
        row, _ = button_row((tr("Leggi i pin", "Read pins"), self.read_pins), (tr("Cerca dispositivi I2C", "Scan I2C devices"), self.i2c_scan))
        v.addLayout(row)
        self.grove_out = QPlainTextEdit()
        self.grove_out.setReadOnly(True)
        v.addWidget(self.grove_out)
        return w

    def read_pins(self) -> None:
        self.req("gpio.pins", None, lambda d: self.grove_out.appendPlainText(f"{common.stamp()}  G1={d.get('g1')}  G2={d.get('g2')}" + sim_suffix(self.simulated)))

    def i2c_scan(self) -> None:
        def ok(d: dict) -> None:
            devs = d.get("devices", [])
            lines = [f"{common.stamp()}  " + tr("{n} dispositivi I2C", "{n} I2C devices", n=len(devs)) + sim_suffix(self.simulated)]
            lines += [f"   0x{x['addr']:02X}  {x.get('name') or I2C_NAMES.get(x['addr'], '?')}" for x in devs]
            self.grove_out.appendPlainText("\n".join(lines))

        self.req("gpio.i2c_scan", None, ok)

    # ---------------- console ----------------

    def _console_tab(self) -> QWidget:
        w = QWidget()
        v = QVBoxLayout(w)
        row = QHBoxLayout()
        self.port = QComboBox()
        self.baud = QComboBox()
        for b in BAUD_RATES:
            self.baud.addItem(str(b), b)
        self.baud.setCurrentText("115200")
        self.ending = QComboBox()
        for k in LINE_ENDINGS:
            self.ending.addItem(k or tr("nessuno", "none"), k)
        self.ending.setCurrentIndex(1)
        self.hex = QCheckBox(tr("Esadecimale", "Hex"))
        self.reset = QCheckBox(tr("Riavvia la scheda all'apertura", "Reset board on open"))
        self.reset.setChecked(True)
        for x in (self.port, self.baud, self.ending, self.hex, self.reset):
            row.addWidget(x)
        v.addLayout(row)
        row, self.console_btns = button_row((tr("Aggiorna porte", "Refresh ports"), self.refresh_ports), (tr("Apri", "Open"), self.open_console), (tr("Chiudi", "Close"), self.close_console), (tr("Salva registro", "Save log"), self.save_log))
        v.addLayout(row)
        self.term = QPlainTextEdit()
        self.term.setReadOnly(True)
        self.term.setMaximumBlockCount(5000)
        v.addWidget(self.term)
        row = QHBoxLayout()
        self.send_line = QLineEdit()
        self.send_line.setPlaceholderText(tr("Testo da inviare…", "Text to send…"))
        self.send_line.returnPressed.connect(self.send)
        row.addWidget(self.send_line)
        v.addLayout(row)
        self.refresh_ports()
        return w

    def refresh_ports(self) -> None:
        self.port.clear()
        polpo_port = getattr(getattr(self.ctx.devices.client, "transport", None), "port", None) if self.ctx.devices.client else None
        for p in list_ports():
            if p.device == polpo_port:
                continue  # la porta del Polpo è occupata da Polpo Link
            self.port.addItem(f"{p.device} {('· ' + p.chip) if p.chip else ''}", p.device)

    def _append(self, data: bytes) -> None:
        text = hexdump(data) + " " if self.hex.isChecked() else data.decode("utf-8", "replace")
        self.term.insertPlainText(text)
        self.term.ensureCursorVisible()

    def open_console(self) -> None:
        dev = self.port.currentData()
        if not dev:
            self.say(tr("Nessuna porta seriale disponibile.", "No serial port available."), True)
            return
        self.close_console()
        try:
            self.console = SerialConsole(
                dev,
                int(self.baud.currentData()),
                lambda data: self.bridge.call_in_gui(lambda: self._append(data)),
                lambda _r: self.bridge.call_in_gui(lambda: self.say(tr("Porta scollegata.", "Port disconnected."), True)),
                reset_on_open=self.reset.isChecked(),
            )
            self.console.open()
        except ConsoleError as e:
            self.console = None
            self.say(str(e), True)
            return
        self.say(tr("Console aperta su {p} a {b} baud.", "Console open on {p} at {b} baud.", p=dev, b=self.baud.currentData()))

    def close_console(self) -> None:
        if self.console is not None:
            self.console.close()
            self.console = None
            self.say(tr("Console chiusa.", "Console closed."))

    def send(self) -> None:
        if self.console is None:
            self.say(tr("Apri prima la console.", "Open the console first."), True)
            return
        self.console.write((self.send_line.text() + LINE_ENDINGS[self.ending.currentData()]).encode())
        self.send_line.clear()

    def save_log(self) -> None:
        text = self.term.toPlainText()
        if not text:
            return
        self.ctx.vault.put("diagnostica", time.strftime("console-%Y%m%d-%H%M.txt"), text.encode())
        self.ctx.bus.publish("vault.changed")
        self.say(tr("Registro salvato nella cassaforte.", "Log saved in the vault."))

    # ---------------- schede ----------------

    def _boards_tab(self) -> QWidget:
        w = QWidget()
        v = QVBoxLayout(w)
        row, _ = button_row((tr("Aggiorna", "Refresh"), self.refresh_boards))
        v.addLayout(row)
        self.boards = table([tr("Porta", "Port"), tr("Chip riconosciuto", "Recognised chip"), "VID:PID", tr("Descrizione", "Description"), tr("Note", "Notes")], 4)
        v.addWidget(self.boards)
        self.refresh_boards()
        return w

    def refresh_boards(self) -> None:
        rows = []
        for p in list_ports():
            hint = ""
            if p.vid == 0x303A:
                hint = tr("ESP32 con USB nativa: il Polpo o un'altra scheda Espressif", "ESP32 with native USB: the Polpo or another Espressif board")
            elif p.vid in (0x1A86, 0x10C4, 0x0403, 0x067B):
                hint = tr("adattatore USB-seriale (tipico di ESP32 DevKit, Arduino Nano compatibili)", "USB-serial adapter (typical of ESP32 DevKit, Arduino Nano clones)")
            elif p.vid in (0x2341, 0x2A03):
                hint = tr("Arduino originale (5 V per Uno/Mega)", "Genuine Arduino (5 V for Uno/Mega)")
            rows.append([p.device, p.chip or "—", p.usb_id, p.description, hint])
        fill(self.boards, rows)

    # ---------------- esptool ----------------

    def _flash_tab(self) -> QWidget:
        w = QWidget()
        v = QVBoxLayout(w)
        v.addWidget(label(tr("Per schede ESP32 TUE. Scrivere un firmware sostituisce quello presente. Serve la modalità laboratorio.", "For YOUR ESP32 boards. Writing firmware replaces the current one. Needs lab mode."), muted=True, wrap=True))
        f = QFormLayout()
        self.f_port = QComboBox()
        self.f_file = QLineEdit()
        self.f_offset = QLineEdit("0x0")
        pick = QHBoxLayout()
        pick.addWidget(self.f_file)
        row, _ = button_row((tr("Scegli…", "Choose…"), self._pick_bin))
        pick.addLayout(row)
        f.addRow(tr("Porta", "Port"), self.f_port)
        f.addRow(tr("File .bin", ".bin file"), pick)
        f.addRow(tr("Indirizzo", "Address"), self.f_offset)
        v.addLayout(f)
        row, _ = button_row((tr("Aggiorna porte", "Refresh ports"), self._flash_ports), (tr("Leggi il chip", "Read chip info"), self.chip_info), (tr("Scrivi il firmware…", "Write firmware…"), self.write_flash))
        v.addLayout(row)
        self.f_log = QPlainTextEdit()
        self.f_log.setReadOnly(True)
        v.addWidget(self.f_log)
        self._proc: QProcess | None = None
        self._flash_ports()
        return w

    def _flash_ports(self) -> None:
        self.f_port.clear()
        for p in list_ports():
            self.f_port.addItem(f"{p.device} {('· ' + p.chip) if p.chip else ''}", p.device)

    def _pick_bin(self) -> None:
        path, _ = QFileDialog.getOpenFileName(self, tr("Firmware", "Firmware"), "", "Firmware (*.bin)")
        if path:
            self.f_file.setText(path)

    def esptool_args(self, action: str) -> list[str]:
        """Riga di comando completa di esptool (programma incluso)."""
        from ...devices.esptool_runner import esptool_argv

        port = self.f_port.currentData() or ""
        if action == "info":
            return esptool_argv(["--port", port, "flash-id"])
        return esptool_argv(["--port", port, "write-flash", self.f_offset.text().strip(), self.f_file.text().strip()])

    def _run(self, args: list[str]) -> None:
        if self._proc is not None and self._proc.state() != QProcess.ProcessState.NotRunning:
            self.say(tr("esptool è già in esecuzione.", "esptool is already running."), True)
            return
        self.f_log.setPlainText(" ".join(args) + "\n")
        proc = QProcess(self)
        proc.setProcessChannelMode(QProcess.ProcessChannelMode.MergedChannels)
        proc.readyReadStandardOutput.connect(lambda: self.f_log.appendPlainText(bytes(proc.readAllStandardOutput()).decode(errors="replace").rstrip()))
        proc.finished.connect(lambda code, _s: self.say(tr("esptool terminato (codice {c}).", "esptool finished (code {c}).", c=code), code != 0))
        proc.start(args[0], args[1:])
        self._proc = proc

    def chip_info(self) -> None:
        if not self.f_port.currentData():
            self.say(tr("Nessuna porta.", "No port."), True)
            return
        self._run(self.esptool_args("info"))

    def write_flash(self) -> None:
        path = Path(self.f_file.text().strip())
        if not path.is_file() or path.suffix.lower() != ".bin":
            self.say(tr("Scegli un file .bin.", "Choose a .bin file."), True)
            return
        try:
            int(self.f_offset.text().strip(), 0)
        except ValueError:
            self.say(tr("Indirizzo non valido (es. 0x0 o 0x10000).", "Invalid address (e.g. 0x0 or 0x10000)."), True)
            return
        if not self.require_lab("esp.flash"):
            return
        if not common.confirm_sensitive(self, tr("Programmare la scheda?", "Flash the board?"), tr("{f} su {p} all'indirizzo {o}. Il firmware attuale verrà sostituito.", "{f} on {p} at {o}. The current firmware will be replaced.", f=path.name, p=self.f_port.currentData(), o=self.f_offset.text())):
            return
        self.ctx.activity.add("gpio", tr("Programmazione ESP32: {f}", "ESP32 flashing: {f}", f=path.name), "avviso")
        self._run(self.esptool_args("write"))

    # ---------------- calcolatori ----------------

    def _calc_tab(self) -> QWidget:
        w = QWidget()
        v = QVBoxLayout(w)

        def spin(val: float, suffix: str, top: float = 1e7, dec: int = 3) -> QDoubleSpinBox:
            s = QDoubleSpinBox()
            s.setRange(0, top)
            s.setDecimals(dec)
            s.setValue(val)
            s.setSuffix(suffix)
            return s

        g = QGroupBox(tr("Legge di Ohm (lascia a 0 il valore da calcolare)", "Ohm's law (leave the unknown at 0)"))
        f = QFormLayout(g)
        self.o_v, self.o_i, self.o_r = spin(5, " V"), spin(0, " A"), spin(220, " Ω")
        f.addRow(tr("Tensione", "Voltage"), self.o_v)
        f.addRow(tr("Corrente", "Current"), self.o_i)
        f.addRow(tr("Resistenza", "Resistance"), self.o_r)
        self.o_out = label("", selectable=True)
        row, _ = button_row((tr("Calcola", "Calculate"), self.calc_ohm))
        f.addRow(row)
        f.addRow(self.o_out)
        v.addWidget(g)

        g = QGroupBox(tr("Partitore di tensione", "Voltage divider"))
        f = QFormLayout(g)
        self.d_vin, self.d_r1, self.d_r2 = spin(5, " V"), spin(10000, " Ω"), spin(20000, " Ω")
        f.addRow("Vin", self.d_vin)
        f.addRow("R1", self.d_r1)
        f.addRow("R2", self.d_r2)
        self.d_out = label("", selectable=True)
        row, _ = button_row((tr("Calcola", "Calculate"), self.calc_divider))
        f.addRow(row)
        f.addRow(self.d_out)
        v.addWidget(g)

        g = QGroupBox(tr("Resistenza per un LED", "LED resistor"))
        f = QFormLayout(g)
        self.l_vs, self.l_vf, self.l_ma = spin(5, " V"), spin(2.0, " V"), spin(10, " mA", 1000)
        f.addRow(tr("Alimentazione", "Supply"), self.l_vs)
        f.addRow(tr("Tensione del LED", "LED voltage"), self.l_vf)
        f.addRow(tr("Corrente voluta", "Desired current"), self.l_ma)
        self.l_out = label("", selectable=True)
        row, _ = button_row((tr("Calcola", "Calculate"), self.calc_led))
        f.addRow(row)
        f.addRow(self.l_out)
        v.addWidget(g)

        g = QGroupBox(tr("Codice colori delle resistenze", "Resistor colour code"))
        f = QFormLayout(g)
        self.c_bands = QLineEdit("giallo viola rosso oro")
        self.c_value = QLineEdit("4700")
        self.c_out = label("", selectable=True)
        f.addRow(tr("Colori → valore", "Colours → value"), self.c_bands)
        f.addRow(tr("Valore (Ω) → colori", "Value (Ω) → colours"), self.c_value)
        row, _ = button_row((tr("Converti", "Convert"), self.calc_colors))
        f.addRow(row)
        f.addRow(self.c_out)
        v.addWidget(g)
        v.addStretch(1)
        return w

    def calc_ohm(self) -> str:
        vals = {k: (s.value() or None) for k, s in (("v", self.o_v), ("i", self.o_i), ("r", self.o_r))}
        try:
            r = el.ohm(**vals)
            text = f"V = {r['v']:.3g} V · I = {r['i'] * 1000:.3g} mA · R = {el.format_ohms(r['r'])} · P = {r['p'] * 1000:.3g} mW"
        except ValueError as e:
            text = str(e)
        self.o_out.setText(text)
        return text

    def calc_divider(self) -> str:
        try:
            text = f"Vout = {el.divider(self.d_vin.value(), self.d_r1.value(), self.d_r2.value()):.3f} V"
        except ValueError as e:
            text = str(e)
        self.d_out.setText(text)
        return text

    def calc_led(self) -> str:
        try:
            r = el.led_resistor(self.l_vs.value(), self.l_vf.value(), self.l_ma.value())
            text = tr(
                "Esatta {e} · standard (E12, per eccesso) {s} · corrente reale {i:.1f} mA · potenza {p:.0f} mW",
                "Exact {e} · standard (E12, rounded up) {s} · actual current {i:.1f} mA · power {p:.0f} mW",
                e=el.format_ohms(round(r["exact"], 1)), s=el.format_ohms(r["standard"]), i=r["current_ma"], p=r["power_w"] * 1000,
            )
        except ValueError as e:
            text = str(e)
        self.l_out.setText(text)
        return text

    def calc_colors(self) -> str:
        parts = []
        try:
            ohms, tol = el.decode_bands(self.c_bands.text().split())
            parts.append(f"{el.format_ohms(ohms)}" + (f" ±{tol:g}%" if tol else ""))
        except ValueError as e:
            parts.append(str(e))
        try:
            parts.append(" ".join(el.encode_bands(float(self.c_value.text().replace(",", ".")))))
        except ValueError as e:
            parts.append(str(e))
        text = "  ·  ".join(parts)
        self.c_out.setText(text)
        return text

    # ---------------- Polpo Bridge ----------------

    def _bridge_tab(self) -> QWidget:
        w = QWidget()
        v = QVBoxLayout(w)
        self.bpanel = BridgePanel(self)
        v.addWidget(self.bpanel)
        row = QHBoxLayout()
        self.b_pin = QComboBox()
        self.b_mode = QComboBox()
        for m, name in (("input", tr("ingresso", "input")), ("input_pullup", tr("ingresso con pull-up", "input with pull-up")), ("output", tr("uscita", "output"))):
            self.b_mode.addItem(name, m)
        row.addWidget(label(tr("Pin", "Pin")))
        row.addWidget(self.b_pin)
        row.addWidget(self.b_mode)
        v.addLayout(row)
        row, _ = button_row(
            (tr("Imposta modo", "Set mode"), self.b_set_mode),
            (tr("Leggi", "Read"), self.b_read),
            (tr("Uscita ALTA", "Output HIGH"), lambda: self.b_write(1)),
            (tr("Uscita BASSA", "Output LOW"), lambda: self.b_write(0)),
            (tr("Leggi ADC", "Read ADC"), self.b_adc),
            (tr("Scansione I2C", "I2C scan"), self.b_i2c),
        )
        v.addLayout(row)
        self.b_out = QPlainTextEdit()
        self.b_out.setReadOnly(True)
        v.addWidget(self.b_out)
        self.bridge.event.connect(lambda topic, _p: self._b_pins() if topic == "bridge.state" else None)
        return w

    def _b_pins(self) -> None:
        self.b_pin.clear()
        info = self.ctx.bridge.info
        for p in info.get("pins", []):
            self.b_pin.addItem(str(p) + (" · ADC" if p in info.get("adc", []) else ""), p)

    def _b_log(self, text: str) -> None:
        self.b_out.appendPlainText(f"{common.stamp()}  {text}")

    def b_set_mode(self) -> None:
        pin, mode = self.b_pin.currentData(), self.b_mode.currentData()
        if pin is None:
            self.say(tr("Collega prima il Polpo Bridge.", "Connect the Polpo Bridge first."), True)
            return
        if mode == "output":
            if not self.require_lab("gpio.output"):
                return
            if not common.confirm_sensitive(self, tr("Usare il pin come uscita?", "Use the pin as an output?"), tr("Pin {p}: controlla che non sia collegato a un'altra uscita o a 5 V su una scheda a 3,3 V.", "Pin {p}: make sure it is not wired to another output or to 5 V on a 3.3 V board.", p=pin)):
                return
        bridge_req(self, "pin.mode", {"pin": pin, "mode": mode}, lambda d: self._b_log(tr("pin {p}: {m}", "pin {p}: {m}", p=d.get("pin"), m=d.get("mode"))))

    def b_read(self) -> None:
        pin = self.b_pin.currentData()
        bridge_req(self, "pin.read", {"pin": pin}, lambda d: self._b_log(tr("pin {p} = {v}", "pin {p} = {v}", p=pin, v=d.get("value"))))

    def b_write(self, value: int) -> None:
        if not self.require_lab("gpio.output"):
            return
        pin = self.b_pin.currentData()

        def ok(d: dict) -> None:
            self._b_log(tr("pin {p} ← {v}", "pin {p} ← {v}", p=pin, v=d.get("value")))
            self.ctx.activity.add("gpio", tr("Bridge: pin {p} impostato a {v}", "Bridge: pin {p} set to {v}", p=pin, v=value), "avviso")

        bridge_req(self, "pin.write", {"pin": pin, "value": value}, ok)

    def b_adc(self) -> None:
        pin = self.b_pin.currentData()

        def ok(d: dict) -> None:
            bits = int(d.get("bits", 10))
            vref = 3.3 if bits == 12 else 5.0
            self._b_log(tr("ADC pin {p}: {r} (≈ {v:.2f} V se il riferimento è {ref} V)", "ADC pin {p}: {r} (≈ {v:.2f} V if the reference is {ref} V)", p=pin, r=d.get("raw"), v=d.get("raw", 0) * vref / ((1 << bits) - 1), ref=vref))

        bridge_req(self, "adc.read", {"pin": pin}, ok)

    def b_i2c(self) -> None:
        bridge_req(self, "i2c.scan", None, lambda d: self._b_log("I2C: " + (", ".join(f"0x{a:02X} {I2C_NAMES.get(a, '')}".strip() for a in d.get("devices", [])) or tr("nessun dispositivo", "no devices"))))
