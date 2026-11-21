"""Strumenti dei moduli Polpo, Radio, Infrarossi, NFC con il Polpo virtuale."""

import json
from unittest import mock

import pytest

from polpo_studio.app.main_window import MainWindow
from polpo_studio.app.tools import common
from polpo_studio.core.capability import Presence
from polpo_studio.devices import firmware, pcsc
from polpo_studio.protocols import ir, subghz

from .test_gui import make_ctx, shot


@pytest.fixture
def win(qtbot, tmp_path):
    ctx = make_ctx(tmp_path / "dati")
    ctx.settings.set("virtual_confirm_dialog", False)
    ctx.devices.virtual_options = dict(time_scale=0.01, latency=0.0, auto_confirm_delay=0.3)
    w = MainWindow(ctx)
    qtbot.addWidget(w)
    w.show()
    w.connect_virtual()
    qtbot.waitUntil(lambda: ctx.devices.connected, timeout=5000)
    yield w
    w.close()


def tool(win, key):
    win.show_page(key)
    return win.pages[key].tools_box.itemAt(0).widget()


def test_polpo_info_diag_sd_backup_and_scans(win, qtbot, tmp_path):
    t = tool(win, "polpo")
    t.on_connection_changed()
    t.run_diag()
    qtbot.waitUntil(lambda: "RFID2" in t.diag_out.toPlainText(), timeout=3000)
    t.save_diag()
    t.tabs.setCurrentIndex(2)
    t.sd_refresh()
    qtbot.waitUntil(lambda: t.tree.topLevelItemCount() == 1 and t.tree.topLevelItem(0).childCount() > 3, timeout=3000)
    root = t.tree.topLevelItem(0)
    leggimi = next(root.child(i) for i in range(root.childCount()) if root.child(i).text(0) == "LEGGIMI.txt")
    t.tree.setCurrentItem(leggimi)
    dest = tmp_path / "leggimi.txt"
    t.sd_to_pc(str(dest))
    qtbot.waitUntil(dest.exists, timeout=3000)
    src = tmp_path / "nota.txt"
    src.write_text("ciao")
    t.tree.setCurrentItem(root)
    t.sd_upload(str(src))
    qtbot.waitUntil(lambda: "/polpo/nota.txt" in win.ctx.devices.virtual.files, timeout=3000)
    t.sd_backup()
    qtbot.waitUntil(lambda: any(i.category == "backup" for i in win.ctx.vault.items()), timeout=5000)
    bk = next(i for i in win.ctx.vault.items() if i.category == "backup")
    assert bk.simulated and bk.meta["file"] >= 6
    t.tabs.setCurrentIndex(3)
    t.scan_wifi()
    qtbot.waitUntil(lambda: t.scan_table.rowCount() == 3, timeout=3000)
    assert "simulata" in t.scan_table.item(0, 0).text()
    shot(win, "modulo_polpo_reti")


def test_firmware_manifest_and_command(win):
    fw = firmware.bundled()
    assert fw.sha256 == "e561ba395ce0514548444bfc66f32938177d8ae052db9913553814701b174db6"
    if fw.available:
        assert firmware.verify(fw)
        cmd = firmware.esptool_command("/dev/ttyACM0", fw)
        assert cmd[cmd.index("--before") + 1] == "no-reset" and "0x10000" in cmd
    t = tool(win, "polpo")
    t.flash()  # senza laboratorio: rifiutato
    assert "laboratorio" in t.status.text()


def test_radio_receive_save_transmit_report(win, qtbot, tmp_path):
    t = tool(win, "radio")
    t.rx_start()
    qtbot.waitUntil(lambda: t.rx_table.rowCount() >= 1, timeout=3000)
    t.rx_stop()
    t.new_device("presa del salotto")
    dev_id = t.register.load()[0]["id"]
    assert t.save_selected("presa salotto", dev_id)
    item = win.ctx.vault.items("radio")[0]
    assert item.simulated and item.meta["device"] == dev_id
    sub = subghz.parse(win.ctx.vault.get(item.id).decode())
    assert sub.code.bits == 24 and sub.code.pulse_us in (350, 352)
    t.refresh_archive()
    t.arch.selectRow(0)
    t.transmit()
    assert "laboratorio" in t.status.text()
    win.ctx.lab.enable(5)
    with mock.patch.object(common, "confirm_sensitive", return_value=True):
        t.transmit()
    qtbot.waitUntil(lambda: "Trasmesso" in t.status.text(), timeout=5000)
    assert any(p.startswith("/polpo/rf433/pc_") for p in win.ctx.devices.virtual.files)
    assert t.report(str(tmp_path / "r.html")) and "presa del salotto" in (tmp_path / "r.html").read_text()
    shot(win, "modulo_radio_archivio")


