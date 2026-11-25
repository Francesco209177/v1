#!/usr/bin/env python3
"""Backup completo dell'iPhone (stile iTunes/Finder) eseguito dal NAS via rete.

Si collega a lockdownd dell'iPhone (porta 62078) con un pairing record già esistente e
usa il servizio mobilebackup2 tramite pymobiledevice3. Il backup è incrementale,
compatibile con Finder/iTunes e, se attivi la cifratura, include anche password,
dati di Salute e cronologia.

Comandi:
  info           prova la connessione e mostra i dati del telefono
  encryption-on  attiva la cifratura dei backup con BACKUP_PASSWORD (consigliato)
  backup         esegue un backup adesso
  loop           esegue un backup ogni INTERVAL_HOURS (riprova più spesso se il telefono non risponde)
"""

from __future__ import annotations

import argparse
import asyncio
import json
import os
import plistlib
import socket
import sys
import time
import urllib.request
from datetime import datetime, timezone
from pathlib import Path

from pymobiledevice3.lockdown import create_using_tcp
from pymobiledevice3.services.mobilebackup2 import Mobilebackup2Service

LOCKDOWN_PORT = 62078


def env(name: str, default: str = "") -> str:
    return os.environ.get(name, default).strip()


HOSTS = [h.strip() for h in env("IPHONE_HOSTS").split(",") if h.strip()]
PAIRING_FILE = Path(env("PAIRING_FILE", "/config/pairing.plist"))
BACKUP_DIR = Path(env("BACKUP_DIR", "/backups"))
INTERVAL_HOURS = float(env("INTERVAL_HOURS", "24"))
RETRY_MINUTES = float(env("RETRY_MINUTES", "30"))
CONNECT_TIMEOUT = float(env("CONNECT_TIMEOUT", "5"))
NOTIFY_URL = env("NOTIFY_URL")  # opzionale, es. https://ntfy.sh/mio-topic-segreto
STATUS_FILE = BACKUP_DIR / "status.json"


def log(message: str) -> None:
    print(f"{datetime.now().strftime('%Y-%m-%d %H:%M:%S')} {message}", flush=True)


def notify(message: str) -> None:
    if not NOTIFY_URL:
        return
    try:
        request = urllib.request.Request(NOTIFY_URL, data=message.encode("utf-8"), method="POST")
        urllib.request.urlopen(request, timeout=10).close()
    except Exception as error:  # la notifica non deve mai far fallire il backup
        log(f"Notifica non inviata: {error}")


def write_status(**fields) -> None:
    try:
        status = json.loads(STATUS_FILE.read_text()) if STATUS_FILE.exists() else {}
    except (OSError, ValueError):
        status = {}
    status.update(fields)
    BACKUP_DIR.mkdir(parents=True, exist_ok=True)
    STATUS_FILE.write_text(json.dumps(status, indent=2, ensure_ascii=False))


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


def load_pair_record() -> dict:
    if not PAIRING_FILE.exists():
        raise SystemExit(
            f"Pairing file non trovato: {PAIRING_FILE}. Segui il README (passo 1) e copialo in config/pairing.plist."
        )
    with PAIRING_FILE.open("rb") as handle:
        record = plistlib.load(handle)
    missing = [key for key in ("HostID", "HostCertificate", "HostPrivateKey", "RootCertificate") if key not in record]
    if missing:
        raise SystemExit(f"Il pairing file non sembra valido (mancano: {', '.join(missing)}).")
    return record


def reachable_host() -> str | None:
    """Primo host della lista che risponde sulla porta di lockdownd."""
    if not HOSTS:
        raise SystemExit("Imposta IPHONE_HOSTS nel file .env (IP di casa e/o IP Tailscale dell'iPhone).")
    for host in HOSTS:
        try:
            with socket.create_connection((host, LOCKDOWN_PORT), timeout=CONNECT_TIMEOUT):
                return host
        except OSError:
            continue
    return None


async def connect():
    host = reachable_host()
    if host is None:
        return None, None
    lockdown = await create_using_tcp(hostname=host, pair_record=load_pair_record(), autopair=False)
    if not lockdown.paired:
        await lockdown.close()
        raise RuntimeError(
            f"{host} ha risposto ma non accetta il pairing file: rigeneralo (README, passo 1) "
            "e controlla che la sincronizzazione via Wi-Fi sia attiva."
        )
    return host, lockdown


