"""Percorsi e impostazioni persistenti (JSON nella cartella dati)."""

from __future__ import annotations

import json
import os
import secrets
import threading
from dataclasses import asdict, dataclass, field, fields
from pathlib import Path
from typing import Any, Optional


@dataclass
class Paths:
    data: Path
    backups: Path

    @property
    def settings_file(self) -> Path:
        return self.data / "settings.json"

    @property
    def state_file(self) -> Path:
        return self.data / "state.json"

    @property
    def events_file(self) -> Path:
        return self.data / "events.jsonl"

    @property
    def pairing(self) -> Path:
        return self.data / "pairing"

    @property
    def cache(self) -> Path:
        return self.data / "cache"

    @property
    def current(self) -> Path:
        """Cartella usata da mobilebackup2: dentro c'è <UDID>/."""
        return self.backups / "corrente"

    @property
    def safe_copy(self) -> Path:
        """Copia dell'ultimo backup riuscito (stessa struttura: <UDID>/)."""
        return self.backups / "copia-sicura"

    def ensure(self) -> None:
        for path in (self.data, self.pairing, self.cache, self.backups, self.current, self.safe_copy):
            path.mkdir(parents=True, exist_ok=True)
        for private in (self.data, self.pairing, self.cache):
            try:
                os.chmod(private, 0o700)
            except OSError:
                pass

    @classmethod
    def from_env(cls, data: Optional[str] = None, backups: Optional[str] = None) -> "Paths":
        data_dir = Path(data or os.environ.get("IPHONE_BACKUP_DATA") or "/var/lib/iphone-backup")
        backup_dir = Path(backups or os.environ.get("IPHONE_BACKUP_DIR") or data_dir / "backups")
        return cls(data=data_dir, backups=backup_dir)


@dataclass
class DeviceRecord:
    udid: str
    name: str = "iPhone"
    product_type: str = ""
    ios_version: str = ""
    paired_at: str = ""


@dataclass
class Settings:
    auto_backup: bool = True
    interval_hours: float = 24.0
    retry_minutes: float = 30.0
    extra_hosts: list[str] = field(default_factory=list)
    keep_safe_copy: bool = True
    notify_url: str = ""
    device: Optional[DeviceRecord] = None
    web_password_hash: str = ""
    session_secret: str = ""

    def to_json(self) -> dict[str, Any]:
        data = asdict(self)
        return data

    @classmethod
    def from_json(cls, data: dict[str, Any]) -> "Settings":
        known = {f.name for f in fields(cls)}
        values = {key: value for key, value in data.items() if key in known}
        device = values.get("device")
        if isinstance(device, dict) and device.get("udid"):
            device_known = {f.name for f in fields(DeviceRecord)}
            values["device"] = DeviceRecord(**{k: v for k, v in device.items() if k in device_known})
        else:
            values["device"] = None
        return cls(**values)


class SettingsStore:
    """Legge e salva settings.json in modo atomico (permessi 0600)."""

    def __init__(self, path: Path):
        self.path = path
        self._lock = threading.Lock()
        self.settings = self._load()
        if not self.settings.session_secret:
            self.settings.session_secret = secrets.token_urlsafe(48)
            self.save()

    def _load(self) -> Settings:
        try:
            return Settings.from_json(json.loads(self.path.read_text()))
        except (OSError, ValueError, TypeError):
            return Settings()

    def save(self) -> None:
        with self._lock:
            write_json(self.path, self.settings.to_json())


def write_json(path: Path, data: Any) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_suffix(path.suffix + ".tmp")
    tmp.write_text(json.dumps(data, indent=2, ensure_ascii=False))
    try:
        os.chmod(tmp, 0o600)
    except OSError:
        pass
    tmp.replace(path)


def read_json(path: Path, default: Any) -> Any:
    try:
        return json.loads(path.read_text())
    except (OSError, ValueError):
        return default
