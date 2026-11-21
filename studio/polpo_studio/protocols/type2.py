"""Tag NFC Type 2 (NTAG21x, MIFARE Ultralight): modelli, CC, blocchi, analisi di una lettura.

Mappe di memoria dai datasheet pubblici NXP, come ``polpo/lib/polpo_core/src/polpo/nfc/type2.cpp``.
"""

from __future__ import annotations

from dataclasses import dataclass, field

from . import ndef


@dataclass(frozen=True)
class Model:
    name: str
    total_pages: int
    user_first: int
    user_last: int
    dyn_lock_page: int  # 0 = nessun blocco dinamico
    cfg_page: int = 0  # pagina CFG0 (AUTH0) per i chip con password, 0 = nessuna


MODELS = {
    "ultralight": Model("MIFARE Ultralight", 16, 4, 15, 0),
    "ul_ev1_11": Model("MIFARE Ultralight EV1 (MF0UL11)", 20, 4, 15, 0, 0x10),
    "ul_ev1_21": Model("MIFARE Ultralight EV1 (MF0UL21)", 41, 4, 35, 36, 0x25),
    "ntag210": Model("NTAG210", 20, 4, 15, 0, 0x10),
    "ntag212": Model("NTAG212", 41, 4, 35, 36, 0x25),
    "ntag213": Model("NTAG213", 45, 4, 39, 40, 0x29),
    "ntag215": Model("NTAG215", 135, 4, 129, 130, 0x83),
    "ntag216": Model("NTAG216", 231, 4, 225, 226, 0xE3),
}


def model_from_version(v: bytes) -> Model | None:
    if len(v) < 8:
        return None
    product, storage = v[2], v[6]
    if product == 0x04:
        return {0x0B: MODELS["ntag210"], 0x0E: MODELS["ntag212"], 0x0F: MODELS["ntag213"], 0x11: MODELS["ntag215"], 0x13: MODELS["ntag216"]}.get(storage)
    if product == 0x03:
        return {0x0B: MODELS["ul_ev1_11"], 0x0E: MODELS["ul_ev1_21"]}.get(storage)
    return None


def model_by_name(name: str) -> Model | None:
    return next((m for m in MODELS.values() if m.name == name), None)


def card_family(sak: int, atqa: int) -> str:
    return {
        0x00: "NFC Type 2 (NTAG / MIFARE Ultralight)",
        0x08: "MIFARE Classic 1K (o compatibile)",
        0x09: "MIFARE Mini",
        0x18: "MIFARE Classic 4K (o compatibile)",
        0x10: "MIFARE Plus (SL2)",
        0x11: "MIFARE Plus (SL2)",
        0x28: "Smart card con emulazione MIFARE Classic",
        0x38: "Smart card con emulazione MIFARE Classic",
    }.get(sak) or (
        ("MIFARE DESFire" if atqa == 0x0344 else "Smart card ISO 14443-4 (DESFire, Plus SL3, carta bancaria, documento...)")
        if sak == 0x20
        else "Carta ISO 14443-A non riconosciuta"
    )


@dataclass
class Analysis:
    uid: str = ""
    model: str = ""
    family: str = ""
    uid_ok: bool | None = None  # controllo dei byte BCC
    ndef_formatted: bool = False
    cc_version: str = ""
    capacity: int = 0
    writable: bool | None = None
    static_locked: bool | None = None
    otp: str = ""
    records: list[ndef.Record] = field(default_factory=list)
    ndef_error: str = ""
    notes: list[str] = field(default_factory=list)


def analyze(card: dict) -> Analysis:
    """Analizza la risposta di ``nfc.read`` (o una lettura salvata con gli stessi campi)."""
    a = Analysis(uid=str(card.get("uid", "")), model=str(card.get("model", "")))
    a.family = str(card.get("family") or card_family(int(card.get("sak", 0)), int(card.get("atqa", 0))))
    if card.get("sak", 0) != 0:
        a.notes.append("Non è un tag Type 2: Polpo Studio mostra solo UID e famiglia. Le chiavi e i settori non vengono letti, per scelta.")
        return a
    if card.get("read_error"):
        a.notes.append("Memoria non leggibile: probabilmente protetta da password. Polpo Studio non prova a indovinarla.")
        return a
    try:
        mem = bytes.fromhex(str(card.get("pages", "")))
    except ValueError:
        a.notes.append("Pagine non valide nella lettura.")
        return a
    if len(mem) < 16:
        a.notes.append("Lettura troppo corta.")
        return a
    uid = mem[0:3] + mem[4:8]
    a.uid_ok = (0x88 ^ mem[0] ^ mem[1] ^ mem[2]) == mem[3] and (mem[4] ^ mem[5] ^ mem[6] ^ mem[7]) == mem[8]
    if not a.uid:
        a.uid = uid.hex().upper()
    if not a.uid_ok:
        a.notes.append("Byte di controllo dell'UID non coerenti: possibile tag non originale o lettura disturbata.")
    lock = mem[10:12]
    a.static_locked = lock != b"\x00\x00"
    cc = mem[12:16]
    a.ndef_formatted = cc[0] == 0xE1
    a.cc_version = f"{cc[1] >> 4}.{cc[1] & 0x0F}"
    a.capacity = cc[2] * 8
    a.writable = cc[3] == 0x00
    a.otp = cc.hex().upper()
    if a.static_locked:
        a.notes.append(f"Pagine bloccate per sempre (lock statici {lock.hex().upper()}): non si possono riscrivere.")
    if not a.writable:
        a.notes.append("Il tag si dichiara in sola lettura (CC byte 3).")
    m = model_by_name(a.model)
    if m and m.cfg_page:
        a.notes.append(
            "Il chip supporta la password (pagina AUTH0): il Polpo legge solo la memoria utente, quindi lo stato della password non è noto."
        )
    if a.ndef_formatted:
        msg = ndef.find_in_tlv(mem[16:])
        if msg is None:
            a.notes.append("Formattato NDEF ma senza messaggio (tag vuoto).")
        else:
            try:
                a.records = ndef.parse(msg)
            except ValueError as e:
                a.ndef_error = str(e)
    else:
        a.notes.append("Non formattato NDEF: i telefoni non lo leggeranno come link o testo.")
    return a
