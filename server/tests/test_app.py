"""Test senza iPhone: database WhatsApp sintetico, backup di esempio, interfaccia web con iPhone simulato."""

from __future__ import annotations

import io
import shutil
import sqlite3
import zipfile
from datetime import datetime, timedelta
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from iphone_backup import backups as backup_store
from iphone_backup import whatsapp as wa
from iphone_backup.auth import hash_password, verify_password
from iphone_backup.config import DeviceRecord, Paths, Settings
from iphone_backup.demo import DEMO_UDID, build_chatstorage, create_demo_backup
from iphone_backup.fake_device import NEW_PHONE_UDID, FakeGateway
from iphone_backup.service import BackupService, next_due
from iphone_backup.web import create_app, format_day, format_when


# --- WhatsApp -----------------------------------------------------------------------------------

@pytest.fixture
def chat_db(tmp_path: Path) -> Path:
    path = tmp_path / "ChatStorage.sqlite"
    build_chatstorage(path)
    return path


def test_list_chats_sorted_and_named(chat_db: Path):
    chats = wa.list_chats(chat_db)
    assert [c.name for c in chats] == ["Marco", "Calcetto del giovedì", "Giulia"]
    group = chats[1]
    assert group.is_group and group.count == 4
    assert chats[2].archived


def test_messages_senders_and_types(chat_db: Path):
    messages = wa.list_messages(chat_db, 2)
    assert [m.sender for m in messages] == ["Marco", "Luca", "Io", "Marco"]
    location = messages[-1]
    assert location.kind.endswith("Posizione") and "45.46420" in location.text
    photo = next(m for m in wa.list_messages(chat_db, 1) if m.type_code == 1)
    assert photo.is_image and photo.media_id == 1 and photo.media_name == "foto-demo.png"


def test_messages_paging_keeps_most_recent(chat_db: Path):
    last_two = wa.list_messages(chat_db, 1, offset=0, limit=2)
    assert [m.id for m in last_two] == [4, 5]


def test_export_text_and_html(chat_db: Path):
    text = wa.export_chat_text(chat_db, 3)
    assert text.startswith("Chat WhatsApp: Giulia")
    assert "Io: Certo! 200 g di farina" in text
    html = wa.export_chat_html(chat_db, 3)
    assert "<h1>Giulia</h1>" in html and "Mi mandi la ricetta" in html


def test_tolerates_missing_columns(tmp_path: Path):
    path = tmp_path / "old.sqlite"
    db = sqlite3.connect(path)
    db.executescript(
        "CREATE TABLE ZWACHATSESSION (Z_PK INTEGER PRIMARY KEY, ZCONTACTJID VARCHAR);"
        "CREATE TABLE ZWAMESSAGE (Z_PK INTEGER PRIMARY KEY, ZCHATSESSION INTEGER, ZTEXT VARCHAR);"
        "INSERT INTO ZWACHATSESSION VALUES (1, '391234@s.whatsapp.net');"
        "INSERT INTO ZWAMESSAGE VALUES (1, 1, 'ciao');"
    )
    db.commit()
    db.close()
    chats = wa.list_chats(path)
    assert chats[0].name == "+391234"
    assert wa.list_messages(path, 1)[0].text == "ciao"


def test_media_path_rejects_traversal(tmp_path: Path, chat_db: Path):
    db = sqlite3.connect(chat_db)
    db.execute("INSERT INTO ZWAMEDIAITEM (Z_PK, ZMEDIALOCALPATH) VALUES (99, '../../etc/passwd')")
    db.commit()
    db.close()
    assert wa.media_relative_path(chat_db, 99) is None
    assert wa.media_relative_path(chat_db, 1) == "Message/Media/393331112222@s.whatsapp.net/a/b/foto-demo.png"


