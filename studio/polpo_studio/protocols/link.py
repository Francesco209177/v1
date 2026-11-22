"""Polpo Link: protocollo a righe JSON tra Polpo Studio e il Polpo (USB CDC).

Questa è la copia Python della parte pura del firmware (``polpo/lib/polpo_core/src/polpo/link``).
I test confrontano entrambe con lo stesso file ``polpo/test/golden/link_pure.jsonl``, così il
Polpo virtuale risponde come il dispositivo vero.

    richiesta  {"id":7,"cmd":"ir.send","args":{...}}
    risposta   {"id":7,"ok":true,"data":{...}}   oppure   {"id":7,"ok":false,"error":{"code":"...","msg":"..."}}
    evento     {"ev":"rf.code","data":{...}}
"""

from __future__ import annotations

import base64
import binascii
import json
import zlib
from dataclasses import dataclass, field
from typing import Any

PROTOCOL_VERSION = 1
MAX_LINE = 2048  # byte per riga inviata al Polpo
MAX_CHUNK = 768  # byte di file per blocco fs.read / fs.write
MAX_FILE_SIZE = 256 * 1024
NESTING_LIMIT = 6
# Le risposte del Polpo possono superare 2 KB (elenco reti, pagine NFC): il PC accetta righe più lunghe.
MAX_INCOMING_LINE = 64 * 1024


@dataclass(frozen=True)
class CommandSpec:
    name: str
    needs_session: bool  # serve che l'utente abbia accettato il collegamento sul Polpo
    sensitive: bool  # il Polpo chiede conferma sul suo schermo a ogni uso


_COMMAND_LIST = [
    CommandSpec("ping", False, False),
    CommandSpec("hello", False, False),
    CommandSpec("info", True, False),
    CommandSpec("diag", True, False),
    CommandSpec("bye", True, False),
    CommandSpec("fs.list", True, False),
    CommandSpec("fs.read", True, False),
    CommandSpec("fs.write", True, False),  # sensibile solo in /polpo/badusb
    CommandSpec("fs.delete", True, False),
    CommandSpec("ir.send", True, False),
    CommandSpec("ir.learn.start", True, False),
    CommandSpec("ir.learn.stop", True, False),
    CommandSpec("rf.rx.start", True, False),
    CommandSpec("rf.rx.stop", True, False),
    CommandSpec("rf.raw.start", True, False),
    CommandSpec("rf.raw.snapshot", True, False),
    CommandSpec("rf.raw.stop", True, False),
    CommandSpec("rf.tx", True, True),
    CommandSpec("nfc.read", True, False),
    CommandSpec("nfc.write_ndef", True, True),
    CommandSpec("wifi.scan", True, False),
    CommandSpec("ble.scan", True, False),
    CommandSpec("gpio.i2c_scan", True, False),
    CommandSpec("gpio.pins", True, False),
]
COMMANDS: dict[str, CommandSpec] = {c.name: c for c in _COMMAND_LIST}

ERROR_CODES = (
    "bad_args",
    "io_error",
    "no_hardware",
    "too_large",
    "denied",
    "timeout",
    "unsupported",
    "budget",
    "busy",
    "not_connected",
    "unknown_cmd",
    "bad_json",
    "bad_request",
    "line_too_long",
)


def encode(obj: dict[str, Any]) -> bytes:
    """Una riga compatta in UTF-8, senza il ``\\n`` finale (come serializeJson)."""
    return json.dumps(obj, ensure_ascii=False, separators=(",", ":")).encode("utf-8")


# ---------------- righe ----------------


class LineFramer:
    """Divide il flusso in righe terminate da ``\\n``; ``\\r`` è ignorato.

    Una riga oltre ``max_line`` byte viene scartata fino al ``\\n`` successivo e segnalata una
    sola volta, come ``polpo::link::LineFramer``.
    """

    def __init__(self, max_line: int = MAX_LINE) -> None:
        self.max_line = max_line
        self._buf = bytearray()
        self._overflow = False

    def feed(self, data: bytes) -> list[bytes | None]:
        """Restituisce le righe complete; ``None`` segnala una riga troppo lunga."""
        out: list[bytes | None] = []
        start = 0
        while True:
            nl = data.find(b"\n", start)
            seg = data[start:] if nl < 0 else data[start:nl]
            if b"\r" in seg:
                seg = seg.replace(b"\r", b"")
            if not self._overflow:
                if len(self._buf) + len(seg) > self.max_line:
                    self._overflow = True
                    self._buf.clear()
                    out.append(None)
                else:
                    self._buf += seg
            if nl < 0:
                return out
            if self._overflow:
                self._overflow = False
            else:
                out.append(bytes(self._buf))
            self._buf.clear()
            start = nl + 1


