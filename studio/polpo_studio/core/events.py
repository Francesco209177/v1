"""Bus degli eventi: i moduli pubblicano, l'interfaccia ascolta. Indipendente da Qt."""

from __future__ import annotations

import logging
import threading
from collections.abc import Callable
from typing import Any

log = logging.getLogger(__name__)

Handler = Callable[[str, dict[str, Any]], None]


class EventBus:
    def __init__(self) -> None:
        self._lock = threading.Lock()
        self._subs: dict[str, list[Handler]] = {}

    def subscribe(self, topic: str, handler: Handler) -> Callable[[], None]:
        """``topic`` "*" riceve tutto. Restituisce la funzione per annullare l'iscrizione."""
        with self._lock:
            self._subs.setdefault(topic, []).append(handler)

        def unsubscribe() -> None:
            with self._lock:
                if handler in self._subs.get(topic, []):
                    self._subs[topic].remove(handler)

        return unsubscribe

    def publish(self, topic: str, **payload: Any) -> None:
        with self._lock:
            handlers = list(self._subs.get(topic, [])) + list(self._subs.get("*", []))
        for h in handlers:
            try:
                h(topic, payload)
            except Exception:
                log.exception("errore in un gestore di %s", topic)
