"""Cassaforte cifrata di Polpo Studio.

* Una **chiave dati** casuale (AES-256) cifra file e metadati.
* La chiave dati è salvata due volte, "avvolta" con chiavi ricavate (scrypt) dalla **frase di accesso**
  e dalla **chiave di recupero**: basta una delle due per aprire la cassaforte.
* Ogni file è cifrato con AES-256-GCM; i dati aggiuntivi autenticati (AAD) legano il contenuto al suo
  id e alla sua versione, così un file scambiato o vecchio non passa la verifica.
* Il **PIN** è solo un blocco rapido mentre il programma è aperto: senza la chiave dati in memoria non
  apre nulla. Dopo 5 errori la chiave viene tolta dalla memoria e serve la frase.
* "Ricorda su questo computer" salva la chiave dati nel portachiavi del sistema operativo: comodo, ma
  chi usa il tuo account del computer può aprire la cassaforte.
"""

from __future__ import annotations

import json
import os
import threading
import time
import uuid
from dataclasses import asdict, dataclass, field
from pathlib import Path
from typing import Any

from . import crypto
from .crypto import IntegrityError

KEYRING_SERVICE = "Polpo Studio"
MAX_PIN_ERRORS = 5
CATEGORIES = ("nfc", "rfid", "radio", "ir", "ibutton", "diagnostica", "configurazioni", "app", "backup", "altro")


class VaultError(Exception):
    def __init__(self, code: str, msg: str) -> None:
        super().__init__(msg)
        self.code = code


@dataclass
class Item:
    id: str
    category: str
    name: str
    created: float
    modified: float
    version: int
    size: int
    sha256: str
    origin: str = "reale"  # "reale" oppure "simulato" (dal Polpo virtuale)
    meta: dict[str, Any] = field(default_factory=dict)

    @property
    def simulated(self) -> bool:
        return self.origin == "simulato"


@dataclass
class Problem:
    item_id: str
    what: str


def _write_atomic(path: Path, data: bytes) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_name(path.name + ".tmp")
    with open(tmp, "wb") as f:
        f.write(data)
        f.flush()
        os.fsync(f.fileno())
    os.replace(tmp, path)


