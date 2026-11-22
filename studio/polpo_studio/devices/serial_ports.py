"""Elenco delle porte seriali con il riconoscimento dei chip USB-seriale più comuni."""

from __future__ import annotations

from dataclasses import dataclass

# (VID, PID o None per "qualsiasi") -> descrizione. Codici pubblici dei produttori.
KNOWN_CHIPS: dict[tuple[int, int | None], str] = {
    (0x303A, None): "Espressif, USB nativa (ESP32-S2/S3/C3/C6)",
    (0x1A86, 0x7523): "WCH CH340",
    (0x1A86, 0x5523): "WCH CH341",
    (0x1A86, 0x55D4): "WCH CH9102",
    (0x10C4, 0xEA60): "Silicon Labs CP210x",
    (0x0403, 0x6001): "FTDI FT232R",
    (0x0403, 0x6010): "FTDI FT2232",
    (0x0403, 0x6014): "FTDI FT232H",
    (0x0403, 0x6015): "FTDI FT231X",
    (0x067B, 0x2303): "Prolific PL2303",
    (0x2341, None): "Arduino",
    (0x2A03, None): "Arduino (arduino.org)",
    (0x2E8A, None): "Raspberry Pi (RP2040/RP2350)",
    (0x239A, None): "Adafruit",
    (0x1B4F, None): "SparkFun",
}


@dataclass(frozen=True)
class PortInfo:
    device: str
    description: str
    vid: int | None
    pid: int | None
    serial_number: str
    manufacturer: str
    chip: str

    @property
    def usb_id(self) -> str:
        return f"{self.vid:04X}:{self.pid:04X}" if self.vid is not None and self.pid is not None else ""

    @property
    def maybe_polpo(self) -> bool:
        """Solo un indizio: il Polpo si riconosce davvero con il ``ping`` di Polpo Link."""
        return self.vid == 0x303A


def chip_name(vid: int | None, pid: int | None) -> str:
    if vid is None:
        return ""
    return KNOWN_CHIPS.get((vid, pid)) or KNOWN_CHIPS.get((vid, None), "")


def list_ports() -> list[PortInfo]:
    try:
        from serial.tools import list_ports as lp
    except ImportError:
        return []
    out = []
    for p in lp.comports():
        out.append(
            PortInfo(
                device=p.device,
                description=p.description or "",
                vid=p.vid,
                pid=p.pid,
                serial_number=p.serial_number or "",
                manufacturer=p.manufacturer or "",
                chip=chip_name(p.vid, p.pid),
            )
        )
    out.sort(key=lambda x: (not x.maybe_polpo, x.vid is None, x.device))
    return out
