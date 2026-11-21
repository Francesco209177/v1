"""Tessere 125 kHz (EM4100/EM4102): formati del codice, Wiegand 26, trame del modulo RDM6300.

Una tessera EM4100 contiene 40 bit: 8 bit di "versione" (o cliente) e 32 bit di numero. I lettori
"tipo tastiera" di solito scrivono i 32 bit in decimale (10 cifre) seguiti da Invio; sulle tessere
si trova spesso anche il formato Wiegand 26 "impianto,numero" (8 + 16 bit).
"""

from __future__ import annotations

from dataclasses import dataclass


@dataclass(frozen=True)
class Em4100:
    version: int  # 8 bit
    number: int  # 32 bit

    @property
    def value(self) -> int:
        return (self.version << 32) | self.number

    @property
    def hex(self) -> str:
        return f"{self.value:010X}"

    @property
    def decimal10(self) -> str:
        return f"{self.number:010d}"

    @property
    def w26(self) -> tuple[int, int]:
        """(impianto, numero) dai 24 bit bassi."""
        return (self.number >> 16) & 0xFF, self.number & 0xFFFF

    @property
    def w26_text(self) -> str:
        fc, cn = self.w26
        return f"{fc:03d},{cn:05d}"

    @property
    def w26_bits(self) -> str:
        """I 26 bit Wiegand con le parità (pari sui primi 12, dispari sugli ultimi 12)."""
        fc, cn = self.w26
        data = (fc << 16) | cn
        bits = f"{data:024b}"
        even = bits[:12].count("1") % 2
        odd = 1 - bits[12:].count("1") % 2
        return f"{even}{bits}{odd}"


def parse_code(text: str) -> tuple[Em4100 | None, str]:
    """Riconosce il formato di un codice scritto (dal lettore o a mano). Restituisce (codice, formato)."""
    t = text.strip().replace(" ", "")
    if not t:
        return None, ""
    if "," in t:
        a, _, b = t.partition(",")
        if a.isdigit() and b.isdigit() and int(a) < 256 and int(b) < 65536:
            return Em4100(0, (int(a) << 16) | int(b)), "Wiegand 26 (impianto,numero)"
        return None, ""
    if t.isdigit() and len(t) == 10 and int(t) < 2**32:
        return Em4100(0, int(t)), "decimale a 10 cifre (32 bit)"
    if t.isdigit() and len(t) == 8 and int(t[:3]) < 256 and int(t[3:]) < 65536:
        return Em4100(0, (int(t[:3]) << 16) | int(t[3:])), "8 cifre (impianto + numero)"
    try:
        v = int(t, 16)
    except ValueError:
        return None, ""
    if len(t) == 10:
        return Em4100(v >> 32, v & 0xFFFFFFFF), "esadecimale a 10 cifre (40 bit)"
    if len(t) == 8:
        return Em4100(0, v), "esadecimale a 8 cifre (32 bit)"
    return None, ""


# ---------------- RDM6300 ----------------


class Rdm6300Parser:
    """Trame: 0x02, 10 caratteri esadecimali (5 byte), 2 caratteri di controllo (XOR), 0x03."""

    def __init__(self) -> None:
        self._buf = bytearray()
        self.bad_frames = 0

    def feed(self, data: bytes) -> list[Em4100]:
        out = []
        self._buf += data
        while True:
            start = self._buf.find(0x02)
            if start < 0:
                self._buf.clear()
                return out
            if start:
                del self._buf[:start]
            if len(self._buf) < 14:
                return out
            frame = bytes(self._buf[:14])
            if frame[13] != 0x03:
                self.bad_frames += 1
                del self._buf[:1]
                continue
            del self._buf[:14]
            try:
                payload = bytes.fromhex(frame[1:11].decode("ascii"))
                check = int(frame[11:13].decode("ascii"), 16)
            except (ValueError, UnicodeDecodeError):
                self.bad_frames += 1
                continue
            x = 0
            for b in payload:
                x ^= b
            if x != check:
                self.bad_frames += 1
                continue
            out.append(Em4100(payload[0], int.from_bytes(payload[1:], "big")))


def rdm6300_frame(card: Em4100) -> bytes:
    """Costruisce una trama (serve ai test e alle prove del modulo)."""
    payload = card.value.to_bytes(5, "big")
    x = 0
    for b in payload:
        x ^= b
    return b"\x02" + payload.hex().upper().encode() + f"{x:02X}".encode() + b"\x03"


# ---------------- lettori "tipo tastiera" ----------------


@dataclass
class Burst:
    text: str
    duration_ms: float
    max_gap_ms: float

    @property
    def looks_like_reader(self) -> bool:
        """Un lettore scrive tutto in pochi millisecondi; una persona è molto più lenta."""
        return len(self.text) >= 8 and self.max_gap_ms < 40 and self.duration_ms < 400


def burst_from_times(chars: list[tuple[str, float]]) -> Burst:
    """``chars``: (carattere, istante in secondi) fino all'Invio escluso."""
    if not chars:
        return Burst("", 0, 0)
    times = [t for _, t in chars]
    gaps = [(b - a) * 1000 for a, b in zip(times, times[1:])] or [0.0]
    return Burst("".join(c for c, _ in chars), (times[-1] - times[0]) * 1000, max(gaps))
