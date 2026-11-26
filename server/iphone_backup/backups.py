"""Backup salvati sul disco: elenco, dimensione, copia "ultimo backup riuscito" e download in zip."""

from __future__ import annotations

import os
import plistlib
import shutil
import subprocess
import zipfile
from dataclasses import asdict, dataclass
from datetime import datetime
from pathlib import Path
from typing import Iterator, Optional

from .config import Paths

KINDS = {"corrente": "Ultimo backup", "copia-sicura": "Copia dell'ultimo backup riuscito"}


@dataclass
class BackupInfo:
    kind: str
    udid: str
    path: str
    device_name: str = ""
    product_type: str = ""
    ios_version: str = ""
    date: Optional[str] = None
    encrypted: Optional[bool] = None
    complete: bool = False
    size: int = 0

    @property
    def label(self) -> str:
        return KINDS.get(self.kind, self.kind)

    def to_json(self) -> dict:
        data = asdict(self)
        data["label"] = self.label
        return data


def _plist(path: Path) -> dict:
    try:
        return plistlib.loads(path.read_bytes())
    except (OSError, ValueError, plistlib.InvalidFileException):
        return {}


def _date(value) -> Optional[str]:
    if isinstance(value, datetime):
        # Le date dei plist sono in UTC senza fuso orario.
        from datetime import timezone

        return value.replace(tzinfo=timezone.utc).astimezone().isoformat(timespec="seconds")
    return None


def dir_size(path: Path) -> int:
    total = 0
    for root, _, files in os.walk(path):
        for name in files:
            try:
                total += os.lstat(os.path.join(root, name)).st_size
            except OSError:
                pass
    return total


def read_backup(kind: str, device_dir: Path, with_size: bool = True) -> Optional[BackupInfo]:
    if not (device_dir / "Manifest.plist").exists() and not (device_dir / "Info.plist").exists():
        return None
    info = _plist(device_dir / "Info.plist")
    manifest = _plist(device_dir / "Manifest.plist")
    status = _plist(device_dir / "Status.plist")
    lockdown = manifest.get("Lockdown", {}) if isinstance(manifest.get("Lockdown"), dict) else {}
    return BackupInfo(
        kind=kind,
        udid=device_dir.name,
        path=str(device_dir),
        device_name=info.get("Device Name") or lockdown.get("DeviceName") or "iPhone",
        product_type=info.get("Product Type") or lockdown.get("ProductType") or "",
        ios_version=str(info.get("Product Version") or lockdown.get("ProductVersion") or ""),
        date=_date(info.get("Last Backup Date")) or _date(manifest.get("Date")),
        encrypted=bool(manifest["IsEncrypted"]) if "IsEncrypted" in manifest else None,
        complete=status.get("SnapshotState") == "finished",
        size=dir_size(device_dir) if with_size else 0,
    )


def list_backups(paths: Paths, with_size: bool = True) -> list[BackupInfo]:
    result = []
    for kind, root in (("corrente", paths.current), ("copia-sicura", paths.safe_copy)):
        if not root.exists():
            continue
        for child in sorted(root.iterdir()):
            if child.is_dir() and not child.name.startswith(".") and not child.name.endswith((".nuova", ".vecchia")):
                backup = read_backup(kind, child, with_size)
                if backup:
                    result.append(backup)
    return result


def device_dir(paths: Paths, kind: str, udid: str) -> Path:
    if kind not in KINDS or not udid or "/" in udid or udid.startswith("."):
        raise ValueError("Backup non valido")
    root = paths.current if kind == "corrente" else paths.safe_copy
    return root / udid


def backup_root(paths: Paths, kind: str) -> Path:
    if kind not in KINDS:
        raise ValueError("Backup non valido")
    return paths.current if kind == "corrente" else paths.safe_copy


def update_safe_copy(paths: Paths, udid: str, log=print) -> None:
    """Copia il backup corrente in copia-sicura/<udid> senza mai lasciare una copia a metà.

    rsync scrive in <udid>.nuova (riusando con hard link i file uguali della copia precedente),
    poi le cartelle vengono scambiate: se qualcosa va storto resta la copia precedente.
    """
    source = paths.current / udid
    if not (source / "Manifest.plist").exists():
        raise FileNotFoundError("Nessun backup corrente da copiare.")
    paths.safe_copy.mkdir(parents=True, exist_ok=True)
    final = paths.safe_copy / udid
    new = paths.safe_copy / f"{udid}.nuova"
    old = paths.safe_copy / f"{udid}.vecchia"
    for leftover in (new, old):
        if leftover.exists():
            shutil.rmtree(leftover)

    rsync = shutil.which("rsync")
    if rsync:
        command = [rsync, "-a", "--delete"]
        if final.exists():
            command.append(f"--link-dest={final}")
        command += [f"{source}/", f"{new}/"]
        subprocess.run(command, check=True, capture_output=True)
    else:
        log("rsync non trovato: copia completa con Python (più lenta).")
        shutil.copytree(source, new)

    if final.exists():
        final.rename(old)
    new.rename(final)
    if old.exists():
        shutil.rmtree(old, ignore_errors=True)


def disk_usage(path: Path) -> dict:
    try:
        usage = shutil.disk_usage(path)
        return {"total": usage.total, "free": usage.free, "used": usage.used}
    except OSError:
        return {"total": 0, "free": 0, "used": 0}


class _ZipBuffer:
    """File "finto" per zipfile: raccoglie i byte da mandare al browser a pezzi."""

    def __init__(self) -> None:
        self.chunks: list[bytes] = []
        self.position = 0

    def write(self, data: bytes) -> int:
        self.chunks.append(bytes(data))
        self.position += len(data)
        return len(data)

    def tell(self) -> int:
        return self.position

    def flush(self) -> None:
        pass

    def drain(self) -> bytes:
        data = b"".join(self.chunks)
        self.chunks.clear()
        return data


def stream_zip(folder: Path, arc_root: str, chunk_size: int = 1024 * 1024) -> Iterator[bytes]:
    """Zip (senza compressione, i file sono già cifrati) generato al volo, anche se il backup è enorme."""
    buffer = _ZipBuffer()
    with zipfile.ZipFile(buffer, "w", compression=zipfile.ZIP_STORED, allowZip64=True) as archive:
        for root, dirs, files in os.walk(folder):
            dirs.sort()
            for name in sorted(files):
                path = Path(root) / name
                arcname = f"{arc_root}/{path.relative_to(folder).as_posix()}"
                info = zipfile.ZipInfo.from_file(path, arcname)
                info.compress_type = zipfile.ZIP_STORED
                with path.open("rb") as source, archive.open(info, "w", force_zip64=True) as target:
                    while True:
                        data = source.read(chunk_size)
                        if not data:
                            break
                        target.write(data)
                        chunk = buffer.drain()
                        if chunk:
                            yield chunk
                chunk = buffer.drain()
                if chunk:
                    yield chunk
    yield buffer.drain()


def human_size(size: int) -> str:
    value = float(size)
    for unit in ("B", "KB", "MB", "GB", "TB"):
        if value < 1024 or unit == "TB":
            return f"{value:.0f} {unit}" if unit in ("B", "KB") else f"{value:.1f} {unit}"
        value /= 1024
    return f"{size} B"
