"""Cartelle di Polpo Studio: dati dell'utente e risorse incluse nel programma."""

from __future__ import annotations

import os
import sys
from pathlib import Path


def data_dir() -> Path:
    """Dati dell'utente (impostazioni, registro, cassaforte). ``POLPO_STUDIO_HOME`` la sostituisce."""
    env = os.environ.get("POLPO_STUDIO_HOME")
    if env:
        p = Path(env)
    elif sys.platform == "win32":
        p = Path(os.environ.get("APPDATA") or Path.home()) / "PolpoStudio"
    elif sys.platform == "darwin":
        p = Path.home() / "Library" / "Application Support" / "PolpoStudio"
    else:
        p = Path(os.environ.get("XDG_DATA_HOME") or Path.home() / ".local" / "share") / "polpo-studio"
    p.mkdir(parents=True, exist_ok=True)
    return p


def resources_dir() -> Path:
    """Risorse incluse (anche dentro il pacchetto PyInstaller)."""
    base = getattr(sys, "_MEIPASS", None)
    if base:
        return Path(base) / "polpo_studio" / "resources"
    return Path(__file__).resolve().parent / "resources"