async def cmd_info() -> int:
    host, lockdown = await connect()
    if lockdown is None:
        log(f"Nessun host raggiungibile tra {HOSTS} sulla porta {LOCKDOWN_PORT}.")
        return 1
    try:
        info = lockdown.short_info
        log(f"Connesso a {host}")
        for key in ("DeviceName", "ProductType", "ProductVersion", "UniqueDeviceID"):
            log(f"  {key}: {info.get(key)}")
        log(f"  Sincronizzazione Wi-Fi: {'attiva' if await lockdown.get_enable_wifi_connections() else 'NON attiva'}")
        async with Mobilebackup2Service(lockdown) as service:
            encrypted = await service.get_will_encrypt()
        log(f"  Backup cifrati: {'sì' if encrypted else 'no (consigliato: comando encryption-on)'}")
    finally:
        await lockdown.close()
    return 0


async def cmd_encryption_on() -> int:
    password = env("BACKUP_PASSWORD")
    if len(password) < 8:
        log("Imposta BACKUP_PASSWORD (almeno 8 caratteri) nel file .env. Senza questa password il backup non si può ripristinare!")
        return 1
    host, lockdown = await connect()
    if lockdown is None:
        log("iPhone non raggiungibile.")
        return 1
    try:
        async with Mobilebackup2Service(lockdown) as service:
            if await service.get_will_encrypt():
                log("La cifratura dei backup è già attiva.")
                return 0
            BACKUP_DIR.mkdir(parents=True, exist_ok=True)
            log("Attivo la cifratura: se l'iPhone lo chiede, sbloccalo e inserisci il codice.")
            await service.change_password(backup_directory=BACKUP_DIR, new=password)
            log("Cifratura attivata. Conserva BACKUP_PASSWORD in un posto sicuro.")
    finally:
        await lockdown.close()
    return 0


async def cmd_backup() -> int:
    write_status(last_attempt=now_iso())
    try:
        host, lockdown = await connect()
    except Exception as error:
        log(f"Connessione fallita: {error}")
        write_status(result="errore", error=str(error))
        return 2
    if lockdown is None:
        log(f"iPhone non raggiungibile ({', '.join(HOSTS)}): riprovo più tardi.")
        write_status(result="non raggiungibile")
        return 1

    name = lockdown.short_info.get("DeviceName") or "iPhone"
    started = time.monotonic()
    last_logged = -10.0

    def progress(percent) -> None:
        nonlocal last_logged
        try:
            value = float(percent)
        except (TypeError, ValueError):
            return
        if value - last_logged >= 5 or value >= 100:
            last_logged = value
            log(f"  avanzamento: {value:.0f}%")

    log(f"Backup di \"{name}\" ({host}) in {BACKUP_DIR} …")
    try:
        BACKUP_DIR.mkdir(parents=True, exist_ok=True)
        async with Mobilebackup2Service(lockdown) as service:
            # full=False: incrementale; il primo backup (o dopo un errore) è comunque completo.
            await service.backup(full=False, backup_directory=BACKUP_DIR, progress_callback=progress)
    except Exception as error:
        log(f"Backup NON riuscito: {error!r}")
        write_status(result="errore", error=repr(error), host=host)
        notify(f"Backup iPhone NON riuscito: {error}")
        return 2
    finally:
        await lockdown.close()

    minutes = (time.monotonic() - started) / 60
    log(f"Backup completato in {minutes:.1f} minuti.")
    write_status(result="ok", error=None, host=host, device=name, last_success=now_iso(), duration_minutes=round(minutes, 1))
    notify(f"Backup iPhone completato ({name}, {minutes:.0f} min)")
    return 0


def cmd_loop() -> int:
    log(f"Avvio: un backup ogni {INTERVAL_HOURS:g} ore, host {HOSTS}.")
    while True:
        result = asyncio.run(cmd_backup())
        wait_hours = INTERVAL_HOURS if result == 0 else RETRY_MINUTES / 60
        log(f"Prossimo tentativo tra {wait_hours * 60:.0f} minuti.")
        time.sleep(wait_hours * 3600)


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("command", choices=["info", "encryption-on", "backup", "loop"], nargs="?", default="loop")
    command = parser.parse_args().command
    if command == "loop":
        return cmd_loop()
    handlers = {"info": cmd_info, "encryption-on": cmd_encryption_on, "backup": cmd_backup}
    return asyncio.run(handlers[command]())


if __name__ == "__main__":
    sys.exit(main())
