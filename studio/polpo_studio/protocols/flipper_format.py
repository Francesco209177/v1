"""Formato a righe "chiave: valore" usato dai file .ir e .sub (stesse regole del firmware)."""

from __future__ import annotations

from dataclasses import dataclass, field


class FormatError(ValueError):
    pass


@dataclass
class FfDoc:
    filetype: str = ""
    version: int = 0
    lines: list[tuple[str, str, int]] = field(default_factory=list)  # (chiave, valore, riga)


def parse(text: str) -> FfDoc:
    doc = FfDoc()
    have_type = have_version = False
    for n, raw in enumerate(text.split("\n"), start=1):
        line = raw.strip()
        if not line or line.startswith("#"):
            continue
        colon = line.find(":")
        if colon <= 0:
            raise FormatError(f"riga {n}: manca ':'")
        key, value = line[:colon].strip(), line[colon + 1 :].strip()
        if not have_type:
            if key != "Filetype":
                raise FormatError("manca l'intestazione Filetype")
            doc.filetype, have_type = value, True
        elif not have_version:
            if key != "Version" or not value.isdigit():
                raise FormatError("manca o non valida l'intestazione Version")
            doc.version, have_version = int(value), True
        else:
            doc.lines.append((key, value, n))
    if not (have_type and have_version):
        raise FormatError("file vuoto o senza intestazione")
    return doc


def line(key: str, value: object) -> str:
    return f"{key}: {value}\n"


def header(filetype: str, version: int = 1) -> str:
    return line("Filetype", filetype) + line("Version", version)


def parse_hex_bytes(text: str) -> bytes | None:
    s = "".join(text.split())
    if len(s) % 2:
        return None
    try:
        return bytes.fromhex(s)
    except ValueError:
        return None


def hex_bytes(data: bytes) -> str:
    return " ".join(f"{b:02X}" for b in data)
