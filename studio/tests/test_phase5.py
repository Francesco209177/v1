"""DuckyScript (parità col firmware), elettronica, elenco USB, Bluetooth con bleak finto, strumenti GUI."""

import os
import plistlib
import sys
import threading
import time
import types
from unittest import mock

import pytest

from polpo_studio.app.main_window import MainWindow
from polpo_studio.app.tools import common
from polpo_studio.core.capability import Presence
from polpo_studio.devices import ble as ble_mod
from polpo_studio.devices import usb_list
from polpo_studio.devices.serial_console import ConsoleError, SerialConsole
from polpo_studio.protocols import ducky, electronics as el

from .test_gui import make_ctx


# ---------------- DuckyScript: stessi casi di polpo/test/test_ducky ----------------


def test_ducky_layouts_like_firmware():
    assert ducky.layout_lookup("IT", "@") == (ducky.MOD_RALT, ducky.K_SEMI)
    assert ducky.layout_lookup("IT", "{") == (ducky.MOD_RALT | ducky.MOD_LSHIFT, ducky.K_LBR)
    assert ducky.layout_lookup("IT", "è") == (0, ducky.K_LBR)
    assert ducky.layout_lookup("IT", "-")[1] == ducky.K_SLASH
    assert ducky.layout_lookup("IT", "Q")[0] == ducky.MOD_LSHIFT
    assert ducky.layout_lookup("IT", "`") is None and ducky.layout_lookup("IT", "~") is None
    assert ducky.layout_lookup("US", "@") == (ducky.MOD_LSHIFT, 0x1F)
    assert ducky.layout_lookup("US", "è") is None
    assert all(ducky.layout_lookup("US", chr(c)) for c in range(0x20, 0x7F))
    assert [chr(c) for c in range(0x20, 0x7F) if not ducky.layout_lookup("IT", chr(c))] == ["`", "~"]


def test_ducky_basic_script_like_firmware():
    src = "REM apre il blocco note e scrive un saluto\nDELAY 500\nGUI r\nDELAY 300\nSTRING notepad\nENTER\nSTRINGLN Ciao, è il Polpo!\nCTRL-ALT DELETE\n"
    s = ducky.parse(src, "IT")
    assert s.ok and s.line_count == 8 and len(s.actions) == 8
    assert (s.actions[0].type, s.actions[0].ms) == ("delay", 500)
    assert (s.actions[1].modifiers, s.actions[1].keycode) == (ducky.MOD_LGUI, ducky.K_A + ord("r") - ord("a"))
    assert s.actions[3].text == "notepad" and s.actions[6].type == "key"
    assert (s.actions[7].modifiers, s.actions[7].keycode) == (ducky.MOD_LCTRL | ducky.MOD_LALT, ducky.K_DEL)
    assert s.total_delay_ms == 800 and s.total_chars == 7 + 17


def test_ducky_errors_and_repeat_like_firmware():
    assert not ducky.parse("STRING ls ~\n", "IT").ok and ducky.parse("STRING ls ~\n", "IT").errors[0][0] == 1
    assert ducky.parse("STRING ls ~\n", "US").ok
    s = ducky.parse("DEFAULT_DELAY 100\nTAB\nREPEAT 3\nSTRING a\n", "US")
    assert s.ok and len(s.actions) == 2 + 6 + 2 and s.total_delay_ms == 500
    e = ducky.parse("FOO BAR\nDELAY abc\nREPEAT 2\nDELAY 999999\nCTRL NOTAKEY\n", "US")
    assert len(e.errors) == 5 and e.errors[0][0] == 1 and e.errors[4][0] == 5
    k = ducky.parse("F5\nALT F4\nshift tab\nWINDOWS\nPRINTSCREEN\n", "US")
    assert k.ok and k.actions[0].keycode == ducky.K_F1 + 4
    assert (k.actions[1].modifiers, k.actions[1].keycode) == (ducky.MOD_LALT, ducky.K_F1 + 3)
    assert (k.actions[2].modifiers, k.actions[2].keycode) == (ducky.MOD_LSHIFT, ducky.K_TAB)
    big = ducky.parse("STRING a\nREPEAT 500\nREPEAT 500\nREPEAT 500\n", "US")
    assert any("1200" in m for _, m in big.errors)


# ---------------- elettronica ----------------


def test_electronics():
    assert el.ohm(v=5, r=250)["i"] == pytest.approx(0.02)
    assert el.ohm(i=0.02, r=250)["v"] == pytest.approx(5) and el.ohm(v=5, i=0.02)["p"] == pytest.approx(0.1)
    with pytest.raises(ValueError):
        el.ohm(v=5)
    assert el.divider(5, 10_000, 20_000) == pytest.approx(3.3333, abs=1e-3)
    led = el.led_resistor(5, 2, 10)
    assert led["exact"] == pytest.approx(300) and led["standard"] == pytest.approx(330) and led["current_ma"] < 10
    assert el.decode_bands(["giallo", "viola", "rosso", "oro"]) == (4700, 5.0)
    assert el.decode_bands(["marrone", "nero", "nero", "rosso", "marrone"]) == (10_000, 1.0)
    assert el.encode_bands(4700) == ["giallo", "viola", "rosso"]
    assert el.encode_bands(4.7) == ["giallo", "viola", "oro"]
    assert el.encode_bands(10_000, five=True) == ["marrone", "nero", "nero", "rosso"]
    assert el.format_ohms(4700) == "4,7 kΩ"
    with pytest.raises(ValueError):
        el.decode_bands(["oro", "viola", "rosso"])


