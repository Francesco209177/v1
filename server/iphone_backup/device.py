"""Comunicazione con l'iPhone tramite pymobiledevice3 (USB via usbmuxd, oppure rete).

Tutte le funzioni sono async e girano nel thread del lavoro (vedi jobs.py).
`FakeGateway` (fake_device.py) ha la stessa interfaccia e serve per i test e la modalità demo.
"""

from __future__ import annotations

import asyncio
import plistlib
from dataclasses import asdict, dataclass
from datetime import datetime
from pathlib import Path
from typing import Optional, Protocol

from .config import DeviceRecord, Paths
from .jobs import DeviceUnreachable, Job, UserFacingError, describe_error

LOCKDOWN_PORT = 62078


@dataclass
class UsbDevice:
    udid: str
    name: str = "iPhone"
    product_type: str = ""
    ios_version: str = ""
    paired: bool = False
    error: str = ""

    def to_json(self) -> dict:
        return asdict(self)


@dataclass
class DeviceStatus:
    reachable: bool
    via: str = ""
    name: str = ""
    ios_version: str = ""
    encrypted: Optional[bool] = None
    wifi_enabled: Optional[bool] = None
    checked_at: str = ""
    error: str = ""

    def to_json(self) -> dict:
        return asdict(self)


class Gateway(Protocol):
    async def list_usb(self) -> list[UsbDevice]: ...

    async def pair_usb(self, udid: str, job: Job) -> DeviceRecord: ...

    async def check(self, udid: str, hosts: list[str], job: Optional[Job] = None) -> DeviceStatus: ...

    async def set_encryption(self, udid: str, hosts: list[str], password: str, backup_root: Path, job: Job) -> bool: ...

    async def backup(self, udid: str, hosts: list[str], backup_root: Path, job: Job) -> str: ...

    async def restore(self, target_udid: str, source_udid: str, backup_root: Path, password: str, job: Job) -> None: ...


def read_backup_ios_version(backup_root: Path, udid: str) -> str:
    try:
        info = plistlib.loads((backup_root / udid / "Info.plist").read_bytes())
        return str(info.get("Product Version", ""))
    except (OSError, plistlib.InvalidFileException, ValueError):
        return ""


def version_tuple(version: str) -> tuple[int, ...]:
    parts = []
    for piece in version.split("."):
        digits = "".join(ch for ch in piece if ch.isdigit())
        parts.append(int(digits) if digits else 0)
    return tuple(parts)


