"""Modulo Bluetooth (adattatore del PC): scansione, dispositivi autorizzati, servizi GATT, letture,
notifiche, registro. Le scansioni non si salvano se non lo chiedi."""

from __future__ import annotations

import json
import time

from PySide6.QtCore import Qt
from PySide6.QtWidgets import (
    QHeaderView,
    QPlainTextEdit,
    QSpinBox,
    QSplitter,
    QTableWidget,
    QTableWidgetItem,
    QTreeWidget,
    QTreeWidgetItem,
    QVBoxLayout,
    QWidget,
)

from ...core.capability import HardwareStatus, Presence
from ...core.i18n import tr
from ...devices.ble import BleUnavailable, BleWorker, format_value
from ...security.vault import VaultError
from ..widgets import label
from . import common
from .common import ToolBase, button_row, stamp

AUTH_NAME = "dispositivi-bluetooth.json"
UUID_ROLE = Qt.ItemDataRole.UserRole


class AuthorizedDevices:
    def __init__(self, vault) -> None:
        self.vault = vault

    def _item(self):
        return next((i for i in self.vault.items("configurazioni") if i.name == AUTH_NAME), None)

    def load(self) -> list[dict]:
        it = self._item()
        if it is None:
            return []
        try:
            return json.loads(self.vault.get(it.id))
        except (ValueError, VaultError):
            return []

    def add(self, address: str, name: str) -> None:
        devs = [d for d in self.load() if d["address"] != address]
        devs.append({"address": address, "name": name, "added": time.strftime("%Y-%m-%d")})
        data = json.dumps(devs, ensure_ascii=False, indent=2).encode()
        it = self._item()
        if it is None:
            self.vault.put("configurazioni", AUTH_NAME, data)
        else:
            self.vault.update(it.id, data=data)

    def is_authorized(self, address: str) -> bool:
        return any(d["address"] == address for d in self.load())


