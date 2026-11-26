"""Logica dell'applicazione: avvia i lavori, tiene lo stato dei backup e la sessione WhatsApp."""

from __future__ import annotations

import asyncio
import threading
import time
import urllib.request
from datetime import datetime, timedelta
from typing import Optional

from . import backups as backup_store
from .config import Paths, Settings, SettingsStore, read_json, write_json
from .device import DeviceStatus, Gateway
from .events import EventLog
from .jobs import DeviceUnreachable, Job, JobManager, UserFacingError
from .whatsapp import NoWhatsApp, WhatsAppArchive, WrongPassword, open_backup, verify_password

RESULT_OK = "ok"
RESULT_ERROR = "errore"
RESULT_UNREACHABLE = "non raggiungibile"


def parse_time(value) -> Optional[datetime]:
    if not value:
        return None
    try:
        return datetime.fromisoformat(value)
    except (TypeError, ValueError):
        return None


def next_due(state: dict, settings: Settings, now: datetime) -> Optional[datetime]:
    """Quando fare il prossimo backup automatico (None = backup automatico spento o iPhone non associato)."""
    if not settings.auto_backup or settings.device is None:
        return None
    last_success = parse_time(state.get("last_success"))
    last_attempt = parse_time(state.get("last_attempt"))
    if last_attempt is None and last_success is None:
        return now
    if last_attempt is not None and (last_success is None or last_attempt > last_success):
        return last_attempt + timedelta(minutes=max(5.0, settings.retry_minutes))
    return (last_success or now) + timedelta(hours=max(1.0, settings.interval_hours))