def test_archive_open_demo_backup_and_media(tmp_path: Path):
    device_dir = create_demo_backup(tmp_path / "backups")
    archive = wa.WhatsAppArchive.open(device_dir, "", tmp_path / "cache")
    try:
        assert list(archive.databases) == ["whatsapp"]
        assert len(wa.list_chats(archive.db("whatsapp"))) == 3
        path, mime = archive.media("whatsapp", 1)
        assert mime == "image/png" and path.read_bytes().startswith(b"\x89PNG")
        workdir = archive.workdir
    finally:
        archive.close()
    assert not workdir.exists()


def test_open_backup_without_whatsapp(tmp_path: Path):
    device_dir = create_demo_backup(tmp_path / "backups")
    db = sqlite3.connect(device_dir / "Manifest.db")
    db.execute("DELETE FROM Files WHERE domain LIKE 'AppDomainGroup-group.net.whatsapp%'")
    db.commit()
    db.close()
    with pytest.raises(wa.NoWhatsApp):
        wa.WhatsAppArchive.open(device_dir, "", tmp_path / "cache")


def test_encrypted_backup_requires_password(tmp_path: Path):
    import plistlib

    device_dir = create_demo_backup(tmp_path / "backups")
    manifest = plistlib.loads((device_dir / "Manifest.plist").read_bytes())
    manifest["IsEncrypted"] = True
    (device_dir / "Manifest.plist").write_bytes(plistlib.dumps(manifest))
    with pytest.raises(wa.WrongPassword):
        wa.open_backup(device_dir, "")
    assert wa.is_encrypted(device_dir) is True


# --- backup su disco ----------------------------------------------------------------------------

def make_paths(tmp_path: Path) -> Paths:
    paths = Paths(data=tmp_path / "data", backups=tmp_path / "backups")
    paths.ensure()
    return paths


def test_list_backups_and_safe_copy(tmp_path: Path):
    paths = make_paths(tmp_path)
    create_demo_backup(paths.current)
    backup_store.update_safe_copy(paths, DEMO_UDID)
    items = backup_store.list_backups(paths)
    assert [(b.kind, b.udid) for b in items] == [("corrente", DEMO_UDID), ("copia-sicura", DEMO_UDID)]
    current = items[0]
    assert current.complete and current.encrypted is False and current.ios_version == "18.6"
    assert current.size > 0 and current.date

    # Un secondo aggiornamento sostituisce la copia senza lasciare cartelle temporanee.
    create_demo_backup(paths.current)
    backup_store.update_safe_copy(paths, DEMO_UDID)
    assert sorted(p.name for p in paths.safe_copy.iterdir()) == [DEMO_UDID]


def test_safe_copy_is_independent_from_current(tmp_path: Path):
    paths = make_paths(tmp_path)
    device_dir = create_demo_backup(paths.current)
    backup_store.update_safe_copy(paths, DEMO_UDID)
    (device_dir / "Info.plist").write_bytes(b"modificato")
    backup_store.update_safe_copy(paths, DEMO_UDID)
    (device_dir / "Info.plist").write_bytes(b"di nuovo modificato in place")
    assert (paths.safe_copy / DEMO_UDID / "Info.plist").read_bytes() == b"modificato"


def test_stream_zip_contains_backup(tmp_path: Path):
    device_dir = create_demo_backup(tmp_path / "b")
    data = b"".join(backup_store.stream_zip(device_dir, DEMO_UDID, chunk_size=64))
    with zipfile.ZipFile(io.BytesIO(data)) as archive:
        names = archive.namelist()
        assert f"{DEMO_UDID}/Manifest.plist" in names
        assert archive.read(f"{DEMO_UDID}/Info.plist") == (device_dir / "Info.plist").read_bytes()
        assert archive.testzip() is None


def test_device_dir_rejects_bad_input(tmp_path: Path):
    paths = make_paths(tmp_path)
    for kind, udid in (("altro", DEMO_UDID), ("corrente", "../x"), ("corrente", ".nascosto"), ("corrente", "")):
        with pytest.raises(ValueError):
            backup_store.device_dir(paths, kind, udid)


