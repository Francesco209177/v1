"""Backup di esempio con lo stesso formato di Finder/iTunes (non cifrato).

Serve per la modalità demo e per i test: contiene un database WhatsApp (ChatStorage.sqlite)
con alcune chat di prova, così si può provare tutta l'interfaccia senza un iPhone.
"""

from __future__ import annotations

import hashlib
import plistlib
import sqlite3
import struct
import tempfile
import uuid
import zlib
from datetime import datetime, timedelta, timezone
from pathlib import Path

APPLE_EPOCH = datetime(2001, 1, 1, tzinfo=timezone.utc)
WA_DOMAIN = "AppDomainGroup-group.net.whatsapp.WhatsApp.shared"
DEMO_UDID = "00008110-000A1B2C3D4E5F60"

# Schema ridotto ma con gli stessi nomi di tabelle e colonne di WhatsApp per iOS.
CHATSTORAGE_SCHEMA = """
CREATE TABLE ZWACHATSESSION (Z_PK INTEGER PRIMARY KEY, ZCONTACTJID VARCHAR, ZPARTNERNAME VARCHAR,
    ZLASTMESSAGEDATE TIMESTAMP, ZSESSIONTYPE INTEGER, ZARCHIVED INTEGER, ZMESSAGECOUNTER INTEGER);
CREATE TABLE ZWAGROUPMEMBER (Z_PK INTEGER PRIMARY KEY, ZMEMBERJID VARCHAR, ZCONTACTNAME VARCHAR,
    ZFIRSTNAME VARCHAR, ZCHATSESSION INTEGER);
CREATE TABLE ZWAMEDIAITEM (Z_PK INTEGER PRIMARY KEY, ZMESSAGE INTEGER, ZMEDIALOCALPATH VARCHAR,
    ZTITLE VARCHAR, ZFILESIZE INTEGER, ZLATITUDE FLOAT, ZLONGITUDE FLOAT, ZVCARDNAME VARCHAR);
CREATE TABLE ZWAMESSAGE (Z_PK INTEGER PRIMARY KEY, ZCHATSESSION INTEGER, ZISFROMME INTEGER,
    ZMESSAGEDATE TIMESTAMP, ZTEXT VARCHAR, ZMESSAGETYPE INTEGER, ZFROMJID VARCHAR, ZTOJID VARCHAR,
    ZGROUPMEMBER INTEGER, ZMEDIAITEM INTEGER, ZPUSHNAME VARCHAR);
CREATE TABLE ZWAPROFILEPUSHNAME (Z_PK INTEGER PRIMARY KEY, ZJID VARCHAR, ZPUSHNAME VARCHAR);
"""

def _demo_png(width: int = 320, height: int = 200) -> bytes:
    """Immagine PNG di esempio (un tramonto sul campo da calcetto, molto stilizzato) senza dipendenze."""
    rows = []
    for y in range(height):
        row = bytearray([0])
        for x in range(width):
            if y > height * 0.68:
                r, g, b = 46, 140 + (x * 3 + y) % 20, 70
            else:
                t = y / (height * 0.68)
                r, g, b = int(255 - 60 * t), int(150 + 40 * t), int(90 + 140 * t)
                if (x - width * 0.7) ** 2 + (y - height * 0.45) ** 2 < (height * 0.12) ** 2:
                    r, g, b = 255, 214, 102
            row += bytes((r, g, b))
        rows.append(bytes(row))

    def chunk(kind: bytes, data: bytes) -> bytes:
        return struct.pack(">I", len(data)) + kind + data + struct.pack(">I", zlib.crc32(kind + data) & 0xFFFFFFFF)

    header = struct.pack(">IIBBBBB", width, height, 8, 2, 0, 0, 0)
    return (b"\x89PNG\r\n\x1a\n" + chunk(b"IHDR", header) + chunk(b"IDAT", zlib.compress(b"".join(rows), 9))
            + chunk(b"IEND", b""))


TINY_PNG = _demo_png()


def apple_seconds(moment: datetime) -> float:
    return (moment - APPLE_EPOCH).total_seconds()