# ---------------- risposte ----------------


def make_ok(req_id: int, data: dict[str, Any] | None = None) -> dict[str, Any]:
    return {"id": req_id, "ok": True, "data": {} if data is None else data}


def make_error(req_id: int, code: str, msg: str) -> dict[str, Any]:
    return {"id": req_id, "ok": False, "error": {"code": code, "msg": msg}}


def make_event(ev: str, data: dict[str, Any]) -> dict[str, Any]:
    return {"ev": ev, "data": data}


# ---------------- validazione ----------------


@dataclass
class Request:
    id: int = 0
    cmd: str = ""
    spec: CommandSpec | None = None
    args: dict[str, Any] = field(default_factory=dict)


def _depth(v: Any) -> int:
    if isinstance(v, dict):
        return 1 + max((_depth(x) for x in v.values()), default=0)
    if isinstance(v, list):
        return 1 + max((_depth(x) for x in v), default=0)
    return 0


def _reject_constant(name: str) -> Any:
    raise ValueError(name)


def _is_uint32(v: Any) -> bool:
    return isinstance(v, int) and not isinstance(v, bool) and 0 <= v <= 0xFFFFFFFF


def preprocess(line: bytes | str, session_active: bool, busy: bool) -> tuple[dict[str, Any] | None, Request]:
    """Valida una riga come ``polpo::link::preprocess``.

    Restituisce ``(risposta, richiesta)``: se la risposta è ``None`` la richiesta va eseguita dal
    dispositivo, altrimenti è la risposta completa da inviare (errore o ``ping``).
    """
    req = Request()
    raw = line.encode("utf-8") if isinstance(line, str) else line
    if len(raw) > MAX_LINE:
        return make_error(0, "line_too_long", "riga oltre 2048 byte"), req
    try:
        doc = json.loads(raw.decode("utf-8"), parse_constant=_reject_constant)
        if _depth(doc) > NESTING_LIMIT:
            raise ValueError("troppo annidato")
    except (ValueError, UnicodeDecodeError):
        return make_error(0, "bad_json", "JSON non valido"), req
    if not isinstance(doc, dict):
        return make_error(0, "bad_request", "serve un oggetto JSON"), req
    if not _is_uint32(doc.get("id")):
        return make_error(0, "bad_request", "manca un id numerico"), req
    req.id = doc["id"]
    cmd = doc.get("cmd")
    if not isinstance(cmd, str):
        return make_error(req.id, "bad_request", "manca il comando"), req
    req.cmd = cmd
    args = doc.get("args")
    if args is not None and not isinstance(args, dict):
        return make_error(req.id, "bad_request", "args deve essere un oggetto"), req
    req.args = args or {}
    req.spec = COMMANDS.get(cmd)
    if req.spec is None:
        return make_error(req.id, "unknown_cmd", "comando sconosciuto"), req
    if cmd == "ping":
        return make_ok(req.id, {"pong": True, "proto": PROTOCOL_VERSION}), req
    if busy:
        return make_error(req.id, "busy", "un'altra richiesta è in corso"), req
    if req.spec.needs_session and not session_active:
        return make_error(req.id, "not_connected", "collegamento non accettato sul Polpo: invia hello"), req
    return None, req


# ---------------- codifiche ----------------


def b64encode(data: bytes) -> str:
    return base64.b64encode(data).decode("ascii")


def b64decode(text: str) -> bytes | None:
    """Base64 RFC 4648 rigoroso; ``None`` se non valido."""
    if len(text) % 4:
        return None
    try:
        return base64.b64decode(text.encode("ascii"), validate=True)
    except (binascii.Error, UnicodeEncodeError):
        return None


def crc32(data: bytes, prev: int = 0) -> int:
    return zlib.crc32(data, prev) & 0xFFFFFFFF


_PATH_CHARS = set("abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789_-./")


def valid_sd_path(p: str) -> bool:
    """Solo percorsi dentro /polpo, senza "..", con caratteri semplici, max 96 caratteri."""
    if not isinstance(p, str) or not 6 <= len(p) <= 96:
        return False
    if not p.startswith("/polpo") or (len(p) > 6 and p[6] != "/"):
        return False
    if ".." in p or "//" in p:
        return False
    return all(c in _PATH_CHARS for c in p)


def is_sensitive_path(p: str) -> bool:
    """Gli script in /polpo/badusb si scrivono solo con conferma sul Polpo."""
    return p.startswith("/polpo/badusb/")


def to_hex(data: bytes, sep: str = "") -> str:
    return sep.join(f"{b:02X}" for b in data)
