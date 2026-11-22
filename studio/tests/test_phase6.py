"""RFID 125 kHz, 1-Wire/iButton, Polpo Bridge (con una scheda finta su pty, solo per i test)."""

import json
import os
import threading
import time
from unittest import mock

import pytest

from polpo_studio.app.main_window import MainWindow
from polpo_studio.app.tools import common
from polpo_studio.core.capability import Presence, Status, evaluate
from polpo_studio.core.catalog import MODULE_IDS
from polpo_studio.protocols import onewire, rfid125

from .test_gui import make_ctx


# ---------------- formati ----------------


def test_em4100_formats():
    card, fmt = rfid125.parse_code("0012345678")
    assert fmt.startswith("decimale") and card.number == 12345678
    assert card.w26 == ((12345678 >> 16) & 0xFF, 12345678 & 0xFFFF)
    assert rfid125.parse_code(card.w26_text)[0].number == 12345678 & 0xFFFFFF
    h, fmt = rfid125.parse_code("1A00BC614E")
    assert fmt.startswith("esadecimale a 10") and h.version == 0x1A and h.number == 0x00BC614E and h.hex == "1A00BC614E"
    assert rfid125.parse_code("ciao")[0] is None and rfid125.parse_code("999,99999")[0] is None
    bits = card.w26_bits
    assert len(bits) == 26 and bits[1:13].count("1") % 2 == int(bits[0]) and (bits[13:25].count("1") + int(bits[25])) % 2 == 1


def test_rdm6300_frames_and_bad_checksum():
    p = rfid125.Rdm6300Parser()
    good = rfid125.rdm6300_frame(rfid125.Em4100(0x1A, 0x00BC614E))
    bad = bytearray(good)
    bad[12] ^= 1
    cards = p.feed(b"rumore" + bytes(bad) + good[:5])
    assert cards == [] and p.bad_frames >= 1
    cards = p.feed(good[5:] + good)
    assert [c.hex for c in cards] == ["1A00BC614E", "1A00BC614E"]


def test_wedge_burst_heuristic():
    fast = rfid125.burst_from_times([(c, i * 0.005) for i, c in enumerate("0012345678")])
    slow = rfid125.burst_from_times([(c, i * 0.25) for i, c in enumerate("0012345678")])
    assert fast.looks_like_reader and not slow.looks_like_reader


def test_onewire_crc8_maxim_example():
    # Esempio della nota applicativa Maxim AN27: famiglia 02h, serie 000000 01B81C, CRC A2h.
    rom = onewire.Rom(bytes([0x02, 0x1C, 0xB8, 0x01, 0x00, 0x00, 0x00, 0xA2]))
    assert rom.crc_ok and rom.serial == "00000001B81C"
    assert onewire.crc8(b"") == 0
    made = onewire.make_rom(0x01, 0x123456789ABC)
    assert made.crc_ok and made.family_name.startswith("DS1990A")
    assert onewire.parse_rom(made.text.replace(" ", ":")) == made
    assert not onewire.Rom(made.raw[:7] + bytes([made.raw[7] ^ 1])).crc_ok
    assert onewire.parse_rom("12 34") is None


# ---------------- Bridge finto su pty ----------------


class FakeBridge:
    """Risponde come lo sketch polpo_bridge.ino (solo per i test: l'app non simula il Bridge)."""

    def __init__(self, boot_delay=0.3):
        import termios
        import tty

        self.master, self.slave = os.openpty()
        tty.setraw(self.slave)
        attrs = termios.tcgetattr(self.slave)
        attrs[3] &= ~termios.ECHO
        termios.tcsetattr(self.slave, termios.TCSANOW, attrs)
        self.port = os.ttyname(self.slave)
        self.outputs, self.levels = set(), {4: 1, 5: 0, 13: 0}
        self.roms = [onewire.make_rom(0x01, 0xA1B2C3D4E5F6).text, "01 11 22 33 44 55 66 00"]
        self.boot_until = time.monotonic() + boot_delay
        self.stop = threading.Event()
        threading.Thread(target=self.run, daemon=True).start()

    def reply(self, obj):
        os.write(self.master, json.dumps(obj).encode() + b"\n")

    def run(self):
        buf = b""
        while not self.stop.is_set():
            try:
                buf += os.read(self.master, 1024)
            except OSError:
                return
            while b"\n" in buf:
                line, buf = buf.split(b"\n", 1)
                if time.monotonic() < self.boot_until:
                    continue  # come un Arduino che si sta riavviando
                req = json.loads(line)
                rid, cmd, a = req["id"], req["cmd"], req.get("args", {})
                ok = lambda d: self.reply({"id": rid, "ok": True, "data": d})  # noqa: E731
                err = lambda c, m: self.reply({"id": rid, "ok": False, "error": {"code": c, "msg": m}})  # noqa: E731
                if cmd == "hello":
                    ok({"bridge": "Polpo Bridge", "version": "0.1.0", "proto": 1, "board": "Finta (test)", "pins": [4, 5, 13], "adc": [5], "onewire_pin": 4, "adc_bits": 10})
                elif cmd == "pin.mode":
                    (self.outputs.add if a["mode"] == "output" else self.outputs.discard)(a["pin"])
                    ok({"pin": a["pin"], "mode": a["mode"]})
                elif cmd == "pin.read":
                    ok({"value": self.levels.get(a["pin"], 0)})
                elif cmd == "pin.write":
                    if a["pin"] not in self.outputs:
                        err("denied", "imposta prima il pin come uscita (pin.mode)")
                    else:
                        self.levels[a["pin"]] = a["value"]
                        ok({"value": a["value"]})
                elif cmd == "adc.read":
                    ok({"raw": 512, "bits": 10})
                elif cmd == "i2c.scan":
                    ok({"devices": [0x3C]})
                elif cmd == "ow.reset":
                    ok({"presence": True})
                elif cmd == "ow.search":
                    ok({"roms": [{"rom": r, "crc_ok": onewire.parse_rom(r).crc_ok} for r in self.roms]})
                else:
                    err("unknown_cmd", "comando sconosciuto")

    def close(self):
        self.stop.set()
        os.close(self.master)
        os.close(self.slave)


