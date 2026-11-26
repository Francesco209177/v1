"""Registro degli eventi (file JSON lines) mostrato nella pagina Registro e nel journal di systemd."""

from __future__ import annotations

import json
import threading
from datetime import datetime
from pathlib import Path


class EventLog:
    MAX_LINES = 2000

    def __init__(self, path: Path):
        self.path = path
        self._lock = threading.Lock()

    def add(self, message: str, level: str = "info") -> None:
        entry = {"time": datetime.now().isoformat(timespec="seconds"), "level": level, "message": message}
        print(f"[{entry['time']}] {level.upper()}: {message}", flush=True)
        with self._lock:
            try:
                with self.path.open("a", encoding="utf-8") as handle:
                    handle.write(json.dumps(entry, ensure_ascii=False) + "\n")
                self._trim()
            except OSError:
                pass

    def info(self, message: str) -> None:
        self.add(message, "info")

    def success(self, message: str) -> None:
        self.add(message, "ok")

    def warning(self, message: str) -> None:
        self.add(message, "warning")

    def error(self, message: str) -> None:
        self.add(message, "error")

    def recent(self, limit: int = 300) -> list[dict]:
        try:
            lines = self.path.read_text(encoding="utf-8").splitlines()
        except OSError:
            return []
        result = []
        for line in lines[-limit:]:
            try:
                result.append(json.loads(line))
            except ValueError:
                continue
        return list(reversed(result))

    def _trim(self) -> None:
        try:
            lines = self.path.read_text(encoding="utf-8").splitlines()
        except OSError:
            return
        if len(lines) > self.MAX_LINES * 1.2:
            self.path.write_text("\n".join(lines[-self.MAX_LINES:]) + "\n", encoding="utf-8")