# --- pianificazione e utilità -------------------------------------------------------------------

def test_next_due_rules():
    now = datetime(2026, 11, 26, 12, 0)
    settings = Settings(device=DeviceRecord(udid="x"), interval_hours=24, retry_minutes=30)
    assert next_due({}, settings, now) == now
    ok = {"last_attempt": "2026-11-26T03:00:00", "last_success": "2026-11-26T03:00:00"}
    assert next_due(ok, settings, now) == datetime(2026, 11, 27, 3, 0)
    failed = {"last_attempt": "2026-11-26T11:00:00", "last_success": "2026-11-25T03:00:00"}
    assert next_due(failed, settings, now) == datetime(2026, 11, 26, 11, 30)
    settings.auto_backup = False
    assert next_due(ok, settings, now) is None
    assert next_due(ok, Settings(device=None), now) is None


def test_password_hash():
    stored = hash_password("una password lunga")
    assert verify_password("una password lunga", stored)
    assert not verify_password("sbagliata", stored)
    assert not verify_password("x", "formato-non-valido")


def test_format_helpers():
    now = datetime.now()
    assert format_when(None) == "mai"
    assert format_when(now.isoformat()).startswith("oggi alle")
    assert format_when((now - timedelta(days=1)).isoformat()).startswith("ieri alle")
    assert format_day(now.isoformat()) == "Oggi"


# --- interfaccia web con iPhone simulato --------------------------------------------------------

@pytest.fixture
def app_env(tmp_path: Path):
    paths = make_paths(tmp_path)
    gateway = FakeGateway(delay=0)
    service = BackupService(paths, gateway, demo=True)
    app = create_app(service, start_scheduler=False)
    with TestClient(app) as client:
        yield client, service, gateway


def login(client: TestClient) -> None:
    response = client.post("/setup", data={"password": "password-di-prova", "confirm": "password-di-prova"})
    assert response.status_code in (200, 303)


def run_job(client: TestClient, service: BackupService, path: str, body: dict | None = None) -> dict:
    response = client.post(path, json=body or {})
    assert response.status_code == 200, response.text
    job = service.jobs.wait(30)
    assert job is not None
    return job.to_json()


def test_setup_and_login_required(app_env):
    client, service, _ = app_env
    assert client.get("/", follow_redirects=False).headers["location"] == "/setup"
    login(client)
    assert client.get("/").status_code == 200
    client.post("/logout")
    assert client.get("/", follow_redirects=False).headers["location"] == "/login"
    assert client.get("/api/status").status_code == 401
    assert "Password errata" in client.post("/login", data={"password": "no"}).text
    client.post("/login", data={"password": "password-di-prova"})
    assert client.get("/api/status").status_code == 200


