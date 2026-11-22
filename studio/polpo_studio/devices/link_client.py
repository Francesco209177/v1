"""Client Polpo Link: richieste numerate, una alla volta, con ping periodico e trasferimento file."""

from __future__ import annotations

import itertools
import json
import logging
import threading
import time
from collections import deque
from collections.abc import Callable
from concurrent.futures import Future
from dataclasses import dataclass
from enum import Enum
from typing import Any

from ..protocols import link
from .transport import Transport, TransportError

log = logging.getLogger(__name__)

DEFAULT_TIMEOUT = 6.0
# Tempo massimo per comando: alcune operazioni aspettano la conferma sullo schermo del Polpo (20 s).
TIMEOUTS = {
    "hello": 35.0,
    "rf.tx": 35.0,
    "nfc.write_ndef": 45.0,
    "wifi.scan": 15.0,
    "ble.scan": 16.0,
    "diag": 10.0,
}
PING_TIMEOUT = 5.0
MISSED_PINGS_UNRESPONSIVE = 3


class LinkError(Exception):
    def __init__(self, code: str, msg: str) -> None:
        super().__init__(msg)
        self.code = code
        self.msg = msg

    def __str__(self) -> str:
        return self.msg


class State(str, Enum):
    CLOSED = "closed"  # porta chiusa
    OPEN = "open"  # porta aperta, collegamento non ancora accettato sul Polpo
    WAITING = "waiting_accept"  # in attesa della conferma sullo schermo del Polpo
    CONNECTED = "connected"


@dataclass
class _Req:
    id: int
    cmd: str
    line: bytes
    future: Future
    deadline: float


EventCallback = Callable[[str, dict[str, Any]], None]
StateCallback = Callable[["State", str], None]


