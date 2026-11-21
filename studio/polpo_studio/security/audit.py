"""Registro delle attività cifrato e protetto da una catena HMAC.

Ogni riga è cifrata (AES-256-GCM) e porta l'HMAC della riga precedente: cambiare, togliere o
riordinare una riga rompe la catena. Un piccolo file "testa" cifrato ricorda l'ultima riga, così
anche il taglio delle righe finali viene scoperto.
"""

from __future__ import annotations

import json
import threading
from pathlib import Path
from typing import Any

from . import crypto
from .crypto import IntegrityError
from .vault import Vault, _write_atomic

ZERO = "0" * 64


class AuditLog:
    def __init__(self, vault: Vault) -> None:
        self.vault = vault
        self._lock = threading.Lock()
        self._seq = 0
        self._last = ZERO
        self._k_enc = vault.key_for("registro-cifratura")
        self._k_mac = vault.key_for("registro-hmac")
        if self.path.exists():
            lines = self._lines()
            if lines:
                tail = json.loads(lines[-1])
                self._seq, self._last = int(tail["seq"]), str(tail["mac"])

    @property
    def path(self) -> Path:
        return self.vault.folder / "registro.log"

    @property
    def head_path(self) -> Path:
        return self.vault.folder / "registro.testa"

    def _lines(self) -> list[str]:
        return [x for x in self.path.read_text(encoding="utf-8").splitlines() if x.strip()]

    def _aad(self, what: str, seq: int | str = "") -> bytes:
        return f"polpo-{what}|{self.vault.id}|{seq}".encode()

    def append(self, entry: dict[str, Any]) -> None:
        with self._lock:
            seq = self._seq + 1
            c = crypto.b64e(crypto.seal(self._k_enc, json.dumps(entry, ensure_ascii=False).encode(), self._aad("log", seq)))
            m = crypto.mac(self._k_mac, f"{seq}|{c}|{self._last}".encode())
            with self.path.open("a", encoding="utf-8") as f:
                f.write(json.dumps({"seq": seq, "c": c, "prev": self._last, "mac": m}) + "\n")
            self._seq, self._last = seq, m
            head = json.dumps({"seq": seq, "mac": m}).encode()
            _write_atomic(self.head_path, crypto.seal(self._k_enc, head, self._aad("log-head")))

    def read(self, last: int | None = None) -> list[dict[str, Any]]:
        """Le voci (decifrate); le righe illeggibili vengono saltate (le segnala ``verify``)."""
        if not self.path.exists():
            return []
        lines = self._lines()
        if last is not None:
            lines = lines[-last:]
        out = []
        for line in lines:
            try:
                d = json.loads(line)
                out.append(json.loads(crypto.unseal(self._k_enc, crypto.b64d(d["c"]), self._aad("log", d["seq"]))))
            except (ValueError, KeyError, IntegrityError):
                continue
        return out

    def verify(self) -> list[str]:
        """Restituisce l'elenco dei problemi (vuoto = registro integro)."""
        problems: list[str] = []
        lines = self._lines() if self.path.exists() else []
        prev, expected = ZERO, 1
        for n, line in enumerate(lines, start=1):
            try:
                d = json.loads(line)
                seq, c, p, m = int(d["seq"]), str(d["c"]), str(d["prev"]), str(d["mac"])
            except (ValueError, KeyError, TypeError):
                problems.append(f"riga {n}: formato non valido")
                prev = ""
                continue
            if seq != expected:
                problems.append(f"riga {n}: numero {seq} invece di {expected} (righe tolte o spostate)")
            if p != prev:
                problems.append(f"riga {n}: non segue la riga precedente")
            if not crypto.mac_ok(self._k_mac, f"{seq}|{c}|{p}".encode(), m):
                problems.append(f"riga {n}: HMAC non valido (riga modificata)")
            try:
                crypto.unseal(self._k_enc, crypto.b64d(c), self._aad("log", seq))
            except (ValueError, IntegrityError):
                problems.append(f"riga {n}: contenuto alterato")
            prev, expected = m, seq + 1
        if self.head_path.exists():
            try:
                head = json.loads(crypto.unseal(self._k_enc, self.head_path.read_bytes(), self._aad("log-head")))
                if lines and (head["seq"] != expected - 1 or head["mac"] != prev):
                    problems.append("le ultime righe del registro sono state tolte o sostituite")
                if not lines and head["seq"]:
                    problems.append("il registro è stato svuotato")
            except (ValueError, KeyError, IntegrityError):
                problems.append("file di controllo del registro alterato")
        elif lines:
            problems.append("manca il file di controllo del registro")
        return problems
