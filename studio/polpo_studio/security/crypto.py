"""Primitive crittografiche (libreria ``cryptography``): AES-256-GCM, scrypt, HKDF, HMAC.

Nessun algoritmo fatto in casa: solo composizione di primitive standard.
"""

from __future__ import annotations

import base64
import hashlib
import hmac
import os
import secrets

from cryptography.exceptions import InvalidTag
from cryptography.hazmat.primitives import hashes
from cryptography.hazmat.primitives.ciphers.aead import AESGCM
from cryptography.hazmat.primitives.kdf.hkdf import HKDF
from cryptography.hazmat.primitives.kdf.scrypt import Scrypt

KDF_N = 2**17  # ~128 MB di memoria e ~0,4 s: rende costoso provare frasi a caso
KDF_R = 8
KDF_P = 1
NONCE = 12


class IntegrityError(Exception):
    """Dati alterati, chiave sbagliata o file danneggiato."""


def derive(secret: bytes, salt: bytes, n: int = KDF_N, r: int = KDF_R, p: int = KDF_P) -> bytes:
    return Scrypt(salt=salt, length=32, n=n, r=r, p=p).derive(secret)


def hkdf(key: bytes, info: str) -> bytes:
    return HKDF(algorithm=hashes.SHA256(), length=32, salt=None, info=info.encode()).derive(key)


def seal(key: bytes, plaintext: bytes, aad: bytes) -> bytes:
    nonce = os.urandom(NONCE)
    return nonce + AESGCM(key).encrypt(nonce, plaintext, aad)


def unseal(key: bytes, blob: bytes, aad: bytes) -> bytes:
    if len(blob) < NONCE + 16:
        raise IntegrityError("dati troppo corti")
    try:
        return AESGCM(key).decrypt(blob[:NONCE], blob[NONCE:], aad)
    except InvalidTag as e:
        raise IntegrityError("autenticazione fallita") from e


def mac(key: bytes, data: bytes) -> str:
    return hmac.new(key, data, hashlib.sha256).hexdigest()


def mac_ok(key: bytes, data: bytes, expected: str) -> bool:
    return hmac.compare_digest(mac(key, data), expected)


def sha256(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def b64e(b: bytes) -> str:
    return base64.b64encode(b).decode("ascii")


def b64d(s: str) -> bytes:
    return base64.b64decode(s.encode("ascii"), validate=True)


# ---------------- chiave di recupero ----------------

_B32 = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567"


def new_recovery_key() -> str:
    """160 bit casuali in 8 gruppi da 4 caratteri (alfabeto base32, senza 0/1/8/9)."""
    raw = base64.b32encode(secrets.token_bytes(20)).decode("ascii")
    return "-".join(raw[i : i + 4] for i in range(0, 32, 4))


def normalize_recovery_key(text: str) -> bytes | None:
    """Accetta minuscole, spazi e trattini; restituisce i 20 byte oppure ``None``."""
    s = "".join(ch for ch in text.upper() if ch not in " -\t\n")
    s = s.replace("0", "O").replace("1", "I").replace("8", "B")  # errori di trascrizione comuni
    if len(s) != 32 or any(ch not in _B32 for ch in s):
        return None
    return base64.b32decode(s)


def passphrase_problems(text: str) -> list[str]:
    """Controlli semplici e onesti sulla frase di accesso (in italiano: vengono tradotti dall'interfaccia)."""
    problems = []
    if len(text) < 12:
        problems.append("short")
    if len(set(text)) < 6:
        problems.append("repetitive")
    if text.lower() in {"password1234", "passwordpassword", "123456789012", "qwertyuiopas"}:
        problems.append("common")
    return problems
