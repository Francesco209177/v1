"""Registro delle attività, notifiche, cronologia.

In questa versione il registro è un file JSONL in chiaro nella cartella dei dati; la cassaforte
(fase successiva) lo cifra e lo protegge con una catena HMAC.
"""

from __future__ import annotations

import json
import logging
import threading
import time
from collections import deque
from collections.abc import Callable
from dataclasses import asdict, dataclass, field
from pathlib import Path

log = logging.getLogger(__name__)

LEVELS = ("info", "ok", "avviso", "errore")


@dataclass
class Entry:
    ts: float
    category: str  # "polpo", "radio", "nfc", "sistema"...
    message: str
    level: str = "info"
    simulated: bool = False


class ActivityLog:
    def __init__(self, path: Path | None = None, keep: int = 2000) -> None:
        self.path = path
        self._lock = threading.Lock()
        self._entries: deque[Entry] = deque(maxlen=keep)
        self._listeners: list[Callable[[Entry], None]] = []
        if path and path.exists():
            self._load(path)

    def _load(self, path: Path) -> None:
        try:
            for line in path.read_text(encoding="utf-8").splitlines()[-self._entries.maxlen :]:  # type: ignore[index]
                try:
                    d = json.loads(line)
                    self._entries.append(Entry(**{k: d[k] for k in ("ts", "category", "message", "level", "simulated")}))
                except (ValueError, KeyError, TypeError):
                    continue
        except OSError as e:
            log.warning("registro attività non leggibile: %s", e)

    def add(self, category: str, message: str, level: str = "info", simulated: bool = False) -> Entry:
        e = Entry(time.time(), category, message, level if level in LEVELS else "info", simulated)
        with self._lock:
            self._entries.append(e)
            if self.path:
                try:
                    with self.path.open("a", encoding="utf-8") as f:
                        f.write(json.dumps(asdict(e), ensure_ascii=False) + "\n")
                except OSError as err:
                    log.warning("impossibile scrivere il registro: %s", err)
        for cb in list(self._listeners):
            cb(e)
        return e

    def entries(self) -> list[Entry]:
        with self._lock:
            return list(self._entries)

    def on_add(self, cb: Callable[[Entry], None]) -> None:
        self._listeners.append(cb)


@dataclass
class Notification:
    ts: float
    title: str
    text: str
    level: str = "info"
    read: bool = False
    id: int = field(default=0)


class Notifications:
    def __init__(self, keep: int = 200) -> None:
        self._lock = threading.Lock()
        self._items: deque[Notification] = deque(maxlen=keep)
        self._next = 1
        self._listeners: list[Callable[[Notification], None]] = []
        self.enabled = True

    def push(self, title: str, text: str, level: str = "info") -> Notification | None:
        if not self.enabled and level != "errore":
            return None
        with self._lock:
            n = Notification(time.time(), title, text, level, id=self._next)
            self._next += 1
            self._items.appendleft(n)
        for cb in list(self._listeners):
            cb(n)
        return n

    def items(self) -> list[Notification]:
        with self._lock:
            return list(self._items)

    def unread(self) -> int:
        with self._lock:
            return sum(1 for n in self._items if not n.read)

    def mark_all_read(self) -> None:
        with self._lock:
            for n in self._items:
                n.read = True

    def on_push(self, cb: Callable[[Notification], None]) -> None:
        self._listeners.append(cb)
