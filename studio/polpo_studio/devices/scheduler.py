"""Un piccolo pianificatore su un solo thread: le azioni girano in ordine, una alla volta."""

from __future__ import annotations

import heapq
import itertools
import logging
import threading
import time
from collections.abc import Callable

log = logging.getLogger(__name__)


class Handle:
    __slots__ = ("cancelled",)

    def __init__(self) -> None:
        self.cancelled = False

    def cancel(self) -> None:
        self.cancelled = True


class Scheduler:
    def __init__(self, name: str = "pianificatore") -> None:
        self._heap: list[tuple[float, int, Handle, Callable[[], None]]] = []
        self._seq = itertools.count()
        self._cond = threading.Condition()
        self._stop = False
        self._thread = threading.Thread(target=self._run, name=name, daemon=True)
        self._thread.start()

    def call_later(self, delay: float, fn: Callable[[], None]) -> Handle:
        h = Handle()
        with self._cond:
            heapq.heappush(self._heap, (time.monotonic() + max(0.0, delay), next(self._seq), h, fn))
            self._cond.notify()
        return h

    def call_soon(self, fn: Callable[[], None]) -> Handle:
        return self.call_later(0.0, fn)

    def stop(self) -> None:
        with self._cond:
            self._stop = True
            self._cond.notify()
        if threading.current_thread() is not self._thread:
            self._thread.join(timeout=2)

    def _run(self) -> None:
        while True:
            with self._cond:
                while not self._stop and (not self._heap or self._heap[0][0] > time.monotonic()):
                    wait = self._heap[0][0] - time.monotonic() if self._heap else None
                    self._cond.wait(wait)
                if self._stop:
                    return
                _, _, h, fn = heapq.heappop(self._heap)
            if h.cancelled:
                continue
            try:
                fn()
            except Exception:  # un errore non deve fermare il dispositivo simulato
                log.exception("errore in un'azione pianificata")
