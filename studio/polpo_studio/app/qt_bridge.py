"""Ponte tra i thread di lavoro e l'interfaccia: tutto ciò che tocca i widget gira nel thread di Qt."""

from __future__ import annotations

from collections.abc import Callable
from concurrent.futures import Future
from typing import Any

from PySide6.QtCore import QObject, Signal, Slot

from ..core.events import EventBus


class GuiBridge(QObject):
    """Ripubblica gli eventi del bus nel thread dell'interfaccia (segnale ``event``)."""

    event = Signal(str, object)
    _raw = Signal(str, object)
    _invoke = Signal(object)

    def __init__(self, bus: EventBus) -> None:
        super().__init__()
        self._raw.connect(self._dispatch)
        self._invoke.connect(self._run)
        self._unsub = bus.subscribe("*", lambda topic, payload: self._raw.emit(topic, payload))

    @Slot(str, object)
    def _dispatch(self, topic: str, payload: Any) -> None:
        self.event.emit(topic, payload)

    @Slot(object)
    def _run(self, fn: Callable[[], None]) -> None:
        fn()

    def call_in_gui(self, fn: Callable[[], None]) -> None:
        self._invoke.emit(fn)

    def watch(
        self,
        future: Future,
        on_ok: Callable[[Any], None] | None = None,
        on_err: Callable[[BaseException], None] | None = None,
    ) -> None:
        """Chiama ``on_ok(risultato)`` o ``on_err(eccezione)`` nel thread dell'interfaccia."""

        def done(f: Future) -> None:
            if f.cancelled():
                return
            exc = f.exception()
            if exc is not None:
                if on_err:
                    self.call_in_gui(lambda: on_err(exc))
            elif on_ok:
                res = f.result()
                self.call_in_gui(lambda: on_ok(res))

        future.add_done_callback(done)

    def close(self) -> None:
        self._unsub()
