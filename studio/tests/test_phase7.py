"""Sistema delle app e personalizzazione."""

import json
from unittest import mock

import pytest
from PySide6.QtCore import Qt

from polpo_studio.app.main_window import MainWindow
from polpo_studio.app.tools import common
from polpo_studio.apps import converter, crc_tool, ndef_app, radio_budget
from polpo_studio.core.apps import AppApi, AppError, ThirdPartyApps, parse_manifest
from polpo_studio.core.capability import Status, evaluate

from .test_gui import make_ctx, shot

APP_CODE = '''
from PySide6.QtWidgets import QLabel

def create(api):
    api.log("aperta")
    return QLabel("ciao dalla mia app")
'''


def make_app(folder, **over):
    folder.mkdir(parents=True, exist_ok=True)
    m = {"id": "mia_app", "name": "Mia app", "description": "Prova", "version": "0.1", "category": "strumenti", "author": "Io", "permissions": ["vault.read"], "vault_categories": ["nfc"]}
    m.update(over)
    (folder / "manifest.json").write_text(json.dumps(m))
    (folder / "main.py").write_text(APP_CODE)
    return folder


def test_manifest_validation():
    ok = parse_manifest({"id": "abc", "name": "A", "description": "d", "version": "1", "category": "radio", "author": "x", "hardware": [["polpo", "polpo.rf433"]]})
    assert ok.capability().needs_lab and ok.capability().experimental
    for bad in ({"id": "A!"}, {"permissions": ["rf.tx"]}, {"hardware": [["inventato"]]}, {"vault_categories": ["segreti"]}, {"name": ""}):
        base = {"id": "abc", "name": "A", "description": "d", "version": "1", "category": "radio", "author": "x"}
        base.update(bad)
        with pytest.raises(AppError):
            parse_manifest(base)


def test_builtin_app_logic():
    assert converter.convert("255", "dec")["hex"] == "FF"
    assert converter.convert("50 6F", "hex")["ascii"] == "Po"
    assert converter.convert("UG9scG8=", "b64")["ascii"] == "Polpo"
    assert crc_tool.checks(b"123456789")["CRC16-Modbus"] == "4B37"
    ms, n = radio_budget.estimate(1, 24, 350, 4)
    assert ms == pytest.approx((4 * 24 + 32) * 350 * 4 / 1000) and n > 1000
    assert len(ndef_app.build("uri", "https://example.org")) == 2 + 4 + 1 + len("example.org") + 1


def test_app_api_permissions(tmp_path):
    ctx = make_ctx(tmp_path / "a")
    m = parse_manifest({"id": "abc", "name": "A", "description": "d", "version": "1", "category": "nfc", "author": "x", "permissions": ["vault.read", "polpo.nfc.read"], "vault_categories": ["nfc"]})
    api = AppApi(ctx, m)
    ctx.vault.put("nfc", "t", b"1")
    ctx.vault.put("radio", "r", b"2")
    assert len(api.vault_items("nfc")) == 1
    with pytest.raises(PermissionError):
        api.vault_items("radio")
    with pytest.raises(PermissionError):
        api.vault_put("nfc", "x", b"1")  # manca vault.write
    with pytest.raises(PermissionError):
        api.request("rf.tx", {"file": "/polpo/x.sub"})  # nessun permesso concede trasmissioni
    api.request("nfc.read")  # concesso (fallisce poi perché il Polpo non è collegato, ma non per permesso)
    ctx.shutdown()


def test_third_party_install_integrity(tmp_path):
    ctx = make_ctx(tmp_path / "b")
    tp = ThirdPartyApps(ctx.data_dir / "app", ctx.settings)
    src = make_app(tmp_path / "src")
    m = tp.install(src)
    assert tp.verify(m.id) == [] and tp.installed()[0].name == "Mia app"
    assert callable(tp.load(m).create)
    (m.path / "main.py").write_text(APP_CODE + "\n# modificata\n")
    with pytest.raises(AppError) as e:
        tp.load(m)
    assert "modificata" in str(e.value) or "modificato" in str(e.value)
    tp.uninstall(m.id)
    assert tp.installed() == [] and not m.path.exists()
    with pytest.raises(AppError):
        tp.read_candidate(tmp_path)
    ctx.shutdown()


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


def test_apps_catalog_builtin_and_third_party(win, qtbot, tmp_path):
    t = tool(win, "apps")
    assert t.table.rowCount() == 4
    t.search.setText("crc")
    assert t.table.rowCount() == 1
    t.table.selectRow(0)
    dlg = t.open_selected()
    assert dlg is not None and dlg.isVisible()
    dlg.close()
    t.search.setText("")
    src = make_app(tmp_path / "terza", hardware=[["polpo", "polpo.rfid2"]])
    assert t.install(str(src)) is None and "laboratorio" in t.status.text()
    win.ctx.lab.enable(5)
    with mock.patch.object(common, "confirm_sensitive", return_value=True):
        m = t.install(str(src))
    assert m is not None and t.table.rowCount() == 5
    row = next(r for r in range(t.table.rowCount()) if t.table.item(r, 0).text() == "Mia app")
    assert t.table.cellWidget(row, 5).property("status") == Status.NEEDS_HARDWARE.value
    t.table.selectRow(row)
    dlg = t.open_selected()
    assert dlg is not None and any("aperta" in e.message for e in win.ctx.activity.entries())
    shot(win, "modulo_app")
    win.ctx.lab.disable()
    t.table.selectRow(row)
    assert t.open_selected() is None and "laboratorio" in t.status.text()
    t.uninstall()
    assert t.table.rowCount() == 4


def test_personalization(win, qtbot):
    s = win.ctx.settings
    s.set("sidebar_order", ["nfc", "radio"])
    s.set("hidden_modules", ["ibutton"])
    qtbot.waitUntil(lambda: win.sidebar.item(1).data(Qt.ItemDataRole.UserRole) == "nfc", timeout=2000)
    keys = [win.sidebar.item(i).data(Qt.ItemDataRole.UserRole) for i in range(win.sidebar.count())]
    assert "ibutton" not in keys and keys[2] == "radio"
    s.set("shortcuts", {"connect_virtual": "Ctrl+Alt+V"})
    qtbot.waitUntil(lambda: win.qactions["connect_virtual"].shortcut().toString() == "Ctrl+Alt+V", timeout=2000)
    assert win.qactions["connect_usb"].shortcut().toString() == "Ctrl+L"
    s.set("sidebar_compact", True)
    qtbot.waitUntil(lambda: win.sidebar.width() == 64 and win.sidebar.item(0).text() == "", timeout=2000)
    assert win.sidebar.item(0).toolTip() == "Home"
    s.set("icon_style", "pieno")
    s.set("density", "compatta")
    qtbot.wait(50)
    s.set("dashboard_cards", ["functions", "polpo"])
    dash = win.pages["home"]
    qtbot.waitUntil(lambda: not dash.cards["hardware"].isVisible() or not dash.cards["hardware"].isVisibleTo(dash), timeout=2000)
    win.show_page("settings")
    page = win.pages["settings"]
    page.tabs.setCurrentIndex(1)
    qtbot.wait(20)
    shot(win, "impostazioni_menu")
    s.set("sidebar_compact", False)
    qtbot.waitUntil(lambda: win.pages["settings"].tabs.currentIndex() == 1, timeout=2000)  # la scheda resta quella scelta