def build_chatstorage(path: Path, now: datetime | None = None) -> None:
    """Crea un ChatStorage.sqlite di esempio."""
    now = now or datetime.now(timezone.utc)
    path.parent.mkdir(parents=True, exist_ok=True)
    if path.exists():
        path.unlink()
    db = sqlite3.connect(path)
    db.executescript(CHATSTORAGE_SCHEMA)
    marco = "393331112222@s.whatsapp.net"
    giulia = "393334445555@s.whatsapp.net"
    group = "120363000000000001@g.us"
    db.executemany(
        "INSERT INTO ZWACHATSESSION VALUES (?,?,?,?,?,?,?)",
        [
            (1, marco, "Marco", apple_seconds(now - timedelta(minutes=5)), 0, 0, 5),
            (2, group, "Calcetto del giovedì", apple_seconds(now - timedelta(hours=3)), 1, 0, 4),
            (3, giulia, "Giulia", apple_seconds(now - timedelta(days=2)), 0, 1, 2),
        ],
    )
    db.executemany(
        "INSERT INTO ZWAGROUPMEMBER VALUES (?,?,?,?,?)",
        [(1, marco, "Marco", "Marco", 2), (2, "393337778888@s.whatsapp.net", None, "Luca", 2)],
    )
    db.execute("INSERT INTO ZWAPROFILEPUSHNAME VALUES (1, '393339990000@s.whatsapp.net', 'Sara')")
    db.execute(
        "INSERT INTO ZWAMEDIAITEM VALUES (1, 4, 'Media/393331112222@s.whatsapp.net/a/b/foto-demo.png', NULL, ?, NULL, NULL, NULL)",
        (len(TINY_PNG),),
    )
    db.execute(
        "INSERT INTO ZWAMEDIAITEM VALUES (2, 9, NULL, 'Campo comunale', NULL, 45.4642, 9.19, NULL)"
    )
    t = lambda **delta: apple_seconds(now - timedelta(**delta))  # noqa: E731
    messages = [
        (1, 1, 0, t(days=1, hours=2), "Ciao! Domani ci sei per il trasloco?", 0, marco, None, None, None),
        (2, 1, 1, t(days=1, hours=1), "Sì, arrivo alle 9 con il furgone 🚚", 0, None, marco, None, None),
        (3, 1, 0, t(hours=5), "Perfetto, porto i caffè", 0, marco, None, None, None),
        (4, 1, 0, t(hours=4), None, 1, marco, None, None, 1),
        (5, 1, 1, t(minutes=5), "Grazie mille, a domani!", 0, None, marco, None, None),
        (6, 2, 0, t(hours=6), "Giovedì si gioca alle 21, chi c'è?", 0, group, None, 1, None),
        (7, 2, 0, t(hours=5, minutes=30), "Io ci sono", 0, group, None, 2, None),
        (8, 2, 1, t(hours=4), "Presente 💪", 0, None, group, None, None),
        (9, 2, 0, t(hours=3), None, 5, group, None, 1, 2),
        (10, 3, 0, t(days=3), "Mi mandi la ricetta della torta?", 0, giulia, None, None, None),
        (11, 3, 1, t(days=2), "Certo! 200 g di farina, 3 uova, 150 g di zucchero…", 0, None, giulia, None, None),
    ]
    db.executemany(
        "INSERT INTO ZWAMESSAGE (Z_PK, ZCHATSESSION, ZISFROMME, ZMESSAGEDATE, ZTEXT, ZMESSAGETYPE, ZFROMJID,"
        " ZTOJID, ZGROUPMEMBER, ZMEDIAITEM) VALUES (?,?,?,?,?,?,?,?,?,?)",
        messages,
    )
    db.commit()
    db.close()


def _mbfile_archive(relative_path: str, size: int, mode: int, mtime: int) -> bytes:
    """Metadati di un file nel formato NSKeyedArchiver (classe MBFile) usato da Manifest.db."""
    objects = [
        "$null",
        {
            "$class": plistlib.UID(3),
            "RelativePath": plistlib.UID(2),
            "LastModified": mtime,
            "LastStatusChange": mtime,
            "Birth": mtime,
            "Size": size,
            "Mode": mode,
            "GroupID": 501,
            "UserID": 501,
            "InodeNumber": 0,
            "ProtectionClass": 3,
            "Flags": 0,
        },
        relative_path,
        {"$classname": "MBFile", "$classes": ["MBFile", "NSObject"]},
    ]
    archive = {"$version": 100000, "$archiver": "NSKeyedArchiver", "$top": {"root": plistlib.UID(1)}, "$objects": objects}
    return plistlib.dumps(archive, fmt=plistlib.FMT_BINARY)


