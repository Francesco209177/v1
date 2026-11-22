"""File radio .sub (codici fissi e RAW), analisi degli impulsi, tempo in aria (come il firmware).

Solo 433,05–434,79 MHz in OOK e codici fissi: è quello che i moduli RF433R/RF433T sanno fare.
"""

from __future__ import annotations

from dataclasses import dataclass, field

from . import flipper_format as ff

KEY_TYPE = "Flipper SubGhz Key File"
RAW_TYPE = "Flipper SubGhz RAW File"
RAW_MAX_PER_LINE = 512
RAW_MAX_TIMINGS = 4096
BAND_MIN, BAND_MAX = 433_050_000, 434_790_000
RC_PROTOCOLS = 12
RC_MAX_BITS = 32
DEFAULT_PRESET = "FuriHalSubGhzPresetOok650Async"

# Tabella dei protocolli di rc-switch 2.6.4: {sinc. alto, basso}, {zero alto, basso}, {uno alto, basso}.
RC_TABLE = (
    (1, 31, 1, 3, 3, 1), (1, 10, 1, 2, 2, 1), (30, 71, 4, 11, 9, 6), (1, 6, 1, 3, 3, 1),
    (6, 14, 1, 2, 2, 1), (23, 1, 1, 2, 2, 1), (2, 62, 1, 6, 6, 1), (3, 130, 7, 16, 3, 16),
    (130, 7, 16, 7, 16, 3), (18, 1, 3, 1, 1, 3), (36, 1, 1, 2, 2, 1), (36, 1, 1, 2, 2, 1),
)  # fmt: skip


@dataclass
class RcCode:
    protocol: int = 1
    bits: int = 24
    value: int = 0
    pulse_us: int = 350


@dataclass
class SubFile:
    frequency: int = 433_920_000
    preset: str = DEFAULT_PRESET
    raw: bool = False
    code: RcCode = field(default_factory=RcCode)
    raw_timings: list[int] = field(default_factory=list)

    @property
    def in_band(self) -> bool:
        return BAND_MIN <= self.frequency <= BAND_MAX


class Unsupported(ff.FormatError):
    """File valido ma non trasmissibile con questo hardware (banda, protocollo)."""


def raw_valid(t: list[int]) -> bool:
    if not t or t[0] <= 0:
        return False
    return all(x != 0 for x in t) and all((t[i] > 0) != (t[i - 1] > 0) for i in range(1, len(t)))


def serialize(f: SubFile) -> str:
    out = ff.header(RAW_TYPE if f.raw else KEY_TYPE) + ff.line("Frequency", f.frequency) + ff.line("Preset", f.preset)
    if f.raw:
        out += ff.line("Protocol", "RAW")
        for i in range(0, len(f.raw_timings), RAW_MAX_PER_LINE):
            out += ff.line("RAW_Data", " ".join(str(x) for x in f.raw_timings[i : i + RAW_MAX_PER_LINE]))
        return out
    if f.code.protocol == 1:
        out += ff.line("Protocol", "Princeton")
    else:
        out += ff.line("Protocol", "Polpo_RCSwitch") + ff.line("RCS_Protocol", f.code.protocol)
    out += ff.line("Bit", f.code.bits) + ff.line("Key", ff.hex_bytes(f.code.value.to_bytes(8, "big")))
    return out + ff.line("TE", f.code.pulse_us)


