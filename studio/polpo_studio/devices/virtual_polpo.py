"""Polpo virtuale: un dispositivo SIMULATO che parla Polpo Link come il firmware vero.

Serve per provare Polpo Studio senza hardware e per i test. Tutto ciò che produce è segnato come
simulato: le reti Wi-Fi, i dispositivi Bluetooth, i codici radio e il tag NFC sono inventati e si
chiamano "simulato". La validazione delle richieste è la stessa del firmware (file golden).
"""

from __future__ import annotations

import logging
import re
import time
from collections.abc import Callable
from pathlib import Path
from typing import Any

from ..protocols import link, ndef
from ..protocols.link import make_error, make_event, make_ok
from .scheduler import Handle, Scheduler

log = logging.getLogger(__name__)

BOARD = "Polpo virtuale (SIMULATO)"
FIRMWARE = "0.1.0-virtuale"
RF_BUDGET_LIMIT_MS = 288_000  # 8% di un'ora, come il firmware
IR_PROTOCOLS = (
    "NEC", "NECext", "NEC42", "NEC42ext", "Samsung32", "RC5", "RC5X", "RC6",
    "SIRC", "SIRC15", "SIRC20", "Kaseikyo", "RCA", "Pioneer",
)  # fmt: skip
I2C_NAMES = {0x28: "M5 RFID2 (WS1850S)"}

# Tag simulato: NTAG215 con un link di esempio.
_TAG_UID = bytes.fromhex("04A1B2C3D4E580")
_TAG_VERSION = bytes.fromhex("0004040201001103")
_TAG_PAGES = 135
_TAG_USER_FIRST, _TAG_USER_LAST = 4, 129

ConfirmHandler = Callable[[str, str, Callable[[bool], None]], None]


def _default_seed_dir() -> Path:
    return Path(__file__).resolve().parent.parent / "resources" / "virtual_sd"


def _uint(a: dict[str, Any], key: str, default: int) -> int:
    """Come ``a["key"] | default`` in ArduinoJson: un intero non negativo oppure il valore predefinito."""
    v = a.get(key)
    return v if isinstance(v, int) and not isinstance(v, bool) and v >= 0 else default