def test_full_flow_pair_backup_whatsapp_restore(app_env):
    client, service, gateway = app_env
    login(client)

    devices = client.get("/api/usb").json()["devices"]
    assert {d["udid"] for d in devices} == {DEMO_UDID, NEW_PHONE_UDID}

    job = run_job(client, service, "/api/pair", {"udid": DEMO_UDID})
    assert job["state"] == "ok" and service.device.udid == DEMO_UDID

    job = run_job(client, service, "/api/encryption", {"password": "segreta1", "confirm": "segreta1"})
    assert job["state"] == "ok" and gateway.encrypted

    job = run_job(client, service, "/api/backup")
    assert job["state"] == "ok", job
    assert service.state["last_result"] == "ok" and service.state["last_size"] > 0
    assert (service.paths.safe_copy / DEMO_UDID / "Manifest.plist").exists()
    assert "Backup completato" in job["message"]

    page = client.get("/backup").text
    assert "Copia dell&#39;ultimo backup riuscito" in page or "Copia dell'ultimo backup riuscito" in page
    zip_response = client.get(f"/backup/scarica/corrente/{DEMO_UDID}")
    assert zip_response.status_code == 200 and zip_response.content[:2] == b"PK"

    job = run_job(client, service, "/api/whatsapp/open", {"kind": "corrente", "udid": DEMO_UDID, "password": ""})
    assert job["state"] == "ok", job
    chats_page = client.get("/whatsapp").text
    assert "Calcetto del giovedì" in chats_page
    chat_page = client.get("/whatsapp/whatsapp/2").text
    assert "Giovedì si gioca alle 21" in chat_page and "Luca" in chat_page
    export = client.get("/whatsapp/whatsapp/3/esporta.txt")
    assert export.status_code == 200 and "ricetta" in export.text
    media = client.get("/whatsapp/whatsapp/media/1")
    assert media.status_code == 200 and media.headers["content-type"] == "image/png"
    assert client.get("/whatsapp/whatsapp/media/999").status_code == 404
    client.post("/api/whatsapp/close")
    assert service.whatsapp is None

    bad = client.post("/api/restore", json={"kind": "corrente", "source": DEMO_UDID, "target": NEW_PHONE_UDID,
                                            "confirm": "no"})
    assert bad.status_code == 400
    job = run_job(client, service, "/api/restore", {"kind": "copia-sicura", "source": DEMO_UDID,
                                                    "target": NEW_PHONE_UDID, "confirm": "ripristina"})
    assert job["state"] == "ok", job
    assert gateway.restored == [(NEW_PHONE_UDID, DEMO_UDID)]


def test_unreachable_backup_is_retried_later(app_env):
    client, service, gateway = app_env
    login(client)
    run_job(client, service, "/api/pair", {"udid": DEMO_UDID})
    gateway.reachable = False
    job = run_job(client, service, "/api/backup")
    assert job["state"] == "error"
    assert service.state["last_result"] == "non raggiungibile"
    due = service.next_due()
    assert due is not None and due > datetime.now() + timedelta(minutes=25)


def test_scheduler_tick_starts_backup(app_env):
    client, service, gateway = app_env
    login(client)
    run_job(client, service, "/api/pair", {"udid": DEMO_UDID})
    job = service.tick()
    assert job is not None and job.kind == "backup"
    service.jobs.wait(30)
    assert service.tick() is None  # il prossimo è tra 24 ore


def test_busy_job_is_rejected(app_env):
    client, service, gateway = app_env
    login(client)
    run_job(client, service, "/api/pair", {"udid": DEMO_UDID})
    gateway.delay = 0.05
    first = client.post("/api/backup")
    second = client.post("/api/backup")
    assert first.status_code == 200 and second.status_code == 409
    service.jobs.wait(30)


def test_settings_save_and_validation(app_env):
    client, service, _ = app_env
    login(client)
    response = client.post("/impostazioni", data={
        "auto_backup": "on", "interval_hours": "12", "retry_minutes": "15",
        "extra_hosts": "100.64.0.5\n192.168.1.20", "notify_url": "",
    }, follow_redirects=False)
    assert response.status_code == 303
    assert service.settings.interval_hours == 12 and service.settings.extra_hosts == ["100.64.0.5", "192.168.1.20"]
    assert service.settings.keep_safe_copy is False
    bad = client.post("/impostazioni", data={"notify_url": "ftp://x"}, follow_redirects=False)
    assert "errore=" in bad.headers["location"]
    for page in ("/", "/associa", "/backup", "/whatsapp", "/ripristina", "/impostazioni", "/registro"):
        assert client.get(page).status_code == 200, page


def test_cache_cleared_on_start(tmp_path: Path):
    paths = make_paths(tmp_path)
    leftover = paths.cache / "whatsapp-vecchio"
    leftover.mkdir()
    BackupService(paths, FakeGateway(delay=0))
    assert not leftover.exists()
    shutil.rmtree(paths.data)
