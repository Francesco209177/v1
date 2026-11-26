"""Lettura delle chat WhatsApp da un backup dell'iPhone, sul server e senza telefono.

1. `WhatsAppArchive.open()` decifra il backup con la password (pyiosbackup) ed estrae
   ChatStorage.sqlite di WhatsApp (e di WhatsApp Business, se presente) in una cartella privata.
2. Le funzioni `list_chats`, `list_messages`, `export_chat_text` leggono quel database.
   Sono tolleranti: se una versione di WhatsApp non ha una colonna, la colonna vale NULL.
"""

from __future__ import annotations

import html
import mimetypes
import shutil
import sqlite3
import threading
import time
import uuid
from dataclasses import asdict, dataclass
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Optional

APPLE_EPOCH = datetime(2001, 1, 1, tzinfo=timezone.utc)

APPS = {
    "whatsapp": ("WhatsApp", "AppDomainGroup-group.net.whatsapp.WhatsApp.shared"),
    "business": ("WhatsApp Business", "AppDomainGroup-group.net.whatsapp.WhatsAppSMB.shared"),
}

MESSAGE_TYPES = {
    0: "",
    1: "📷 Foto",
    2: "🎬 Video",
    3: "🎤 Messaggio vocale",
    4: "👤 Contatto",
    5: "📍 Posizione",
    6: "ℹ️ Evento del gruppo",
    7: "🔗 Link",
    8: "📄 Documento",
    10: "ℹ️ Messaggio di sistema",
    11: "GIF",
    14: "🚫 Messaggio eliminato",
    15: "Sticker",
    46: "📊 Sondaggio",
}


class WrongPassword(Exception):
    pass


class NoWhatsApp(Exception):
    pass


@dataclass
class Chat:
    id: int
    name: str
    jid: str
    is_group: bool
    last_date: Optional[str]
    count: int
    archived: bool

    def to_json(self) -> dict:
        return asdict(self)


@dataclass
class Message:
    id: int
    date: Optional[str]
    from_me: bool
    sender: str
    text: str
    kind: str
    type_code: int
    media_id: Optional[int]
    media_name: str
    is_image: bool

    def to_json(self) -> dict:
        return asdict(self)


def apple_date(value) -> Optional[datetime]:
    if value is None:
        return None
    try:
        return (APPLE_EPOCH + timedelta(seconds=float(value))).astimezone()
    except (TypeError, ValueError, OverflowError):
        return None


def _iso(value) -> Optional[str]:
    moment = apple_date(value)
    return moment.isoformat(timespec="seconds") if moment else None


def _columns(db: sqlite3.Connection, table: str) -> set[str]:
    try:
        return {row[1] for row in db.execute(f"PRAGMA table_info({table})")}
    except sqlite3.Error:
        return set()


def _col(available: set[str], alias: str, column: str) -> str:
    return f"{alias}.{column}" if column in available else "NULL"


def _connect(db_path: Path) -> sqlite3.Connection:
    db = sqlite3.connect(f"file:{db_path}?mode=ro", uri=True)
    db.row_factory = sqlite3.Row
    return db


def _phone(jid: Optional[str]) -> str:
    if not jid:
        return ""
    user = jid.split("@", 1)[0]
    return f"+{user}" if user.isdigit() else user


