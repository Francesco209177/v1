"""NDEF (NFC Forum): record URI e testo, involucro TLV per i tag Type 2.

Stesse regole di ``polpo/lib/polpo_core/src/polpo/nfc/ndef.cpp``.
"""

from __future__ import annotations

from dataclasses import dataclass

URI_PREFIXES = (
    "", "http://www.", "https://www.", "http://", "https://", "tel:", "mailto:",
    "ftp://anonymous:anonymous@", "ftp://ftp.", "ftps://", "sftp://", "smb://", "nfs://",
    "ftp://", "dav://", "news:", "telnet://", "imap:", "rtsp://", "urn:",
    "pop:", "sip:", "sips:", "tftp:", "btspp://", "btl2cap://", "btgoep://",
    "tcpobex://", "irdaobex://", "file://", "urn:epc:id:", "urn:epc:tag:", "urn:epc:pat:",
    "urn:epc:raw:", "urn:epc:", "urn:nfc:",
)  # fmt: skip


def _record(tnf: int, rtype: bytes, payload: bytes) -> bytes:
    sr = len(payload) <= 255
    head = bytes([0x80 | 0x40 | (0x10 if sr else 0) | (tnf & 0x07), len(rtype)])
    size = bytes([len(payload)]) if sr else len(payload).to_bytes(4, "big")
    return head + size + rtype + payload


def uri_message(uri: str) -> bytes:
    best, best_len = 0, 0
    for i, p in enumerate(URI_PREFIXES[1:], start=1):
        if len(p) > best_len and uri.startswith(p):
            best, best_len = i, len(p)
    return _record(0x01, b"U", bytes([best]) + uri[best_len:].encode("utf-8"))


def text_message(text: str, lang: str = "it") -> bytes:
    lb = lang.encode("ascii", "replace")
    return _record(0x01, b"T", bytes([len(lb) & 0x3F]) + lb + text.encode("utf-8"))


def wrap_tlv(message: bytes) -> bytes:
    n = len(message)
    size = bytes([n]) if n < 0xFF else bytes([0xFF, (n >> 8) & 0xFF, n & 0xFF])
    return b"\x03" + size + message + b"\xfe"


def find_in_tlv(mem: bytes) -> bytes | None:
    """Il primo messaggio NDEF nell'area TLV (salta NULL, Lock/Memory Control e proprietari)."""
    i = 0
    while i < len(mem):
        t = mem[i]
        i += 1
        if t == 0x00:
            continue
        if t == 0xFE or i >= len(mem):
            return None
        n = mem[i]
        i += 1
        if n == 0xFF:
            if i + 2 > len(mem):
                return None
            n = (mem[i] << 8) | mem[i + 1]
            i += 2
        if i + n > len(mem):
            return None
        if t == 0x03:
            return mem[i : i + n]
        i += n
    return None


@dataclass
class Record:
    tnf: int
    type: bytes
    payload: bytes
    kind: str = "other"  # "uri", "text" o "other"
    value: str = ""
    lang: str = ""


def parse(message: bytes) -> list[Record]:
    """Analizza un messaggio NDEF; solleva ``ValueError`` se malformato."""
    if not message:
        raise ValueError("messaggio NDEF vuoto")
    out: list[Record] = []
    i = 0
    m = message
    while i < len(m):
        hdr = m[i]
        i += 1
        if hdr & 0x20:
            raise ValueError("record spezzati (chunked) non supportati")
        try:
            type_len = m[i]
            i += 1
            if hdr & 0x10:
                plen = m[i]
                i += 1
            else:
                plen = int.from_bytes(m[i : i + 4], "big")
                if i + 4 > len(m):
                    raise IndexError
                i += 4
            id_len = 0
            if hdr & 0x08:
                id_len = m[i]
                i += 1
        except IndexError:
            raise ValueError("intestazione del record troncata") from None
        if i + type_len + id_len + plen > len(m):
            raise ValueError("record troncato")
        rtype = m[i : i + type_len]
        i += type_len + id_len
        payload = m[i : i + plen]
        i += plen
        rec = Record(hdr & 0x07, rtype, payload)
        if rec.tnf == 0x01 and rtype == b"U" and payload:
            rec.kind = "uri"
            prefix = URI_PREFIXES[payload[0]] if payload[0] < len(URI_PREFIXES) else ""
            rec.value = prefix + payload[1:].decode("utf-8", "replace")
        elif rec.tnf == 0x01 and rtype == b"T" and payload:
            ll = payload[0] & 0x3F
            if 1 + ll <= len(payload):
                rec.kind = "text"
                rec.lang = payload[1 : 1 + ll].decode("ascii", "replace")
                enc = "utf-16" if payload[0] & 0x80 else "utf-8"
                rec.value = payload[1 + ll :].decode(enc, "replace")
        out.append(rec)
        if hdr & 0x40:
            break
    return out