# ---------------- USB ----------------


def test_usb_linux_sysfs(tmp_path):
    d = tmp_path / "1-2"
    d.mkdir()
    for k, v in {"idVendor": "303a", "idProduct": "1001", "product": "USB JTAG/serial debug unit", "manufacturer": "Espressif", "busnum": "1", "speed": "12", "bDeviceClass": "ef"}.items():
        (d / k).write_text(v + "\n")
    intf = d / "1-2:1.0"
    intf.mkdir()
    drv = tmp_path / "drivers" / "cdc_acm"
    drv.mkdir(parents=True)
    os.symlink(drv, intf / "driver")
    (tmp_path / "1-2:1.0").mkdir()
    devs = usb_list.list_linux(tmp_path)
    assert len(devs) == 1
    x = devs[0]
    assert (x.usb_id, x.vendor_name, x.class_name, x.driver) == ("303A:1001", "Espressif", "Varie", "cdc_acm")


def test_usb_macos_ioreg_and_windows_ids():
    data = plistlib.dumps([{"IORegistryEntryName": "Root", "IORegistryEntryChildren": [{"idVendor": 0x1A86, "idProduct": 0x7523, "USB Product Name": "USB Serial", "locationID": 0x14100000}]}])
    devs = usb_list.parse_ioreg(data)
    assert devs[0].usb_id == "1A86:7523" and devs[0].vendor_name == "WCH (QinHeng)"
    assert usb_list.parse_instance_id(r"USB\VID_303A&PID_1001\D8:3B") == (0x303A, 0x1001)
    assert usb_list.parse_instance_id("ROOT\\HUB") is None
    missing = usb_list.missing_serial_drivers(devs, set())
    assert missing and missing[0].usb_id == "1A86:7523"
    assert usb_list.missing_serial_drivers(devs, {(0x1A86, 0x7523)}) == []


# ---------------- Bluetooth con bleak finto ----------------


class FakeDev:
    def __init__(self, address, name):
        self.address, self.name = address, name


class FakeAdv:
    def __init__(self, name, rssi):
        self.local_name, self.rssi = name, rssi
        self.manufacturer_data = {0x004C: b"x"}
        self.service_uuids = ["0000180f-0000-1000-8000-00805f9b34fb"]
        self.tx_power = None


class FakeChar:
    uuid, description, properties, handle = "00002a19-0000-1000-8000-00805f9b34fb", "Battery Level", ["read", "notify"], 12


class FakeService:
    uuid, description, characteristics = "0000180f-0000-1000-8000-00805f9b34fb", "Battery Service", [FakeChar()]


class FakeClient:
    def __init__(self, address, timeout=15):
        self.address, self.is_connected, self.cb = address, False, None
        self.services = [FakeService()]

    async def connect(self):
        self.is_connected = True

    async def disconnect(self):
        self.is_connected = False

    async def read_gatt_char(self, uuid):
        return bytearray(b"\x55")

    async def start_notify(self, uuid, cb):
        cb(None, bytearray(b"\x56"))

    async def stop_notify(self, uuid):
        pass


class FakeScanner:
    fail = False

    @staticmethod
    async def discover(timeout, return_adv):
        if FakeScanner.fail:
            raise RuntimeError("No Bluetooth adapters found.")
        return {"AA": (FakeDev("AA:BB:CC:DD:EE:01", None), FakeAdv("Sensore", -50))}


@pytest.fixture
def fake_bleak(monkeypatch):
    mod = types.ModuleType("bleak")
    mod.BleakScanner, mod.BleakClient = FakeScanner, FakeClient
    monkeypatch.setitem(sys.modules, "bleak", mod)
    FakeScanner.fail = False
    yield mod


def test_ble_worker_with_fake_bleak(fake_bleak):
    w = ble_mod.BleWorker()
    try:
        devs = w.scan(1).result(timeout=3)
        assert devs[0]["name"] == "Sensore" and devs[0]["manufacturers"] == [0x004C]
        w.connect("AA:BB:CC:DD:EE:01").result(timeout=3)
        svc = w.services().result(timeout=3)
        assert svc[0]["name"] == "Batteria" and svc[0]["characteristics"][0]["properties"] == ["read", "notify"]
        assert w.read(FakeChar.uuid).result(timeout=3) == b"\x55"
        got = []
        w.start_notify(FakeChar.uuid, lambda u, d: got.append(d)).result(timeout=3)
        assert got == [b"\x56"]
        FakeScanner.fail = True
        with pytest.raises(ble_mod.BleUnavailable) as e:
            w.scan(1).result(timeout=3)
        assert "adattatore" in str(e.value)
    finally:
        w.shutdown()
    assert ble_mod.format_value(b"ok") == "6F 6B  «ok»"


