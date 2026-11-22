"""Modulo Polpo: informazioni, diagnostica, microSD (con backup), reti vicine, aggiornamento firmware."""

from __future__ import annotations

import io
import time
import zipfile
from pathlib import Path

from PySide6.QtCore import QProcess, Qt
from PySide6.QtWidgets import (
    QFileDialog,
    QHeaderView,
    QPlainTextEdit,
    QProgressBar,
    QTableWidget,
    QTableWidgetItem,
    QTabWidget,
    QTreeWidget,
    QTreeWidgetItem,
    QVBoxLayout,
    QWidget,
)

from ...core.i18n import tr
from ...devices import firmware
from ...devices.link_client import LinkError, PolpoLinkClient
from ...protocols import link
from ..widgets import Card, human_bytes, label
from . import common
from .common import I2C_NAMES, ToolBase, button_row, kv, sim_suffix

WIFI_AUTH = {0: "aperta", 1: "WEP", 2: "WPA", 3: "WPA2", 4: "WPA/WPA2", 5: "WPA2 Enterprise", 6: "WPA3", 7: "WPA2/WPA3", 8: "WAPI"}
PATH_ROLE = Qt.ItemDataRole.UserRole


class PolpoTools(ToolBase):
    category = "polpo"

    def __init__(self, ctx, bridge) -> None:
        super().__init__(ctx, bridge)
        self.tabs = QTabWidget()
        self.root.addWidget(self.tabs)
        self.tabs.addTab(self._info_tab(), tr("Informazioni", "Info"))
        self.tabs.addTab(self._diag_tab(), tr("Diagnostica", "Diagnostics"))
        self.tabs.addTab(self._sd_tab(), tr("microSD", "microSD"))
        self.tabs.addTab(self._scan_tab(), tr("Reti vicine", "Nearby networks"))
        self.tabs.addTab(self._fw_tab(), tr("Firmware", "Firmware"))
        self.finish()
        self.on_connection_changed()

    # ---------------- informazioni ----------------

    def _info_tab(self) -> QWidget:
        w = QWidget()
        v = QVBoxLayout(w)
        row, _ = button_row((tr("Aggiorna", "Refresh"), self.refresh_info))
        v.addLayout(row)
        self.info_box = QVBoxLayout()
        v.addLayout(self.info_box)
        v.addStretch(1)
        return w

    def on_connection_changed(self) -> None:
        while self.info_box.count():
            it = self.info_box.takeAt(0)
            if it.widget():
                it.widget().deleteLater()
        info = self.ctx.devices.info if self.connected else {}
        if not info:
            self.info_box.addWidget(label(tr("Polpo non collegato.", "Polpo not connected."), muted=True))
            return
        sd = info.get("sd") or {}
        mods = info.get("modules") or {}
        names = {"available": tr("rilevato", "detected"), "missing": tr("assente", "missing"), "unverifiable": tr("non verificabile", "unverifiable"), "simulated": tr("simulato", "simulated")}
        up = int(info.get("uptime_s", 0))
        pairs = [
            (tr("Scheda", "Board"), str(info.get("board"))),
            (tr("Firmware", "Firmware"), str(info.get("firmware")) + sim_suffix(self.simulated)),
            (tr("Batteria", "Battery"), f"{info.get('battery')}%" + (tr(" (in carica)", " (charging)") if info.get("charging") else "")),
            (tr("Memoria libera", "Free memory"), human_bytes(info.get("heap_free", 0))),
            (tr("Acceso da", "Up for"), f"{up // 3600} h {up % 3600 // 60} min"),
            ("microSD", f"{human_bytes(sd.get('used', 0))} / {human_bytes(sd.get('total', 0))}" if sd.get("ok") else tr("assente", "missing")),
            (tr("Tastiera", "Keyboard layout"), str(info.get("layout", ""))),
        ] + [(f"{tr('Modulo', 'Unit')} {k}", names.get(v, v)) for k, v in mods.items()]
        b = info.get("rf_budget") or {}
        if b:
            pairs.append((tr("Radio (ultima ora)", "Radio (last hour)"), f"{b.get('used_ms', 0) / 1000:.1f} s / {b.get('limit_ms', 0) / 1000:.0f} s"))
        self.info_box.addWidget(kv(pairs))

    def refresh_info(self) -> None:
        if self.need_polpo():
            self.bridge.watch(self.ctx.devices.refresh_info(), lambda _i: self.say(tr("Informazioni aggiornate.", "Info refreshed.")), self.fail)

    # ---------------- diagnostica ----------------

    def _diag_tab(self) -> QWidget:
        w = QWidget()
        v = QVBoxLayout(w)
        v.addWidget(label(tr("Prova la scrittura sulla microSD e cerca i dispositivi I2C sulla porta Grove.", "Tests microSD writing and scans the Grove port for I2C devices."), muted=True, wrap=True))
        row, _ = button_row((tr("Esegui diagnostica", "Run diagnostics"), self.run_diag), (tr("Salva il risultato", "Save the result"), self.save_diag))
        v.addLayout(row)
        self.diag_out = QPlainTextEdit()
        self.diag_out.setReadOnly(True)
        v.addWidget(self.diag_out)
        self._diag_text = ""
        return w

    def run_diag(self) -> None:
        def ok(d: dict) -> None:
            lines = [
                tr("Diagnostica del {t}", "Diagnostics of {t}", t=time.strftime("%d/%m/%Y %H:%M")) + sim_suffix(self.simulated),
                tr("Firmware: {f} · Scheda: {b}", "Firmware: {f} · Board: {b}", f=d.get("firmware"), b=d.get("board")),
                tr("Prova microSD: {r}", "microSD test: {r}", r=tr("riuscita", "passed") if d.get("sd_test") else tr("NON riuscita", "FAILED")),
            ]
            addrs = d.get("i2c") or []
            lines.append(tr("Dispositivi I2C sulla porta Grove: {n}", "I2C devices on the Grove port: {n}", n=len(addrs)))
            lines += [f"  0x{a:02X}  {I2C_NAMES.get(a, tr('sconosciuto', 'unknown'))}" for a in addrs]
            if not addrs:
                lines.append(tr("  nessuno (RF433 e IR Unit non usano I2C: non compaiono qui)", "  none (RF433 and IR Unit do not use I2C: they never show here)"))
            self._diag_text = "\n".join(lines)
            self.diag_out.setPlainText(self._diag_text)
            self.say(tr("Diagnostica completata.", "Diagnostics done."))
            self.ctx.activity.add("polpo", tr("Diagnostica eseguita", "Diagnostics run"), "ok", self.simulated)

        self.req("diag", None, ok)

    def save_diag(self) -> None:
        if not self._diag_text:
            self.say(tr("Esegui prima la diagnostica.", "Run diagnostics first."), True)
            return
        name = time.strftime("diagnostica-%Y%m%d-%H%M.txt")
        self.ctx.vault.put("diagnostica", name, self._diag_text.encode(), origin=self.origin())
        self.ctx.bus.publish("vault.changed")
        self.say(tr("Salvato nella cassaforte: {n}", "Saved in the vault: {n}", n=name))

    # ---------------- microSD ----------------

    def _sd_tab(self) -> QWidget:
        w = QWidget()
        v = QVBoxLayout(w)
        self.tree = QTreeWidget()
        self.tree.setHeaderLabels([tr("Nome", "Name"), tr("Dimensione", "Size")])
        self.tree.header().setSectionResizeMode(0, QHeaderView.ResizeMode.Stretch)
        self.tree.itemExpanded.connect(self._expand)
        v.addWidget(self.tree)
        row, _ = button_row(
            (tr("Aggiorna", "Refresh"), self.sd_refresh),
            (tr("Scarica nella cassaforte", "Download to the vault"), self.sd_to_vault),
            (tr("Scarica sul PC…", "Download to the PC…"), self.sd_to_pc),
            (tr("Carica dal PC…", "Upload from the PC…"), self.sd_upload),
            (tr("Elimina", "Delete"), self.sd_delete),
        )
        v.addLayout(row)
        card = Card(tr("Backup completo della microSD", "Full microSD backup"))
        card.body.addWidget(label(tr("Copia tutta la cartella /polpo in un archivio .zip nella cassaforte (file fino a 256 KB).", "Copies the whole /polpo folder into a .zip archive in the vault (files up to 256 KB)."), muted=True, wrap=True))
        row, _ = button_row((tr("Crea backup", "Create backup"), self.sd_backup))
        card.body.addLayout(row)
        self.progress = QProgressBar()
        self.progress.setVisible(False)
        card.body.addWidget(self.progress)
        v.addWidget(card)
        return w

    def sd_refresh(self) -> None:
        def ok(d: dict) -> None:
            self.tree.clear()
            root = QTreeWidgetItem(["/polpo", ""])
            root.setData(0, PATH_ROLE, ("/polpo", True))
            self.tree.addTopLevelItem(root)
            self._fill(root, d)
            root.setExpanded(True)
            self.say(tr("Elenco aggiornato.", "List refreshed."))

        self.req("fs.list", {"path": "/polpo"}, ok)

    def _fill(self, parent: QTreeWidgetItem, d: dict) -> None:
        parent.takeChildren()
        base = d.get("path", "/polpo").rstrip("/")
        for e in d.get("entries", []):
            path = f"{base}/{e['name']}"
            it = QTreeWidgetItem([e["name"], "" if e["dir"] else human_bytes(e["size"])])
            it.setData(0, PATH_ROLE, (path, bool(e["dir"])))
            if e["dir"]:
                it.setChildIndicatorPolicy(QTreeWidgetItem.ChildIndicatorPolicy.ShowIndicator)
            parent.addChild(it)

    def _expand(self, item: QTreeWidgetItem) -> None:
        path, is_dir = item.data(0, PATH_ROLE)
        if is_dir and item.childCount() == 0 and link.valid_sd_path(path):
            self.req("fs.list", {"path": path}, lambda d: self._fill(item, d))

    def _selected(self, want_dir: bool | None = False) -> str | None:
        it = self.tree.currentItem()
        if it is None:
            self.say(tr("Seleziona un elemento della microSD.", "Select an item on the microSD."), True)
            return None
        path, is_dir = it.data(0, PATH_ROLE)
        if want_dir is not None and is_dir != want_dir:
            self.say(tr("Seleziona un file.", "Select a file.") if not want_dir else tr("Seleziona una cartella.", "Select a folder."), True)
            return None
        return path

    def sd_to_vault(self) -> None:
        path = self._selected()
        if path is None:
            return
        name = path.rsplit("/", 1)[-1]
        cat = {"ir": "ir", "rf433": "radio", "nfc": "nfc", "badusb": "altro", "logs": "diagnostica"}.get(path.split("/")[2] if path.count("/") > 2 else "", "altro")

        def ok(data: bytes) -> None:
            self.ctx.vault.put(cat, name, data, origin=self.origin(), meta={"da_microsd": path})
            self.ctx.bus.publish("vault.changed")
            self.say(tr("«{n}» salvato nella cassaforte.", "“{n}” saved in the vault.", n=name))
            self.ctx.activity.add("polpo", tr("Scaricato {p} nella cassaforte", "Downloaded {p} to the vault", p=path), "ok", self.simulated)

        self.job(lambda c: c.read_file(path), ok)

    def sd_to_pc(self, dest: str | None = None) -> None:
        path = self._selected()
        if path is None:
            return
        if dest is None:
            dest, _ = QFileDialog.getSaveFileName(self, tr("Salva sul PC", "Save to the PC"), path.rsplit("/", 1)[-1])
            if not dest:
                return

        def ok(data: bytes) -> None:
            Path(dest).write_bytes(data)
            self.say(tr("Salvato in {d}", "Saved to {d}", d=dest))

        self.job(lambda c: c.read_file(path), ok)

    def sd_upload(self, src: str | None = None, folder: str | None = None) -> None:
        if folder is None:
            it = self.tree.currentItem()
            folder = "/polpo"
            if it is not None:
                p, is_dir = it.data(0, PATH_ROLE)
                folder = p if is_dir else p.rsplit("/", 1)[0]
        if src is None:
            src, _ = QFileDialog.getOpenFileName(self, tr("Carica sul Polpo", "Upload to the Polpo"))
            if not src:
                return
        name = Path(src).name
        target = f"{folder}/{name}"
        if not link.valid_sd_path(target):
            self.say(tr("Nome non valido per la microSD: usa solo lettere, cifre, _ - . (niente spazi o accenti).", "Invalid name for the microSD: use only letters, digits, _ - . (no spaces or accents)."), True)
            return
        data = Path(src).read_bytes()
        if link.is_sensitive_path(target):
            self.say(tr("Conferma sullo schermo del Polpo per salvare lo script…", "Confirm on the Polpo screen to save the script…"))

        def ok(_r) -> None:
            self.say(tr("Caricato {t}", "Uploaded {t}", t=target))
            self.ctx.activity.add("polpo", tr("Caricato {t} sulla microSD", "Uploaded {t} to the microSD", t=target), "ok", self.simulated)
            self.sd_refresh()

        self.job(lambda c: c.write_file(target, data), ok)

    def sd_delete(self) -> None:
        path = self._selected(want_dir=None)
        if path is None or path == "/polpo":
            return
        if not common.confirm_sensitive(self, tr("Eliminare dalla microSD?", "Delete from the microSD?"), path, own_device=False):
            return
        self.req("fs.delete", {"path": path}, lambda _d: (self.say(tr("Eliminato {p}", "Deleted {p}", p=path)), self.sd_refresh()))

    def sd_backup(self) -> None:
        self.progress.setVisible(True)
        self.progress.setRange(0, 0)

        def work(c: PolpoLinkClient) -> tuple[bytes, int, list[str]]:
            buf = io.BytesIO()
            skipped: list[str] = []
            n = 0
            with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as z:
                stack = ["/polpo"]
                while stack:
                    folder = stack.pop()
                    for e in c.call("fs.list", {"path": folder})["entries"]:
                        p = f"{folder}/{e['name']}"
                        if not link.valid_sd_path(p):
                            skipped.append(p)
                        elif e["dir"]:
                            stack.append(p)
                        elif e["size"] > link.MAX_FILE_SIZE:
                            skipped.append(p)
                        else:
                            try:
                                z.writestr(p.lstrip("/"), c.read_file(p))
                                n += 1
                            except LinkError:
                                skipped.append(p)
            return buf.getvalue(), n, skipped

        def ok(res) -> None:
            data, n, skipped = res
            name = time.strftime("microSD-%Y%m%d-%H%M.zip")
            self.ctx.vault.put("backup", name, data, origin=self.origin(), meta={"file": n, "saltati": skipped})
            self.ctx.bus.publish("vault.changed")
            self.progress.setVisible(False)
            text = tr("Backup creato: {n} file in «{z}».", "Backup created: {n} files in “{z}”.", n=n, z=name)
            if skipped:
                text += " " + tr("Saltati: {s}", "Skipped: {s}", s=", ".join(skipped))
            self.say(text)
            self.ctx.activity.add("polpo", text, "ok", self.simulated)

        def err(e: BaseException) -> None:
            self.progress.setVisible(False)
            self.fail(e)

        if not self.job(work, ok, err):
            self.progress.setVisible(False)

    # ---------------- reti vicine ----------------

    def _scan_tab(self) -> QWidget:
        w = QWidget()
        v = QVBoxLayout(w)
        v.addWidget(label(tr("Solo ascolto. Per rispetto della privacy i risultati non vengono salvati.", "Listen only. For privacy, results are not saved."), muted=True, wrap=True))
        row, _ = button_row((tr("Cerca reti Wi-Fi", "Scan Wi-Fi"), self.scan_wifi), (tr("Cerca dispositivi Bluetooth", "Scan Bluetooth"), self.scan_ble))
        v.addLayout(row)
        self.scan_table = QTableWidget(0, 5)
        self.scan_table.verticalHeader().setVisible(False)
        self.scan_table.setEditTriggers(QTableWidget.EditTrigger.NoEditTriggers)
        self.scan_table.horizontalHeader().setSectionResizeMode(0, QHeaderView.ResizeMode.Stretch)
        v.addWidget(self.scan_table)
        return w

    def _show(self, headers: list[str], rows: list[list[str]]) -> None:
        self.scan_table.setColumnCount(len(headers))
        self.scan_table.setHorizontalHeaderLabels(headers)
        self.scan_table.setRowCount(len(rows))
        for r, row in enumerate(rows):
            for c, val in enumerate(row):
                self.scan_table.setItem(r, c, QTableWidgetItem(val))

    def scan_wifi(self) -> None:
        self.say(tr("Scansione Wi-Fi in corso…", "Wi-Fi scan running…"))

        def ok(d: dict) -> None:
            nets = sorted(d.get("networks", []), key=lambda n: -n.get("rssi", -100))
            self._show(
                ["SSID", "BSSID", tr("Canale", "Channel"), tr("Segnale", "Signal"), tr("Protezione", "Security")],
                [[n.get("ssid") or tr("(nascosta)", "(hidden)"), n.get("bssid", ""), str(n.get("channel")), f"{n.get('rssi')} dBm", WIFI_AUTH.get(n.get("auth"), str(n.get("auth")))] for n in nets],
            )
            self.say(tr("{n} reti trovate", "{n} networks found", n=len(nets)) + sim_suffix(self.simulated))

        self.req("wifi.scan", None, ok)

    def scan_ble(self) -> None:
        self.say(tr("Scansione Bluetooth in corso…", "Bluetooth scan running…"))

        def ok(d: dict) -> None:
            devs = sorted(d.get("devices", []), key=lambda n: -n.get("rssi", -100))
            self._show(
                [tr("Nome", "Name"), tr("Indirizzo", "Address"), tr("Segnale", "Signal"), tr("Produttore", "Manufacturer"), tr("Connettibile", "Connectable")],
                [[x.get("name") or "—", x.get("addr", ""), f"{x.get('rssi')} dBm", f"0x{x.get('mfr_id', 0):04X}", tr("sì", "yes") if x.get("connectable") else tr("no", "no")] for x in devs],
            )
            self.say(tr("{n} dispositivi trovati", "{n} devices found", n=len(devs)) + sim_suffix(self.simulated))

        self.req("ble.scan", {"ms": 4000}, ok)

    # ---------------- firmware ----------------

    def _fw_tab(self) -> QWidget:
        w = QWidget()
        v = QVBoxLayout(w)
        self.fw = firmware.bundled()
        ok = firmware.verify(self.fw)
        v.addWidget(
            kv(
                [
                    (tr("Versione inclusa", "Bundled version"), self.fw.version),
                    (tr("File", "File"), str(self.fw.path) if self.fw.path else tr("non trovato", "not found")),
                    ("SHA-256", self.fw.sha256),
                    (tr("Impronta verificata", "Fingerprint checked"), tr("sì", "yes") if ok else tr("no", "no")),
                ]
            )
        )
        v.addWidget(
            label(
                tr(
                    "Sperimentale: la procedura (riavvio nel bootloader a 1200 baud, poi esptool a 0x10000) non è stata provata da qui su un Polpo vero. "
                    "Le impostazioni restano. Se qualcosa va storto, la pagina web del flasher reinstalla tutto.",
                    "Experimental: the procedure (1200 baud bootloader restart, then esptool at 0x10000) has not been tested from here on a real Polpo. "
                    "Settings are kept. If something goes wrong, the web flasher page reinstalls everything.",
                ),
                muted=True,
                wrap=True,
            )
        )
        row, btns = button_row((tr("Aggiorna il firmware…", "Update the firmware…"), self.flash))
        self.fw_btn = btns[0]
        self.fw_btn.setEnabled(ok)
        v.addLayout(row)
        self.fw_log = QPlainTextEdit()
        self.fw_log.setReadOnly(True)
        v.addWidget(self.fw_log)
        self._proc: QProcess | None = None
        return w

    def flash(self) -> None:
        if not self.require_lab("fw.flash"):
            return
        if self.simulated:
            self.say(tr("Il Polpo virtuale non ha firmware da aggiornare.", "The virtual Polpo has no firmware to update."), True)
            return
        client = self.ctx.devices.client
        if client is None or not self.connected:
            self.need_polpo()
            return
        port = getattr(client.transport, "port", "")
        if not common.confirm_sensitive(self, tr("Aggiornare il firmware?", "Update the firmware?"), tr("Il Polpo si riavvierà. Non scollegarlo durante la scrittura.", "The Polpo will restart. Do not unplug it while writing.")):
            return
        if not firmware.verify(self.fw):
            self.say(tr("Impronta del firmware diversa: aggiornamento annullato.", "Firmware fingerprint differs: update cancelled."), True)
            return
        from ...devices.serial_ports import list_ports

        before = {p.device for p in list_ports()}
        self.ctx.devices.disconnect().result(timeout=5)
        try:
            firmware.touch_1200(port)
        except Exception as e:  # noqa: BLE001 - mostrato all'utente
            self.say(tr("Riavvio nel bootloader non riuscito: {e}", "Bootloader restart failed: {e}", e=e), True)
            return
        new_port = firmware.wait_new_port(before) or port
        cmd = firmware.esptool_command(new_port, self.fw)
        self.fw_log.setPlainText(" ".join(cmd) + "\n")
        self.ctx.activity.add("polpo", tr("Aggiornamento firmware avviato su {p}", "Firmware update started on {p}", p=new_port), "avviso")
        proc = QProcess(self)
        proc.setProcessChannelMode(QProcess.ProcessChannelMode.MergedChannels)
        proc.readyReadStandardOutput.connect(lambda: self.fw_log.appendPlainText(bytes(proc.readAllStandardOutput()).decode(errors="replace").rstrip()))
        proc.finished.connect(lambda code, _s: self._flash_done(code))
        proc.start(cmd[0], cmd[1:])
        self._proc = proc

    def _flash_done(self, code: int) -> None:
        if code == 0:
            self.say(tr("Firmware scritto. Il Polpo si riavvia: ricollegalo da Home.", "Firmware written. The Polpo restarts: reconnect it from Home."))
            self.ctx.activity.add("polpo", tr("Firmware aggiornato", "Firmware updated"), "ok")
        else:
            self.say(tr("esptool ha restituito l'errore {c}: guarda il registro qui sopra.", "esptool returned error {c}: see the log above.", c=code), True)
            self.ctx.activity.add("polpo", tr("Aggiornamento firmware non riuscito ({c})", "Firmware update failed ({c})", c=code), "errore")