def list_chats(db_path: Path) -> list[Chat]:
    db = _connect(db_path)
    try:
        cols = _columns(db, "ZWACHATSESSION")
        rows = db.execute(
            f"""
            SELECT s.Z_PK AS id, {_col(cols, 's', 'ZPARTNERNAME')} AS name, {_col(cols, 's', 'ZCONTACTJID')} AS jid,
                   {_col(cols, 's', 'ZLASTMESSAGEDATE')} AS last_date, {_col(cols, 's', 'ZSESSIONTYPE')} AS type,
                   {_col(cols, 's', 'ZARCHIVED')} AS archived,
                   (SELECT COUNT(*) FROM ZWAMESSAGE m WHERE m.ZCHATSESSION = s.Z_PK) AS count
            FROM ZWACHATSESSION s
            """
        ).fetchall()
    finally:
        db.close()
    chats = []
    for row in rows:
        if not row["count"]:
            continue
        jid = row["jid"] or ""
        if jid.endswith("@status") or jid == "status@broadcast":
            continue
        chats.append(Chat(
            id=row["id"],
            name=(row["name"] or "").strip() or _phone(jid) or f"Chat {row['id']}",
            jid=jid,
            is_group=jid.endswith("@g.us") or row["type"] == 1,
            last_date=_iso(row["last_date"]),
            count=row["count"],
            archived=bool(row["archived"]),
        ))
    chats.sort(key=lambda chat: chat.last_date or "", reverse=True)
    return chats


def get_chat(db_path: Path, chat_id: int) -> Optional[Chat]:
    return next((chat for chat in list_chats(db_path) if chat.id == chat_id), None)


def _sender_names(db: sqlite3.Connection) -> dict[str, str]:
    names: dict[str, str] = {}
    if _columns(db, "ZWAPROFILEPUSHNAME") >= {"ZJID", "ZPUSHNAME"}:
        for row in db.execute("SELECT ZJID, ZPUSHNAME FROM ZWAPROFILEPUSHNAME"):
            if row[0] and row[1]:
                names[row[0]] = row[1]
    cols = _columns(db, "ZWACHATSESSION")
    if {"ZCONTACTJID", "ZPARTNERNAME"} <= cols:
        for row in db.execute("SELECT ZCONTACTJID, ZPARTNERNAME FROM ZWACHATSESSION"):
            if row[0] and row[1] and not row[0].endswith("@g.us"):
                names[row[0]] = row[1]
    return names