class PolpoLinkClient:
    def __init__(
        self,
        transport: Transport,
        *,
        client_name: str = "Polpo Studio",
        ping_interval: float = 10.0,
        on_event: EventCallback | None = None,
        on_state: StateCallback | None = None,
        busy_retry: float = 0.3,
    ) -> None:
        self.transport = transport
        self.client_name = client_name
        self.ping_interval = ping_interval
        self.on_event = on_event
        self.on_state = on_state
        self.busy_retry = busy_retry
        self.state = State.CLOSED
        self.info: dict[str, Any] = {}
        self.responsive = True
        self._ids = itertools.count(1)
        self._lock = threading.RLock()
        self._queue: deque[_Req] = deque()
        self._inflight: _Req | None = None
        self._pings: dict[int, _Req] = {}
        self._retry_at = 0.0
        self._last_ping = 0.0
        self._missed_pings = 0
        self._stop = threading.Event()
        self._house: threading.Thread | None = None

    @property
    def simulated(self) -> bool:
        return self.transport.simulated

    # ---------------- ciclo di vita ----------------

    def open(self) -> None:
        self.transport.open(self._on_line, self._on_closed)
        self._stop.clear()
        self._set_state(State.OPEN, "porta aperta")
        self._house = threading.Thread(target=self._housekeeping, name="polpo-link", daemon=True)
        self._house.start()

    def close(self, send_bye: bool = True) -> None:
        if self.state == State.CONNECTED and send_bye:
            try:
                self.request("bye", timeout=1.5).result(timeout=2)
            except Exception:
                pass
        self._stop.set()
        try:
            self.transport.close()
        finally:
            self._fail_all(LinkError("closed", "collegamento chiuso"))
            self._set_state(State.CLOSED, "chiuso da Polpo Studio")

    def probe(self, timeout: float = 2.5) -> dict[str, Any]:
        """Verifica che dall'altra parte ci sia un Polpo (``ping`` non richiede la conferma)."""
        try:
            data = self.request("ping", timeout=timeout).result(timeout=timeout + 1)
        except LinkError as e:
            if e.code == "timeout":
                raise LinkError("not_polpo", "Nessuna risposta: su questa porta non c'è un Polpo con Polpo Link") from e
            raise
        if not data.get("pong"):
            raise LinkError("not_polpo", "Risposta inattesa: non sembra un Polpo")
        if data.get("proto") != link.PROTOCOL_VERSION:
            raise LinkError(
                "unsupported",
                f"Il Polpo usa il protocollo {data.get('proto')}, Polpo Studio il {link.PROTOCOL_VERSION}: aggiorna il firmware",
            )
        return data

    def hello(self, timeout: float | None = None) -> dict[str, Any]:
        """Chiede il collegamento: l'utente deve accettare sullo schermo del Polpo."""
        self._set_state(State.WAITING, "conferma sul Polpo")
        try:
            info = self.call("hello", {"client": self.client_name}, timeout=timeout)
        except LinkError:
            if self.state == State.WAITING:
                self._set_state(State.OPEN, "collegamento non accettato")
            raise
        self.info = info
        self._last_ping = time.monotonic()
        self._set_state(State.CONNECTED, "collegato")
        return info

    # ---------------- richieste ----------------

    def request(self, cmd: str, args: dict[str, Any] | None = None, timeout: float | None = None) -> Future:
        fut: Future = Future()
        if self.state == State.CLOSED:
            fut.set_exception(LinkError("closed", "Polpo non collegato"))
            return fut
        rid = next(self._ids) & 0x7FFFFFFF
        obj: dict[str, Any] = {"id": rid, "cmd": cmd}
        if args:
            obj["args"] = args
        line = link.encode(obj)
        if len(line) > link.MAX_LINE:
            fut.set_exception(LinkError("line_too_long", "richiesta oltre 2048 byte"))
            return fut
        t = timeout if timeout is not None else (PING_TIMEOUT if cmd == "ping" else TIMEOUTS.get(cmd, DEFAULT_TIMEOUT))
        req = _Req(rid, cmd, line, fut, time.monotonic() + t)
        to_send: list[_Req] = []
        with self._lock:
            if cmd == "ping":  # il Polpo risponde al ping anche mentre è occupato
                self._pings[rid] = req
                to_send.append(req)
            else:
                self._queue.append(req)
                to_send += self._pump()
        self._send(to_send)
        return fut

    def call(self, cmd: str, args: dict[str, Any] | None = None, timeout: float | None = None) -> dict[str, Any]:
        """Versione bloccante di :meth:`request` (da non usare nel thread dell'interfaccia)."""
        fut = self.request(cmd, args, timeout)
        return fut.result()

    def _pump(self) -> list[_Req]:
        if self._inflight is None and self._queue and time.monotonic() >= self._retry_at:
            self._inflight = self._queue.popleft()
            return [self._inflight]
        return []

    def _send(self, reqs: list[_Req]) -> None:
        for r in reqs:
            try:
                self.transport.write_line(r.line)
            except TransportError as e:
                self._complete(r, LinkError("io_error", str(e)))

    def _complete(self, r: _Req, result: dict[str, Any] | LinkError) -> None:
        with self._lock:
            if self._inflight is r:
                self._inflight = None
            self._pings.pop(r.id, None)
            nxt = self._pump()
        if not r.future.done():
            if isinstance(result, LinkError):
                r.future.set_exception(result)
            else:
                r.future.set_result(result)
        self._send(nxt)

    # ---------------- ricezione ----------------

    def _on_line(self, line: bytes) -> None:
        try:
            msg = json.loads(line.decode("utf-8"))
        except (ValueError, UnicodeDecodeError):
            log.warning("riga non JSON dal Polpo: %r", line[:120])
            return
        if not isinstance(msg, dict):
            return
        if "ev" in msg:
            ev, data = str(msg.get("ev")), msg.get("data") or {}
            if ev == "link.closed":
                self._fail_all(LinkError("not_connected", "collegamento chiuso sul Polpo"))
                self._set_state(State.OPEN, "chiuso sul Polpo")
            if self.on_event:
                self.on_event(ev, data if isinstance(data, dict) else {})
            return
        rid = msg.get("id")
        if not isinstance(rid, int):
            log.warning("risposta senza id numerico dal Polpo")
            return
        with self._lock:
            req = self._pings.get(rid)
            if req is None and self._inflight is not None and (rid == self._inflight.id or rid == 0):
                req = self._inflight
        if req is None:
            log.info("risposta senza richiesta (in ritardo?): id=%s", rid)
            return
        if msg.get("ok") is True:
            if req.cmd == "ping":
                self._missed_pings = 0
                if not self.responsive:
                    self.responsive = True
                    self._notify_state("risponde di nuovo")
            data = msg.get("data")
            self._complete(req, data if isinstance(data, dict) else {})
            return
        err = msg.get("error") or {}
        code, text = str(err.get("code", "io_error")), str(err.get("msg", "errore sconosciuto"))
        if code == "busy" and req.cmd != "ping" and time.monotonic() + self.busy_retry < req.deadline:
            with self._lock:  # il Polpo sta finendo un'altra operazione: riprova tra poco
                if self._inflight is req:
                    self._inflight = None
                    self._queue.appendleft(req)
                    self._retry_at = time.monotonic() + self.busy_retry
            return
        if code == "not_connected" and self.state == State.CONNECTED:
            self._set_state(State.OPEN, "sessione scaduta sul Polpo")
        self._complete(req, LinkError(code, text))

    def _on_closed(self, reason: str) -> None:
        self._stop.set()
        self._fail_all(LinkError("closed", "Polpo scollegato" if reason == "unplugged" else "porta chiusa"))
        self._set_state(State.CLOSED, "scollegato" if reason == "unplugged" else reason)

    # ---------------- manutenzione ----------------

    def _housekeeping(self) -> None:
        while not self._stop.wait(0.1):
            now = time.monotonic()
            expired: list[_Req] = []
            with self._lock:
                if self._inflight is not None and now > self._inflight.deadline:
                    expired.append(self._inflight)
                for r in list(self._queue):
                    if now > r.deadline:
                        self._queue.remove(r)
                        expired.append(r)
                for r in list(self._pings.values()):
                    if now > r.deadline:
                        expired.append(r)
                to_send = self._pump()
            for r in expired:
                if r.cmd == "ping":
                    self._missed_pings += 1
                    if self._missed_pings >= MISSED_PINGS_UNRESPONSIVE and self.responsive:
                        self.responsive = False
                        self._notify_state("non risponde")
                self._complete(r, LinkError("timeout", "il Polpo non ha risposto in tempo"))
            self._send(to_send)
            if self.state == State.CONNECTED and now - self._last_ping >= self.ping_interval:
                self._last_ping = now
                fut = self.request("ping")
                fut.add_done_callback(lambda f: f.exception())  # l'esito conta solo per "responsive"

    def _fail_all(self, err: LinkError) -> None:
        with self._lock:
            reqs = list(self._queue) + list(self._pings.values())
            if self._inflight is not None:
                reqs.append(self._inflight)
            self._queue.clear()
            self._pings.clear()
            self._inflight = None
        for r in reqs:
            if not r.future.done():
                r.future.set_exception(err)

    def _set_state(self, state: State, why: str) -> None:
        changed = state != self.state
        self.state = state
        if changed:
            self._notify_state(why)

    def _notify_state(self, why: str) -> None:
        if self.on_state:
            try:
                self.on_state(self.state, why)
            except Exception:
                log.exception("errore nel gestore dello stato")

    # ---------------- file ----------------

    def read_file(self, path: str, progress: Callable[[int, int], None] | None = None) -> bytes:
        out = bytearray()
        offset = 0
        while True:
            for attempt in range(3):
                d = self.call("fs.read", {"path": path, "offset": offset, "len": link.MAX_CHUNK})
                size = int(d.get("size", 0))
                if size > link.MAX_FILE_SIZE:
                    raise LinkError("too_large", "file oltre 256 KB")
                chunk = link.b64decode(str(d.get("data", "")))
                if chunk is not None and link.crc32(chunk) == d.get("crc32"):
                    break
                log.warning("blocco %d di %s danneggiato, nuovo tentativo", offset, path)
            else:
                raise LinkError("io_error", "blocco danneggiato tre volte: controlla il cavo USB")
            out += chunk
            offset += len(chunk)
            if progress:
                progress(offset, size)
            if d.get("eof") or not chunk:
                return bytes(out)

    def write_file(self, path: str, data: bytes, progress: Callable[[int, int], None] | None = None) -> None:
        if len(data) > link.MAX_FILE_SIZE:
            raise LinkError("too_large", "file oltre 256 KB")
        if not link.valid_sd_path(path):
            raise LinkError("bad_args", "percorso non valido (solo dentro /polpo, senza spazi né accenti)")
        chunks = [data[i : i + link.MAX_CHUNK] for i in range(0, len(data), link.MAX_CHUNK)] or [b""]
        offset = 0
        for i, ch in enumerate(chunks):
            args = {
                "path": path,
                "offset": offset,
                "data": link.b64encode(ch),
                "crc32": link.crc32(ch),
                "final": i == len(chunks) - 1,
            }
            confirm = offset == 0 and link.is_sensitive_path(path)
            self.call("fs.write", args, timeout=35.0 if confirm else None)
            offset += len(ch)
            if progress:
                progress(offset, len(data))
