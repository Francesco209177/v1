"""Polpo Bridge: una scheda Arduino/ESP32 con lo sketch ``studio/bridge`` (Sperimentale).

Usa lo stesso formato a righe JSON di Polpo Link, quindi riusa il client (senza ping e senza
conferme sullo schermo: il Bridge non ha schermo).
"""

from __future__ import annotations

import time
from concurrent.futures import Future, ThreadPoolExecutor
from typing import Any

from ..core.activity import ActivityLog
from ..core.capability import HardwareStatus, Presence
from ..core.events import EventBus
from ..core.hardware import HardwareState
from ..core.i18n import tr
from .link_client import LinkError, PolpoLinkClient, State
from .transport import SerialTransport, Transport, TransportError


class BridgeManager:
    def __init__(self, bus: EventBus, hardware: HardwareState, activity: ActivityLog) -> None:
        self.bus, self.hardware, self.activity = bus, hardware, activity
        self.client: PolpoLinkClient | None = None
        self.info: dict[str, Any] = {}
        self._exec = ThreadPoolExecutor(max_workers=1, thread_name_prefix="bridge")

    @property
    def connected(self) -> bool:
        return self.client is not None and self.client.state != State.CLOSED and bool(self.info)

    def connect(self, port: str, transport: Transport | None = None, boot_wait: float = 6.0) -> Future:
        return self._exec.submit(self._connect, port, transport, boot_wait)

    def _connect(self, port: str, transport: Transport | None, boot_wait: float) -> dict[str, Any]:
        self._disconnect()
        client = PolpoLinkClient(transport or SerialTransport(port), client_name="Polpo Studio", ping_interval=3600, on_state=self._on_state)
        try:
            client.open()
        except TransportError as e:
            raise LinkError("io_error", str(e)) from e
        info: dict[str, Any] | None = None
        end = time.monotonic() + boot_wait  # Arduino Uno si riavvia all'apertura della porta (~2 s)
        while info is None:
            try:
                info = client.call("hello", timeout=1.0)
            except LinkError as e:
                if e.code != "timeout" or time.monotonic() > end:
                    client.close(send_bye=False)
                    raise LinkError("not_bridge", tr("Nessun Polpo Bridge su {p}: carica lo sketch sulla scheda.", "No Polpo Bridge on {p}: upload the sketch to the board.", p=port)) from e
        if info.get("bridge") != "Polpo Bridge":
            client.close(send_bye=False)
            raise LinkError("not_bridge", tr("La scheda su {p} non risponde come Polpo Bridge.", "The board on {p} does not answer as a Polpo Bridge.", p=port))
        self.client, self.info = client, info
        self.hardware.set_pc("bridge", HardwareStatus(Presence.DETECTED, f"{info.get('board')} · {port}"))
        self.activity.add("bridge", tr("Polpo Bridge collegato: {b} su {p}", "Polpo Bridge connected: {b} on {p}", b=info.get("board"), p=port), "ok")
        self.bus.publish("bridge.state", connected=True, info=info)
        return info

    def _on_state(self, state: State, _why: str) -> None:
        if state == State.CLOSED and self.info:
            self.info = {}
            self.hardware.set_pc("bridge", HardwareStatus(Presence.ABSENT, tr("scollegato", "disconnected")))
            self.bus.publish("bridge.state", connected=False, info={})

    def disconnect(self) -> Future:
        return self._exec.submit(self._disconnect)

    def _disconnect(self) -> None:
        client, self.client = self.client, None
        if client is not None:
            client.close(send_bye=False)
        if self.info:
            self.info = {}
            self.hardware.set_pc("bridge", HardwareStatus(Presence.ABSENT, tr("non collegato", "not connected")))
            self.bus.publish("bridge.state", connected=False, info={})

    def request(self, cmd: str, args: dict[str, Any] | None = None, timeout: float = 5.0) -> Future:
        if not self.connected or self.client is None:
            fut: Future = Future()
            fut.set_exception(LinkError("not_connected", tr("Polpo Bridge non collegato", "Polpo Bridge not connected")))
            return fut
        return self.client.request(cmd, args, timeout)

    def shutdown(self) -> None:
        self._disconnect()
        self._exec.shutdown(wait=False, cancel_futures=True)
