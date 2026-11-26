"""Esecuzione di un lavoro alla volta (backup, pairing, ripristino…) con avanzamento e righe di log.

Il lavoro gira in un thread separato con il suo event loop: così le operazioni pesanti su disco
di pymobiledevice3 non rallentano l'interfaccia web.
"""

from __future__ import annotations

import asyncio
import threading
import time
import traceback
import uuid
from collections import deque
from dataclasses import dataclass, field
from datetime import datetime
from typing import Any, Awaitable, Callable, Optional

from .events import EventLog


class JobBusy(Exception):
    """C'è già un lavoro in corso."""


class UserFacingError(Exception):
    """Errore con un messaggio già comprensibile per l'utente."""


class DeviceUnreachable(UserFacingError):
    """L'iPhone non risponde (spento, fuori casa, Wi-Fi addormentato…): si riprova più tardi."""


@dataclass
class Job:
    kind: str
    title: str
    id: str = field(default_factory=lambda: uuid.uuid4().hex[:12])
    state: str = "running"  # running | ok | error
    progress: Optional[float] = None
    message: str = ""
    result: Any = None
    started: float = field(default_factory=time.time)
    finished: Optional[float] = None
    lines: deque = field(default_factory=lambda: deque(maxlen=400))

    def log(self, line: str) -> None:
        self.lines.append(f"{datetime.now().strftime('%H:%M:%S')} {line}")

    def set_progress(self, value: Optional[float], message: Optional[str] = None) -> None:
        if value is not None:
            value = max(0.0, min(100.0, float(value)))
        self.progress = value
        if message is not None:
            self.message = message

    def to_json(self, lines: int = 60) -> dict[str, Any]:
        return {
            "id": self.id,
            "kind": self.kind,
            "title": self.title,
            "state": self.state,
            "progress": self.progress,
            "message": self.message,
            "started": datetime.fromtimestamp(self.started).isoformat(timespec="seconds"),
            "finished": datetime.fromtimestamp(self.finished).isoformat(timespec="seconds") if self.finished else None,
            "elapsed": int((self.finished or time.time()) - self.started),
            "lines": list(self.lines)[-lines:],
            "result": self.result if isinstance(self.result, (str, int, float, dict, list, type(None))) else None,
        }


JobFunc = Callable[[Job], Awaitable[Any]]


class JobManager:
    def __init__(self, events: EventLog):
        self.events = events
        self.current: Optional[Job] = None
        self.last: Optional[Job] = None
        self._lock = threading.Lock()
        self._listeners: list[Callable[[Job], None]] = []

    @property
    def busy(self) -> bool:
        return self.current is not None

    def on_finish(self, listener: Callable[[Job], None]) -> None:
        self._listeners.append(listener)

    def start(self, kind: str, title: str, func: JobFunc) -> Job:
        """Avvia `func(job)` in un thread dedicato. Solleva JobBusy se c'è già un lavoro."""
        with self._lock:
            if self.current is not None:
                raise JobBusy(f"È già in corso: {self.current.title}")
            job = Job(kind=kind, title=title)
            self.current = job
        self.events.info(f"Avviato: {title}")
        thread = threading.Thread(target=self._run, args=(job, func), name=f"job-{kind}", daemon=True)
        thread.start()
        return job

    def _run(self, job: Job, func: JobFunc) -> None:
        try:
            job.result = asyncio.run(func(job))
            job.state = "ok"
            if job.progress is not None:
                job.progress = 100.0
            if not job.message:
                job.message = "Completato"
            self.events.success(f"{job.title}: {job.message}")
        except UserFacingError as error:
            job.state = "error"
            job.message = str(error)
            job.log(f"ERRORE: {error}")
            self.events.error(f"{job.title}: {error}")
        except Exception as error:  # noqa: BLE001 - qualsiasi errore va mostrato all'utente
            job.state = "error"
            job.message = describe_error(error)
            job.log(f"ERRORE: {job.message}")
            for line in traceback.format_exc().splitlines()[-8:]:
                job.log(line)
            self.events.error(f"{job.title}: {job.message}")
        finally:
            job.finished = time.time()
            with self._lock:
                self.current = None
                self.last = job
            for listener in self._listeners:
                try:
                    listener(job)
                except Exception:  # noqa: BLE001
                    pass

    def wait(self, timeout: float = 30) -> Optional[Job]:
        """Solo per i test: aspetta la fine del lavoro corrente."""
        deadline = time.time() + timeout
        while self.current is not None and time.time() < deadline:
            time.sleep(0.02)
        return self.last


def describe_error(error: BaseException) -> str:
    text = str(error).strip()
    name = type(error).__name__
    hints = {
        "NoDeviceConnectedError": "iPhone non raggiungibile: è acceso, sbloccato e sulla stessa rete (o collegato via USB)?",
        "ConnectionFailedError": "Connessione all'iPhone non riuscita.",
        "PasscodeRequiredError": "Sblocca l'iPhone e riprova.",
        "PasswordRequiredError": "Sblocca l'iPhone (inserisci il codice) e riprova.",
        "UserDeniedPairingError": "Sull'iPhone è stato toccato \"Non autorizzare\". Scollega e ricollega il cavo e riprova.",
        "PairingDialogResponsePendingError": "Sull'iPhone tocca \"Autorizza\" e inserisci il codice.",
        "NotPairedError": "L'iPhone non è associato a questo server: rifai l'associazione via USB.",
        "InvalidHostIDError": "L'associazione non è più valida: rifai l'associazione via USB.",
        "MuxException": "usbmuxd non risponde: è installato e in esecuzione? (sudo systemctl status usbmuxd)",
    }
    if name in hints:
        return hints[name] + (f" ({text})" if text else "")
    lowered = text.lower()
    if "find my" in lowered or "findmy" in lowered or "fmip" in lowered:
        return "Disattiva \"Dov'è\" (Trova il mio iPhone) sul telefono di destinazione e riprova. " + f"({text})"
    if isinstance(error, (ConnectionRefusedError, FileNotFoundError)) and "usbmuxd" in text:
        return hints["MuxException"]
    return f"{text} ({name})" if text else name