class BackupService:
    def __init__(self, paths: Paths, gateway: Gateway, demo: bool = False):
        self.paths = paths
        self.gateway = gateway
        self.demo = demo
        paths.ensure()
        self.store = SettingsStore(paths.settings_file)
        self.events = EventLog(paths.events_file)
        self.jobs = JobManager(self.events)
        self.state: dict = read_json(paths.state_file, {})
        self._state_lock = threading.Lock()
        self.whatsapp: Optional[WhatsAppArchive] = None
        self._clear_cache()

    # --- stato ------------------------------------------------------------------------------

    @property
    def settings(self) -> Settings:
        return self.store.settings

    @property
    def device(self):
        return self.settings.device

    def update_state(self, **values) -> None:
        with self._state_lock:
            self.state.update(values)
            write_json(self.paths.state_file, self.state)

    def next_due(self) -> Optional[datetime]:
        return next_due(self.state, self.settings, datetime.now())

    def _clear_cache(self) -> None:
        import shutil

        for child in self.paths.cache.glob("whatsapp-*"):
            shutil.rmtree(child, ignore_errors=True)

    def notify(self, message: str) -> None:
        url = self.settings.notify_url.strip()
        if not url:
            return
        try:
            request = urllib.request.Request(url, data=message.encode("utf-8"), method="POST",
                                             headers={"Title": "Backup iPhone"})
            urllib.request.urlopen(request, timeout=10).close()
        except Exception as error:  # noqa: BLE001
            self.events.warning(f"Notifica non inviata: {error}")

    def _require_device(self):
        if self.device is None:
            raise UserFacingError("Nessun iPhone associato: vai su \"Associa iPhone\".")
        return self.device

    # --- lavori -----------------------------------------------------------------------------

    def start_backup(self, trigger: str = "manuale") -> Job:
        device = self._require_device()

        async def work(job: Job):
            self.close_whatsapp()
            started = time.time()
            self.update_state(last_attempt=datetime.now().isoformat(timespec="seconds"), last_trigger=trigger)
            try:
                via = await self.gateway.backup(device.udid, self.settings.extra_hosts, self.paths.current, job)
            except DeviceUnreachable as error:
                self.update_state(last_result=RESULT_UNREACHABLE, last_error=str(error))
                raise
            except Exception as error:
                self.update_state(last_result=RESULT_ERROR, last_error=str(error))
                self.notify(f"Backup iPhone NON riuscito: {error}")
                raise
            job.set_progress(None, "Controllo il backup…")
            info = backup_store.read_backup("corrente", self.paths.current / device.udid)
            size = info.size if info else 0
            if self.settings.keep_safe_copy:
                job.log("Aggiorno la copia dell'ultimo backup riuscito…")
                job.set_progress(None, "Aggiorno la copia sicura…")
                await asyncio.to_thread(backup_store.update_safe_copy, self.paths, device.udid, job.log)
                self.update_state(safe_copy_at=datetime.now().isoformat(timespec="seconds"))
            minutes = (time.time() - started) / 60
            self.update_state(
                last_success=datetime.now().isoformat(timespec="seconds"), last_result=RESULT_OK, last_error="",
                last_via=via, last_size=size, last_duration_minutes=round(minutes, 1),
                last_encrypted=info.encrypted if info else None,
            )
            job.message = f"Backup completato: {backup_store.human_size(size)} in {minutes:.0f} min"
            self.notify(f"Backup iPhone completato ({backup_store.human_size(size)}, {minutes:.0f} min)")
            return {"size": size, "via": via}

        return self.jobs.start("backup", f"Backup di {device.name} ({trigger})", work)

    def start_check(self) -> Job:
        device = self._require_device()

        async def work(job: Job):
            job.log("Cerco l'iPhone…")
            status: DeviceStatus = await self.gateway.check(device.udid, self.settings.extra_hosts, job)
            self.update_state(device_status=status.to_json())
            if not status.reachable:
                raise DeviceUnreachable(status.error or "iPhone non raggiungibile")
            job.message = f"Raggiungibile via {status.via}"
            return status.to_json()

        return self.jobs.start("check", "Verifica connessione con l'iPhone", work)

    def start_pair(self, udid: str) -> Job:
        async def work(job: Job):
            record = await self.gateway.pair_usb(udid, job)
            self.settings.device = record
            self.store.save()
            self.update_state(device_status={})
            job.message = f"{record.name} associato"
            return {"udid": record.udid, "name": record.name}

        return self.jobs.start("pair", "Associazione iPhone via USB", work)

    def start_encryption(self, password: str) -> Job:
        device = self._require_device()
        if len(password) < 6:
            raise UserFacingError("La password deve avere almeno 6 caratteri.")

        async def work(job: Job):
            changed = await self.gateway.set_encryption(device.udid, self.settings.extra_hosts, password,
                                                        self.paths.current, job)
            self.update_state(encryption_set_at=datetime.now().isoformat(timespec="seconds"))
            job.message = "Cifratura attivata" if changed else "La cifratura era già attiva (vale la password impostata allora)"
            return {"changed": changed}

        return self.jobs.start("encryption", "Attivazione cifratura dei backup", work)

    def start_restore(self, target_udid: str, source_udid: str, kind: str, password: str) -> Job:
        root = backup_store.backup_root(self.paths, kind)
        device_dir = backup_store.device_dir(self.paths, kind, source_udid)
        if not (device_dir / "Manifest.plist").exists():
            raise UserFacingError("Backup non trovato.")

        async def work(job: Job):
            self.close_whatsapp()
            encrypted = backup_store.read_backup(kind, device_dir, with_size=False)
            if encrypted and encrypted.encrypted:
                job.log("Controllo la password del backup…")
                job.set_progress(None, "Controllo la password (qualche secondo)…")
                try:
                    await asyncio.to_thread(verify_password, device_dir, password)
                except WrongPassword as error:
                    raise UserFacingError(str(error)) from error
            await self.gateway.restore(target_udid, source_udid, root, password, job)
            job.message = "Ripristino completato: l'iPhone si riavvia"

        return self.jobs.start("restore", "Ripristino sul nuovo iPhone", work)

    def start_verify_password(self, kind: str, udid: str, password: str) -> Job:
        device_dir = backup_store.device_dir(self.paths, kind, udid)

        async def work(job: Job):
            job.set_progress(None, "Controllo la password (qualche secondo)…")
            try:
                await asyncio.to_thread(verify_password, device_dir, password)
            except WrongPassword as error:
                raise UserFacingError(str(error)) from error
            except FileNotFoundError as error:
                raise UserFacingError(str(error)) from error
            job.message = "Password corretta: il backup si può aprire e ripristinare"

        return self.jobs.start("verify", "Verifica password del backup", work)

    def start_open_whatsapp(self, kind: str, udid: str, password: str) -> Job:
        device_dir = backup_store.device_dir(self.paths, kind, udid)

        async def work(job: Job):
            self.close_whatsapp()
            job.set_progress(None, "Decifro il backup e cerco WhatsApp (qualche secondo)…")
            try:
                archive = await asyncio.to_thread(
                    WhatsAppArchive.open, device_dir, password, self.paths.cache, backup_store.KINDS.get(kind, kind)
                )
            except (WrongPassword, NoWhatsApp, FileNotFoundError) as error:
                raise UserFacingError(str(error)) from error
            self.whatsapp = archive
            job.message = "Chat WhatsApp pronte"

        return self.jobs.start("whatsapp", "Apertura chat WhatsApp", work)

    def close_whatsapp(self) -> None:
        archive, self.whatsapp = self.whatsapp, None
        if archive is not None:
            archive.close()

    def forget_device(self) -> None:
        if self.device is not None:
            udid = self.device.udid
            (self.paths.pairing / f"{udid}.plist").unlink(missing_ok=True)
            self.events.info(f"Associazione rimossa per {self.device.name}. I backup restano sul disco.")
        self.settings.device = None
        self.store.save()
        self.update_state(device_status={})

    # --- pianificazione ----------------------------------------------------------------------

    async def scheduler_loop(self, interval: float = 30) -> None:
        while True:
            try:
                self.tick()
            except Exception as error:  # noqa: BLE001
                self.events.error(f"Pianificazione: {error}")
            await asyncio.sleep(interval)

    def tick(self, now: Optional[datetime] = None) -> Optional[Job]:
        if self.whatsapp is not None and self.whatsapp.expired:
            self.close_whatsapp()
            self.events.info("Chat WhatsApp chiuse dopo 30 minuti di inattività.")
        due = next_due(self.state, self.settings, now or datetime.now())
        if due is None or self.jobs.busy or (now or datetime.now()) < due:
            return None
        return self.start_backup("automatico")


def run_sync(coro):
    """Esegue una coroutine del gateway in un event loop separato (usato dalle richieste web veloci)."""
    return asyncio.run(coro)


__all__ = ["BackupService", "next_due", "run_sync", "open_backup", "UserFacingError"]
