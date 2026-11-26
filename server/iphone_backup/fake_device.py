"""iPhone simulato per la modalità demo e per i test (stessa interfaccia di RealGateway)."""

from __future__ import annotations

import asyncio
from datetime import datetime
from pathlib import Path
from typing import Optional

from .config import DeviceRecord
from .demo import DEMO_UDID, create_demo_backup
from .device import DeviceStatus, UsbDevice, read_backup_ios_version, version_tuple
from .jobs import DeviceUnreachable, Job, UserFacingError

NEW_PHONE_UDID = "00008140-000B2C3D4E5F6A70"


class FakeGateway:
    def __init__(self, delay: float = 0.2):
        self.delay = delay
        self.paired: set[str] = set()
        self.encrypted = False
        self.reachable = True
        self.usb = [
            UsbDevice(udid=DEMO_UDID, name="iPhone di prova", product_type="iPhone15,2", ios_version="18.6"),
            UsbDevice(udid=NEW_PHONE_UDID, name="iPhone nuovo", product_type="iPhone17,1", ios_version="26.1"),
        ]
        self.restored: list[tuple[str, str]] = []

    async def _steps(self, job: Job, count: int, message: str) -> None:
        for step in range(count + 1):
            percent = step * 100 / count
            job.set_progress(percent, f"{message}: {percent:.0f}%")
            if step % max(1, count // 4) == 0:
                job.log(f"Avanzamento {percent:.0f}%")
            await asyncio.sleep(self.delay)

    async def list_usb(self) -> list[UsbDevice]:
        for device in self.usb:
            device.paired = device.udid in self.paired
        return list(self.usb)

    async def pair_usb(self, udid: str, job: Job) -> DeviceRecord:
        device = next((d for d in self.usb if d.udid == udid), None)
        if device is None:
            raise UserFacingError("iPhone non collegato via USB.")
        job.log("Sull'iPhone tocca \"Autorizza\" e inserisci il codice…")
        await asyncio.sleep(self.delay * 3)
        self.paired.add(udid)
        job.log("Associato. Connessioni via Wi-Fi attivate.")
        return DeviceRecord(udid=udid, name=device.name, product_type=device.product_type,
                            ios_version=device.ios_version, paired_at=datetime.now().isoformat(timespec="seconds"))

    async def check(self, udid: str, hosts: list[str], job: Optional[Job] = None) -> DeviceStatus:
        await asyncio.sleep(self.delay)
        now = datetime.now().isoformat(timespec="seconds")
        if not self.reachable:
            return DeviceStatus(reachable=False, checked_at=now, error="iPhone non raggiungibile (simulato).")
        return DeviceStatus(reachable=True, via="Wi-Fi di casa", name="iPhone di prova", ios_version="18.6",
                            encrypted=self.encrypted, wifi_enabled=True, checked_at=now)

    async def set_encryption(self, udid: str, hosts: list[str], password: str, backup_root: Path, job: Job) -> bool:
        await asyncio.sleep(self.delay * 2)
        if self.encrypted:
            job.log("La cifratura era già attiva.")
            return False
        self.encrypted = True
        job.log("Cifratura attivata (simulata).")
        return True

    async def backup(self, udid: str, hosts: list[str], backup_root: Path, job: Job) -> str:
        if not self.reachable:
            raise DeviceUnreachable("iPhone non raggiungibile (simulato).")
        job.log("Connesso a iPhone di prova (iOS 18.6) via Wi-Fi di casa.")
        await self._steps(job, 20, "Backup in corso")
        create_demo_backup(backup_root, udid=udid)
        return "Wi-Fi di casa"

    async def restore(self, target_udid: str, source_udid: str, backup_root: Path, password: str, job: Job) -> None:
        target = next((d for d in self.usb if d.udid == target_udid), None)
        if target is None:
            raise UserFacingError("Il nuovo iPhone non è collegato via USB al server.")
        backup_version = read_backup_ios_version(backup_root, source_udid)
        if backup_version and version_tuple(target.ios_version) < version_tuple(backup_version):
            raise UserFacingError(f"Il nuovo iPhone ha iOS {target.ios_version}, più vecchio del backup ({backup_version}).")
        self.paired.add(target_udid)
        await self._steps(job, 20, "Ripristino in corso")
        self.restored.append((target_udid, source_udid))
        job.log("Ripristino completato (simulato): l'iPhone si riavvia.")