def create_demo_backup(backup_root: Path, udid: str = DEMO_UDID, device_name: str = "iPhone di prova",
                       ios_version: str = "18.6", now: datetime | None = None) -> Path:
    """Crea (o aggiorna) <backup_root>/<udid>/ con un backup non cifrato di esempio."""
    now = now or datetime.now(timezone.utc)
    device_dir = backup_root / udid
    device_dir.mkdir(parents=True, exist_ok=True)

    files: dict[tuple[str, str], bytes] = {}
    with tempfile.TemporaryDirectory() as tmp:
        db_path = Path(tmp) / "ChatStorage.sqlite"
        build_chatstorage(db_path, now)
        files[(WA_DOMAIN, "ChatStorage.sqlite")] = db_path.read_bytes()
    files[(WA_DOMAIN, "Message/Media/393331112222@s.whatsapp.net/a/b/foto-demo.png")] = TINY_PNG
    files[("HomeDomain", "Library/Preferences/com.apple.demo.plist")] = plistlib.dumps({"demo": True})

    manifest_db = device_dir / "Manifest.db"
    if manifest_db.exists():
        manifest_db.unlink()
    db = sqlite3.connect(manifest_db)
    db.execute("CREATE TABLE Files (fileID TEXT PRIMARY KEY, domain TEXT, relativePath TEXT, flags INTEGER, file BLOB)")
    db.execute("CREATE TABLE Properties (key TEXT PRIMARY KEY, value BLOB)")
    mtime = int(now.timestamp())
    directories = set()
    for (domain, relative_path), content in files.items():
        file_id = hashlib.sha1(f"{domain}-{relative_path}".encode()).hexdigest()
        target = device_dir / file_id[:2] / file_id
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_bytes(content)
        db.execute(
            "INSERT INTO Files VALUES (?,?,?,?,?)",
            (file_id, domain, relative_path, 1, _mbfile_archive(relative_path, len(content), 0o100644, mtime)),
        )
        parent = str(Path(relative_path).parent)
        while parent not in ("", "."):
            directories.add((domain, parent))
            parent = str(Path(parent).parent)
    for domain, directory in sorted(directories):
        file_id = hashlib.sha1(f"{domain}-{directory}".encode()).hexdigest()
        db.execute(
            "INSERT OR IGNORE INTO Files VALUES (?,?,?,?,?)",
            (file_id, domain, directory, 2, _mbfile_archive(directory, 0, 0o040755, mtime)),
        )
    db.commit()
    db.close()

    lockdown = {"ProductVersion": ios_version, "ProductType": "iPhone15,2", "BuildVersion": "22G86",
                "UniqueDeviceID": udid, "DeviceName": device_name, "SerialNumber": "DEMO"}
    (device_dir / "Manifest.plist").write_bytes(plistlib.dumps({
        "IsEncrypted": False, "Version": "10.0", "Date": now.replace(tzinfo=None), "SystemDomainsVersion": "24.0",
        "WasPasscodeSet": True, "Lockdown": lockdown, "Applications": {},
    }))
    (device_dir / "Info.plist").write_bytes(plistlib.dumps({
        "Device Name": device_name, "Display Name": device_name, "Product Version": ios_version,
        "Product Type": "iPhone15,2", "Target Identifier": udid, "Unique Identifier": udid.upper(),
        "Last Backup Date": now.replace(tzinfo=None), "iTunes Version": "12.13", "Serial Number": "DEMO",
    }))
    (device_dir / "Status.plist").write_bytes(plistlib.dumps({
        "SnapshotState": "finished", "IsFullBackup": False, "Version": "3.3",
        "BackupState": "new", "Date": now.replace(tzinfo=None), "UUID": str(uuid.uuid4()).upper(),
    }))
    return device_dir
