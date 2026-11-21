"""Bluetooth Low Energy con l'adattatore del PC (libreria bleak) in un thread asyncio dedicato.

L'interfaccia chiama metodi che restituiscono ``concurrent.futures.Future``; le notifiche arrivano
dal thread di bleak tramite una funzione di richiamo.
"""

from __future__ import annotations

import asyncio
import logging
import threading
from collections.abc import Callable
from concurrent.futures import Future
from typing import Any

log = logging.getLogger(__name__)

# Alcuni UUID standard del Bluetooth SIG, per dare un nome ai servizi più comuni.
KNOWN_SERVICES = {
    "00001800": "Accesso generico", "00001801": "Attributi generici", "0000180a": "Informazioni dispositivo",
    "0000180f": "Batteria", "0000180d": "Frequenza cardiaca", "00001809": "Termometro", "0000181a": "Sensori ambientali",
    "00001812": "HID su BLE", "0000fe59": "Aggiornamento firmware (Nordic)",
}  # fmt: skip


class BleUnavailable(Exception):
    pass


def service_name(uuid: str, description: str = "") -> str:
    return KNOWN_SERVICES.get(uuid.lower()[:8], description or "")


class BleWorker:
    def __init__(self) -> None:
        self._loop: asyncio.AbstractEventLoop | None = None
        self._thread: threading.Thread | None = None
        self._client: Any = None
        self._lock = threading.Lock()

    # ---------------- ciclo asyncio ----------------

    def _ensure_loop(self) -> asyncio.AbstractEventLoop:
        with self._lock:
            if self._loop is None:
                self._loop = asyncio.new_event_loop()
                self._thread = threading.Thread(target=self._loop.run_forever, name="bluetooth", daemon=True)
                self._thread.start()
            return self._loop

    def _submit(self, coro) -> Future:
        return asyncio.run_coroutine_threadsafe(coro, self._ensure_loop())

    def shutdown(self) -> None:
        if self._loop is None:
            return
        try:
            self.disconnect().result(timeout=3)
        except Exception:
            pass
        self._loop.call_soon_threadsafe(self._loop.stop)
        if self._thread:
            self._thread.join(timeout=2)
        self._loop = None

    @property
    def connected(self) -> bool:
        return self._client is not None and bool(getattr(self._client, "is_connected", False))

    # ---------------- operazioni ----------------

    def scan(self, seconds: float = 5.0) -> Future:
        async def run() -> list[dict]:
            try:
                from bleak import BleakScanner
            except ImportError as e:
                raise BleUnavailable("libreria bleak non installata") from e
            try:
                found = await BleakScanner.discover(timeout=seconds, return_adv=True)
            except Exception as e:  # noqa: BLE001 - bleak usa eccezioni diverse per ogni sistema
                raise BleUnavailable(_explain(e)) from e
            out = []
            for dev, adv in found.values():
                out.append(
                    {
                        "address": dev.address,
                        "name": adv.local_name or dev.name or "",
                        "rssi": adv.rssi,
                        "manufacturers": sorted(adv.manufacturer_data.keys()),
                        "services": list(adv.service_uuids),
                        "tx_power": adv.tx_power,
                    }
                )
            return sorted(out, key=lambda d: -(d["rssi"] or -127))

        return self._submit(run())

    def connect(self, address: str, timeout: float = 15.0) -> Future:
        async def run() -> None:
            from bleak import BleakClient

            if self._client is not None:
                await self._client.disconnect()
            client = BleakClient(address, timeout=timeout)
            try:
                await client.connect()
            except Exception as e:  # noqa: BLE001
                raise BleUnavailable(_explain(e)) from e
            self._client = client

        return self._submit(run())

    def services(self) -> Future:
        async def run() -> list[dict]:
            c = self._need()
            out = []
            for s in c.services:
                out.append(
                    {
                        "uuid": s.uuid,
                        "name": service_name(s.uuid, s.description),
                        "characteristics": [
                            {"uuid": ch.uuid, "name": ch.description, "properties": list(ch.properties), "handle": ch.handle}
                            for ch in s.characteristics
                        ],
                    }
                )
            return out

        return self._submit(run())

    def read(self, uuid: str) -> Future:
        async def run() -> bytes:
            return bytes(await self._need().read_gatt_char(uuid))

        return self._submit(run())

    def start_notify(self, uuid: str, callback: Callable[[str, bytes], None]) -> Future:
        async def run() -> None:
            await self._need().start_notify(uuid, lambda _ch, data: callback(uuid, bytes(data)))

        return self._submit(run())

    def stop_notify(self, uuid: str) -> Future:
        async def run() -> None:
            await self._need().stop_notify(uuid)

        return self._submit(run())

    def disconnect(self) -> Future:
        async def run() -> None:
            c, self._client = self._client, None
            if c is not None:
                await c.disconnect()

        return self._submit(run())

    def _need(self):
        if not self.connected:
            raise BleUnavailable("nessun dispositivo collegato")
        return self._client


def _explain(e: Exception) -> str:
    text = str(e) or type(e).__name__
    low = text.lower()
    if "no bluetooth adapters" in low or "adapter" in low and "not" in low:
        return "nessun adattatore Bluetooth trovato o acceso"
    if "dbus" in low or "bluez" in low or "org.bluez" in low:
        return "servizio Bluetooth del sistema (BlueZ) non disponibile"
    if "permission" in low or "not authorized" in low:
        return "permesso Bluetooth negato dal sistema"
    return text


def format_value(data: bytes) -> str:
    """Esadecimale più testo leggibile, se lo è."""
    hexs = data.hex(" ").upper()
    try:
        text = data.decode("utf-8")
        if text and all(c.isprintable() for c in text):
            return f"{hexs}  «{text}»"
    except UnicodeDecodeError:
        pass
    return hexs
