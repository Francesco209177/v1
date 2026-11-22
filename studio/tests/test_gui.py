"""Interfaccia in modalità offscreen: senza hardware niente risulta "Disponibile" se serve hardware."""

import os
from pathlib import Path

import pytest

from polpo_studio.app.context import AppContext
from polpo_studio.app.main_window import MainWindow
from polpo_studio.app.module_page import ModulePage
from polpo_studio.core.capability import Status
from polpo_studio.core.catalog import MODULE_IDS

SHOTS = os.environ.get("POLPO_SCREENSHOTS")


def make_ctx(folder):
    ctx = AppContext.create(folder, kdf_n=2**10)
    ctx.vault.create("frase di prova abbastanza lunga")
    ctx.on_unlocked()
    return ctx


@pytest.fixture
def win(qtbot, tmp_path):
    ctx = make_ctx(tmp_path / "dati")
    ctx.settings.set("virtual_confirm_dialog", False)
    ctx.devices.virtual_options = dict(time_scale=0.01, latency=0.0, auto_confirm_delay=0.5)
    w = MainWindow(ctx)
    qtbot.addWidget(w)
    w.show()
    yield w
    w.close()


def shot(w, name):
    if SHOTS:
        Path(SHOTS).mkdir(parents=True, exist_ok=True)
        w.grab().save(str(Path(SHOTS) / f"{name}.png"))


def statuses(page: ModulePage):
    return {r.cap.id: r.badge.property("status") for r in page.rows}


def test_every_page_opens(win, qtbot):
    for key in list(win.pages):
        win.show_page(key)
        qtbot.wait(5)
        assert win.stack.currentWidget() is win.pages[key]
    shot(win, "impostazioni")


def test_without_polpo_hardware_features_need_hardware(win):
    radio = statuses(win.pages["radio"])
    assert radio["radio.rx"] == Status.NEEDS_HARDWARE.value
    assert radio["radio.tx"] == Status.NEEDS_HARDWARE.value
    assert radio["radio.analysis"] == Status.AVAILABLE.value  # solo software
    assert radio["radio.jam"] == Status.NOT_AVAILABLE.value
    nfc = statuses(win.pages["nfc"])
    assert nfc["nfc.read"] == Status.NEEDS_HARDWARE.value
    assert nfc["nfc.emulate"] == Status.NOT_AVAILABLE.value
    for key, page in win.pages.items():
        if key in MODULE_IDS:
            for r in page.rows:
                if r.cap.routes and all(any(h.startswith(("polpo", "pc.ble", "pc.pcsc", "rfid125", "bridge")) for h in rt.hardware) for rt in r.cap.routes):
                    assert r.badge.property("status") != Status.AVAILABLE.value, r.cap.id
    win.show_page("home")
    shot(win, "dashboard_senza_hardware")


def test_virtual_polpo_marks_everything_simulated(win, qtbot):
    win.connect_virtual()
    qtbot.waitUntil(lambda: win.ctx.devices.connected, timeout=5000)
    qtbot.waitUntil(lambda: statuses(win.pages["radio"])["radio.rx"] == Status.SIMULATED.value, timeout=3000)
    assert win.st_sim.isVisible()
    assert "SIMULATO" in win.windowTitle()
    dash = win.pages["home"]
    qtbot.waitUntil(lambda: dash.sim_tag.isVisible(), timeout=3000)
    assert "Polpo virtuale" in dash.polpo_details.text()
    assert statuses(win.pages["infrared"])["ir.learn"] == Status.SIMULATED.value
    assert statuses(win.pages["bluetooth"])["ble.scan"] == Status.SIMULATED.value  # via Polpo virtuale
    assert statuses(win.pages["bluetooth"])["ble.gatt"] == Status.NEEDS_HARDWARE.value  # serve l'adattatore del PC
    assert any(e.simulated for e in win.ctx.activity.entries())
    win.show_page("home")
    qtbot.wait(50)
    shot(win, "dashboard_polpo_virtuale")
    win.show_page("radio")
    qtbot.wait(20)
    shot(win, "modulo_radio_virtuale")
    win.disconnect()
    qtbot.waitUntil(lambda: not win.ctx.devices.connected and win.ctx.devices.client is None, timeout=3000)
    qtbot.waitUntil(lambda: statuses(win.pages["radio"])["radio.rx"] == Status.NEEDS_HARDWARE.value, timeout=3000)


def test_declared_hardware_changes_status(win, qtbot):
    win.connect_virtual()
    qtbot.waitUntil(lambda: win.ctx.devices.connected, timeout=5000)
    # con il Polpo vero RF433 è "non verificabile": simuliamo il rapporto del firmware
    from polpo_studio.core.capability import Presence

    win.ctx.hardware.set_polpo(Presence.DETECTED, {"rf433": "unverifiable", "ir_tx": "available"})
    qtbot.waitUntil(lambda: statuses(win.pages["radio"])["radio.rx"] == Status.NEEDS_HARDWARE.value, timeout=2000)
    win.ctx.settings.set("declared_hardware", {"polpo.rf433": True})
    qtbot.waitUntil(lambda: statuses(win.pages["radio"])["radio.rx"] == Status.AVAILABLE.value, timeout=2000)


def test_theme_language_and_favourites(win, qtbot):
    for theme in ("chiaro", "alto_contrasto", "scuro"):
        win.ctx.settings.set("theme", theme)
        qtbot.wait(10)
    win.ctx.settings.set("theme", "chiaro")
    win.show_page("home")
    qtbot.wait(20)
    shot(win, "dashboard_tema_chiaro")
    win.ctx.settings.set("favorites", ["radio", "nfc"])
    qtbot.wait(10)
    win.ctx.settings.set("language", "en")
    qtbot.waitUntil(lambda: win.sidebar.item(0).text() == "Home" and win.sidebar.item(2).text() == "433 MHz radio", timeout=2000)
    assert win.menuBar().actions()[1].text() == "&Polpo"
    win.show_page("nfc")
    qtbot.wait(20)
    shot(win, "modulo_nfc_inglese")
    win.ctx.settings.set("language", "it")
    qtbot.waitUntil(lambda: win.sidebar.item(2).text() == "Radio 433 MHz", timeout=2000)


def test_virtual_confirm_dialog_can_refuse(qtbot, tmp_path):
    ctx = make_ctx(tmp_path / "d2")
    ctx.devices.virtual_options = dict(time_scale=0.01, latency=0.0)
    w = MainWindow(ctx)
    qtbot.addWidget(w)
    w.show()
    w.connect_virtual()
    qtbot.waitUntil(lambda: bool(w._virtual_boxes), timeout=3000)
    box = w._virtual_boxes[0]
    from PySide6.QtWidgets import QMessageBox

    no = [b for b in box.buttons() if box.buttonRole(b) == QMessageBox.ButtonRole.NoRole][0]
    from unittest import mock

    with mock.patch.object(QMessageBox, "warning") as warn:
        no.click()
        qtbot.waitUntil(lambda: warn.called, timeout=3000)
    assert not ctx.devices.connected
    w.close()
