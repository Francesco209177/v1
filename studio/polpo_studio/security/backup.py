"""Copie di sicurezza ``.polpobak``: tutta la cassaforte in un file cifrato con una password a parte.

La password del backup è diversa dalla frase della cassaforte, così il file si può ripristinare
anche su un altro computer. Formato:

    MAGIC (9 byte) | lunghezza intestazione (4 byte, big endian) | intestazione JSON | nonce + AES-GCM

L'intestazione (in chiaro: formato, data, parametri scrypt) è autenticata come AAD.
"""

from __future__ import annotations

import json
import os
import struct
import time
import zlib
from pathlib import Path

from . import crypto
from .crypto import IntegrityError
from .vault import Vault, VaultError, _write_atomic

MAGIC = b"POLPOBAK\x01"
MAX_BACKUP = 512 * 1024 * 1024


class BackupError(Exception):
    pass


def export_backup(vault: Vault, path: Path, password: str, kdf_n: int = crypto.KDF_N) -> int:
    if len(password) < 8:
        raise BackupError("la password del backup deve avere almeno 8 caratteri")
    items = []
    for it in vault.items():
        data = vault.get(it.id)
        items.append(
            {
                "category": it.category,
                "name": it.name,
                "created": it.created,
                "modified": it.modified,
                "origin": it.origin,
                "meta": it.meta,
                "sha256": it.sha256,
                "data": crypto.b64e(data),
            }
        )
    payload = zlib.compress(json.dumps({"format": "polpobak", "version": 1, "items": items}, ensure_ascii=False).encode(), 6)
    salt = os.urandom(16)
    header = json.dumps(
        {
            "format": "polpobak",
            "version": 1,
            "created": time.time(),
            "kdf": {"alg": "scrypt", "n": kdf_n, "r": crypto.KDF_R, "p": crypto.KDF_P, "salt": crypto.b64e(salt)},
        }
    ).encode()
    key = crypto.derive(password.encode(), salt, kdf_n)
    blob = MAGIC + struct.pack(">I", len(header)) + header + crypto.seal(key, payload, header)
    _write_atomic(path, blob)
    return len(items)


def read_backup(path: Path, password: str) -> list[dict]:
    raw = path.read_bytes()
    if len(raw) > MAX_BACKUP:
        raise BackupError("file troppo grande")
    if not raw.startswith(MAGIC) or len(raw) < len(MAGIC) + 4:
        raise BackupError("non è un backup di Polpo Studio")
    (hlen,) = struct.unpack(">I", raw[len(MAGIC) : len(MAGIC) + 4])
    start = len(MAGIC) + 4
    header = raw[start : start + hlen]
    try:
        h = json.loads(header)
        k = h["kdf"]
        if h.get("format") != "polpobak" or k.get("alg") != "scrypt" or not 2**10 <= int(k["n"]) <= 2**20:
            raise ValueError
        key = crypto.derive(password.encode(), crypto.b64d(k["salt"]), int(k["n"]), int(k["r"]), int(k["p"]))
    except (ValueError, KeyError, TypeError):
        raise BackupError("intestazione del backup non valida") from None
    try:
        payload = crypto.unseal(key, raw[start + hlen :], header)
    except IntegrityError:
        raise BackupError("password sbagliata oppure backup danneggiato") from None
    data = json.loads(zlib.decompress(payload))
    items = data.get("items", [])
    for it in items:
        it["data"] = crypto.b64d(it["data"])
        if crypto.sha256(it["data"]) != it["sha256"]:
            raise BackupError(f"impronta diversa per {it.get('name')}: backup alterato")
    return items


def import_backup(vault: Vault, path: Path, password: str) -> tuple[int, int]:
    """Ripristina nella cassaforte aperta; i file già presenti (stessa impronta) vengono saltati."""
    items = read_backup(path, password)
    have = {i.sha256 for i in vault.items()}
    added = skipped = 0
    for it in items:
        if it["sha256"] in have:
            skipped += 1
            continue
        try:
            vault.put(it["category"], it["name"], it["data"], origin=it.get("origin", "reale"), meta=it.get("meta") or {})
        except VaultError:
            vault.put("altro", it["name"], it["data"], origin=it.get("origin", "reale"), meta=it.get("meta") or {})
        have.add(it["sha256"])
        added += 1
    return added, skipped
