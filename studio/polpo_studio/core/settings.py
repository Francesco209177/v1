"""Impostazioni salvate in JSON, con valori predefiniti e controllo dei tipi."""

from __future__ import annotations

import copy
import json
import logging
import os
import threading
from collections.abc import Callable
from pathlib import Path
from typing import Any

log = logging.getLogger(__name__)

THEMES = ("scuro", "chiaro", "alto_contrasto")

DEFAULTS: dict[str, Any] = {
    "language": "it",
    "theme": "scuro",
    "accent": "#7c5cff",
    "font_scale": 1.0,
    "sidebar_order": [],  # id dei moduli nell'ordine voluto (vuoto = ordine standard)
    "hidden_modules": [],
    "favorites": [],
    "notifications": True,
    "ping_interval_s": 10,
    "last_port": "",
    "declared_hardware": {},  # id hardware -> True se l'utente dice che è collegato
    "virtual_confirm_dialog": True,  # le conferme del Polpo virtuale appaiono come finestra
    "dashboard_cards": ["polpo", "notifications", "hardware", "functions", "favorites", "activity"],
    "window_geometry": "",
    "autolock_min": 10,  # blocco rapido dopo minuti di inattività (0 = mai)
    "lab_minutes": 30,  # durata della modalità laboratorio
    "remember_key": False,  # chiave dati nel portachiavi del sistema
    "third_party_apps": {},  # id -> {"version", "sha256": {file: impronta}}
    "icon_style": "linea",  # "linea" oppure "pieno"
    "sidebar_compact": False,  # barra laterale con sole icone
    "density": "comoda",  # "comoda" oppure "compatta"
    "shortcuts": {},  # id azione -> sequenza di tasti (vuoto = predefinita)
}


class Settings:
    def __init__(self, path: Path) -> None:
        self.path = path
        self._lock = threading.Lock()
        self._data: dict[str, Any] = copy.deepcopy(DEFAULTS)
        self._listeners: list[Callable[[str, Any], None]] = []
        self._load()

    def _load(self) -> None:
        if not self.path.exists():
            return
        try:
            raw = json.loads(self.path.read_text(encoding="utf-8"))
            if not isinstance(raw, dict):
                raise ValueError("non è un oggetto")
        except (OSError, ValueError) as e:
            backup = self.path.with_suffix(".json.rotto")
            log.warning("impostazioni illeggibili (%s): copiate in %s, uso i valori predefiniti", e, backup)
            try:
                os.replace(self.path, backup)
            except OSError:
                pass
            return
        for key, default in DEFAULTS.items():
            if key in raw and _same_type(raw[key], default):
                self._data[key] = raw[key]
        if self._data["theme"] not in THEMES:
            self._data["theme"] = DEFAULTS["theme"]
        if self._data["language"] not in ("it", "en"):
            self._data["language"] = "it"

    def get(self, key: str) -> Any:
        with self._lock:
            return copy.deepcopy(self._data[key])

    def set(self, key: str, value: Any) -> None:
        if key not in DEFAULTS:
            raise KeyError(key)
        if not _same_type(value, DEFAULTS[key]):
            raise TypeError(f"{key}: tipo {type(value).__name__} non valido")
        with self._lock:
            if self._data[key] == value:
                return
            self._data[key] = copy.deepcopy(value)
            self._save_locked()
        for cb in list(self._listeners):
            cb(key, value)

    def on_change(self, cb: Callable[[str, Any], None]) -> None:
        self._listeners.append(cb)

    def _save_locked(self) -> None:
        self.path.parent.mkdir(parents=True, exist_ok=True)
        tmp = self.path.with_suffix(".json.tmp")
        tmp.write_text(json.dumps(self._data, ensure_ascii=False, indent=2), encoding="utf-8")
        os.replace(tmp, self.path)


def _same_type(value: Any, default: Any) -> bool:
    if isinstance(default, bool):
        return isinstance(value, bool)
    if isinstance(default, float):
        return isinstance(value, (int, float)) and not isinstance(value, bool)
    if isinstance(default, int):
        return isinstance(value, int) and not isinstance(value, bool)
    return isinstance(value, type(default))