def list_messages(db_path: Path, chat_id: int, offset: int = 0, limit: Optional[int] = None) -> list[Message]:
    """Messaggi della chat in ordine cronologico. `offset`/`limit` contano dalla fine (i più recenti)."""
    db = _connect(db_path)
    try:
        m = _columns(db, "ZWAMESSAGE")
        g = _columns(db, "ZWAGROUPMEMBER")
        i = _columns(db, "ZWAMEDIAITEM")
        joins = ""
        if "ZGROUPMEMBER" in m and g:
            joins += " LEFT JOIN ZWAGROUPMEMBER g ON g.Z_PK = m.ZGROUPMEMBER"
        if "ZMEDIAITEM" in m and i:
            joins += " LEFT JOIN ZWAMEDIAITEM i ON i.Z_PK = m.ZMEDIAITEM"
        gcol = (lambda name: _col(g, "g", name)) if "ZGROUPMEMBER" in m and g else (lambda name: "NULL")
        icol = (lambda name: _col(i, "i", name)) if "ZMEDIAITEM" in m and i else (lambda name: "NULL")
        query = f"""
            SELECT m.Z_PK AS id, {_col(m, 'm', 'ZMESSAGEDATE')} AS date, {_col(m, 'm', 'ZISFROMME')} AS from_me,
                   {_col(m, 'm', 'ZTEXT')} AS text, {_col(m, 'm', 'ZMESSAGETYPE')} AS type,
                   {_col(m, 'm', 'ZFROMJID')} AS from_jid, {_col(m, 'm', 'ZPUSHNAME')} AS push_name,
                   {gcol('ZMEMBERJID')} AS member_jid, {gcol('ZCONTACTNAME')} AS member_name,
                   {gcol('ZFIRSTNAME')} AS member_first, {icol('Z_PK')} AS media_id,
                   {icol('ZMEDIALOCALPATH')} AS media_path, {icol('ZTITLE')} AS media_title,
                   {icol('ZLATITUDE')} AS lat, {icol('ZLONGITUDE')} AS lon, {icol('ZVCARDNAME')} AS vcard
            FROM ZWAMESSAGE m {joins}
            WHERE m.ZCHATSESSION = ?
            ORDER BY {_col(m, 'm', 'ZMESSAGEDATE')} DESC, m.Z_PK DESC
        """
        params: list = [chat_id]
        if limit is not None:
            query += " LIMIT ? OFFSET ?"
            params += [limit, offset]
        rows = db.execute(query, params).fetchall()
        names = _sender_names(db)
        partner = db.execute(
            f"SELECT {_col(_columns(db, 'ZWACHATSESSION'), 's', 'ZPARTNERNAME')}, "
            f"{_col(_columns(db, 'ZWACHATSESSION'), 's', 'ZCONTACTJID')} FROM ZWACHATSESSION s WHERE s.Z_PK = ?",
            (chat_id,),
        ).fetchone()
    finally:
        db.close()

    partner_name = (partner[0] if partner else None) or _phone(partner[1] if partner else "")
    is_group = bool(partner and partner[1] and str(partner[1]).endswith("@g.us"))
    messages = []
    for row in reversed(rows):
        type_code = int(row["type"] or 0)
        if row["from_me"]:
            sender = "Io"
        elif is_group:
            jid = row["member_jid"] or ""
            sender = (row["member_name"] or row["member_first"] or names.get(jid) or row["push_name"]
                      or _phone(jid) or "Sconosciuto")
        else:
            sender = partner_name or "Contatto"
        text = row["text"] or ""
        kind = MESSAGE_TYPES.get(type_code, f"Messaggio (tipo {type_code})" if type_code else "")
        media_path = row["media_path"] or ""
        if type_code == 5 and row["lat"] is not None:
            text = text or (row["media_title"] or "")
            text = (text + " " if text else "") + f"({row['lat']:.5f}, {row['lon']:.5f})"
        if type_code == 4 and row["vcard"]:
            text = text or row["vcard"]
        if type_code in (8,) and row["media_title"] and not text:
            text = row["media_title"]
        mime = mimetypes.guess_type(media_path)[0] or ""
        messages.append(Message(
            id=row["id"],
            date=_iso(row["date"]),
            from_me=bool(row["from_me"]),
            sender=sender,
            text=text,
            kind=kind,
            type_code=type_code,
            media_id=row["media_id"] if media_path else None,
            media_name=Path(media_path).name if media_path else "",
            is_image=mime.startswith("image/"),
        ))
    return messages


def media_relative_path(db_path: Path, media_id: int) -> Optional[str]:
    db = _connect(db_path)
    try:
        if "ZMEDIALOCALPATH" not in _columns(db, "ZWAMEDIAITEM"):
            return None
        row = db.execute("SELECT ZMEDIALOCALPATH FROM ZWAMEDIAITEM WHERE Z_PK = ?", (media_id,)).fetchone()
    finally:
        db.close()
    if not row or not row[0]:
        return None
    path = str(row[0]).lstrip("/")
    if ".." in Path(path).parts:
        return None
    return path if path.startswith("Message/") else f"Message/{path}"


def export_chat_text(db_path: Path, chat_id: int) -> str:
    chat = get_chat(db_path, chat_id)
    lines = [f"Chat WhatsApp: {chat.name if chat else chat_id}", ""]
    for message in list_messages(db_path, chat_id):
        when = datetime.fromisoformat(message.date).strftime("%d/%m/%Y %H:%M") if message.date else "?"
        content = " ".join(part for part in (message.kind, message.text) if part) or "(vuoto)"
        if message.media_name:
            content += f" [{message.media_name}]"
        lines.append(f"[{when}] {message.sender}: {content}")
    return "\n".join(lines) + "\n"


