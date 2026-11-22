import json
import time

import pytest

from polpo_studio.core.activity import ActivityLog
from polpo_studio.security import crypto
from polpo_studio.security.audit import AuditLog
from polpo_studio.security.backup import BackupError, export_backup, import_backup, read_backup
from polpo_studio.security.lab import LabMode, PermissionDenied
from polpo_studio.security.vault import MAX_PIN_ERRORS, Vault, VaultError

FAST = 2**10


@pytest.fixture
def vault(tmp_path):
    v = Vault(tmp_path / "cassaforte", kdf_n=FAST)
    v.recovery = v.create("una frase abbastanza lunga")
    return v


def test_recovery_key_format_and_typos():
    k = crypto.new_recovery_key()
    assert len(k) == 39 and k.count("-") == 7
    raw = crypto.normalize_recovery_key(k)
    assert raw and len(raw) == 20
    assert crypto.normalize_recovery_key(k.lower().replace("-", " ")) == raw
    assert crypto.normalize_recovery_key("ABCD") is None


def test_create_unlock_with_passphrase_and_recovery(vault, tmp_path):
    item = vault.put("nfc", "tag cucina", b"\x01\x02", meta={"uid": "04A1"})
    vault.lock()
    assert not vault.unlocked
    v2 = Vault(tmp_path / "cassaforte", kdf_n=FAST)
    with pytest.raises(VaultError) as e:
        v2.unlock("frase sbagliata!!")
    assert e.value.code == "wrong"
    v2.unlock_recovery(vault.recovery.lower())
    assert v2.get(item.id) == b"\x01\x02"
    assert v2.items(query="04a1")[0].name == "tag cucina"
    v2.lock()
    v2.unlock("una frase abbastanza lunga")
    assert v2.item(item.id).meta == {"uid": "04A1"}


def test_nothing_readable_on_disk(vault):
    vault.put("radio", "presa del salotto", b"SEGRETO-IN-CHIARO")
    for p in vault.folder.rglob("*"):
        if p.is_file():
            b = p.read_bytes()
            assert b"SEGRETO-IN-CHIARO" not in b and b"salotto" not in b, p


def test_tamper_swap_and_rollback_detected(vault):
    a = vault.put("ir", "a", b"aaaa")
    b = vault.put("ir", "b", b"bbbb")
    assert vault.verify() == []
    old = (vault.objects / a.id).read_bytes()
    vault.update(a.id, data=b"aaaa-v2")
    (vault.objects / a.id).write_bytes(old)  # ritorno a una versione vecchia
    assert [p.what for p in vault.verify()] == ["alterato o danneggiato"]
    (vault.objects / a.id).write_bytes((vault.objects / b.id).read_bytes())  # scambio
    with pytest.raises(crypto.IntegrityError):
        vault.get(a.id)
    blob = bytearray((vault.objects / b.id).read_bytes())
    blob[-1] ^= 1
    (vault.objects / b.id).write_bytes(bytes(blob))
    (vault.objects / "estraneo").write_bytes(b"x")
    assert len(vault.verify()) == 3


def test_tampered_index_refuses_to_open(vault, tmp_path):
    vault.put("nfc", "x", b"1")
    vault.lock()
    blob = bytearray(vault.index_path.read_bytes())
    blob[20] ^= 0xFF
    vault.index_path.write_bytes(bytes(blob))
    with pytest.raises(VaultError) as e:
        vault.unlock("una frase abbastanza lunga")
    assert e.value.code == "corrupt" and not vault.unlocked


def test_change_passphrase_and_new_recovery(vault):
    with pytest.raises(VaultError):
        vault.change_passphrase("sbagliata", "nuova frase molto lunga")
    vault.change_passphrase("una frase abbastanza lunga", "nuova frase molto lunga")
    new_rec = vault.new_recovery_key()
    vault.lock()
    with pytest.raises(VaultError):
        vault.unlock("una frase abbastanza lunga")
    with pytest.raises(VaultError):
        vault.unlock_recovery(vault.recovery)  # la vecchia chiave di recupero non vale più
    vault.unlock_recovery(new_rec)
    vault.lock()
    vault.unlock("nuova frase molto lunga")


def test_pin_quick_lock_and_lockout(vault):
    with pytest.raises(VaultError):
        vault.set_pin("12a4")
    vault.set_pin("2468")
    assert "2468" not in vault.keys_path.read_text()
    vault.quick_lock()
    assert vault.quick_locked
    assert vault.unlock_pin("2468") and not vault.quick_locked
    vault.quick_lock()
    for _ in range(MAX_PIN_ERRORS - 1):
        assert not vault.unlock_pin("0000")
    assert vault.unlocked
    assert not vault.unlock_pin("0000")
    assert not vault.unlocked  # dopo 5 errori serve la frase


