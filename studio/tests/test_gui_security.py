"""Interfaccia di sicurezza: prima apertura, blocco con PIN, modalità laboratorio, archivio."""

from unittest import mock

import pytest
from PySide6.QtWidgets import QMessageBox

from polpo_studio.app.context import AppContext
from polpo_studio.app.main_window import MainWindow
from polpo_studio.app.security_dialogs import LabModeDialog, SetupDialog, UnlockDialog

from .test_gui import make_ctx, shot

PASS = "frase di prova abbastanza lunga"


@pytest.fixture
def win(qtbot, tmp_path):
    ctx = make_ctx(tmp_path / "dati")
    w = MainWindow(ctx)
    qtbot.addWidget(w)
    w.show()
    yield w
    w.close()


def test_setup_dialog_creates_vault(qtbot, tmp_path):
    ctx = AppContext.create(tmp_path / "nuovo", kdf_n=2**10)
    d = SetupDialog(ctx)
    qtbot.addWidget(d)
    d.show()
    d.next.click()  # introduzione
    d.p1.setText("corta")
    assert not d.next.isEnabled()
    d.p1.setText(PASS)
    d.p2.setText(PASS + "x")
    assert not d.next.isEnabled()
    d.p2.setText(PASS)
    assert d.next.isEnabled()
    d.next.click()  # crea
    assert ctx.vault.exists() and ctx.vault.unlocked
    assert d.key_label.text().count("-") == 7
    shot(d, "prima_apertura_chiave")
    assert not d.next.isEnabled()
    d.kept.setChecked(True)
    d.next.click()
    d.pin1.setText("1234")
    d.pin2.setText("1235")
    assert not d.next.isEnabled()
    d.pin2.setText("1234")
    d.next.click()
    assert d.result() == d.DialogCode.Accepted
    assert ctx.vault.has_pin
    d.reject()  # dopo la creazione non si può "annullare"


def test_unlock_dialog_wrong_then_right(qtbot, tmp_path):
    ctx = make_ctx(tmp_path / "x")
    rec = ctx.vault.new_recovery_key()
    ctx.lock_full()
    d = UnlockDialog(ctx)
    qtbot.addWidget(d)
    d.show()
    d.panel.field.setText("sbagliata davvero")
    d.panel.submit()
    assert "sbagliata" in d.panel.err.text().lower()
    d.panel.set_mode("recupero")
    d.panel.field.setText(rec.replace("-", " ").lower())
    d.panel.submit()
    assert ctx.vault.unlocked and ctx.audit is not None
    assert d.result() == d.DialogCode.Accepted


def test_lock_screen_pin_and_lockout(win, qtbot):
    ctx = win.ctx
    ctx.vault.set_pin("2468")
    win.lock()
    assert win.locked and ctx.vault.quick_locked
    assert win.lock_page.mode == "pin"
    shot(win, "schermo_bloccato")
    win.lock_page.field.setText("2468")
    win.lock_page.submit()
    assert not win.locked and not ctx.vault.quick_locked
    win.lock()
    for _ in range(5):
        win.lock_page.field.setText("0000")
        win.lock_page.submit()
    assert not ctx.vault.unlocked and win.lock_page.mode == "frase"
    win.lock_page.field.setText(PASS)
    win.lock_page.submit()
    assert ctx.vault.unlocked and not win.locked and ctx.audit is not None


def test_autolock_after_inactivity(win, qtbot):
    win.ctx.settings.set("autolock_min", 1)
    win._last_input -= 120
    win._on_tick()
    assert win.locked
    assert win.lock_page.mode == "frase"  # nessun PIN: serve la frase
    win.lock_page.field.setText(PASS)
    win.lock_page.submit()
    assert not win.locked


def test_lab_mode_needs_rules_and_secret(win, qtbot):
    ctx = win.ctx
    d = LabModeDialog(ctx, win)
    qtbot.addWidget(d)
    d.secret.setText(PASS)
    d.ok.click()
    assert not ctx.lab.enabled and "regole" in d.err.text()
    d.accept_rules.setChecked(True)
    d.secret.setText("sbagliata!!")
    d.ok.click()
    assert not ctx.lab.enabled
    d.secret.setText(PASS)
    d.minutes.setValue(5)
    d.ok.click()
    assert ctx.lab.enabled and 0 < ctx.lab.remaining_s <= 300
    win._on_tick()
    assert win.st_lab.isVisible() and "Laboratorio" in win.st_lab.text()
    win.show_page("security")
    qtbot.wait(20)
    shot(win, "sicurezza_laboratorio")
    win.lock()
    assert not ctx.lab.enabled  # il blocco spegne il laboratorio


def test_archive_import_export_delete(win, qtbot, tmp_path):
    win.show_page("files")
    page = win.pages["files"]
    tools = page.tools_box.itemAt(0).widget()
    src = tmp_path / "tv_sala.ir"
    src.write_bytes(b"Filetype: IR signals file\nVersion: 1\n")
    assert tools.import_files([str(src)]) == 1
    item = win.ctx.vault.items()[0]
    assert item.category == "ir" and item.name == "tv_sala.ir"
    tools.table.selectRow(0)
    out = tmp_path / "esportato.ir"
    assert tools.export_file(str(out))
    assert out.read_bytes() == src.read_bytes()
    shot(win, "archivio")
    tools.search.setText("niente")
    assert tools.table.rowCount() == 0
    tools.search.setText("")
    tools.table.selectRow(0)
    assert tools.delete(confirm=False)
    assert win.ctx.vault.items() == []
    msgs = [e.message for e in win.ctx.activity.entries()]
    assert any("Importati 1" in m for m in msgs) and any("Esportato" in m for m in msgs)
    assert win.ctx.audit.verify() == []


def test_security_page_verify_reports_tampering(win, qtbot):
    ctx = win.ctx
    it = ctx.vault.put("nfc", "x", b"dati")
    page = win.pages["security"]
    page._verify()
    assert "integro" in page.verify_out.text()
    blob = bytearray((ctx.vault.objects / it.id).read_bytes())
    blob[-1] ^= 1
    (ctx.vault.objects / it.id).write_bytes(bytes(blob))
    page._verify()
    assert "alterato" in page.verify_out.text()


def test_activity_persisted_encrypted_across_restart(qtbot, tmp_path):
    ctx = make_ctx(tmp_path / "r")
    ctx.activity.add("test", "voce da ritrovare")
    ctx.shutdown()
    ctx2 = AppContext.create(tmp_path / "r", kdf_n=2**10)
    assert ctx2.activity.entries() == []
    ctx2.vault.unlock(PASS)
    ctx2.on_unlocked()
    assert any(e.message == "voce da ritrovare" for e in ctx2.activity.entries())
    assert b"ritrovare" not in (tmp_path / "r" / "cassaforte" / "registro.log").read_bytes()


def test_setup_explains_why_finish_is_off(qtbot, tmp_path):
    ctx = AppContext.create(tmp_path / "pin", kdf_n=2**10)
    d = SetupDialog(ctx)
    qtbot.addWidget(d)
    d.next.click()
    d.p1.setText(PASS)
    d.p2.setText(PASS)
    d.next.click()
    d.kept.setChecked(True)
    d.next.click()
    d.pin1.setText("12ab34")
    assert not d.next.isEnabled() and "solo cifre" in d.err.text()
    d.pin1.setText("123456")
    d.pin2.setText("123457")
    assert not d.next.isEnabled() and "non coincidono" in d.err.text()
    d.pin1.setText("")
    d.pin2.setText("")
    assert d.next.isEnabled() and d.err.text() == ""