class BluetoothTools(ToolBase):
    category = "bluetooth"

    def __init__(self, ctx, bridge, worker: BleWorker | None = None) -> None:
        super().__init__(ctx, bridge)
        self.worker = worker or BleWorker()
        self.auth = AuthorizedDevices(ctx.vault)
        self.found: list[dict] = []
        row, _ = button_row(
            (tr("Cerca dispositivi", "Scan for devices"), self.scan),
            (tr("Autorizza il selezionato…", "Authorise the selected…"), self.authorize),
            (tr("Collega", "Connect"), self.connect),
            (tr("Scollega", "Disconnect"), self.disconnect),
        )
        self.seconds = QSpinBox()
        self.seconds.setRange(2, 20)
        self.seconds.setValue(5)
        self.seconds.setSuffix(" s")
        row.insertWidget(0, self.seconds)
        self.root.addLayout(row)
        split = QSplitter(Qt.Orientation.Vertical)
        self.table = QTableWidget(0, 5)
        self.table.setHorizontalHeaderLabels([tr("Nome", "Name"), tr("Indirizzo", "Address"), tr("Segnale", "Signal"), tr("Produttori", "Manufacturers"), tr("Autorizzato", "Authorised")])
        self.table.verticalHeader().setVisible(False)
        self.table.setEditTriggers(QTableWidget.EditTrigger.NoEditTriggers)
        self.table.setSelectionBehavior(QTableWidget.SelectionBehavior.SelectRows)
        self.table.horizontalHeader().setSectionResizeMode(0, QHeaderView.ResizeMode.Stretch)
        split.addWidget(self.table)
        gatt = QWidget()
        gv = QVBoxLayout(gatt)
        gv.setContentsMargins(0, 0, 0, 0)
        self.services = QTreeWidget()
        self.services.setHeaderLabels([tr("Servizio / caratteristica", "Service / characteristic"), tr("Proprietà", "Properties")])
        self.services.header().setSectionResizeMode(0, QHeaderView.ResizeMode.Stretch)
        gv.addWidget(self.services)
        row, _ = button_row((tr("Leggi", "Read"), self.read), (tr("Notifiche sì", "Notify on"), self.notify_on), (tr("Notifiche no", "Notify off"), self.notify_off))
        gv.addLayout(row)
        split.addWidget(gatt)
        self.log = QPlainTextEdit()
        self.log.setReadOnly(True)
        split.addWidget(self.log)
        self.root.addWidget(split)
        self.root.addWidget(label(tr("Ci si collega solo ai dispositivi autorizzati (tuoi). Le scansioni non vengono salvate.", "Connections are only allowed to authorised devices (yours). Scans are not saved."), muted=True, wrap=True))
        self.finish()

    def _log(self, text: str) -> None:
        self.log.appendPlainText(f"{stamp()}  {text}")

    def _adapter(self, ok: bool, detail: str) -> None:
        self.ctx.hardware.set_pc("pc.ble", HardwareStatus(Presence.DETECTED if ok else Presence.ABSENT, detail))

    def _ble_fail(self, e: BaseException) -> None:
        if isinstance(e, BleUnavailable):
            self._adapter(False, str(e))
        self.say(tr("Bluetooth: {e}", "Bluetooth: {e}", e=e), True)
        self._log(str(e))

    # ---------------- scansione ----------------

    def scan(self) -> None:
        self.say(tr("Scansione in corso…", "Scanning…"))

        def ok(devs: list[dict]) -> None:
            self._adapter(True, tr("adattatore funzionante", "adapter working"))
            self.show_devices(devs)

        self.bridge.watch(self.worker.scan(self.seconds.value()), ok, self._ble_fail)

    def show_devices(self, devs: list[dict]) -> None:
        self.found = devs
        self.table.setRowCount(len(devs))
        for r, d in enumerate(devs):
            vals = [d["name"] or "—", d["address"], f"{d['rssi']} dBm" if d["rssi"] is not None else "", ", ".join(f"0x{m:04X}" for m in d["manufacturers"]), tr("sì", "yes") if self.auth.is_authorized(d["address"]) else tr("no", "no")]
            for c, v in enumerate(vals):
                self.table.setItem(r, c, QTableWidgetItem(v))
        self.say(tr("{n} dispositivi vicini.", "{n} nearby devices.", n=len(devs)))

    def _selected(self) -> dict | None:
        rows = self.table.selectionModel().selectedRows()
        if not rows:
            self.say(tr("Seleziona un dispositivo.", "Select a device."), True)
            return None
        return self.found[rows[0].row()]

    def authorize(self) -> None:
        d = self._selected()
        if d is None:
            return
        if not common.confirm_sensitive(self, tr("Autorizzare il dispositivo?", "Authorise the device?"), f"{d['name'] or '—'} ({d['address']})"):
            return
        self.auth.add(d["address"], d["name"])
        self.ctx.activity.add("bluetooth", tr("Dispositivo autorizzato: {a}", "Device authorised: {a}", a=d["address"]), "info")
        self.show_devices(self.found)

    # ---------------- GATT ----------------

    def connect(self) -> None:
        d = self._selected()
        if d is None:
            return
        if not self.auth.is_authorized(d["address"]):
            self.say(tr("Prima autorizza il dispositivo (deve essere tuo).", "Authorise the device first (it must be yours)."), True)
            return
        self.say(tr("Collegamento a {a}…", "Connecting to {a}…", a=d["address"]))

        def ok(services: list[dict]) -> None:
            self.show_services(services)
            self._log(tr("Collegato a {a}", "Connected to {a}", a=d["address"]))
            self.ctx.activity.add("bluetooth", tr("Collegato a {a}", "Connected to {a}", a=d["address"]), "info")

        def after_connect(_r) -> None:
            self.bridge.watch(self.worker.services(), ok, self._ble_fail)

        self.bridge.watch(self.worker.connect(d["address"]), after_connect, self._ble_fail)

    def show_services(self, services: list[dict]) -> None:
        self.services.clear()
        for s in services:
            top = QTreeWidgetItem([f"{s['name'] or tr('Servizio', 'Service')} · {s['uuid']}", ""])
            for ch in s["characteristics"]:
                it = QTreeWidgetItem([f"{ch['name'] or tr('Caratteristica', 'Characteristic')} · {ch['uuid']}", ", ".join(ch["properties"])])
                it.setData(0, UUID_ROLE, ch["uuid"])
                top.addChild(it)
            self.services.addTopLevelItem(top)
        self.services.expandAll()
        self.say(tr("{n} servizi.", "{n} services.", n=len(services)))

    def _char(self) -> str | None:
        it = self.services.currentItem()
        uuid = it.data(0, UUID_ROLE) if it else None
        if not uuid:
            self.say(tr("Seleziona una caratteristica.", "Select a characteristic."), True)
        return uuid

    def read(self) -> None:
        uuid = self._char()
        if uuid:
            self.bridge.watch(self.worker.read(uuid), lambda data: self._log(f"{uuid}: {format_value(data)}"), self._ble_fail)

    def notify_on(self) -> None:
        uuid = self._char()
        if uuid:
            cb = lambda u, data: self.bridge.call_in_gui(lambda: self._log(f"↻ {u}: {format_value(data)}"))  # noqa: E731
            self.bridge.watch(self.worker.start_notify(uuid, cb), lambda _r: self._log(tr("Notifiche attive su {u}", "Notifications on for {u}", u=uuid)), self._ble_fail)

    def notify_off(self) -> None:
        uuid = self._char()
        if uuid:
            self.bridge.watch(self.worker.stop_notify(uuid), lambda _r: self._log(tr("Notifiche spente", "Notifications off")), self._ble_fail)

    def disconnect(self) -> None:
        self.bridge.watch(self.worker.disconnect(), lambda _r: (self.services.clear(), self._log(tr("Scollegato", "Disconnected"))), self._ble_fail)