def export_chat_html(db_path: Path, chat_id: int) -> str:
    chat = get_chat(db_path, chat_id)
    title = html.escape(chat.name if chat else str(chat_id))
    rows = []
    for message in list_messages(db_path, chat_id):
        when = datetime.fromisoformat(message.date).strftime("%d/%m/%Y %H:%M") if message.date else ""
        content = html.escape(" ".join(part for part in (message.kind, message.text) if part))
        side = "me" if message.from_me else "them"
        rows.append(
            f'<div class="msg {side}"><b>{html.escape(message.sender)}</b> '
            f'<small>{when}</small><p>{content.replace(chr(10), "<br>")}</p></div>'
        )
    return (
        "<!doctype html><html lang=it><meta charset=utf-8><meta name=viewport content='width=device-width'>"
        f"<title>{title}</title><style>body{{font-family:system-ui,sans-serif;max-width:720px;margin:auto;"
        "padding:16px;background:#efeae2}.msg{background:#fff;border-radius:10px;padding:8px 12px;margin:6px 0;"
        "max-width:85%}.me{background:#d9fdd3;margin-left:auto}p{margin:4px 0 0;white-space:pre-wrap}"
        f"small{{color:#667}}</style><h1>{title}</h1>" + "\n".join(rows) + "</html>"
    )


# --- apertura del backup ------------------------------------------------------------------------


class WhatsAppArchive:
    """Backup decifrato in memoria + copia privata dei database WhatsApp. Va chiuso con close()."""

    IDLE_SECONDS = 30 * 60

    def __init__(self, backup, workdir: Path, databases: dict[str, Path], source_label: str):
        self.backup = backup
        self._lock = threading.Lock()
        self.workdir = workdir
        self.databases = databases
        self.source_label = source_label
        self.last_used = time.time()

    @classmethod
    def open(cls, device_dir: Path, password: str, cache_dir: Path, source_label: str = "") -> "WhatsAppArchive":
        backup = open_backup(device_dir, password)
        _share_manifest_connection(backup)
        workdir = cache_dir / f"whatsapp-{uuid.uuid4().hex}"
        workdir.mkdir(parents=True, mode=0o700)
        databases: dict[str, Path] = {}
        try:
            for key, (_, domain) in APPS.items():
                target = workdir / key / "ChatStorage.sqlite"
                if _extract(backup, domain, "ChatStorage.sqlite", target):
                    for suffix in ("-wal", "-shm"):
                        _extract(backup, domain, f"ChatStorage.sqlite{suffix}", Path(f"{target}{suffix}"))
                    _checkpoint(target)
                    databases[key] = target
        except Exception:
            shutil.rmtree(workdir, ignore_errors=True)
            _cleanup_manifest(backup)
            raise
        if not databases:
            shutil.rmtree(workdir, ignore_errors=True)
            _cleanup_manifest(backup)
            raise NoWhatsApp("Nel backup non c'è WhatsApp (o non è ancora stato fatto un backup completo).")
        return cls(backup, workdir, databases, source_label)

    def touch(self) -> None:
        self.last_used = time.time()

    @property
    def expired(self) -> bool:
        return time.time() - self.last_used > self.IDLE_SECONDS

    def db(self, app: str) -> Path:
        if app not in self.databases:
            raise KeyError(app)
        self.touch()
        return self.databases[app]

    def media(self, app: str, media_id: int) -> Optional[tuple[Path, str]]:
        relative = media_relative_path(self.db(app), media_id)
        if not relative:
            return None
        target = self.workdir / app / "media" / str(media_id) / Path(relative).name
        with self._lock:
            if not target.exists() and not _extract(self.backup, APPS[app][1], relative, target):
                return None
        return target, mimetypes.guess_type(target.name)[0] or "application/octet-stream"

    def close(self) -> None:
        with self._lock:
            shutil.rmtree(self.workdir, ignore_errors=True)
            _cleanup_manifest(self.backup)


