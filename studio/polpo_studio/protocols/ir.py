"""Segnali infrarossi: protocolli, file .ir, libreria di codici pubblici (come il firmware)."""

from __future__ import annotations

from dataclasses import dataclass, field

from . import flipper_format as ff

MAX_RAW_TIMINGS = 1024
MAX_RAW_TIMING_US = 100_000
MAX_RAW_TOTAL_US = 2_000_000


@dataclass(frozen=True)
class Protocol:
    name: str
    address_bits: int
    command_bits: int
    frequency: int


PROTOCOLS = {
    p.name.lower(): p
    for p in (
        Protocol("NEC", 8, 8, 38000),
        Protocol("NECext", 16, 16, 38000),
        Protocol("NEC42", 13, 8, 38000),
        Protocol("NEC42ext", 26, 16, 38000),
        Protocol("Samsung32", 8, 8, 38000),
        Protocol("RC5", 5, 6, 36000),
        Protocol("RC5X", 5, 7, 36000),
        Protocol("RC6", 8, 8, 36000),
        Protocol("SIRC", 5, 7, 40000),
        Protocol("SIRC15", 8, 7, 40000),
        Protocol("SIRC20", 13, 7, 40000),
        Protocol("Kaseikyo", 26, 10, 37000),
        Protocol("RCA", 4, 8, 56000),
        Protocol("Pioneer", 8, 8, 40000),
    )
}


def protocol(name: str) -> Protocol | None:
    return PROTOCOLS.get(name.lower())


@dataclass
class Signal:
    name: str
    raw: bool = False
    protocol: str = ""
    address: int = 0
    command: int = 0
    frequency: int = 38000
    duty: float = 0.33
    timings: list[int] = field(default_factory=list)

    def validate(self) -> str:
        """Stringa vuota se valido, altrimenti il motivo."""
        if not self.name:
            return "nome mancante"
        if self.raw:
            if not self.timings:
                return "nessun tempo nei dati RAW"
            if len(self.timings) > MAX_RAW_TIMINGS:
                return "troppi tempi (max 1024)"
            if not 10_000 <= self.frequency <= 100_000:
                return "frequenza portante fuori range (10-100 kHz)"
            if not 0.0 < self.duty < 1.0:
                return "duty cycle non valido"
            if any(t <= 0 or t > MAX_RAW_TIMING_US for t in self.timings):
                return "tempo RAW fuori range (max 100 ms)"
            if sum(self.timings) > MAX_RAW_TOTAL_US:
                return "segnale RAW troppo lungo (max 2 s)"
            return ""
        p = protocol(self.protocol)
        if p is None:
            return "protocollo sconosciuto"
        if self.address >> p.address_bits:
            return f"indirizzo troppo grande per {p.name}"
        if self.command >> p.command_bits:
            return f"comando troppo grande per {p.name}"
        return ""

    def link_args(self) -> dict:
        """Argomenti per ``ir.send`` di Polpo Link."""
        if self.raw:
            return {"raw": True, "frequency": self.frequency, "duty": self.duty, "timings": list(self.timings)}
        return {"protocol": protocol(self.protocol).name if protocol(self.protocol) else self.protocol, "address": self.address, "command": self.command}


@dataclass
class IrFile:
    filetype: str = "IR signals file"
    signals: list[Signal] = field(default_factory=list)
    warnings: list[str] = field(default_factory=list)


def parse(text: str) -> IrFile:
    doc = ff.parse(text)
    if doc.filetype not in ("IR signals file", "IR library file"):
        raise ff.FormatError(f"non è un file infrarossi (Filetype: {doc.filetype})")
    out = IrFile(doc.filetype)
    cur: Signal | None = None
    bad = False

    def finish() -> None:
        if cur is not None and not bad:
            why = cur.validate()
            if why:
                out.warnings.append(f'"{cur.name}" saltato: {why}')
            else:
                out.signals.append(cur)

    for key, value, _n in doc.lines:
        if key == "name":
            finish()
            cur, bad = Signal(value), False
            continue
        if cur is None or bad:
            continue

        def skip(why: str) -> None:
            nonlocal bad
            out.warnings.append(f'"{cur.name}" saltato: {why}')
            bad = True

        if key == "type":
            if value in ("raw", "parsed"):
                cur.raw = value == "raw"
            else:
                skip(f"tipo {value}")
        elif key == "protocol":
            if protocol(value) is None:
                skip(f"protocollo {value} non supportato")
            else:
                cur.protocol = protocol(value).name
        elif key in ("address", "command"):
            b = ff.parse_hex_bytes(value)
            if b is None or len(b) != 4:
                skip(f"{key} non valido")
            else:
                setattr(cur, key, int.from_bytes(b, "little"))
        elif key == "frequency":
            if value.isdigit():
                cur.frequency = int(value)
            else:
                skip("frequenza non valida")
        elif key == "duty_cycle":
            try:
                cur.duty = float(value)
            except ValueError:
                skip("duty cycle non valido")
        elif key == "data":
            for tok in value.split():
                if not tok.isdigit():
                    skip("dato RAW non numerico")
                    break
                cur.timings.append(int(tok))
    finish()
    return out


def _fmt_duty(d: float) -> str:
    return f"{d:.6f}"


