"""Lettori NFC PC/SC (es. ACR122U) — Sperimentale.

Usa solo comandi standard PC/SC parte 3 (GET DATA per l'UID, READ BINARY per le pagine dei tag
Type 2). Non tenta autenticazioni né chiavi: per le MIFARE Classic mostra solo UID e tipo.
Il pacchetto ``pyscard`` è facoltativo: senza, la funzione risulta "Richiede hardware esterno".
"""

from __future__ import annotations

from typing import Any, Protocol

from ..protocols import type2

GET_UID = [0xFF, 0xCA, 0x00, 0x00, 0x00]
# Nome della carta nell'ATR dei lettori PC/SC (PC/SC parte 3, byte 13-14 dopo l'RID PC/SC).
ATR_CARD_NAMES = {
    0x0001: ("MIFARE Classic 1K", 0x08),
    0x0002: ("MIFARE Classic 4K", 0x18),
    0x0003: ("MIFARE Ultralight / NTAG", 0x00),
    0x0026: ("MIFARE Mini", 0x09),
    0x003A: ("MIFARE Ultralight C", 0x00),
}
PCSC_RID = bytes.fromhex("A000000306")


class Connection(Protocol):
    def getATR(self) -> list[int]: ...  # noqa: N802 (nome di pyscard)
    def transmit(self, apdu: list[int]) -> tuple[list[int], int, int]: ...


class PcscError(Exception):
    pass


def available() -> tuple[bool, str]:
    try:
        from smartcard.System import readers  # type: ignore[import-not-found]
    except Exception:
        return False, "pacchetto pyscard non installato"
    try:
        r = readers()
    except Exception as e:
        return False, f"servizio PC/SC non disponibile: {e}"
    return (True, ", ".join(str(x) for x in r)) if r else (False, "nessun lettore collegato")


def list_readers() -> list[str]:
    from smartcard.System import readers  # type: ignore[import-not-found]

    return [str(r) for r in readers()]


def _ok(conn: Connection, apdu: list[int]) -> bytes:
    data, sw1, sw2 = conn.transmit(apdu)
    if (sw1, sw2) != (0x90, 0x00):
        raise PcscError(f"il lettore ha risposto {sw1:02X} {sw2:02X}")
    return bytes(data)


def card_name_from_atr(atr: bytes) -> tuple[str, int] | None:
    i = atr.find(PCSC_RID)
    if i < 0 or len(atr) < i + 9:
        return None
    code = (atr[i + 6] << 8) | atr[i + 7]
    return ATR_CARD_NAMES.get(code)


def read_card(conn: Connection) -> dict[str, Any]:
    """Legge una carta già collegata e restituisce gli stessi campi di ``nfc.read`` del Polpo."""
    atr = bytes(conn.getATR())
    uid = _ok(conn, GET_UID)
    named = card_name_from_atr(atr)
    out: dict[str, Any] = {"present": True, "uid": uid.hex().upper(), "atr": atr.hex().upper(), "source": "pcsc"}
    if named is None:
        out.update({"sak": 0x20, "atqa": 0, "family": "Carta ISO 14443 non di memoria (o non riconosciuta dal lettore)"})
        return out
    name, sak = named
    out.update({"sak": sak, "atqa": 0, "family": type2.card_family(sak, 0)})
    if sak != 0x00:
        return out
    head = _ok(conn, [0xFF, 0xB0, 0x00, 0x00, 0x10])[:16]  # pagine 0-3
    if len(head) < 16:
        raise PcscError("lettura delle prime pagine incompleta")
    total_pages = 4 + (head[14] * 8) // 4 if head[12] == 0xE1 else 16
    mem = bytearray(head)
    page = 4
    while page < total_pages:
        try:
            chunk = _ok(conn, [0xFF, 0xB0, 0x00, page, 0x10])
        except PcscError:
            out["read_error"] = "memoria non leggibile oltre la pagina %d (protetta?)" % page
            break
        mem += chunk[: min(16, (total_pages - page) * 4)]
        page += 4
    model = {0x06: "MIFARE Ultralight", 0x12: "NTAG213", 0x3E: "NTAG215", 0x6D: "NTAG216"}.get(head[14], name)
    out.update({"model": model, "pages": bytes(mem).hex().upper()})
    return out


def read_from_reader(reader_name: str) -> dict[str, Any]:
    from smartcard.System import readers  # type: ignore[import-not-found]

    r = next((x for x in readers() if str(x) == reader_name), None)
    if r is None:
        raise PcscError("lettore non trovato")
    conn = r.createConnection()
    try:
        conn.connect()
    except Exception as e:
        raise PcscError(f"nessuna carta sul lettore ({e})") from e
    try:
        return read_card(conn)
    finally:
        try:
            conn.disconnect()
        except Exception:
            pass
