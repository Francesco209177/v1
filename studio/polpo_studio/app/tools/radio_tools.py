"""Modulo Radio 433 MHz: ricezione, cattura RAW con grafico, archivio legato ai dispositivi propri,
editor .sub, bande supportate, trasmissione (modalità laboratorio + doppia conferma), report."""

from __future__ import annotations

import html
import json
import time
import uuid
from pathlib import Path

from PySide6.QtCore import QPointF, Qt, QTimer
from PySide6.QtGui import QColor, QPainter, QPen
from PySide6.QtWidgets import (
    QComboBox,
    QDialog,
    QDialogButtonBox,
    QFileDialog,
    QFormLayout,
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
from ...protocols import flipper_format as ff
from ...protocols import subghz
from ...security.vault import VaultError
from ..themes import effective_accent, palette
from ..widgets import label
from . import common
from .common import NotSendable, ToolBase, button_row, check_sendable, sim_suffix, stamp

REGISTER_NAME = "dispositivi-radio.json"
ID_ROLE = Qt.ItemDataRole.UserRole


class DeviceRegister:
    """Registro dei dispositivi propri (cifrato nella cassaforte)."""

    def __init__(self, vault) -> None:
        self.vault = vault

    def _item(self):
        for it in self.vault.items("configurazioni"):
            if it.name == REGISTER_NAME:
                return it
        return None

    def load(self) -> list[dict]:
        it = self._item()
        if it is None:
            return []
        try:
            return json.loads(self.vault.get(it.id))
        except (ValueError, VaultError):
            return []

    def save(self, devices: list[dict]) -> None:
        data = json.dumps(devices, ensure_ascii=False, indent=2).encode()
        it = self._item()
        if it is None:
            self.vault.put("configurazioni", REGISTER_NAME, data)
        else:
            self.vault.update(it.id, data=data)

    def add(self, name: str, place: str = "", notes: str = "") -> dict:
        devs = self.load()
        d = {"id": uuid.uuid4().hex[:12], "name": name, "place": place, "notes": notes, "added": time.strftime("%Y-%m-%d")}
        devs.append(d)
        self.save(devs)
        return d

    def name(self, dev_id: str) -> str:
        return next((d["name"] for d in self.load() if d["id"] == dev_id), "?")


class PulsePlot(QWidget):
    """Disegna gli impulsi: alto = portante accesa, basso = spenta."""

    def __init__(self, ctx) -> None:
        super().__init__()
        self.ctx = ctx
        self.timings: list[int] = []
        self.setMinimumHeight(140)

    def set_timings(self, t: list[int]) -> None:
        self.timings = list(t)
        self.update()

    def paintEvent(self, _e) -> None:  # noqa: N802 (Qt)
        p = QPainter(self)
        theme = self.ctx.settings.get("theme")
        pal = palette(theme)
        p.fillRect(self.rect(), QColor(pal.panel))
        if not self.timings:
            p.setPen(QColor(pal.muted))
            p.drawText(self.rect(), Qt.AlignmentFlag.AlignCenter, tr("Nessun impulso registrato", "No pulses recorded"))
            return
        total = sum(abs(x) for x in self.timings) or 1
        w, h = self.width() - 20, self.height() - 30
        p.setPen(QPen(QColor(effective_accent(theme, self.ctx.settings.get("accent"))), 2))
        x, y_hi, y_lo = 10.0, 15.0, 15.0 + h
        last = QPointF(x, y_lo)
        for t in self.timings:
            y = y_hi if t > 0 else y_lo
            nx = x + abs(t) / total * w
            p.drawLine(last, QPointF(x, y))
            p.drawLine(QPointF(x, y), QPointF(nx, y))
            last, x = QPointF(nx, y), nx
        p.setPen(QColor(pal.muted))
        p.drawText(10, self.height() - 4, tr("{n} impulsi · {ms:.1f} ms", "{n} pulses · {ms:.1f} ms", n=len(self.timings), ms=total / 1000))


class SaveDialog(QDialog):
    def __init__(self, parent, register: DeviceRegister, default_name: str) -> None:
        super().__init__(parent)
        self.register = register
        self.setWindowTitle(tr("Salva il codice", "Save the code"))
        f = QFormLayout(self)
        self.name = QLineEdit(default_name)
        f.addRow(tr("Nome", "Name"), self.name)
        self.device = QComboBox()
        self._reload()
        f.addRow(tr("Dispositivo tuo", "Your device"), self.device)
        self.new_dev = QLineEdit()
        self.new_dev.setPlaceholderText(tr("…oppure scrivi il nome di un nuovo dispositivo tuo", "…or type the name of a new device of yours"))
        f.addRow("", self.new_dev)
        f.addRow(label(tr("Salva solo codici di telecomandi e prese che possiedi.", "Only save codes from remotes and sockets you own."), muted=True, wrap=True))
        bb = QDialogButtonBox(QDialogButtonBox.StandardButton.Ok | QDialogButtonBox.StandardButton.Cancel)
        bb.accepted.connect(self.accept)
        bb.rejected.connect(self.reject)
        f.addRow(bb)

    def _reload(self) -> None:
        self.device.clear()
        for d in self.register.load():
            self.device.addItem(d["name"], d["id"])

    def device_id(self) -> str | None:
        if self.new_dev.text().strip():
            return self.register.add(self.new_dev.text().strip())["id"]
        return self.device.currentData()


class RadioTools(ToolBase):
    category = "radio"

    def __init__(self, ctx, bridge) -> None:
        super().__init__(ctx, bridge)
        self.register = DeviceRegister(ctx.vault)
        self.codes: list[tuple[dict, bool]] = []
        self.raw: list[int] = []
        self.raw_sim = False
        self.tabs = QTabWidget()
        self.root.addWidget(self.tabs)
        self.tabs.addTab(self._rx_tab(), tr("Ricezione", "Receive"))
        self.tabs.addTab(self._raw_tab(), tr("Cattura RAW", "RAW capture"))
        self.tabs.addTab(self._archive_tab(), tr("Archivio e dispositivi", "Archive and devices"))
        self.tabs.addTab(self._editor_tab(), tr("Editor .sub", ".sub editor"))
        self.tabs.addTab(self._bands_tab(), tr("Bande supportate", "Supported bands"))
        self.on_polpo_event("rf.code", self._on_code)
        self.finish()
        self.refresh_archive()

    # ---------------- ricezione ----------------

    def _rx_tab(self) -> QWidget:
        w = QWidget()
        v = QVBoxLayout(w)
        v.addWidget(label(tr("Premi un tasto del TUO telecomando vicino al Polpo (modulo RF433R sulla porta Grove).", "Press a button on YOUR remote near the Polpo (RF433R unit on the Grove port)."), muted=True, wrap=True))
        row, _ = button_row((tr("Avvia ascolto", "Start listening"), self.rx_start), (tr("Ferma", "Stop"), self.rx_stop), (tr("Salva il codice selezionato…", "Save the selected code…"), self.save_selected))
        v.addLayout(row)
        self.rx_table = QTableWidget(0, 6)
        self.rx_table.setHorizontalHeaderLabels([tr("Ora", "Time"), tr("Protocollo", "Protocol"), tr("Bit", "Bits"), tr("Codice", "Code"), tr("Impulso", "Pulse"), tr("Origine", "Source")])
        self.rx_table.verticalHeader().setVisible(False)
        self.rx_table.setEditTriggers(QTableWidget.EditTrigger.NoEditTriggers)
        self.rx_table.setSelectionBehavior(QTableWidget.SelectionBehavior.SelectRows)
        self.rx_table.horizontalHeader().setSectionResizeMode(3, QHeaderView.ResizeMode.Stretch)
        v.addWidget(self.rx_table)
        return w

    def rx_start(self) -> None:
        self.req("rf.rx.start", None, lambda _d: self.say(tr("In ascolto a 433,92 MHz…", "Listening at 433.92 MHz…") + sim_suffix(self.simulated)))

    def rx_stop(self) -> None:
        self.req("rf.rx.stop", None, lambda _d: self.say(tr("Ascolto fermato.", "Listening stopped.")))

    def _on_code(self, d: dict, simulated: bool) -> None:
        self.codes.append((d, simulated))
        r = self.rx_table.rowCount()
        self.rx_table.insertRow(r)
        value = int(str(d.get("value", "0")), 16)
        bits = int(d.get("bits", 0))
        vals = [stamp(), str(d.get("protocol")), str(bits), f"0x{value:0{max(1, (bits + 3) // 4)}X}", f"{d.get('pulse_us')} µs", tr("SIMULATO", "SIMULATED") if simulated or d.get("simulated") else tr("reale", "real")]
        for c, val in enumerate(vals):
            self.rx_table.setItem(r, c, QTableWidgetItem(val))
        self.rx_table.selectRow(r)

    def save_selected(self, name: str | None = None, device_id: str | None = None) -> bool:
        rows = self.rx_table.selectionModel().selectedRows()
        if not rows:
            self.say(tr("Seleziona un codice ricevuto.", "Select a received code."), True)
            return False
        d, sim = self.codes[rows[0].row()]
        sim = sim or bool(d.get("simulated"))
        sub = subghz.code_to_sub(int(d["protocol"]), int(d["bits"]), str(d["value"]), int(d["pulse_us"]))
        if name is None:
            dlg = SaveDialog(self, self.register, tr("codice {v}", "code {v}", v=d["value"].lstrip("0") or "0"))
            if dlg.exec() != QDialog.DialogCode.Accepted:
                return False
            name, device_id = dlg.name.text().strip() or "codice", dlg.device_id()
        meta = {"device": device_id or "", "protocol": sub.code.protocol, "bits": sub.code.bits, "pulse_us": sub.code.pulse_us}
        self.ctx.vault.put("radio", f"{name}.sub", subghz.serialize(sub).encode(), origin="simulato" if sim else "reale", meta=meta)
        self.ctx.bus.publish("vault.changed")
        self.ctx.activity.add("radio", tr("Codice salvato: {n}", "Code saved: {n}", n=name), "ok", sim)
        self.say(tr("Salvato «{n}» nella cassaforte.", "Saved “{n}” in the vault.", n=name))
        self.refresh_archive()
        return True

    # ---------------- RAW ----------------

    def _raw_tab(self) -> QWidget:
        w = QWidget()
        v = QVBoxLayout(w)
        row, _ = button_row((tr("Avvia registrazione", "Start recording"), self.raw_start), (tr("Ferma", "Stop"), self.raw_stop), (tr("Salva come .sub RAW", "Save as RAW .sub"), self.raw_save))
        v.addLayout(row)
        self.plot = PulsePlot(self.ctx)
        v.addWidget(self.plot)
        self.raw_stats = label("", wrap=True, selectable=True)
        v.addWidget(self.raw_stats)
        self.raw_timer = QTimer(self)
        self.raw_timer.setInterval(1500)
        self.raw_timer.timeout.connect(self.raw_snapshot)
        return w

    def raw_start(self) -> None:
        def ok(_d) -> None:
            self.say(tr("Registrazione RAW in corso…", "RAW recording…"))
            self.raw_timer.start()
            self.raw_snapshot()

        self.req("rf.raw.start", None, ok)

    def raw_snapshot(self) -> None:
        if not self.connected:
            self.raw_timer.stop()
            return

        def ok(d: dict) -> None:
            self.raw = [int(x) for x in d.get("timings", [])]
            self.raw_sim = self.simulated or bool(d.get("simulated"))
            self.plot.set_timings(self.raw)
            self.show_analysis(self.raw)

        self.req("rf.raw.snapshot", None, ok, err=lambda e: (self.raw_timer.stop(), self.fail(e)))

    def show_analysis(self, timings: list[int]) -> None:
        st = subghz.pulse_analyze(timings)
        self.raw_stats.setText(
            tr(
                "Impulsi: {n} · breve ≈ {s} µs · lungo ≈ {l} µs · rapporto {r:.2f} · gruppi {c}\nIpotesi: {g}",
                "Pulses: {n} · short ≈ {s} µs · long ≈ {l} µs · ratio {r:.2f} · groups {c}\nGuess: {g}",
                n=st.count, s=st.short_us, l=st.long_us, r=st.ratio, c=st.clusters, g=subghz.guess_protocol(st),
            )
        )

    def raw_stop(self) -> None:
        self.raw_timer.stop()
        self.req("rf.raw.stop", None, lambda _d: self.say(tr("Registrazione fermata.", "Recording stopped.")))

    def raw_save(self, name: str | None = None) -> bool:
        t = list(self.raw)
        while t and t[0] < 0:
            t.pop(0)
        if not subghz.raw_valid(t):
            self.say(tr("Niente di valido da salvare: registra prima qualche impulso.", "Nothing valid to save: record some pulses first."), True)
            return False
        name = name or time.strftime("raw-%H%M%S")
        sub = subghz.SubFile(raw=True, raw_timings=t)
        self.ctx.vault.put("radio", f"{name}.sub", subghz.serialize(sub).encode(), origin="simulato" if self.raw_sim else "reale", meta={"raw": True})
        self.ctx.bus.publish("vault.changed")
        self.say(tr("RAW salvato nella cassaforte.", "RAW saved in the vault."))
        self.refresh_archive()
        return True

    # ---------------- archivio ----------------

    def _archive_tab(self) -> QWidget:
        w = QWidget()
        v = QVBoxLayout(w)
        self.arch = QTableWidget(0, 5)
        self.arch.setHorizontalHeaderLabels([tr("Nome", "Name"), tr("Dispositivo", "Device"), tr("Tipo", "Type"), tr("Trasmissibile", "Transmittable"), tr("Origine", "Source")])
        self.arch.verticalHeader().setVisible(False)
        self.arch.setEditTriggers(QTableWidget.EditTrigger.NoEditTriggers)
        self.arch.setSelectionBehavior(QTableWidget.SelectionBehavior.SelectRows)
        self.arch.horizontalHeader().setSectionResizeMode(0, QHeaderView.ResizeMode.Stretch)
        v.addWidget(self.arch)
        row, _ = button_row(
            (tr("Apri nell'editor", "Open in editor"), self.open_in_editor),
            (tr("Analizza", "Analyse"), self.analyse_selected),
            (tr("Trasmetti…", "Transmit…"), self.transmit),
            (tr("Nuovo dispositivo…", "New device…"), self.new_device),
            (tr("Report…", "Report…"), self.report),
        )
        v.addLayout(row)
        self.dev_list = label("", muted=True, wrap=True)
        v.addWidget(self.dev_list)
        self.bridge.event.connect(lambda topic, _p: self.refresh_archive() if topic in ("vault.changed", "vault.unlocked") else None)
        return w

    def _radio_items(self):
        try:
            return self.ctx.vault.items("radio")
        except VaultError:
            return []

    def refresh_archive(self) -> None:
        if not self.ctx.vault.unlocked:
            return
        items = self._radio_items()
        devs = {d["id"]: d["name"] for d in self.register.load()}
        self.arch.setRowCount(len(items))
        for r, it in enumerate(items):
            try:
                sub = subghz.parse(self.ctx.vault.get(it.id).decode("utf-8", "replace"))
                kind = "RAW" if sub.raw else f"rc-switch {sub.code.protocol}, {sub.code.bits} bit"
                why = subghz.check_transmittable(sub)
            except ff.FormatError as e:
                kind, why = tr("non valido", "invalid"), str(e)
            vals = [it.name, devs.get(it.meta.get("device", ""), "—"), kind, tr("sì", "yes") if not why else tr("no: ", "no: ") + why, tr("SIMULATO", "SIMULATED") if it.simulated else tr("reale", "real")]
            for c, val in enumerate(vals):
                cell = QTableWidgetItem(val)
                cell.setData(ID_ROLE, it.id)
                self.arch.setItem(r, c, cell)
        self.dev_list.setText(tr("Dispositivi tuoi: ", "Your devices: ") + (", ".join(devs.values()) or tr("nessuno", "none")))

    def _selected_item(self):
        rows = self.arch.selectionModel().selectedRows()
        if not rows:
            self.say(tr("Seleziona un codice dell'archivio.", "Select an archived code."), True)
            return None
        return self.ctx.vault.item(self.arch.item(rows[0].row(), 0).data(ID_ROLE))

    def open_in_editor(self) -> None:
        it = self._selected_item()
        if it:
            self.editor.setPlainText(self.ctx.vault.get(it.id).decode("utf-8", "replace"))
            self.editor_name.setText(it.name)
            self.tabs.setCurrentIndex(3)
            self.check_editor()

    def analyse_selected(self) -> None:
        it = self._selected_item()
        if not it:
            return
        try:
            sub = subghz.parse(self.ctx.vault.get(it.id).decode("utf-8", "replace"))
        except ff.FormatError as e:
            self.say(str(e), True)
            return
        if sub.raw:
            self.raw, self.raw_sim = sub.raw_timings, it.simulated
            self.plot.set_timings(sub.raw_timings)
            self.show_analysis(sub.raw_timings)
            self.tabs.setCurrentIndex(1)
        else:
            us = subghz.rc_airtime_us(sub.code, 1)
            self.say(tr("Codice fisso {b} bit, impulso {p} µs, circa {ms:.1f} ms per invio.", "Fixed code {b} bits, pulse {p} µs, about {ms:.1f} ms per send.", b=sub.code.bits, p=sub.code.pulse_us, ms=us / 1000))

    def new_device(self, name: str | None = None) -> None:
        if name is None:
            from PySide6.QtWidgets import QInputDialog

            name, ok = QInputDialog.getText(self, tr("Nuovo dispositivo", "New device"), tr("Nome del dispositivo TUO (es. «presa del salotto»):", "Name of YOUR device (e.g. “living room socket”):"))
            if not ok or not name.strip():
                return
        self.register.add(name.strip())
        self.refresh_archive()

    def transmit(self) -> None:
        it = self._selected_item()
        if not it:
            return
        try:
            check_sendable(self.ctx, it)
        except NotSendable as e:
            self.say(str(e), True)
            return
        try:
            sub = subghz.parse(self.ctx.vault.get(it.id).decode("utf-8", "replace"))
        except ff.FormatError as e:
            self.say(str(e), True)
            return
        why = subghz.check_transmittable(sub)
        if why:
            self.say(tr("Non trasmissibile: {w}", "Not transmittable: {w}", w=why), True)
            return
        if not self.need_polpo() or not self.require_lab("rf.tx"):
            return
        dev = self.register.name(it.meta.get("device", "")) if it.meta.get("device") else tr("nessun dispositivo registrato", "no registered device")
        if not common.confirm_sensitive(self, tr("Trasmettere a 433,92 MHz?", "Transmit at 433.92 MHz?"), tr("Codice «{n}» per: {d}.\nDopo questa conferma il Polpo ti chiederà di confermare sul suo schermo.", "Code “{n}” for: {d}.\nAfter this, the Polpo will ask you to confirm on its screen.", n=it.name, d=dev)):
            return
        data = self.ctx.vault.get(it.id)
        target = f"/polpo/rf433/pc_{it.id[:8]}.sub"
        self.say(tr("Copio il file sul Polpo e attendo la conferma sul suo schermo…", "Copying the file to the Polpo and waiting for confirmation on its screen…"))

        def work(c):
            c.write_file(target, data)
            return c.call("rf.tx", {"file": target})

        def ok(d: dict) -> None:
            self.say(tr("Trasmesso. Tempo radio usato nell'ultima ora: {s:.1f} s.", "Transmitted. Radio time used in the last hour: {s:.1f} s.", s=d.get("budget_used_ms", 0) / 1000) + sim_suffix(self.simulated))
            self.ctx.activity.add("radio", tr("Trasmesso «{n}» ({d})", "Transmitted “{n}” ({d})", n=it.name, d=dev), "avviso", self.simulated)

        self.job(work, ok)

    def report(self, dest: str | None = None) -> bool:
        items = self._radio_items()
        devs = {d["id"]: d for d in self.register.load()}
        rows = []
        for it in items:
            try:
                sub = subghz.parse(self.ctx.vault.get(it.id).decode("utf-8", "replace"))
                info = "RAW" if sub.raw else f"rc-switch {sub.code.protocol} · {sub.code.bits} bit · {sub.code.pulse_us} µs"
                if sub.raw:
                    st = subghz.pulse_analyze(sub.raw_timings)
                    info += f" · {st.short_us}/{st.long_us} µs · {html.escape(subghz.guess_protocol(st))}"
            except ff.FormatError as e:
                info = html.escape(str(e))
            dev = devs.get(it.meta.get("device", ""), {}).get("name", "—")
            rows.append(f"<tr><td>{html.escape(it.name)}</td><td>{html.escape(dev)}</td><td>{info}</td><td>{'SIMULATO' if it.simulated else 'reale'}</td><td><tt>{it.sha256[:16]}</tt></td></tr>")
        doc = (
            "<!doctype html><meta charset='utf-8'><title>Report radio</title>"
            "<style>body{font-family:sans-serif;margin:2em}td,th{border-bottom:1px solid #ccc;padding:4px 8px;text-align:left}</style>"
            f"<h1>Report radio 433 MHz</h1><p>Creato il {time.strftime('%d/%m/%Y %H:%M')} con Polpo Studio. Solo dispositivi propri.</p>"
            "<table><tr><th>Nome</th><th>Dispositivo</th><th>Dettagli</th><th>Origine</th><th>SHA-256</th></tr>" + "".join(rows) + "</table>"
        )
        if dest is None:
            dest, _ = QFileDialog.getSaveFileName(self, tr("Salva il report", "Save the report"), "report-radio.html", "HTML (*.html)")
            if not dest:
                return False
        Path(dest).write_text(doc, encoding="utf-8")
        self.say(tr("Report salvato (non cifrato): {d}", "Report saved (not encrypted): {d}", d=dest))
        return True

    # ---------------- editor ----------------

    def _editor_tab(self) -> QWidget:
        w = QWidget()
        v = QVBoxLayout(w)
        self.editor_name = QLineEdit("nuovo.sub")
        v.addWidget(self.editor_name)
        self.editor = QPlainTextEdit()
        self.editor.setPlainText(subghz.serialize(subghz.SubFile(code=subghz.RcCode(1, 24, 0x000001, 350))))
        self.editor.textChanged.connect(self.check_editor)
        v.addWidget(self.editor)
        self.editor_state = label("", wrap=True)
        v.addWidget(self.editor_state)
        row, _ = button_row((tr("Importa .sub…", "Import .sub…"), self.import_sub), (tr("Salva nella cassaforte", "Save in the vault"), self.save_editor))
        v.addLayout(row)
        self.check_editor()
        return w

    def check_editor(self) -> str:
        try:
            sub = subghz.parse(self.editor.toPlainText())
        except subghz.Unsupported as e:
            text = tr("Non supportato: {e}", "Not supported: {e}", e=e)
        except ff.FormatError as e:
            text = tr("Errore: {e}", "Error: {e}", e=e)
        else:
            why = subghz.check_transmittable(sub)
            text = tr("Valido. ", "Valid. ") + (tr("Trasmissibile con il Polpo.", "Transmittable with the Polpo.") if not why else tr("Non supportato per la trasmissione: {w}", "Not supported for transmission: {w}", w=why))
        self.editor_state.setText(text)
        return text

    def import_sub(self) -> None:
        path, _ = QFileDialog.getOpenFileName(self, tr("Importa .sub", "Import .sub"), "", "Radio (*.sub)")
        if path:
            self.editor.setPlainText(Path(path).read_text(encoding="utf-8", errors="replace"))
            self.editor_name.setText(Path(path).name)

    def save_editor(self) -> bool:
        text = self.editor.toPlainText()
        try:
            subghz.parse(text)
        except ff.FormatError as e:
            self.say(str(e), True)
            return False
        name = self.editor_name.text().strip() or "nuovo.sub"
        self.ctx.vault.put("radio", name if name.endswith(".sub") else name + ".sub", text.encode())
        self.ctx.bus.publish("vault.changed")
        self.say(tr("Salvato nella cassaforte.", "Saved in the vault."))
        self.refresh_archive()
        return True

    # ---------------- bande ----------------

    def _bands_tab(self) -> QWidget:
        w = QWidget()
        v = QVBoxLayout(w)
        rows = [
            ("433,92 MHz · OOK/ASK · codici fissi (rc-switch, PT2262/EV1527)", tr("Supportato", "Supported")),
            ("433,92 MHz · OOK · RAW (fino a 4096 impulsi)", tr("Supportato", "Supported")),
            ("315 / 868 / 915 MHz", tr("Non supportato: i moduli RF433 lavorano solo a 433,92 MHz", "Not supported: the RF433 units only work at 433.92 MHz")),
            ("FSK / GFSK / LoRa", tr("Non supportato dall'hardware", "Not supported by the hardware")),
            ("Rolling code (KeeLoq, Somfy, auto…)", tr("Escluso per scelta di sicurezza", "Excluded by design")),
            (tr("Disturbo radio, prove a forza bruta", "Jamming, brute force"), tr("Escluso: illegale", "Excluded: illegal")),
        ]
        t = QTableWidget(len(rows), 2)
        t.setHorizontalHeaderLabels([tr("Banda / modulazione", "Band / modulation"), tr("Stato", "Status")])
        t.verticalHeader().setVisible(False)
        t.setEditTriggers(QTableWidget.EditTrigger.NoEditTriggers)
        t.horizontalHeader().setSectionResizeMode(0, QHeaderView.ResizeMode.Stretch)
        t.horizontalHeader().setSectionResizeMode(1, QHeaderView.ResizeMode.Stretch)
        for r, (a, b) in enumerate(rows):
            t.setItem(r, 0, QTableWidgetItem(a))
            t.setItem(r, 1, QTableWidgetItem(b))
        v.addWidget(t)
        v.addWidget(label(tr("In Italia e in Europa la banda 433,05–434,79 MHz ha limiti di tempo di trasmissione: il Polpo ne tiene conto con il suo limite orario.", "In Italy and Europe the 433.05–434.79 MHz band has transmission time limits: the Polpo enforces an hourly budget."), muted=True, wrap=True))
        return w