# ---------------- interfaccia ----------------


@pytest.fixture
def win(qtbot, tmp_path):
    ctx = make_ctx(tmp_path / "dati")
    ctx.settings.set("virtual_confirm_dialog", False)
    ctx.devices.virtual_options = dict(time_scale=0.01, latency=0.0, auto_confirm_delay=0.3)
    w = MainWindow(ctx)
    qtbot.addWidget(w)
    w.show()
    yield w
    w.close()


def tool(win, key):
    win.show_page(key)
    return win.pages[key].tools_box.itemAt(0).widget()


def test_usb_tools_and_ducky_copy(win, qtbot):
    t = tool(win, "usb")
    t.refresh_devices()
    t.refresh_serial()
    t.refresh_hid()
    t.tabs.setCurrentIndex(4)
    assert t.check_ducky().ok
    t.ducky.setPlainText("STRING ~\n")
    assert not t.check_ducky().ok and "Riga 1" in t.ducky_out.text()
    t.layout_box.setCurrentText("US")
    assert t.check_ducky().ok
    assert t.save_ducky()
    win.connect_virtual()
    qtbot.waitUntil(lambda: win.ctx.devices.connected, timeout=5000)
    t.ducky_name.setText("prova script!")
    t.copy_ducky()
    qtbot.waitUntil(lambda: "/polpo/badusb/prova_script_.txt" in win.ctx.devices.virtual.files, timeout=5000)
    qtbot.waitUntil(lambda: "BadUSB" in t.status.text(), timeout=3000)
    from PySide6.QtCore import Qt

    qtbot.mouseClick(t.tester, Qt.MouseButton.LeftButton)
    qtbot.keyClick(t.tester, "a")
    assert t.tester.count >= 2


def test_bluetooth_tools_with_fake_worker(win, qtbot, fake_bleak):
    t = tool(win, "bluetooth")
    t.scan()
    qtbot.waitUntil(lambda: t.table.rowCount() == 1, timeout=3000)
    assert win.ctx.hardware.get("pc.ble").presence == Presence.DETECTED
    t.table.selectRow(0)
    t.connect()
    assert "autorizza" in t.status.text().lower()
    with mock.patch.object(common, "confirm_sensitive", return_value=True):
        t.authorize()
    assert t.auth.is_authorized("AA:BB:CC:DD:EE:01")
    t.table.selectRow(0)
    t.connect()
    qtbot.waitUntil(lambda: t.services.topLevelItemCount() == 1, timeout=3000)
    t.services.setCurrentItem(t.services.topLevelItem(0).child(0))
    t.read()
    qtbot.waitUntil(lambda: "55" in t.log.toPlainText(), timeout=3000)
    FakeScanner.fail = True
    t.scan()
    qtbot.waitUntil(lambda: win.ctx.hardware.get("pc.ble").presence == Presence.ABSENT, timeout=3000)
    assert "adattatore" in t.status.text()
    t.worker.shutdown()


def test_gpio_tools(win, qtbot):
    t = tool(win, "gpio")
    t.tabs.setCurrentIndex(4)
    assert "mA" in t.calc_ohm()
    assert "3.333" in t.calc_divider()
    assert "330" in t.calc_led()
    assert "4,7 kΩ ±5%" in t.calc_colors()
    t.read_pins()
    assert "Collega prima" in t.status.text()
    win.connect_virtual()
    qtbot.waitUntil(lambda: win.ctx.devices.connected, timeout=5000)
    t.i2c_scan()
    qtbot.waitUntil(lambda: "0x28" in t.grove_out.toPlainText(), timeout=3000)
    t.f_file.setText("/non/esiste.bin")
    t.write_flash()
    assert ".bin" in t.status.text()
    assert t.esptool_args("info")[-1] == "flash-id"


def test_serial_console_over_pty():
    import termios
    import tty

    master, slave = os.openpty()
    tty.setraw(slave)
    got, ev = [], threading.Event()
    c = SerialConsole(os.ttyname(slave), 115200, lambda d: (got.append(d), ev.set()), lambda r: None)
    c.open()
    try:
        os.write(master, b"ciao dalla scheda\n")
        deadline = time.monotonic() + 10
        while b"ciao dalla scheda" not in b"".join(got) and time.monotonic() < deadline:
            ev.wait(0.1)
        assert b"ciao dalla scheda" in b"".join(got)
        c.write(b"ping\n")
        received = b""
        os.set_blocking(master, False)
        while b"ping\n" not in received and time.monotonic() < deadline:
            try:
                received += os.read(master, 100)
            except BlockingIOError:
                time.sleep(0.02)
        assert received.startswith(b"ping")
    finally:
        c.close()
        os.close(master)
        os.close(slave)
    with pytest.raises(ConsoleError):
        SerialConsole("/dev/null", 1200, print, print)