def _rc_airtime_ms(bits: int, pulse_us: int, repeats: int) -> int:
    # Protocollo 1 di rc-switch: sincronismo 1+31, bit da 4 impulsi (stima del firmware).
    return max(1, ((4 * bits + 32) * pulse_us * repeats) // 1000)


class VirtualPolpo:
    def __init__(
        self,
        *,
        time_scale: float = 1.0,
        latency: float = 0.01,
        session_timeout: float = 120.0,
        confirm_timeout: float = 20.0,
        auto_confirm: bool = True,
        auto_confirm_delay: float = 0.8,
        confirm_handler: ConfirmHandler | None = None,
        seed_dir: Path | None = None,
        sd_present: bool = True,
        rfid2: bool = True,
        tag_present: bool = True,
    ) -> None:
        self.time_scale = time_scale
        self.latency = latency
        self.session_timeout = session_timeout
        self.confirm_timeout = confirm_timeout
        self.auto_confirm = auto_confirm
        self.auto_confirm_delay = auto_confirm_delay
        self.confirm_handler = confirm_handler
        self.sd_present = sd_present
        self.rfid2 = rfid2
        self.tag_present = tag_present
        self.ir_repeats = 1
        self.rf_repeats = 4

        self._sched = Scheduler("polpo-virtuale")
        self._send: Callable[[bytes], None] | None = None
        self._framer = link.LineFramer()
        self._started = time.monotonic()
        self.session = False
        self.client_name = ""
        self.commands_done = 0
        self.last_cmd = ""
        self._last_rx = time.monotonic()
        self._pending: str | None = None  # "confirm", "wifi", "ble", "nfc_write"
        self._pending_token = 0
        self._streams: dict[str, Handle] = {}
        self._rf_raw_on = False
        self._budget: list[tuple[float, int]] = []
        self.files: dict[str, bytes] = {}
        self.dirs: set[str] = {"/polpo"}
        self.tag_pages = self._blank_tag()
        self._write_tag(ndef.wrap_tlv(ndef.uri_message("https://example.org/polpo-simulato")))
        if sd_present:
            self._seed(seed_dir or _default_seed_dir())
        self._tick = self._sched.call_later(1.0, self._housekeeping)

    # ---------------- collegamento ----------------

    def attach(self, send: Callable[[bytes], None]) -> None:
        """``send`` riceve ogni riga in uscita (senza ``\\n``)."""
        self._send = send

    def detach(self) -> None:
        self._send = None
        self._sched.call_soon(self._end_session_silent)

    def shutdown(self) -> None:
        self._send = None
        self._sched.stop()

    def feed(self, data: bytes) -> None:
        """Byte in arrivo dal PC (qualsiasi thread)."""
        self._sched.call_later(self.latency, lambda: self._on_bytes(data))

    def close_on_device(self) -> None:
        """Come premere Indietro sulla schermata "Collegato al PC"."""
        self._sched.call_soon(self._end_session)

    @property
    def busy(self) -> bool:
        return self._pending is not None

    # ---------------- interno ----------------

    def _t(self, seconds: float) -> float:
        return seconds * self.time_scale

    def _out(self, obj: dict[str, Any]) -> None:
        if self._send is not None:
            self._send(link.encode(obj))

    def _ok(self, rid: int, data: dict[str, Any] | None = None) -> None:
        self._out(make_ok(rid, data))

    def _err(self, rid: int, code: str, msg: str) -> None:
        self._out(make_error(rid, code, msg))

    def _emit(self, ev: str, data: dict[str, Any]) -> None:
        self._out(make_event(ev, data))

    def _on_bytes(self, data: bytes) -> None:
        for line in self._framer.feed(data):
            if line is None:
                self._err(0, "line_too_long", "riga oltre 2048 byte")
                continue
            self._last_rx = time.monotonic()
            resp, req = link.preprocess(line, self.session, self.busy)
            if resp is not None:
                self._out(resp)
            else:
                self._handle(req)

    def _housekeeping(self) -> None:
        if self.session and not self.busy and time.monotonic() - self._last_rx > self.session_timeout:
            self._end_session()
        self._tick = self._sched.call_later(min(1.0, self.session_timeout / 4), self._housekeeping)

    def _stop_streams(self) -> None:
        for h in self._streams.values():
            h.cancel()
        self._streams.clear()
        self._rf_raw_on = False

    def _end_session(self) -> None:
        if not self.session:
            return
        self.session = False
        self._stop_streams()
        self._emit("link.closed", {"reason": "closed_on_device"})

    def _end_session_silent(self) -> None:
        self.session = False
        self._stop_streams()

    # ---------------- conferme sullo "schermo" ----------------

    def _ask(self, title: str, body: str, then: Callable[[bool], None]) -> None:
        self._pending = "confirm"
        self._pending_token += 1
        token = self._pending_token

        def resolve(yes: bool) -> None:
            if self._pending != "confirm" or self._pending_token != token:
                return  # già deciso (o scaduto)
            self._pending = None
            then(yes)

        def respond(yes: bool) -> None:
            self._sched.call_soon(lambda: resolve(bool(yes)))

        self._sched.call_later(self._t(self.confirm_timeout), lambda: resolve(False))
        if self.confirm_handler is not None:
            self.confirm_handler(title, body, respond)
        elif self.auto_confirm:
            self._sched.call_later(self._t(self.auto_confirm_delay), lambda: resolve(True))

    # ---------------- microSD simulata ----------------

    def _seed(self, root: Path) -> None:
        self.dirs.update(f"/polpo/{d}" for d in ("ir", "rf433", "nfc", "badusb", "logs"))  # come sd_template
        if not root.is_dir():
            return
        for p in sorted(root.rglob("*")):
            rel = "/" + p.relative_to(root).as_posix()
            if p.is_dir():
                self.dirs.add(rel)
            elif p.name != ".gitkeep":
                self.files[rel] = p.read_bytes()
                self.dirs.add(rel.rsplit("/", 1)[0])
        self.files["/polpo/rf433/presa_simulata.sub"] = (
            "Filetype: Flipper SubGhz Key File\nVersion: 1\nFrequency: 433920000\n"
            "Preset: FuriHalSubGhzPresetOok650Async\nProtocol: Princeton\nBit: 24\n"
            "Key: 00 00 00 00 00 51 5A 01\nTE: 350\n"
        ).encode()
        self.files["/polpo/rf433/fuori_banda_simulato.sub"] = (
            "Filetype: Flipper SubGhz Key File\nVersion: 1\nFrequency: 868350000\n"
            "Preset: FuriHalSubGhzPresetOok650Async\nProtocol: Princeton\nBit: 24\n"
            "Key: 00 00 00 00 00 12 34 56\nTE: 350\n"
        ).encode()
        self.dirs.add("/polpo/rf433")

    def _used_bytes(self) -> int:
        return sum(len(v) for v in self.files.values()) + 4096 * len(self.dirs)

    def _check_path(self, rid: int, args: dict[str, Any]) -> str | None:
        path = args.get("path", "")
        if not isinstance(path, str) or not link.valid_sd_path(path):
            self._err(rid, "bad_args", "percorso non valido (solo dentro /polpo)")
            return None
        if not self.sd_present:
            self._err(rid, "no_hardware", "microSD assente")
            return None
        return path

    def _fs_list(self, rid: int, args: dict[str, Any]) -> None:
        path = self._check_path(rid, args)
        if path is None:
            return
        if path not in self.dirs:
            return self._err(rid, "io_error", "cartella non leggibile")
        prefix = path.rstrip("/") + "/"
        entries = []
        for d in sorted(self.dirs):
            if d.startswith(prefix) and "/" not in d[len(prefix) :]:
                entries.append({"name": d[len(prefix) :], "dir": True, "size": 0})
        for f in sorted(self.files):
            if f.startswith(prefix) and "/" not in f[len(prefix) :]:
                entries.append({"name": f[len(prefix) :], "dir": False, "size": len(self.files[f])})
        self._ok(rid, {"path": path, "entries": entries})

    def _fs_read(self, rid: int, args: dict[str, Any]) -> None:
        path = self._check_path(rid, args)
        if path is None:
            return
        data = self.files.get(path)
        if data is None:
            return self._err(rid, "io_error", "file non trovato")
        offset = _uint(args, "offset", 0)
        length = min(_uint(args, "len", link.MAX_CHUNK), link.MAX_CHUNK)
        chunk = data[offset : offset + length] if offset < len(data) else b""
        self._ok(
            rid,
            {
                "size": len(data),
                "offset": offset,
                "data": link.b64encode(chunk),
                "crc32": link.crc32(chunk),
                "eof": offset + len(chunk) >= len(data),
            },
        )

    def _do_fs_write(self, rid: int, path: str, offset: int, data: bytes, final: bool) -> None:
        tmp = path + ".part"
        current = self.files.get(tmp, b"") if offset else b""
        if len(current) != offset:
            return self._err(rid, "bad_args", "offset non coerente: riparti da 0")
        if offset + len(data) > link.MAX_FILE_SIZE:
            self.files.pop(tmp, None)
            return self._err(rid, "too_large", "file oltre 256 KB")
        parent = path.rsplit("/", 1)[0]
        if parent not in self.dirs:
            return self._err(rid, "io_error", "scrittura non riuscita")
        self.files[tmp] = current + data
        if final:
            self.files[path] = self.files.pop(tmp)
        self._ok(rid, {"written": offset + len(data), "final": final})

    def _fs_write(self, rid: int, args: dict[str, Any]) -> None:
        path = self._check_path(rid, args)
        if path is None:
            return
        raw = args.get("data", "")
        data = link.b64decode(raw) if isinstance(raw, str) else None
        if data is None or len(data) > link.MAX_CHUNK:
            return self._err(rid, "bad_args", "dati base64 non validi o blocco troppo grande")
        if link.crc32(data) != _uint(args, "crc32", 0):
            return self._err(rid, "bad_args", "CRC32 diverso: blocco danneggiato")
        offset = _uint(args, "offset", 0)
        final = args.get("final") is True
        if offset == 0 and link.is_sensitive_path(path):
            body = f"Il PC vuole salvare uno script BadUSB:\n{path}\nAccetti?"

            def then(yes: bool) -> None:
                if not yes:
                    return self._err(rid, "denied", "rifiutato sul Polpo")
                self._do_fs_write(rid, path, 0, data, final)

            return self._ask("Script dal PC", body, then)
        self._do_fs_write(rid, path, offset, data, final)

    def _fs_delete(self, rid: int, args: dict[str, Any]) -> None:
        path = self._check_path(rid, args)
        if path is None:
            return
        if path in self.files:
            del self.files[path]
        elif path in self.dirs and path != "/polpo" and not any(
            x.startswith(path + "/") for x in list(self.files) + list(self.dirs)
        ):
            self.dirs.discard(path)
        else:
            return self._err(rid, "io_error", "file non trovato")
        self._ok(rid)

    # ---------------- informazioni ----------------

    def info(self) -> dict[str, Any]:
        return {
            "proto": link.PROTOCOL_VERSION,
            "firmware": FIRMWARE,
            "board": BOARD,
            "virtual": True,
            "battery": 80,
            "charging": False,
            "heap_free": 182_000,
            "uptime_s": int(time.monotonic() - self._started),
            "sd": {
                "ok": self.sd_present,
                "total": 8 * 1024**3 if self.sd_present else 0,
                "used": self._used_bytes() if self.sd_present else 0,
            },
            "modules": {
                "ir_tx": "simulated",
                "wifi": "simulated",
                "ble": "simulated",
                "usb_hid": "simulated",
                "rfid2": "simulated" if self.rfid2 else "missing",
                "rf433": "simulated",
                "ir_unit": "simulated",
            },
            "rf_budget": {"used_ms": self._budget_used(), "limit_ms": RF_BUDGET_LIMIT_MS},
            "level": 1,
            "layout": "IT",
        }

    def _budget_used(self) -> int:
        now = time.monotonic()
        self._budget = [(t, ms) for t, ms in self._budget if now - t < 3600]
        return sum(ms for _, ms in self._budget)

    # ---------------- NFC simulato ----------------

    def _blank_tag(self) -> bytearray:
        u = _TAG_UID
        mem = bytearray(_TAG_PAGES * 4)
        bcc0 = 0x88 ^ u[0] ^ u[1] ^ u[2]
        bcc1 = u[3] ^ u[4] ^ u[5] ^ u[6]
        mem[0:4] = bytes([u[0], u[1], u[2], bcc0])
        mem[4:8] = u[3:7]
        mem[8:12] = bytes([bcc1, 0x48, 0x00, 0x00])
        mem[12:16] = bytes([0xE1, 0x10, 0x3E, 0x00])
        return mem

    def _write_tag(self, tlv: bytes) -> bool:
        first, last = _TAG_USER_FIRST * 4, (_TAG_USER_LAST + 1) * 4
        if len(tlv) > last - first:
            return False
        self.tag_pages[first:last] = tlv + bytes(last - first - len(tlv))
        return True

    def _card(self) -> dict[str, Any]:
        return {
            "present": True,
            "uid": link.to_hex(_TAG_UID),
            "atqa": 0x0044,
            "sak": 0x00,
            "family": "NFC Type 2 (NTAG / MIFARE Ultralight)",
            "model": "NTAG215",
            "version": link.to_hex(_TAG_VERSION),
            "simulated": True,
        }

    # ---------------- smistamento ----------------

    def _handle(self, r: link.Request) -> None:
        rid, c, a = r.id, r.cmd, r.args
        self.last_cmd = c
        self.commands_done += 1
        if c == "hello":
            self.client_name = a.get("client") if isinstance(a.get("client"), str) else "Polpo Studio"
            if self.session:
                return self._ok(rid, self.info())

            def then(yes: bool) -> None:
                if not yes:
                    return self._err(rid, "denied", "collegamento rifiutato sul Polpo")
                self.session = True
                self._last_rx = time.monotonic()
                self._ok(rid, self.info())

            body = f'"{self.client_name}" chiede di controllare il Polpo via USB. Accetti?'
            return self._ask("Collegare al PC?", body, then)
        if c == "info":
            return self._ok(rid, self.info())
        if c == "bye":
            self._ok(rid)
            return self._end_session()
        if c == "diag":
            d = self.info()
            d["sd_test"] = self.sd_present
            d["i2c"] = [0x28] if self.rfid2 else []
            return self._ok(rid, d)
        if c == "fs.list":
            return self._fs_list(rid, a)
        if c == "fs.read":
            return self._fs_read(rid, a)
        if c == "fs.write":
            return self._fs_write(rid, a)
        if c == "fs.delete":
            return self._fs_delete(rid, a)
        if c == "ir.send":
            return self._ir_send(rid, a)
        if c == "ir.learn.start":
            self._start_stream("ir", 2.0, 4.0, self._ir_learned_samples())
            return self._ok(rid)
        if c == "ir.learn.stop":
            self._stop_stream("ir")
            return self._ok(rid)
        if c == "rf.rx.start":
            self._rf_raw_on = False
            self._start_stream("rf", 1.5, 3.0, self._rf_samples())
            return self._ok(rid)
        if c == "rf.rx.stop":
            self._stop_stream("rf")
            return self._ok(rid)
        if c == "rf.raw.start":
            self._stop_stream("rf")
            self._rf_raw_on = True
            return self._ok(rid)
        if c == "rf.raw.snapshot":
            if not self._rf_raw_on:
                return self._err(rid, "bad_args", "avvia prima rf.raw.start")
            return self._ok(rid, self._raw_snapshot())
        if c == "rf.raw.stop":
            self._rf_raw_on = False
            return self._ok(rid)
        if c == "rf.tx":
            return self._rf_tx(rid, a)
        if c == "nfc.read":
            if not self.rfid2:
                return self._err(rid, "no_hardware", "modulo RFID2 non trovato sulla porta Grove")
            if not self.tag_present:
                return self._ok(rid, {"present": False})
            d = self._card()
            d["pages"] = link.to_hex(bytes(self.tag_pages[: (_TAG_USER_LAST + 1) * 4]))
            return self._ok(rid, d)
        if c == "nfc.write_ndef":
            return self._nfc_write(rid, a)
        if c == "wifi.scan":
            self._pending = "wifi"
            self._sched.call_later(self._t(2.0), lambda: self._finish("wifi", rid, self._wifi_results()))
            return
        if c == "ble.scan":
            ms = min(_uint(a, "ms", 4000), 10000)
            self._pending = "ble"
            self._sched.call_later(self._t(ms / 1000), lambda: self._finish("ble", rid, self._ble_results()))
            return
        if c == "gpio.i2c_scan":
            devs = [{"addr": 0x28, "name": I2C_NAMES[0x28]}] if self.rfid2 else []
            return self._ok(rid, {"devices": devs})
        if c == "gpio.pins":
            return self._ok(rid, {"g1": 1, "g2": 1})
        self._err(rid, "unknown_cmd", "comando non gestito")

    def _finish(self, kind: str, rid: int, data: dict[str, Any]) -> None:
        if self._pending == kind:
            self._pending = None
            self._ok(rid, data)

    # ---------------- infrarossi ----------------

    def _ir_send(self, rid: int, a: dict[str, Any]) -> None:
        if isinstance(a.get("file"), str):
            path, name = a["file"], a.get("name", "")
            if not link.valid_sd_path(path):
                return self._err(rid, "bad_args", "percorso non valido")
            data = self.files.get(path)
            if data is None:
                return self._err(rid, "io_error", "file .ir non leggibile")
            names = re.findall(r"^name:\s*(.+?)\s*$", data.decode("utf-8", "replace"), re.M)
            if name not in names:
                return self._err(rid, "bad_args", "tasto non trovato nel file")
        elif a.get("raw"):
            t = a.get("timings")
            if not isinstance(t, list) or not t or not all(isinstance(x, int) and 0 < x < 100_000 for x in t):
                return self._err(rid, "bad_args", "tempi RAW non validi")
        else:
            proto = a.get("protocol")
            if not isinstance(proto, str) or proto.lower() not in {p.lower() for p in IR_PROTOCOLS}:
                return self._err(rid, "bad_args", "protocollo IR sconosciuto")
        self._ok(rid)

    def _ir_learned_samples(self) -> list[tuple[str, dict[str, Any]]]:
        return [
            ("ir.learned", {"protocol": "NEC", "address": 4, "command": 8, "simulated": True}),
            ("ir.learned", {"protocol": "Samsung32", "address": 7, "command": 2, "simulated": True}),
            ("ir.learned", {"raw": True, "timings": [9000, 4500, 560, 560, 560, 1690, 560], "simulated": True}),
        ]

    # ---------------- radio ----------------

    def _rf_samples(self) -> list[tuple[str, dict[str, Any]]]:
        return [
            ("rf.code", {"protocol": 1, "bits": 24, "value": "0000000000515A01", "pulse_us": 350, "simulated": True}),
            ("rf.code", {"protocol": 1, "bits": 24, "value": "0000000000515A02", "pulse_us": 352, "simulated": True}),
        ]

    def _start_stream(self, key: str, first: float, every: float, samples: list[tuple[str, dict[str, Any]]]) -> None:
        self._stop_stream(key)
        state = {"i": 0}

        def step() -> None:
            if key not in self._streams or not self.session:
                return
            ev, data = samples[state["i"] % len(samples)]
            state["i"] += 1
            self._emit(ev, dict(data))
            self._streams[key] = self._sched.call_later(self._t(every), step)

        self._streams[key] = self._sched.call_later(self._t(first), step)

    def _stop_stream(self, key: str) -> None:
        h = self._streams.pop(key, None)
        if h:
            h.cancel()

    def _raw_snapshot(self) -> dict[str, Any]:
        bits = 0x515A01
        t: list[int] = []
        for _ in range(3):
            for i in range(23, -1, -1):
                t += [1050, -350] if (bits >> i) & 1 else [350, -1050]
            t += [350, -10850]
        return {
            "count": len(t),
            "timings": t[:300],
            "stats": {"short_us": 350, "long_us": 1050, "ratio": 3.0, "min_us": 350, "max_us": 10850},
            "simulated": True,
        }

    def _rf_tx(self, rid: int, a: dict[str, Any]) -> None:
        path = a.get("file", "")
        if not isinstance(path, str) or not link.valid_sd_path(path):
            return self._err(rid, "bad_args", "percorso non valido")
        data = self.files.get(path)
        if data is None:
            return self._err(rid, "io_error", "file .sub non leggibile")
        text = data.decode("utf-8", "replace")
        m = re.search(r"^Frequency:\s*(\d+)", text, re.M)
        if not m:
            return self._err(rid, "unsupported", "manca la riga Frequency")
        freq = int(m.group(1))
        if not 433_050_000 <= freq <= 434_790_000:
            return self._err(rid, "unsupported", "il modulo RF433T trasmette solo a 433,92 MHz")
        proto = re.search(r"^Protocol:\s*(\S+)", text, re.M)
        if not proto or proto.group(1) not in ("Princeton", "Polpo_RCSwitch", "RAW"):
            return self._err(rid, "unsupported", "protocollo non supportato (solo codici fissi Princeton o RAW)")
        bits_m = re.search(r"^Bit:\s*(\d+)", text, re.M)
        te_m = re.search(r"^TE:\s*(\d+)", text, re.M)
        cost = _rc_airtime_ms(int(bits_m.group(1)) if bits_m else 24, int(te_m.group(1)) if te_m else 350, self.rf_repeats)
        name = path.rsplit("/", 1)[-1]

        def then(yes: bool) -> None:
            if not yes:
                return self._err(rid, "denied", "rifiutato sul Polpo")
            self._stop_stream("rf")
            if self._budget_used() + cost > RF_BUDGET_LIMIT_MS:
                return self._err(rid, "budget", "limite orario di trasmissione raggiunto: riprova più tardi")
            self._budget.append((time.monotonic(), cost))
            self._ok(rid, {"budget_used_ms": self._budget_used(), "simulated": True})

        self._ask("Trasmettere?", f"Il PC chiede di trasmettere a 433,92 MHz:\n{name}\nSolo dispositivi tuoi.", then)

    # ---------------- NFC ----------------

    def _nfc_write(self, rid: int, a: dict[str, Any]) -> None:
        kind, value = a.get("kind", ""), a.get("value", "")
        if not isinstance(value, str) or not value or len(value.encode()) > 400:
            return self._err(rid, "bad_args", "contenuto vuoto o troppo lungo")
        if kind == "uri":
            msg = ndef.uri_message(value)
        elif kind == "text":
            lang = a.get("lang", "it")
            msg = ndef.text_message(value, lang if isinstance(lang, str) else "it")
        else:
            return self._err(rid, "bad_args", "kind deve essere uri o text")
        tlv = ndef.wrap_tlv(msg)

        def write() -> None:
            if self._pending != "nfc_write":
                return
            self._pending = None
            if not self.tag_present:
                return self._err(rid, "timeout", "nessun tag appoggiato entro 15 s")
            if not self._write_tag(tlv):
                return self._err(rid, "denied", "scrittura rifiutata: messaggio troppo grande per il tag")
            self._ok(rid, {"model": "NTAG215", "bytes": len(tlv), "uid": link.to_hex(_TAG_UID), "simulated": True})

        def then(yes: bool) -> None:
            if not yes:
                return self._err(rid, "denied", "rifiutato sul Polpo")
            if not self.rfid2:
                return self._err(rid, "no_hardware", "modulo RFID2 non trovato sulla porta Grove")
            self._pending = "nfc_write"
            self._sched.call_later(self._t(1.0 if self.tag_present else 15.0), write)

        self._ask("Scrivere un tag?", f"Il PC vuole scrivere su un tag NFC TUO:\n{value}", then)

    # ---------------- Wi-Fi e Bluetooth simulati ----------------

    def _wifi_results(self) -> dict[str, Any]:
        nets = [
            ("Rete simulata - casa", "02:00:00:00:10:01", -48, 6, 3),
            ("Rete simulata - ospiti", "02:00:00:00:10:02", -63, 11, 0),
            ("Rete simulata - ufficio", "02:00:00:00:10:03", -77, 1, 7),
        ]
        return {
            "networks": [
                {"ssid": s, "bssid": b, "rssi": r, "channel": ch, "auth": au} for s, b, r, ch, au in nets
            ],
            "simulated": True,
        }

    def _ble_results(self) -> dict[str, Any]:
        devs = [
            ("Sensore simulato", "02:00:00:00:20:01", -55, 0xFFFF, True),
            ("Cuffie simulate", "02:00:00:00:20:02", -71, 0x0000, True),
            ("", "02:00:00:00:20:03", -88, 0x0000, False),
        ]
        return {
            "devices": [
                {"name": n, "addr": ad, "rssi": r, "mfr_id": m, "connectable": c} for n, ad, r, m, c in devs
            ],
            "simulated": True,
        }