def serialize(f: IrFile) -> str:
    out = ff.header(f.filetype)
    for s in f.signals:
        out += "#\n" + ff.line("name", s.name)
        if s.raw:
            out += ff.line("type", "raw") + ff.line("frequency", s.frequency) + ff.line("duty_cycle", _fmt_duty(s.duty))
            out += ff.line("data", " ".join(str(t) for t in s.timings))
        else:
            out += ff.line("type", "parsed") + ff.line("protocol", s.protocol)
            out += ff.line("address", ff.hex_bytes(s.address.to_bytes(4, "little")))
            out += ff.line("command", ff.hex_bytes(s.command.to_bytes(4, "little")))
    return out


# ---------------- libreria ----------------

BUTTONS = {
    "power": ("Accendi / spegni", "Power"),
    "vol_up": ("Volume +", "Volume +"),
    "vol_down": ("Volume -", "Volume -"),
    "mute": ("Muto", "Mute"),
    "ch_up": ("Canale +", "Channel +"),
    "ch_down": ("Canale -", "Channel -"),
}
CATEGORIES = {"tv": ("Televisori", "TVs"), "audio": ("Audio", "Audio")}


@dataclass(frozen=True)
class LibraryCode:
    category: str
    brand: str
    button: str
    protocol: str
    address: int
    command: int

    def signal(self) -> Signal:
        return Signal(f"{self.brand} {self.button}", protocol=self.protocol, address=self.address, command=self.command)


# Stessa tabella di polpo/lib/polpo_core/src/polpo/ir/ir_library.cpp: codici pubblici molto diffusi.
LIBRARY: tuple[LibraryCode, ...] = tuple(
    LibraryCode(*row)
    for row in (
        ("tv", "Samsung", "power", "Samsung32", 0x07, 0x02),
        ("tv", "Samsung", "vol_up", "Samsung32", 0x07, 0x07),
        ("tv", "Samsung", "vol_down", "Samsung32", 0x07, 0x0B),
        ("tv", "Samsung", "mute", "Samsung32", 0x07, 0x0F),
        ("tv", "Samsung", "ch_up", "Samsung32", 0x07, 0x12),
        ("tv", "Samsung", "ch_down", "Samsung32", 0x07, 0x10),
        ("tv", "LG", "power", "NEC", 0x04, 0x08),
        ("tv", "LG", "vol_up", "NEC", 0x04, 0x02),
        ("tv", "LG", "vol_down", "NEC", 0x04, 0x03),
        ("tv", "LG", "mute", "NEC", 0x04, 0x09),
        ("tv", "LG", "ch_up", "NEC", 0x04, 0x00),
        ("tv", "LG", "ch_down", "NEC", 0x04, 0x01),
        ("tv", "Sony", "power", "SIRC", 0x01, 0x15),
        ("tv", "Sony", "vol_up", "SIRC", 0x01, 0x12),
        ("tv", "Sony", "vol_down", "SIRC", 0x01, 0x13),
        ("tv", "Sony", "mute", "SIRC", 0x01, 0x14),
        ("tv", "Sony", "ch_up", "SIRC", 0x01, 0x10),
        ("tv", "Sony", "ch_down", "SIRC", 0x01, 0x11),
        ("tv", "Philips RC5", "power", "RC5", 0x00, 0x0C),
        ("tv", "Philips RC5", "vol_up", "RC5", 0x00, 0x10),
        ("tv", "Philips RC5", "vol_down", "RC5", 0x00, 0x11),
        ("tv", "Philips RC5", "mute", "RC5", 0x00, 0x0D),
        ("tv", "Philips RC5", "ch_up", "RC5", 0x00, 0x20),
        ("tv", "Philips RC5", "ch_down", "RC5", 0x00, 0x21),
        ("tv", "Philips RC6", "power", "RC6", 0x00, 0x0C),
        ("tv", "Philips RC6", "vol_up", "RC6", 0x00, 0x10),
        ("tv", "Philips RC6", "vol_down", "RC6", 0x00, 0x11),
        ("tv", "Philips RC6", "mute", "RC6", 0x00, 0x0D),
        ("tv", "Panasonic", "power", "Kaseikyo", 0x200280, 0x3D0),
        ("tv", "Toshiba", "power", "NEC", 0x40, 0x12),
        ("audio", "Sony", "power", "SIRC", 0x10, 0x15),
        ("audio", "Sony", "vol_up", "SIRC", 0x10, 0x12),
        ("audio", "Sony", "vol_down", "SIRC", 0x10, 0x13),
        ("audio", "Sony", "mute", "SIRC", 0x10, 0x14),
        ("audio", "Yamaha", "power", "NEC", 0x7A, 0x1F),
        ("audio", "Yamaha", "vol_up", "NEC", 0x7A, 0x1A),
        ("audio", "Yamaha", "vol_down", "NEC", 0x7A, 0x1B),
        ("audio", "Yamaha", "mute", "NEC", 0x7A, 0x1C),
    )
)


def brands(category: str) -> list[str]:
    seen: list[str] = []
    for c in LIBRARY:
        if c.category == category and c.brand not in seen:
            seen.append(c.brand)
    return seen


def codes(category: str, brand: str) -> list[LibraryCode]:
    return [c for c in LIBRARY if c.category == category and c.brand == brand]
