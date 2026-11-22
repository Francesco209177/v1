"""Registro delle attività e notifiche.

Le voci restano in memoria per l'interfaccia e vengono salvate solo nel registro cifrato della
cassaforte (``security.audit``), collegato con :meth:`ActivityLog.attach_sink` dopo lo sblocco.
Quelle nate prima dello sblocco aspettano in memoria e vengono salvate subito dopo.
"""

from __future__ import annotations

import logging
import threading
import time
from collections import deque
from collections.abc import Callable
from dataclasses import asdict, dataclass, field

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
    def __init__(self, keep: int = 2000) -> None:
        self._lock = threading.Lock()
        self._entries: deque[Entry] = deque(maxlen=keep)
        self._pending: list[Entry] = []
        self._sink: Callable[[dict], None] | None = None
        self._listeners: list[Callable[[Entry], None]] = []

    def attach_sink(self, sink: Callable[[dict], None], history: list[dict] | None = None) -> None:
        """Collega il registro cifrato: carica le voci passate e salva quelle in attesa."""
        with self._lock:
            old = [Entry(**{k: d[k] for k in ("ts", "category", "message", "level", "simulated")}) for d in history or [] if _valid(d)]
            current = list(self._entries)
            self._entries.clear()
            self._entries.extend(old + current)
            self._sink = sink
            pending, self._pending = self._pending, []
        for e in pending:
            self._write(e)

    def detach_sink(self) -> None:
        with self._lock:
            self._sink = None
            self._entries.clear()

    def _write(self, e: Entry) -> None:
        sink = self._sink
        if sink is None:
            with self._lock:
                self._pending.append(e)
            return
        try:
            sink(asdict(e))
        except Exception as err:  # il registro non deve mai fermare il programma
            log.warning("impossibile salvare nel registro: %s", err)

    def add(self, category: str, message: str, level: str = "info", simulated: bool = False) -> Entry:
        e = Entry(time.time(), category, message, level if level in LEVELS else "info", simulated)
        with self._lock:
            self._entries.append(e)
        self._write(e)
        for cb in list(self._listeners):
            cb(e)
        return e

    def entries(self) -> list[Entry]:
        with self._lock:
            return list(self._entries)

    def on_add(self, cb: Callable[[Entry], None]) -> None:
        self._listeners.append(cb)


def _valid(d: dict) -> bool:
    return isinstance(d, dict) and all(k in d for k in ("ts", "category", "message", "level", "simulated"))


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