def open_backup(device_dir: Path, password: str):
    """Apre un backup con pyiosbackup. Solleva WrongPassword se la password non è corretta."""
    from pyiosbackup import Backup
    from pyiosbackup.exceptions import BackupPasswordIsRequired

    if not (device_dir / "Manifest.plist").exists():
        raise FileNotFoundError("Backup non trovato o incompleto (manca Manifest.plist).")
    try:
        return Backup.from_path(device_dir, password or "")
    except BackupPasswordIsRequired as error:
        raise WrongPassword("Il backup è cifrato: inserisci la password.") from error
    except Exception as error:  # noqa: BLE001 - chiave sbagliata → errore di unwrap AES
        name = type(error).__name__
        if "Unwrap" in name or "InvalidTag" in name or "Padding" in name or isinstance(error, ValueError):
            raise WrongPassword("Password del backup errata.") from error
        raise


def verify_password(device_dir: Path, password: str) -> bool:
    backup = open_backup(device_dir, password)
    _cleanup_manifest(backup)
    return True


def is_encrypted(device_dir: Path) -> Optional[bool]:
    import plistlib

    try:
        return bool(plistlib.loads((device_dir / "Manifest.plist").read_bytes()).get("IsEncrypted", False))
    except (OSError, ValueError, plistlib.InvalidFileException):
        return None


def _entry(backup, domain: str, relative_path: str):
    """Cerca un file nel Manifest.db con una query parametrizzata (i percorsi possono contenere apostrofi)."""
    from pyiosbackup.entry import Entry

    manifest_db = backup._manifest_db  # noqa: SLF001 - API interna, versione fissata in requirements
    connection = getattr(manifest_db, "_conn", None)
    if connection is None:
        try:
            return backup.get_entry_by_domain_and_path(domain, relative_path)
        except Exception:  # noqa: BLE001
            return None
    row = connection.execute("SELECT * FROM Files WHERE domain = ? AND relativePath = ?", (domain, relative_path)).fetchone()
    if row is None:
        return None
    return Entry(backup, **manifest_db._load_entry(row))  # noqa: SLF001


def _extract(backup, domain: str, relative_path: str, target: Path) -> bool:
    entry = _entry(backup, domain, relative_path)
    if entry is None or not entry.is_file():
        return False
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_bytes(entry.read_bytes())
    target.chmod(0o600)
    return True


def _share_manifest_connection(backup) -> None:
    """La connessione SQLite di pyiosbackup è legata al thread che l'ha aperta; gli allegati vengono
    estratti da altri thread (sempre uno alla volta, protetti da un lock), quindi la riapriamo condivisibile."""
    manifest_db = getattr(backup, "_manifest_db", None)
    path = getattr(manifest_db, "path", None)
    if manifest_db is None or path is None or not hasattr(manifest_db, "_conn"):
        return
    try:
        manifest_db._conn.close()  # noqa: SLF001
    except sqlite3.Error:
        pass
    connection = sqlite3.connect(str(path), check_same_thread=False)
    connection.row_factory = sqlite3.Row
    manifest_db._conn = connection  # noqa: SLF001


def _checkpoint(db_path: Path) -> None:
    """Integra il file -wal nel database, così la lettura in sola lettura vede tutti i messaggi."""
    try:
        db = sqlite3.connect(db_path)
        db.execute("PRAGMA wal_checkpoint(TRUNCATE)")
        db.execute("PRAGMA journal_mode=DELETE")
        db.close()
    except sqlite3.Error:
        pass


def _cleanup_manifest(backup) -> None:
    """pyiosbackup scrive il Manifest.db decifrato in un file temporaneo: lo cancelliamo."""
    manifest_db = getattr(backup, "_manifest_db", None)
    connection = getattr(manifest_db, "_conn", None)
    path = getattr(manifest_db, "path", None)
    try:
        if connection is not None:
            connection.close()
    except sqlite3.Error:
        pass
    if path:
        try:
            Path(path).unlink()
        except OSError:
            pass
