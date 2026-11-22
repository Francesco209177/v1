"""Gestore del Polpo: apre il collegamento (USB o virtuale), tiene aggiornato l'hardware, pubblica eventi."""

from __future__ import annotations

import logging
import threading
from collections.abc import Callable
from concurrent.futures import Future, ThreadPoolExecutor
from typing import Any

from ..core.activity import ActivityLog, Notifications
from ..core.capability import Presence
from ..core.events import EventBus
from ..core.hardware import HardwareState
from ..core.i18n import tr
from ..core.settings import Settings
from .link_client import LinkError, PolpoLinkClient, State
from .transport import SerialTransport, Transport, TransportError, VirtualTransport
from .virtual_polpo import ConfirmHandler, VirtualPolpo

log = logging.getLogger(__name__)


class DeviceManager:
    def __init__(
        self,
        bus: EventBus,
        settings: Settings,
        hardware: HardwareState,
        activity: ActivityLog,
        notifications: Notifications,
    ) -> None:
        self.bus = bus
        self.settings = settings
        self.hardware = hardware
        self.activity = activity
        self.notifications = notifications
        self.client: PolpoLinkClient | None = None
        self.virtual: VirtualPolpo | None = None
        self.virtual_confirm: ConfirmHandler | None = None
        self.virtual_options: dict[str, Any] = {}
        self.info: dict[str, Any] = {}
        self._lock = threading.Lock()
        self._exec = ThreadPoolExecutor(max_workers=2, thread_name_prefix="polpo-lavoro")

    # ---------------- stato ----------------

    @property
    def connected(self) -> bool:
        return self.client is not None and self.client.state == State.CONNECTED

    @property
    def simulated(self) -> bool:
        return self.client is not None and self.client.simulated

    def describe(self) -> str:
        if not self.client or self.client.state == State.CLOSED:
            return tr("Polpo non collegato", "Polpo not connected")
        name = self.client.transport.name
        if self.client.state == State.CONNECTED:
            return tr("Collegato: {n}", "Connected: {n}", n=name)
        if self.client.state == State.WAITING:
            return tr("Conferma sullo schermo del Polpo…", "Confirm on the Polpo screen…")
        return tr("Porta aperta, collegamento non accettato", "Port open, connection not accepted")

    # ---------------- collegamento ----------------

    def connect_serial(self, port: str) -> Future:
        return self._exec.submit(self._connect, lambda: SerialTransport(port), port)

    def connect_virtual(self) -> Future:
        def make() -> Transport:
            dev = VirtualPolpo(confirm_handler=self.virtual_confirm, **self.virtual_options)
            self.virtual = dev
            return VirtualTransport(dev)

        return self._exec.submit(self._connect, make, "")

    def disconnect(self) -> Future:
        return self._exec.submit(self._disconnect)

    def shutdown(self) -> None:
        try:
            self._disconnect()
        finally:
            self._exec.shutdown(wait=False, cancel_futures=True)

    def _phase(self, phase: str, text: str) -> None:
        self.bus.publish("polpo.phase", phase=phase, text=text)

    def _connect(self, make: Callable[[], Transport], port: str) -> dict[str, Any]:
        self._disconnect()
        transport = make()
        client = PolpoLinkClient(
            transport,
            ping_interval=float(self.settings.get("ping_interval_s")),
            on_event=self._on_event,
            on_state=lambda st, why: self._on_state(client, st, why),
        )
        with self._lock:
            self.client = client
        sim = transport.simulated
        try:
            self._phase("opening", tr("Apro {p}…", "Opening {p}…", p=transport.name))
            try:
                client.open()
            except TransportError as e:
                raise LinkError("io_error", str(e)) from e
            self._phase("probing", tr("Cerco il Polpo…", "Looking for the Polpo…"))
            client.probe()
            self._phase("waiting_accept", tr("Accetta il collegamento sullo schermo del Polpo", "Accept the connection on the Polpo screen"))
            info = client.hello()
        except Exception:
            with self._lock:
                if self.client is client:
                    self.client = None
            client.close(send_bye=False)
            self._phase("failed", "")
            raise
        self.info = info
        self.hardware.set_polpo(Presence.SIMULATED if sim else Presence.DETECTED, info.get("modules") or {})
        if port:
            self.settings.set("last_port", port)
        what = transport.name
        self.activity.add("polpo", tr("Collegato a {w} (firmware {f})", "Connected to {w} (firmware {f})", w=what, f=info.get("firmware", "?")), "ok", sim)
        self.bus.publish("polpo.info", info=info, simulated=sim)
        self._phase("connected", "")
        return info

    def _disconnect(self) -> None:
        with self._lock:
            client, self.client = self.client, None
        if client is not None:
            client.close(send_bye=True)
        if self.virtual is not None:
            self.virtual.shutdown()
            self.virtual = None
        self.info = {}
        self.hardware.set_polpo(Presence.ABSENT)

    # ---------------- richieste ----------------

    def request(self, cmd: str, args: dict[str, Any] | None = None, timeout: float | None = None) -> Future:
        client = self.client
        if client is None or client.state != State.CONNECTED:
            fut: Future = Future()
            fut.set_exception(LinkError("not_connected", tr("Polpo non collegato", "Polpo not connected")))
            return fut
        return client.request(cmd, args, timeout)

    def run(self, fn: Callable[[PolpoLinkClient], Any]) -> Future:
        """Esegue un'operazione lunga (es. trasferimento file) in un thread di lavoro."""

        def job() -> Any:
            client = self.client
            if client is None or client.state != State.CONNECTED:
                raise LinkError("not_connected", tr("Polpo non collegato", "Polpo not connected"))
            return fn(client)

        return self._exec.submit(job)

    def refresh_info(self) -> Future:
        def job(c: PolpoLinkClient) -> dict[str, Any]:
            info = c.call("info")
            self.info = info
            self.hardware.set_polpo(Presence.SIMULATED if c.simulated else Presence.DETECTED, info.get("modules") or {})
            self.bus.publish("polpo.info", info=info, simulated=c.simulated)
            return info

        return self.run(job)

    # ---------------- dal client ----------------

    def _on_state(self, client: PolpoLinkClient, state: State, why: str) -> None:
        if client is not self.client and state != State.CLOSED:
            return
        sim = client.simulated
        self.bus.publish("polpo.state", state=state.value, why=why, simulated=sim, responsive=client.responsive)
        if state in (State.OPEN, State.CLOSED) and self.info:
            self.info = {}
            self.hardware.set_polpo(Presence.ABSENT)
            if why in ("chiuso sul Polpo", "scollegato", "sessione scaduta sul Polpo"):
                text = {
                    "chiuso sul Polpo": tr("Collegamento chiuso sullo schermo del Polpo.", "Connection closed on the Polpo screen."),
                    "scollegato": tr("Il Polpo è stato scollegato.", "The Polpo was unplugged."),
                    "sessione scaduta sul Polpo": tr("Sessione scaduta sul Polpo.", "Session expired on the Polpo."),
                }[why]
                self.activity.add("polpo", text, "avviso", sim)
                self.notifications.push(tr("Polpo", "Polpo"), text, "avviso")

    def _on_event(self, ev: str, data: dict[str, Any]) -> None:
        client = self.client
        sim = client.simulated if client else False
        self.bus.publish("polpo.event", ev=ev, data=data, simulated=sim)