def parse(text: str) -> SubFile:
    """Solleva ``FormatError`` se il file è illeggibile, ``Unsupported`` se il protocollo non è gestito."""
    doc = ff.parse(text)
    if doc.filetype not in (KEY_TYPE, RAW_TYPE):
        raise ff.FormatError("non è un file radio .sub")
    out = SubFile()
    proto = ""
    have_key = False
    for key, value, _n in doc.lines:
        if key == "Frequency":
            if not value.isdigit():
                raise ff.FormatError("frequenza non valida")
            out.frequency = int(value)
        elif key == "Preset":
            out.preset = value
        elif key == "Protocol":
            proto = value
        elif key == "RAW_Data":
            for tok in value.split():
                try:
                    v = int(tok)
                except ValueError:
                    raise ff.FormatError("dato RAW non valido") from None
                if len(out.raw_timings) >= RAW_MAX_TIMINGS:
                    raise ff.FormatError("segnale RAW troppo lungo (max 4096 tempi)")
                out.raw_timings.append(v)
        elif key == "Bit":
            if not value.isdigit() or not 1 <= int(value) <= 32:
                raise ff.FormatError("Bit non valido (da 1 a 32)")
            out.code.bits = int(value)
        elif key == "Key":
            b = ff.parse_hex_bytes(value)
            if not b or len(b) > 8:
                raise ff.FormatError("Key non valida")
            out.code.value = int.from_bytes(b, "big")
            have_key = True
        elif key == "TE":
            if not value.isdigit() or not 50 <= int(value) <= 5000:
                raise ff.FormatError("TE non valido")
            out.code.pulse_us = int(value)
        elif key == "RCS_Protocol":
            if not value.isdigit() or not 1 <= int(value) <= RC_PROTOCOLS:
                raise ff.FormatError("RCS_Protocol non valido")
            out.code.protocol = int(value)
    if proto == "RAW":
        out.raw = True
        if not raw_valid(out.raw_timings):
            if out.raw_timings and out.raw_timings[0] < 0:  # molte catture iniziano con una pausa
                out.raw_timings.pop(0)
            if not raw_valid(out.raw_timings):
                raise ff.FormatError("dati RAW non alternati")
        return out
    if proto == "Princeton":
        out.code.protocol = 1
    elif proto != "Polpo_RCSwitch":
        raise Unsupported(f"protocollo {proto} non supportato (solo codici fissi Princeton o RAW)")
    if not have_key:
        raise ff.FormatError("manca il campo Key")
    if out.code.value >> out.code.bits:
        raise ff.FormatError("Key più lunga dei bit dichiarati")
    return out


def check_transmittable(f: SubFile) -> str:
    """Motivo per cui il file non si può trasmettere col Polpo (stringa vuota = si può)."""
    if not f.in_band:
        return "il modulo RF433T trasmette solo a 433,92 MHz (banda 433,05–434,79 MHz)"
    if not f.raw and f.code.bits > RC_MAX_BITS:
        return "rc-switch trasmette al massimo 32 bit"
    return ""


@dataclass
class PulseStats:
    count: int = 0
    min_us: int = 0
    max_us: int = 0
    short_us: int = 0
    long_us: int = 0
    ratio: float = 0.0
    clusters: int = 0


def pulse_analyze(timings: list[int]) -> PulseStats:
    st = PulseStats()
    v = sorted(abs(t) for t in timings if 50 <= abs(t) <= 20_000)
    st.count = len(v)
    if not v:
        return st
    st.min_us, st.max_us = v[0], v[-1]
    clusters: list[list[int]] = []  # [somma, numero]
    for x in v:
        if not clusters or x > (clusters[-1][0] // clusters[-1][1]) * 14 // 10:
            clusters.append([x, 1])
        else:
            clusters[-1][0] += x
            clusters[-1][1] += 1
    st.clusters = min(len(clusters), 255)
    order = sorted(range(len(clusters)), key=lambda i: -clusters[i][1])
    a = order[0]
    b = order[1] if len(order) > 1 else order[0]
    mean = lambda i: clusters[i][0] // clusters[i][1]  # noqa: E731
    if mean(a) > mean(b):
        a, b = b, a
    st.short_us, st.long_us = mean(a), mean(b)
    st.ratio = st.long_us / st.short_us if st.short_us else 0.0
    return st


def guess_protocol(st: PulseStats) -> str:
    """Ipotesi prudente dal rapporto tra impulsi lunghi e corti."""
    if st.count < 16:
        return "troppi pochi impulsi per un'ipotesi"
    if 2.6 <= st.ratio <= 3.4 and 150 <= st.short_us <= 700:
        return "compatibile con PT2262 / EV1527 (rc-switch 1, \"Princeton\")"
    if 1.7 <= st.ratio <= 2.3:
        return "compatibile con rc-switch 2 o 5 (rapporto 1:2)"
    return "protocollo non riconosciuto: tienilo come RAW"


def rc_airtime_us(code: RcCode, repeats: int) -> int:
    if not 1 <= code.protocol <= RC_PROTOCOLS or not 1 <= code.bits <= RC_MAX_BITS:
        return 0
    p = RC_TABLE[code.protocol - 1]
    per_bit = max(p[2] + p[3], p[4] + p[5])
    return (per_bit * code.bits + p[0] + p[1]) * code.pulse_us * repeats


def code_to_sub(protocol: int, bits: int, value_hex: str, pulse_us: int) -> SubFile:
    """Da un evento ``rf.code`` di Polpo Link a un file .sub."""
    return SubFile(code=RcCode(protocol, bits, int(value_hex, 16), pulse_us))
