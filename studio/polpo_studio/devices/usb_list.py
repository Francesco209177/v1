"""Elenco delle periferiche USB con i nomi del sistema operativo.

* Linux: ``/sys/bus/usb/devices`` (nessun permesso speciale);
* macOS: ``ioreg -p IOUSB -l -a`` (plist);
* Windows: SetupAPI tramite ctypes (nomi di Gestione dispositivi).

Solo lettura: nessun dispositivo viene aperto.
"""

from __future__ import annotations

import plistlib
import re
import subprocess
import sys
from dataclasses import dataclass
from pathlib import Path

CLASS_NAMES = {
    0x00: "per interfaccia", 0x01: "Audio", 0x02: "Comunicazioni (CDC)", 0x03: "HID (tastiere, mouse…)",
    0x05: "Fisica", 0x06: "Immagini", 0x07: "Stampante", 0x08: "Memoria di massa", 0x09: "Hub",
    0x0A: "Dati CDC", 0x0B: "Smart card", 0x0E: "Video", 0x0F: "Salute", 0x10: "Audio/Video",
    0xDC: "Diagnostica", 0xE0: "Wireless (Bluetooth…)", 0xEF: "Varie", 0xFE: "Specifica applicazione", 0xFF: "Del produttore",
}  # fmt: skip

VENDORS = {
    0x303A: "Espressif", 0x1A86: "WCH (QinHeng)", 0x10C4: "Silicon Labs", 0x0403: "FTDI", 0x067B: "Prolific",
    0x2341: "Arduino", 0x2A03: "Arduino", 0x2E8A: "Raspberry Pi", 0x239A: "Adafruit", 0x1B4F: "SparkFun",
    0x046D: "Logitech", 0x045E: "Microsoft", 0x05AC: "Apple", 0x0BDA: "Realtek", 0x8087: "Intel",
    0x8086: "Intel", 0x072F: "Advanced Card Systems (ACS)", 0x1D6B: "Linux Foundation", 0x0781: "SanDisk",
    0x0951: "Kingston", 0x04E8: "Samsung", 0x18D1: "Google", 0x0A12: "Cambridge Silicon Radio", 0x0B05: "ASUS",
    0x1050: "Yubico", 0x04F2: "Chicony", 0x0C45: "Microdia", 0x13D3: "IMC Networks", 0x8564: "Transcend",
}  # fmt: skip

# Chip USB-seriale: se compaiono tra le periferiche ma senza porta seriale, manca il driver.
SERIAL_CHIPS = {(0x1A86, 0x7523), (0x1A86, 0x55D4), (0x1A86, 0x5523), (0x10C4, 0xEA60), (0x0403, 0x6001), (0x0403, 0x6010), (0x0403, 0x6014), (0x0403, 0x6015), (0x067B, 0x2303)}


@dataclass
class UsbDevice:
    vid: int
    pid: int
    name: str
    manufacturer: str = ""
    serial: str = ""
    location: str = ""
    speed: str = ""
    device_class: int | None = None
    driver: str = ""

    @property
    def usb_id(self) -> str:
        return f"{self.vid:04X}:{self.pid:04X}"

    @property
    def vendor_name(self) -> str:
        return self.manufacturer or VENDORS.get(self.vid, "")

    @property
    def class_name(self) -> str:
        return CLASS_NAMES.get(self.device_class, "") if self.device_class is not None else ""


def _read(p: Path) -> str:
    try:
        return p.read_text(encoding="utf-8", errors="replace").strip()
    except OSError:
        return ""


def list_linux(root: Path = Path("/sys/bus/usb/devices")) -> list[UsbDevice]:
    out = []
    if not root.exists():
        return out
    for d in sorted(root.iterdir()):
        if ":" in d.name or not (d / "idVendor").exists():
            continue
        try:
            vid, pid = int(_read(d / "idVendor"), 16), int(_read(d / "idProduct"), 16)
        except ValueError:
            continue
        cls = _read(d / "bDeviceClass")
        drivers = sorted({p.resolve().name for p in d.glob("*:*/driver")})
        out.append(
            UsbDevice(
                vid, pid,
                _read(d / "product") or VENDORS.get(vid, "") or "USB",
                _read(d / "manufacturer"),
                _read(d / "serial"),
                f"bus {_read(d / 'busnum')} · {d.name}",
                f"{_read(d / 'speed')} Mbit/s" if _read(d / "speed") else "",
                int(cls, 16) if cls else None,
                ", ".join(drivers),
            )  # fmt: skip
        )
    return out


def _walk_ioreg(node: dict, out: list[UsbDevice]) -> None:
    if "idVendor" in node and "idProduct" in node:
        out.append(
            UsbDevice(
                int(node["idVendor"]), int(node["idProduct"]),
                str(node.get("USB Product Name") or node.get("kUSBProductString") or node.get("IORegistryEntryName", "USB")),
                str(node.get("USB Vendor Name") or node.get("kUSBVendorString") or ""),
                str(node.get("USB Serial Number") or node.get("kUSBSerialNumberString") or ""),
                f"0x{int(node.get('locationID', 0)):08X}",
                "",
                int(node["bDeviceClass"]) if "bDeviceClass" in node else None,
            )  # fmt: skip
        )
    for child in node.get("IORegistryEntryChildren", []) or []:
        _walk_ioreg(child, out)


