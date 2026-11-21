"""Registro tecnico (per la diagnostica), separato dal registro delle attività dell'utente."""

from __future__ import annotations

import logging
import logging.handlers
from pathlib import Path


def setup_logging(folder: Path, level: int = logging.INFO) -> Path:
    folder.mkdir(parents=True, exist_ok=True)
    path = folder / "polpo-studio.log"
    root = logging.getLogger()
    if any(getattr(h, "_polpo", False) for h in root.handlers):
        return path
    handler = logging.handlers.RotatingFileHandler(path, maxBytes=1_000_000, backupCount=3, encoding="utf-8")
    handler.setFormatter(logging.Formatter("%(asctime)s %(levelname)s %(name)s: %(message)s"))
    handler._polpo = True  # type: ignore[attr-defined]
    root.addHandler(handler)
    root.setLevel(level)
    return path