def test_radio_raw_capture_and_editor(win, qtbot):
    t = tool(win, "radio")
    t.tabs.setCurrentIndex(1)
    t.raw_start()
    qtbot.waitUntil(lambda: len(t.raw) > 10, timeout=3000)
    t.raw_stop()
    assert "PT2262" in t.raw_stats.text()
    assert t.raw_save("cattura")
    shot(win, "modulo_radio_raw")
    t.tabs.setCurrentIndex(3)
    t.editor.setPlainText(t.editor.toPlainText().replace("433920000", "868350000"))
    assert "Non supportato per la trasmissione" in t.check_editor()
    t.editor.setPlainText("Filetype: Flipper SubGhz Key File\nVersion: 1\nFrequency: 433920000\nProtocol: KeeLoq\n")
    assert "Non supportato" in t.check_editor()


def test_simulated_code_never_goes_to_real_polpo(win):
    t = tool(win, "radio")
    it = win.ctx.vault.put("radio", "finto.sub", subghz.serialize(subghz.SubFile()).encode(), origin="simulato")
    with mock.patch.object(type(win.ctx.devices), "simulated", new_callable=mock.PropertyMock, return_value=False):
        with pytest.raises(common.NotSendable):
            common.check_sendable(win.ctx, win.ctx.vault.item(it.id))


def test_ir_library_send_learn_import(win, qtbot, tmp_path):
    t = tool(win, "infrared")
    t.open_source(("lib", "tv|Samsung"))
    assert len(t.signals) == 6
    t.send(t.signals[0])
    qtbot.waitUntil(lambda: "Inviato" in t.status.text(), timeout=3000)
    new_id = t.copy_to_mine("tv sala")
    assert new_id and len(ir.parse(win.ctx.vault.get(new_id).decode()).signals) == 6
    t.learn()
    qtbot.waitUntil(lambda: len(t.signals) == 7, timeout=5000)
    assert win.ctx.vault.item(new_id).simulated  # un tasto del Polpo virtuale rende il telecomando SIMULATO
    src = tmp_path / "x.ir"
    src.write_text((t.ctx.devices.virtual.files["/polpo/ir/esempio_tv.ir"]).decode())
    assert t.import_ir(str(src))
    shot(win, "modulo_infrarossi")


def test_nfc_read_save_write_analyse(win, qtbot, tmp_path):
    t = tool(win, "nfc")
    t.read_polpo()
    qtbot.waitUntil(lambda: t.card is not None, timeout=3000)
    html = t.view.toHtml()
    assert "NTAG215" in html and "example.org" in html and "SIMULATO" in html
    assert t.save_card()
    shot(win, "modulo_nfc_lettura")
    t.value.setText("https://example.org/mio")
    t.write()
    assert "laboratorio" in t.status.text()
    win.ctx.lab.enable(5)
    with mock.patch.object(common, "confirm_sensitive", return_value=True):
        t.write()
    qtbot.waitUntil(lambda: "verificato" in t.status.text(), timeout=5000)
    t.read_polpo()
    qtbot.waitUntil(lambda: "example.org/mio" in t.view.toHtml(), timeout=3000)
    t.ndef_in.setPlainText("03 11 D1 01 0D 55 04 65 78 61 6D 70 6C 65 2E 6F 72 67 FE")
    assert "https://example.org" in t.analyse_ndef()
    t.refresh_archive()
    assert t.arch.rowCount() == 1
    assert t.report(str(tmp_path / "n.html"))


def test_pcsc_read_with_fake_reader():
    atr = bytes.fromhex("3B8F8001804F0CA0000003060300030000000068")
    mem = bytearray(64)
    mem[0:4] = bytes([0x04, 0x11, 0x22, 0x88 ^ 0x04 ^ 0x11 ^ 0x22])
    mem[4:8] = bytes([1, 2, 3, 4])
    mem[8] = 1 ^ 2 ^ 3 ^ 4
    mem[12:16] = bytes([0xE1, 0x10, 0x06, 0x00])

    class Fake:
        def getATR(self):
            return list(atr)

        def transmit(self, apdu):
            if apdu[:2] == [0xFF, 0xCA]:
                return [0x04, 0x11, 0x22, 1, 2, 3, 4], 0x90, 0x00
            page = apdu[3]
            return list(mem[page * 4 : page * 4 + 16]), 0x90, 0x00

    card = pcsc.read_card(Fake())
    assert card["uid"] == "04112201020304" and card["sak"] == 0 and card["model"] == "MIFARE Ultralight"
    assert len(bytes.fromhex(card["pages"])) == 16 * 4
    assert pcsc.card_name_from_atr(bytes(5)) is None


def test_tools_without_polpo_say_so(qtbot, tmp_path):
    ctx = make_ctx(tmp_path / "solo")
    w = MainWindow(ctx)
    qtbot.addWidget(w)
    t = tool(w, "nfc")
    t.read_polpo()
    assert "Collega prima il Polpo" in t.status.text()
    assert ctx.hardware.get("polpo.rfid2").presence == Presence.ABSENT
    w.close()