def parse_ioreg(data: bytes) -> list[UsbDevice]:
    out: list[UsbDevice] = []
    root = plistlib.loads(data)
    for node in root if isinstance(root, list) else [root]:
        _walk_ioreg(node, out)
    return out


def list_macos() -> list[UsbDevice]:
    res = subprocess.run(["ioreg", "-p", "IOUSB", "-l", "-a"], capture_output=True, timeout=10, check=False)
    return parse_ioreg(res.stdout) if res.returncode == 0 and res.stdout else []


_ID_RE = re.compile(r"VID_([0-9A-F]{4})&PID_([0-9A-F]{4})", re.I)


def parse_instance_id(instance_id: str) -> tuple[int, int] | None:
    m = _ID_RE.search(instance_id)
    return (int(m.group(1), 16), int(m.group(2), 16)) if m else None


def list_windows() -> list[UsbDevice]:  # pragma: no cover - richiede Windows
    import ctypes
    from ctypes import wintypes

    setupapi = ctypes.WinDLL("setupapi", use_last_error=True)

    class SP_DEVINFO_DATA(ctypes.Structure):  # noqa: N801 (nome Windows)
        _fields_ = [("cbSize", wintypes.DWORD), ("ClassGuid", ctypes.c_byte * 16), ("DevInst", wintypes.DWORD), ("Reserved", ctypes.c_void_p)]

    DIGCF_PRESENT, DIGCF_ALLCLASSES = 0x2, 0x4
    SPDRP_DEVICEDESC, SPDRP_MFG, SPDRP_FRIENDLYNAME, SPDRP_SERVICE = 0x0, 0xB, 0xC, 0x4
    setupapi.SetupDiGetClassDevsW.restype = ctypes.c_void_p
    hdev = setupapi.SetupDiGetClassDevsW(None, "USB", None, DIGCF_PRESENT | DIGCF_ALLCLASSES)
    if hdev in (None, ctypes.c_void_p(-1).value):
        return []
    out = []
    try:
        i = 0
        while True:
            info = SP_DEVINFO_DATA()
            info.cbSize = ctypes.sizeof(info)
            if not setupapi.SetupDiEnumDeviceInfo(ctypes.c_void_p(hdev), i, ctypes.byref(info)):
                break
            i += 1
            buf = ctypes.create_unicode_buffer(512)
            if not setupapi.SetupDiGetDeviceInstanceIdW(ctypes.c_void_p(hdev), ctypes.byref(info), buf, 512, None):
                continue
            ids = parse_instance_id(buf.value)
            if ids is None or "&MI_" in buf.value.upper():
                continue  # le singole interfacce di un dispositivo composito non si ripetono

            def prop(code: int) -> str:
                b = ctypes.create_unicode_buffer(512)
                ok = setupapi.SetupDiGetDeviceRegistryPropertyW(ctypes.c_void_p(hdev), ctypes.byref(info), code, None, b, ctypes.sizeof(b), None)
                return b.value if ok else ""

            out.append(UsbDevice(ids[0], ids[1], prop(SPDRP_FRIENDLYNAME) or prop(SPDRP_DEVICEDESC) or "USB", prop(SPDRP_MFG), buf.value.rsplit("\\", 1)[-1], buf.value, "", None, prop(SPDRP_SERVICE)))
    finally:
        setupapi.SetupDiDestroyDeviceInfoList(ctypes.c_void_p(hdev))
    return out


def list_usb() -> list[UsbDevice]:
    try:
        if sys.platform.startswith("linux"):
            return list_linux()
        if sys.platform == "darwin":
            return list_macos()
        if sys.platform == "win32":
            return list_windows()
    except Exception:  # noqa: BLE001 - un elenco mancante non deve fermare il programma
        return []
    return []


def missing_serial_drivers(devices: list[UsbDevice], serial_ids: set[tuple[int, int]]) -> list[UsbDevice]:
    """Chip USB-seriale presenti ma senza porta seriale: probabilmente manca il driver."""
    return [d for d in devices if (d.vid, d.pid) in SERIAL_CHIPS and (d.vid, d.pid) not in serial_ids]


def list_hid() -> list[dict]:
    """Elenco HID (hidapi). Solo lettura dei descrittori: nessun dispositivo viene aperto."""
    try:
        import hid
    except ImportError:
        return []
    seen, out = set(), []
    for d in hid.enumerate():
        key = (d.get("vendor_id"), d.get("product_id"), d.get("usage_page"), d.get("usage"), d.get("interface_number"))
        if key in seen:
            continue
        seen.add(key)
        out.append(d)
    return out


HID_USAGES = {(0x01, 0x02): "mouse", (0x01, 0x06): "tastiera", (0x01, 0x05): "gamepad", (0x01, 0x04): "joystick", (0x0C, 0x01): "tasti multimediali", (0x0D, 0x04): "touchscreen", (0x0D, 0x05): "touchpad"}