def test_keyring_failure_is_reported(vault, monkeypatch):
    import keyring

    def boom(*a):
        raise RuntimeError("nessun portachiavi")

    monkeypatch.setattr(keyring, "set_password", boom)
    with pytest.raises(VaultError) as e:
        vault.remember_on_this_computer(True)
    assert e.value.code == "keyring"
    store = {}
    monkeypatch.setattr(keyring, "set_password", lambda s, u, p: store.__setitem__((s, u), p))
    monkeypatch.setattr(keyring, "get_password", lambda s, u: store.get((s, u)))
    vault.put("app", "x", b"1")
    vault.remember_on_this_computer(True)
    vault.lock()
    assert vault.try_keyring() and len(vault.items()) == 1


def test_simulated_origin_kept(vault):
    it = vault.put("radio", "dal virtuale", b"1", origin="simulato")
    assert it.simulated and vault.stats()["simulated"] == 1
    with pytest.raises(VaultError):
        vault.put("radio", "x", b"1", origin="boh")
    with pytest.raises(VaultError):
        vault.put("armi", "x", b"1")


def test_audit_chain_detects_edits_deletions_and_truncation(vault):
    log = AuditLog(vault)
    for i in range(5):
        log.append({"ts": time.time(), "category": "test", "message": f"voce {i}", "level": "info", "simulated": False})
    assert log.verify() == []
    assert [e["message"] for e in log.read()] == [f"voce {i}" for i in range(5)]
    assert b"voce" not in log.path.read_bytes()
    lines = log.path.read_text().splitlines()
    # riga tolta in mezzo
    log.path.write_text("\n".join(lines[:2] + lines[3:]) + "\n")
    assert any("numero" in p or "non segue" in p for p in log.verify())
    # ultime righe tagliate
    log.path.write_text("\n".join(lines[:3]) + "\n")
    assert any("ultime righe" in p for p in log.verify())
    # contenuto cambiato
    d = json.loads(lines[1])
    d["c"] = d["c"][:-4] + "AAAA"
    log.path.write_text("\n".join([lines[0], json.dumps(d)] + lines[2:]) + "\n")
    assert any("HMAC" in p for p in log.verify())
    log.path.write_text("\n".join(lines) + "\n")
    assert log.verify() == []
    # riapertura: la catena continua
    log2 = AuditLog(vault)
    log2.append({"ts": 1, "category": "t", "message": "dopo", "level": "info", "simulated": False})
    assert log2.verify() == []


def test_activity_buffers_until_vault_open(vault):
    act = ActivityLog()
    act.add("polpo", "prima dello sblocco")
    log = AuditLog(vault)
    act.attach_sink(log.append, log.read())
    act.add("polpo", "dopo")
    assert [e["message"] for e in log.read()] == ["prima dello sblocco", "dopo"]
    act2 = ActivityLog()
    act2.attach_sink(log.append, log.read())
    assert [e.message for e in act2.entries()] == ["prima dello sblocco", "dopo"]


def test_backup_roundtrip_other_vault(vault, tmp_path):
    vault.put("nfc", "uno", b"1" * 1000, meta={"note": "è mio"})
    vault.put("radio", "due", b"2", origin="simulato")
    path = tmp_path / "copia.polpobak"
    assert export_backup(vault, path, "password-backup", kdf_n=FAST) == 2
    assert b"uno" not in path.read_bytes()
    with pytest.raises(BackupError):
        read_backup(path, "sbagliata!")
    other = Vault(tmp_path / "altro", kdf_n=FAST)
    other.create("altra frase lunghissima")
    assert import_backup(other, path, "password-backup") == (2, 0)
    assert import_backup(other, path, "password-backup") == (0, 2)
    names = {i.name: i for i in other.items()}
    assert names["due"].simulated and names["uno"].meta == {"note": "è mio"}
    raw = bytearray(path.read_bytes())
    raw[-5] ^= 1
    path.write_bytes(bytes(raw))
    with pytest.raises(BackupError):
        read_backup(path, "password-backup")
    with pytest.raises(BackupError):
        export_backup(vault, tmp_path / "x.polpobak", "corta")


def test_lab_mode_expires_and_guards():
    events = []
    lab = LabMode(on_change=events.append)
    with pytest.raises(PermissionDenied) as e:
        lab.require("rf.tx")
    assert "modalità laboratorio" in str(e.value)
    lab.enable(1)
    lab.require("rf.tx")
    assert 0 < lab.remaining_s <= 60
    lab._until = time.monotonic() - 1  # scaduta
    assert not lab.enabled and events == [True, False]
    with pytest.raises(KeyError):
        lab.require("azione.inventata")


def test_passphrase_checks():
    assert "short" in crypto.passphrase_problems("corta")
    assert crypto.passphrase_problems("cavallo batteria graffetta") == []
