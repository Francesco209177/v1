"""Aggiornamento del firmware del Polpo (Sperimentale: non provato da qui su hardware vero).

Come PlatformIO: un "tocco" a 1200 baud fa ripartire l'ESP32-S3 nel bootloader, poi esptool scrive
solo l'applicazione a 0x10000 (il file unico a 0x0 cancellerebbe le impostazioni) senza riavviare
di nuovo la scheda (``--before no-reset``). Il file viene usato solo se la sua impronta SHA-256 è
quella fissata nel programma.
"""

from __future__ import annotations

import hashlib
import json
import time
from dataclasses import dataclass
from pathlib import Path

from ..paths import resources_dir

REPO_RELEASE = Path(__file__).resolve().parents[3] / "polpo" / "release"


@dataclass(frozen=True)
class Firmware:
    version: str
    path: Path | None
    offset: str
    sha256: str

    @property
    def available(self) -> bool:
        return self.path is not None


def bundled() -> Firmware:
    m = json.loads((resources_dir() / "firmware.json").read_text(encoding="utf-8"))
    path = None
    for folder in (resources_dir() / "firmware", REPO_RELEASE):
        p = folder / m["app_file"]
        if p.is_file():
            path = p
            break
    return Firmware(m["version"], path, m["app_offset"], m["sha256"])


def verify(fw: Firmware) -> bool:
    if fw.path is None:
        return False
    return hashlib.sha256(fw.path.read_bytes()).hexdigest() == fw.sha256


def esptool_command(port: str, fw: Firmware) -> list[str]:
    from .esptool_runner import esptool_argv

    assert fw.path is not None
    return esptool_argv([
        "--chip", "esp32s3", "--port", port,
        "--before", "no-reset", "--after", "hard-reset",
        "write-flash", fw.offset, str(fw.path),
    ])  # fmt: skip


def touch_1200(port: str) -> None:
    """Apre e chiude la porta a 1200 baud: l'ESP32-S3 con USB nativa riparte nel bootloader."""
    import serial

    s = serial.Serial()
    s.port = port
    s.baudrate = 1200
    s.dtr = False
    s.open()
    time.sleep(0.1)
    s.close()


def wait_new_port(before: set[str], timeout: float = 8.0) -> str | None:
    """Dopo il tocco il Polpo ricompare (spesso con un'altra porta): la cerca tra quelle Espressif."""
    from .serial_ports import list_ports

    end = time.monotonic() + timeout
    while time.monotonic() < end:
        ports = [p for p in list_ports() if p.vid == 0x303A]
        fresh = [p.device for p in ports if p.device not in before]
        if fresh:
            return fresh[0]
        if ports and time.monotonic() > end - timeout / 2:
            return ports[0].device
        time.sleep(0.3)
    return None