class RealGateway:
    def __init__(self, paths: Paths):
        self.paths = paths

    # --- helper -----------------------------------------------------------------------------

    def _pair_record(self, udid: str) -> Optional[dict]:
        path = self.paths.pairing / f"{udid}.plist"
        try:
            return plistlib.loads(path.read_bytes())
        except (OSError, ValueError, plistlib.InvalidFileException):
            return None

    def _save_pair_record(self, lockdown) -> None:
        record = getattr(lockdown, "pair_record", None)
        if record and lockdown.udid:
            path = self.paths.pairing / f"{lockdown.udid}.plist"
            path.write_bytes(plistlib.dumps(record))
            path.chmod(0o600)

    async def _usb_serials(self) -> list[str]:
        from pymobiledevice3 import usbmux

        devices = await usbmux.list_devices()
        return [device.serial for device in devices if device.is_usb]

    async def _usb_lockdown(self, udid: str, autopair: bool, job: Optional[Job] = None, timeout: float = 180):
        """Lockdown via USB. Con autopair=True ripete finché l'utente non tocca "Autorizza"."""
        from pymobiledevice3.exceptions import PairingDialogResponsePendingError, PasswordRequiredError
        from pymobiledevice3.lockdown import create_using_usbmux

        deadline = asyncio.get_running_loop().time() + timeout
        last_hint = ""
        while True:
            try:
                return await create_using_usbmux(
                    serial=udid,
                    autopair=autopair,
                    pair_timeout=30 if autopair else None,
                    pairing_records_cache_folder=self.paths.pairing,
                )
            except (PasswordRequiredError, PairingDialogResponsePendingError, TimeoutError) as error:
                hint = (
                    "Sblocca l'iPhone (codice) e tieni lo schermo acceso"
                    if isinstance(error, PasswordRequiredError)
                    else "Sull'iPhone tocca \"Autorizza\" e inserisci il codice"
                )
                if job and hint != last_hint:
                    job.log(hint + "…")
                    job.set_progress(None, hint)
                    last_hint = hint
                if asyncio.get_running_loop().time() > deadline:
                    raise UserFacingError("Tempo scaduto: l'associazione non è stata confermata sull'iPhone.") from error
                await asyncio.sleep(3)

    async def _tcp_open(self, host: str, timeout: float = 4) -> bool:
        try:
            _, writer = await asyncio.wait_for(asyncio.open_connection(host, LOCKDOWN_PORT), timeout)
            writer.close()
            return True
        except (OSError, asyncio.TimeoutError):
            return False

    async def connect(self, udid: str, hosts: list[str], job: Optional[Job] = None):
        """Trova l'iPhone: prima USB, poi la rete di casa (Bonjour), poi gli IP impostati (es. Tailscale)."""
        from pymobiledevice3.lockdown import create_using_mobdev2

        def note(text: str) -> None:
            if job:
                job.log(text)

        try:
            if udid in await self._usb_serials():
                lockdown = await self._usb_lockdown(udid, autopair=False)
                if lockdown.paired:
                    return lockdown, "USB"
                await lockdown.close()
                note("Collegato via USB ma non associato a questo server.")
        except Exception as error:  # noqa: BLE001 - usbmuxd assente non impedisce la rete
            note(f"USB non disponibile ({type(error).__name__}).")

        if self._pair_record(udid) is None:
            raise UserFacingError("Manca il file di associazione: associa di nuovo l'iPhone via USB.")

        note("Cerco l'iPhone sulla rete di casa (Bonjour)…")
        try:
            lockdown = await create_using_mobdev2(udid=udid, pair_records=self.paths.pairing, timeout=6)
            return lockdown, "Wi-Fi di casa"
        except Exception as error:  # noqa: BLE001
            note(f"Non trovato con Bonjour ({type(error).__name__}).")

        for host in hosts:
            host = host.strip()
            if not host:
                continue
            note(f"Provo {host}…")
            if not await self._tcp_open(host):
                note(f"{host}: nessuna risposta sulla porta {LOCKDOWN_PORT}.")
                continue
            try:
                lockdown = await create_using_mobdev2(hostname=host, udid=udid, pair_records=self.paths.pairing)
                return lockdown, f"rete ({host})"
            except Exception as error:  # noqa: BLE001
                note(f"{host}: {describe_error(error)}")

        raise DeviceUnreachable(
            "iPhone non raggiungibile. Deve essere acceso e sulla stessa Wi-Fi del server "
            "(meglio se in carica), oppure collegato via USB; da fuori casa serve l'IP Tailscale "
            "dell'iPhone nelle Impostazioni."
        )

    # --- operazioni ---------------------------------------------------------------------------

    async def list_usb(self) -> list[UsbDevice]:
        from pymobiledevice3.lockdown import create_using_usbmux

        try:
            serials = await self._usb_serials()
        except Exception as error:  # noqa: BLE001
            raise UserFacingError(
                "Nessun iPhone collegato via USB (oppure usbmuxd non è attivo). Collega l'iPhone al server con il "
                "cavo, sbloccalo e tocca di nuovo \"Cerca\": usbmuxd parte da solo quando colleghi l'iPhone. "
                "Se il problema resta: sudo apt install --reinstall usbmuxd"
            ) from error
        result = []
        for serial in serials:
            device = UsbDevice(udid=serial)
            try:
                lockdown = await create_using_usbmux(
                    serial=serial, autopair=False, pairing_records_cache_folder=self.paths.pairing
                )
                try:
                    info = lockdown.short_info
                    device.name = info.get("DeviceName") or "iPhone"
                    device.product_type = info.get("ProductType") or ""
                    device.ios_version = info.get("ProductVersion") or ""
                    device.paired = bool(lockdown.paired)
                finally:
                    await lockdown.close()
            except Exception as error:  # noqa: BLE001
                device.error = describe_error(error)
            result.append(device)
        return result

    async def pair_usb(self, udid: str, job: Job) -> DeviceRecord:
        job.log("Associazione: sull'iPhone comparirà \"Vuoi autorizzare questo computer?\".")
        lockdown = await self._usb_lockdown(udid, autopair=True, job=job)
        try:
            if not lockdown.paired:
                raise UserFacingError("L'iPhone non ha accettato l'associazione.")
            self._save_pair_record(lockdown)
            job.log("Associato. Attivo le connessioni via Wi-Fi…")
            await lockdown.set_enable_wifi_connections(True)
            info = lockdown.short_info
            record = DeviceRecord(
                udid=lockdown.udid,
                name=info.get("DeviceName") or "iPhone",
                product_type=info.get("ProductType") or "",
                ios_version=info.get("ProductVersion") or "",
                paired_at=datetime.now().isoformat(timespec="seconds"),
            )
            job.log(f"{record.name} (iOS {record.ios_version}) associato e raggiungibile via Wi-Fi.")
            return record
        finally:
            await lockdown.close()

    async def check(self, udid: str, hosts: list[str], job: Optional[Job] = None) -> DeviceStatus:
        from pymobiledevice3.services.mobilebackup2 import Mobilebackup2Service

        status = DeviceStatus(reachable=False, checked_at=datetime.now().isoformat(timespec="seconds"))
        try:
            lockdown, via = await self.connect(udid, hosts, job)
        except Exception as error:  # noqa: BLE001
            status.error = describe_error(error) if not isinstance(error, UserFacingError) else str(error)
            return status
        try:
            info = lockdown.short_info
            status.reachable = True
            status.via = via
            status.name = info.get("DeviceName") or ""
            status.ios_version = info.get("ProductVersion") or ""
            try:
                status.wifi_enabled = await lockdown.get_enable_wifi_connections()
            except Exception:  # noqa: BLE001
                pass
            try:
                async with Mobilebackup2Service(lockdown) as service:
                    status.encrypted = await service.get_will_encrypt()
            except Exception:  # noqa: BLE001
                pass
        finally:
            await lockdown.close()
        return status

    async def set_encryption(self, udid: str, hosts: list[str], password: str, backup_root: Path, job: Job) -> bool:
        from pymobiledevice3.services.mobilebackup2 import Mobilebackup2Service

        lockdown, via = await self.connect(udid, hosts, job)
        try:
            async with Mobilebackup2Service(lockdown) as service:
                if await service.get_will_encrypt():
                    job.log("La cifratura dei backup era già attiva su questo iPhone.")
                    return False
                job.log("Attivo la cifratura: se l'iPhone lo chiede, inserisci il codice di sblocco.")
                job.set_progress(None, "Conferma sull'iPhone con il codice")
                backup_root.mkdir(parents=True, exist_ok=True)
                await service.change_password(backup_directory=backup_root, new=password)
                job.log("Cifratura attivata.")
                return True
        finally:
            await lockdown.close()

    async def backup(self, udid: str, hosts: list[str], backup_root: Path, job: Job) -> str:
        from pymobiledevice3.services.mobilebackup2 import Mobilebackup2Service

        lockdown, via = await self.connect(udid, hosts, job)
        try:
            info = lockdown.short_info
            job.log(f"Connesso a {info.get('DeviceName')} (iOS {info.get('ProductVersion')}) via {via}.")
            backup_root.mkdir(parents=True, exist_ok=True)
            async with Mobilebackup2Service(lockdown) as service:
                encrypted = await service.get_will_encrypt()
                job.log("Backup cifrato." if encrypted else "Attenzione: backup NON cifrato (password e Salute esclusi).")
                job.set_progress(0, "Backup in corso…")
                last = [-5.0]

                def progress(value) -> None:
                    try:
                        percent = float(value)
                    except (TypeError, ValueError):
                        return
                    job.set_progress(percent, f"Backup in corso: {percent:.0f}%")
                    if percent - last[0] >= 5:
                        last[0] = percent
                        job.log(f"Avanzamento {percent:.0f}%")

                await service.backup(full=False, backup_directory=backup_root, progress_callback=progress)
            return via
        finally:
            await lockdown.close()

    async def restore(self, target_udid: str, source_udid: str, backup_root: Path, password: str, job: Job) -> None:
        from pymobiledevice3.services.mobilebackup2 import Mobilebackup2Service

        if target_udid not in await self._usb_serials():
            raise UserFacingError("Il nuovo iPhone non è collegato via USB al server.")
        job.log("Associazione con il nuovo iPhone (tocca \"Autorizza\" se richiesto)…")
        lockdown = await self._usb_lockdown(target_udid, autopair=True, job=job)
        try:
            device_version = lockdown.short_info.get("ProductVersion") or ""
            backup_version = read_backup_ios_version(backup_root, source_udid)
            job.log(f"Nuovo iPhone: iOS {device_version}. Backup creato con iOS {backup_version or '?'}.")
            if backup_version and device_version and version_tuple(device_version) < version_tuple(backup_version):
                raise UserFacingError(
                    f"Il nuovo iPhone ha iOS {device_version}, più vecchio di quello del backup ({backup_version}). "
                    "Aggiorna iOS sul nuovo iPhone (Impostazioni > Generali > Aggiornamento Software) e riprova."
                )
            job.set_progress(0, "Ripristino in corso: non scollegare il cavo")

            def progress(value) -> None:
                try:
                    job.set_progress(float(value), f"Ripristino in corso: {float(value):.0f}% — non scollegare il cavo")
                except (TypeError, ValueError):
                    pass

            async with Mobilebackup2Service(lockdown) as service:
                await service.restore(
                    backup_directory=backup_root,
                    system=True,
                    settings=True,
                    reboot=True,
                    copy=False,
                    remove=False,
                    password=password,
                    source=source_udid,
                    progress_callback=progress,
                )
            job.log("Ripristino completato: l'iPhone si riavvia. Lascialo collegato al Wi-Fi e alla corrente "
                    "mentre riscarica le app.")
        finally:
            await lockdown.close()