class Vault:
    def __init__(self, folder: Path, kdf_n: int = crypto.KDF_N) -> None:
        self.folder = folder
        self.kdf_n = kdf_n
        self._lock = threading.RLock()
        self._dek: bytearray | None = None
        self._keys: dict[str, Any] = {}
        self._index: dict[str, Item] = {}
        self.pin_errors = 0
        self.quick_locked = False
        if self.keys_path.exists():
            self._keys = json.loads(self.keys_path.read_text(encoding="utf-8"))

    # ---------------- percorsi ----------------

    @property
    def keys_path(self) -> Path:
        return self.folder / "chiavi.json"

    @property
    def index_path(self) -> Path:
        return self.folder / "indice.bin"

    @property
    def objects(self) -> Path:
        return self.folder / "oggetti"

    @property
    def id(self) -> str:
        return self._keys.get("id", "")

    def exists(self) -> bool:
        return self.keys_path.exists()

    @property
    def unlocked(self) -> bool:
        return self._dek is not None

    # ---------------- chiavi ----------------

    def _aad(self, slot: str) -> bytes:
        return f"polpo-vault|{self.id}|{slot}".encode()

    def _wrap(self, slot: str, secret: bytes) -> dict[str, str]:
        assert self._dek is not None
        salt = os.urandom(16)
        kek = crypto.derive(secret, salt, self._keys["kdf"]["n"], self._keys["kdf"]["r"], self._keys["kdf"]["p"])
        return {"salt": crypto.b64e(salt), "blob": crypto.b64e(crypto.seal(kek, bytes(self._dek), self._aad(slot)))}

    def _unwrap(self, slot: str, secret: bytes) -> bytes:
        s = self._keys["slots"][slot]
        k = self._keys["kdf"]
        kek = crypto.derive(secret, crypto.b64d(s["salt"]), k["n"], k["r"], k["p"])
        return crypto.unseal(kek, crypto.b64d(s["blob"]), self._aad(slot))

    def _save_keys(self) -> None:
        _write_atomic(self.keys_path, json.dumps(self._keys, indent=2).encode())

    def _key(self, purpose: str) -> bytes:
        if self._dek is None:
            raise VaultError("locked", "cassaforte chiusa")
        return crypto.hkdf(bytes(self._dek), purpose)

    def key_for(self, purpose: str) -> bytes:
        """Chiave derivata per un altro componente (es. il registro attività)."""
        return self._key("ext|" + purpose)

    def create(self, passphrase: str) -> str:
        """Crea la cassaforte; restituisce la chiave di recupero da conservare."""
        with self._lock:
            if self.exists():
                raise VaultError("exists", "la cassaforte esiste già")
            self._keys = {
                "format": "polpo-vault",
                "version": 1,
                "id": uuid.uuid4().hex,
                "created": time.time(),
                "kdf": {"alg": "scrypt", "n": self.kdf_n, "r": crypto.KDF_R, "p": crypto.KDF_P},
                "slots": {},
                "pin": None,
            }
            self._dek = bytearray(os.urandom(32))
            recovery = crypto.new_recovery_key()
            raw = crypto.normalize_recovery_key(recovery)
            assert raw is not None
            self._keys["slots"]["frase"] = self._wrap("frase", passphrase.encode())
            self._keys["slots"]["recupero"] = self._wrap("recupero", raw)
            self.objects.mkdir(parents=True, exist_ok=True)
            self._index = {}
            self._save_index()
            self._save_keys()
            return recovery

    def unlock(self, passphrase: str) -> None:
        self._unlock_slot("frase", passphrase.encode(), "frase di accesso sbagliata")

    def unlock_recovery(self, key_text: str) -> None:
        raw = crypto.normalize_recovery_key(key_text)
        if raw is None:
            raise VaultError("bad_key", "la chiave di recupero ha 32 caratteri (lettere e cifre da 2 a 7)")
        self._unlock_slot("recupero", raw, "chiave di recupero sbagliata")

    def _unlock_slot(self, slot: str, secret: bytes, err: str) -> None:
        with self._lock:
            if not self.exists():
                raise VaultError("missing", "la cassaforte non esiste ancora")
            try:
                dek = self._unwrap(slot, secret)
            except IntegrityError:
                raise VaultError("wrong", err) from None
            self._open_with(dek)

    def _open_with(self, dek: bytes) -> None:
        self._dek = bytearray(dek)
        try:
            self._load_index()
        except IntegrityError:
            self.lock()
            raise VaultError("corrupt", "indice della cassaforte alterato o danneggiato") from None
        self.pin_errors = 0
        self.quick_locked = False

    def lock(self) -> None:
        """Toglie la chiave dati dalla memoria (per quanto Python lo permette)."""
        with self._lock:
            if self._dek is not None:
                for i in range(len(self._dek)):
                    self._dek[i] = 0
            self._dek = None
            self._index = {}
            self.quick_locked = False

    def change_passphrase(self, old: str, new: str) -> None:
        with self._lock:
            try:
                self._unwrap("frase", old.encode())
            except IntegrityError:
                raise VaultError("wrong", "frase di accesso attuale sbagliata") from None
            self._keys["slots"]["frase"] = self._wrap("frase", new.encode())
            self._save_keys()

    def check_passphrase(self, passphrase: str) -> bool:
        try:
            self._unwrap("frase", passphrase.encode())
            return True
        except IntegrityError:
            return False

    def new_recovery_key(self) -> str:
        with self._lock:
            if self._dek is None:
                raise VaultError("locked", "cassaforte chiusa")
            recovery = crypto.new_recovery_key()
            raw = crypto.normalize_recovery_key(recovery)
            assert raw is not None
            self._keys["slots"]["recupero"] = self._wrap("recupero", raw)
            self._save_keys()
            return recovery

    # ---------------- PIN (blocco rapido) ----------------

    @property
    def has_pin(self) -> bool:
        return bool(self._keys.get("pin"))

    def set_pin(self, pin: str) -> None:
        if not (pin.isdigit() and 4 <= len(pin) <= 12):
            raise VaultError("bad_pin", "il PIN ha da 4 a 12 cifre")
        with self._lock:
            salt = os.urandom(16)
            self._keys["pin"] = {"salt": crypto.b64e(salt), "mac": crypto.mac(self._key("pin"), salt + pin.encode())}
            self._save_keys()

    def clear_pin(self) -> None:
        with self._lock:
            self._keys["pin"] = None
            self._save_keys()

    def quick_lock(self) -> None:
        """Blocco dello schermo: la chiave resta in memoria, serve il PIN (o la frase) per riprendere."""
        self.quick_locked = True

    def unlock_pin(self, pin: str) -> bool:
        """``True`` se il PIN è giusto. Dopo 5 errori la cassaforte si chiude del tutto."""
        with self._lock:
            if self._dek is None or not self.has_pin:
                return False
            p = self._keys["pin"]
            if crypto.mac_ok(self._key("pin"), crypto.b64d(p["salt"]) + pin.encode(), p["mac"]):
                self.pin_errors = 0
                self.quick_locked = False
                return True
            self.pin_errors += 1
            if self.pin_errors >= MAX_PIN_ERRORS:
                self.lock()
            return False

    # ---------------- portachiavi del sistema ----------------

    def remember_on_this_computer(self, enabled: bool) -> None:
        import keyring

        if enabled:
            if self._dek is None:
                raise VaultError("locked", "cassaforte chiusa")
            try:
                keyring.set_password(KEYRING_SERVICE, self.id, crypto.b64e(bytes(self._dek)))
            except Exception as e:
                raise VaultError("keyring", f"portachiavi del sistema non disponibile: {e}") from e
        else:
            try:
                keyring.delete_password(KEYRING_SERVICE, self.id)
            except Exception:
                pass

    def try_keyring(self) -> bool:
        try:
            import keyring

            secret = keyring.get_password(KEYRING_SERVICE, self.id)
        except Exception:
            return False
        if not secret:
            return False
        try:
            self._open_with(crypto.b64d(secret))
        except (VaultError, ValueError):
            return False
        return True

    # ---------------- indice ----------------

    def _index_aad(self) -> bytes:
        return f"polpo-index|{self.id}".encode()

    def _load_index(self) -> None:
        if not self.index_path.exists():
            self._index = {}
            return
        raw = crypto.unseal(self._key("index"), self.index_path.read_bytes(), self._index_aad())
        data = json.loads(raw)
        self._index = {d["id"]: Item(**d) for d in data["items"]}

    def _save_index(self) -> None:
        data = {"version": 1, "items": [asdict(i) for i in self._index.values()]}
        blob = crypto.seal(self._key("index"), json.dumps(data, ensure_ascii=False).encode(), self._index_aad())
        _write_atomic(self.index_path, blob)

    def _obj_aad(self, item_id: str, version: int) -> bytes:
        return f"polpo-obj|{self.id}|{item_id}|{version}".encode()

    # ---------------- oggetti ----------------

    def put(self, category: str, name: str, data: bytes, *, origin: str = "reale", meta: dict[str, Any] | None = None) -> Item:
        if category not in CATEGORIES:
            raise VaultError("bad_category", f"categoria sconosciuta: {category}")
        if origin not in ("reale", "simulato"):
            raise VaultError("bad_origin", "origine sconosciuta")
        with self._lock:
            now = time.time()
            item = Item(uuid.uuid4().hex, category, name, now, now, 1, len(data), crypto.sha256(data), origin, dict(meta or {}))
            _write_atomic(self.objects / item.id, crypto.seal(self._key("objects"), data, self._obj_aad(item.id, 1)))
            self._index[item.id] = item
            self._save_index()
            return item

    def get(self, item_id: str) -> bytes:
        with self._lock:
            item = self.item(item_id)
            blob = (self.objects / item_id).read_bytes()
            data = crypto.unseal(self._key("objects"), blob, self._obj_aad(item_id, item.version))
            if crypto.sha256(data) != item.sha256:
                raise IntegrityError("impronta SHA-256 diversa")
            return data

    def item(self, item_id: str) -> Item:
        with self._lock:
            if self._dek is None:
                raise VaultError("locked", "cassaforte chiusa")
            if item_id not in self._index:
                raise VaultError("not_found", "file non trovato nella cassaforte")
            return self._index[item_id]

    def items(self, category: str | None = None, query: str = "") -> list[Item]:
        q = query.strip().lower()
        with self._lock:
            if self._dek is None:
                raise VaultError("locked", "cassaforte chiusa")
            out = [
                i
                for i in self._index.values()
                if (category is None or i.category == category)
                and (not q or q in i.name.lower() or q in json.dumps(i.meta, ensure_ascii=False).lower())
            ]
        return sorted(out, key=lambda i: i.modified, reverse=True)

    def update(
        self,
        item_id: str,
        *,
        data: bytes | None = None,
        name: str | None = None,
        meta: dict[str, Any] | None = None,
        mark_simulated: bool = False,
    ) -> Item:
        """``mark_simulated`` segna il file come SIMULATO (solo in quella direzione: non si torna indietro)."""
        with self._lock:
            item = self.item(item_id)
            if mark_simulated:
                item.origin = "simulato"
            if data is not None:
                item.version += 1
                _write_atomic(self.objects / item_id, crypto.seal(self._key("objects"), data, self._obj_aad(item_id, item.version)))
                item.size = len(data)
                item.sha256 = crypto.sha256(data)
            if name is not None:
                item.name = name
            if meta is not None:
                item.meta = dict(meta)
            item.modified = time.time()
            self._save_index()
            return item

    def delete(self, item_id: str) -> None:
        with self._lock:
            self.item(item_id)
            del self._index[item_id]
            self._save_index()
            try:
                (self.objects / item_id).unlink()
            except FileNotFoundError:
                pass

    def verify(self) -> list[Problem]:
        """Decifra tutto e confronta le impronte: elenca file mancanti, alterati o estranei."""
        problems: list[Problem] = []
        with self._lock:
            for item in list(self._index.values()):
                path = self.objects / item.id
                if not path.exists():
                    problems.append(Problem(item.id, "mancante"))
                    continue
                try:
                    self.get(item.id)
                except IntegrityError:
                    problems.append(Problem(item.id, "alterato o danneggiato"))
            known = set(self._index)
            if self.objects.exists():
                for p in self.objects.iterdir():
                    if p.name not in known and not p.name.endswith(".tmp"):
                        problems.append(Problem(p.name, "file estraneo nella cartella"))
        return problems

    def stats(self) -> dict[str, Any]:
        with self._lock:
            items = list(self._index.values())
        return {"count": len(items), "bytes": sum(i.size for i in items), "simulated": sum(1 for i in items if i.simulated)}