@pytest.fixture
def fake_bridge():
    b = FakeBridge()
    yield b
    b.close()


@pytest.fixture
def win(qtbot, tmp_path):
    ctx = make_ctx(tmp_path / "dati")
    w = MainWindow(ctx)
    qtbot.addWidget(w)
    w.show()
    yield w
    w.close()


def tool(win, key):
    win.show_page(key)
    return win.pages[key].tools_box.itemAt(0).widget()


def test_bridge_manager_waits_for_boot_and_detects(win, fake_bridge):
    ctx = win.ctx
    info = ctx.bridge.connect(fake_bridge.port).result(timeout=10)
    assert info["board"] == "Finta (test)"
    assert ctx.hardware.get("bridge").presence == Presence.DETECTED
    ib = MODULE_IDS["ibutton"].capabilities[0]
    assert evaluate(ib, ctx.hardware.snapshot()).status == Status.NEEDS_HARDWARE  # sonda 1-Wire da dichiarare
    ctx.settings.set("declared_hardware", {"bridge.onewire": True})
    assert evaluate(ib, ctx.hardware.snapshot()).status == Status.EXPERIMENTAL
    ctx.bridge.disconnect().result(timeout=5)
    assert ctx.hardware.get("bridge").presence == Presence.ABSENT


def test_bridge_rejects_other_boards(win, tmp_path):
    import termios
    import tty

    master, slave = os.openpty()
    tty.setraw(slave)
    try:
        with pytest.raises(Exception) as e:
            win.ctx.bridge.connect(os.ttyname(slave), boot_wait=1.5).result(timeout=10)
        assert "Polpo Bridge" in str(e.value)
    finally:
        os.close(master)
        os.close(slave)


def test_ibutton_tools_with_bridge(win, qtbot, fake_bridge):
    t = tool(win, "ibutton")
    t.search()
    assert "Collega prima il Polpo Bridge" in t.status.text()
    t.panel.connect(fake_bridge.port)
    qtbot.waitUntil(lambda: win.ctx.bridge.connected, timeout=10000)
    qtbot.waitUntil(lambda: "Finta" in t.panel.info.text(), timeout=3000)
    t.search()
    qtbot.waitUntil(lambda: t.table.rowCount() == 2, timeout=3000)
    assert t.table.item(0, 3).text() == "valido" and t.table.item(1, 3).text() == "ERRATO"
    t.table.selectRow(0)
    assert t.save_selected()
    assert win.ctx.vault.items("ibutton")[0].meta["rom"].startswith("01 ")
    t.manual.setText("02 1C B8 01 00 00 00 A2")
    assert "valido" in t.analyse()
    t.presence()
    qtbot.waitUntil(lambda: "Presenza" in t.status.text(), timeout=3000)


def test_gpio_bridge_outputs_need_lab(win, qtbot, fake_bridge):
    t = tool(win, "gpio")
    t.tabs.setCurrentIndex(5)
    t.bpanel.connect(fake_bridge.port)
    qtbot.waitUntil(lambda: t.b_pin.count() == 3, timeout=10000)
    t.b_read()
    qtbot.waitUntil(lambda: "pin 4 = 1" in t.b_out.toPlainText(), timeout=3000)
    t.b_mode.setCurrentIndex(2)
    t.b_set_mode()
    assert "laboratorio" in t.status.text()
    t.b_write(1)
    assert "laboratorio" in t.status.text()
    win.ctx.lab.enable(5)
    t.b_write(1)
    qtbot.waitUntil(lambda: "uscita" in t.status.text(), timeout=3000)  # rifiutato dallo sketch: non è un'uscita
    with mock.patch.object(common, "confirm_sensitive", return_value=True):
        t.b_set_mode()
    qtbot.waitUntil(lambda: "output" in t.b_out.toPlainText(), timeout=3000)
    t.b_write(1)
    qtbot.waitUntil(lambda: "← 1" in t.b_out.toPlainText(), timeout=3000)
    t.b_pin.setCurrentIndex(1)
    t.b_adc()
    t.b_i2c()
    qtbot.waitUntil(lambda: "0x3C" in t.b_out.toPlainText() and "ADC" in t.b_out.toPlainText(), timeout=3000)


def test_rfid_tools(win, qtbot, tmp_path):
    t = tool(win, "rfid125")
    t.wedge.setFocus()
    qtbot.keyClicks(t.wedge, "0012345678")
    from PySide6.QtCore import Qt

    qtbot.keyClick(t.wedge, Qt.Key.Key_Return)
    assert t.last is not None and t.last.number == 12345678
    assert "lettore USB" in t.result.text()
    t.on_burst(rfid125.burst_from_times([(c, i * 0.3) for i, c in enumerate("0012345678")]))
    assert "a mano" in t.status.text()
    t.card_name.setText("badge palestra")
    t.test_media.setChecked(True)
    assert t.save_card()
    t.conv_in.setText("188,24910")
    assert t.convert() and t.last.w26_text == "188,24910"
    t.rdm_feed(rfid125.rdm6300_frame(rfid125.Em4100(0x1A, 0x00BC614E)))
    assert t.last.hex == "1A00BC614E"
    t.refresh_archive()
    assert t.arch.rowCount() == 1 and t.report(str(tmp_path / "r.html"))
