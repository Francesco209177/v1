"""Oggetti condivisi dell'applicazione, creati una volta all'avvio."""

from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path

from ..core import i18n
from ..core.activity import ActivityLog, Notifications
from ..core.events import EventBus
from ..core.hardware import HardwareState
from ..core.settings import Settings
from ..devices.manager import DeviceManager
from ..paths import data_dir


@dataclass
class AppContext:
    settings: Settings
    bus: EventBus
    hardware: HardwareState
    activity: ActivityLog
    notifications: Notifications
    devices: DeviceManager
    data_dir: Path

    @classmethod
    def create(cls, folder: Path | None = None) -> AppContext:
        folder = folder or data_dir()
        folder.mkdir(parents=True, exist_ok=True)
        settings = Settings(folder / "impostazioni.json")
        i18n.set_language(settings.get("language"))
        bus = EventBus()
        hardware = HardwareState()
        hardware.set_declared(settings.get("declared_hardware"))
        activity = ActivityLog(folder / "attivita.jsonl")
        notifications = Notifications()
        notifications.enabled = settings.get("notifications")
        devices = DeviceManager(bus, settings, hardware, activity, notifications)

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
        return cls(settings, bus, hardware, activity, notifications, devices, folder)

    def shutdown(self) -> None:
        self.devices.shutdown()
