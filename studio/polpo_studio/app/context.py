"""Oggetti condivisi dell'applicazione, creati una volta all'avvio."""

from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path

from ..core import i18n
from ..core.activity import ActivityLog, Notifications
from ..core.events import EventBus
from ..core.hardware import HardwareState
from ..core.settings import Settings
from ..devices.bridge import BridgeManager
from ..devices.manager import DeviceManager
from ..paths import data_dir
from ..security import crypto
from ..security.audit import AuditLog
from ..security.lab import LabMode
from ..security.vault import Vault


@dataclass
class AppContext:
    settings: Settings
    bus: EventBus
    hardware: HardwareState
    activity: ActivityLog
    notifications: Notifications
    devices: DeviceManager
    data_dir: Path
    vault: Vault
    lab: LabMode
    bridge: BridgeManager
    audit: AuditLog | None = None

    @classmethod
    def create(cls, folder: Path | None = None, kdf_n: int = crypto.KDF_N) -> AppContext:
        folder = folder or data_dir()
        folder.mkdir(parents=True, exist_ok=True)
        settings = Settings(folder / "impostazioni.json")
        i18n.set_language(settings.get("language"))
        bus = EventBus()
        hardware = HardwareState()
        hardware.set_declared(settings.get("declared_hardware"))
        activity = ActivityLog()
        notifications = Notifications()
        notifications.enabled = settings.get("notifications")
        devices = DeviceManager(bus, settings, hardware, activity, notifications)
        vault = Vault(folder / "cassaforte", kdf_n)
        lab = LabMode(on_change=lambda on: bus.publish("lab.changed", enabled=on))
        bridge = BridgeManager(bus, hardware, activity)

        hardware.on_change(lambda: bus.publish("hardware.changed"))
        activity.on_add(lambda e: bus.publish("activity.added", entry=e))
        notifications.on_push(lambda n: bus.publish("notification", item=n))

        def on_setting(key: str, value: object) -> None:
            if key == "declared_hardware":
                hardware.set_declared(value)  # type: ignore[arg-type]
            elif key == "notifications":
                notifications.enabled = bool(value)
            bus.publish("settings.changed", key=key, value=value)

        settings.on_change(on_setting)
        return cls(settings, bus, hardware, activity, notifications, devices, folder, vault, lab, bridge)

    def on_unlocked(self) -> None:
        """Dopo l'apertura della cassaforte: collega il registro cifrato."""
        self.audit = AuditLog(self.vault)
        self.activity.attach_sink(self.audit.append, self.audit.read(last=500))
        self.bus.publish("vault.unlocked")

    def lock_full(self) -> None:
        """Chiude la cassaforte: serve di nuovo la frase (o la chiave di recupero)."""
        self.lab.disable()
        self.activity.detach_sink()
        self.audit = None
        self.vault.lock()
        self.bus.publish("vault.locked")

    def shutdown(self) -> None:
        self.lab.disable()
        self.devices.shutdown()
        self.bridge.shutdown()
        self.vault.lock()
