"""Trasporti a righe per Polpo Link: porta seriale USB vera oppure Polpo virtuale in memoria."""

from __future__ import annotations

import logging
import threading
from collections.abc import Callable

from ..protocols.link import MAX_INCOMING_LINE, LineFramer
from .virtual_polpo import VirtualPolpo

log = logging.getLogger(__name__)

LineCallback = Callable[[bytes], None]
ClosedCallback = Callable[[str], None]


class TransportError(Exception):
    pass


class Transport:
    """Base: ``open`` avvia la lettura; le righe arrivano a ``on_line`` da un altro thread."""

    simulated = False
    name = ""

    def open(self, on_line: LineCallback, on_closed: ClosedCallback) -> None:
        raise NotImplementedError

    def write_line(self, line: bytes) -> None:
        raise NotImplementedError

    def close(self) -> None:
        raise NotImplementedError


class SerialTransport(Transport):
    """Porta seriale USB (CDC) del Polpo.

    Regole per l'ESP32-S3 con USB nativa:
    * DTR attivo (senza DTR il Polpo non trasmette) e RTS basso *prima* dell'apertura: certe
      combinazioni di DTR/RTS riavviano la scheda;
    * mai 1200 baud: è il segnale per entrare nel bootloader (usato solo di proposito per
      l'aggiornamento del firmware);
    * accesso esclusivo, così un monitor seriale aperto non ruba le risposte.
    """

    def __init__(self, port: str, baudrate: int = 115200) -> None:
        if baudrate == 1200:
            raise ValueError("1200 baud riavvia il Polpo nel bootloader: usa un'altra velocità")
        self.port = port
        self.name = port
        self.baudrate = baudrate
        self._ser = None
        self._thread: threading.Thread | None = None
        self._stop = threading.Event()
        self._wlock = threading.Lock()

    def open(self, on_line: LineCallback, on_closed: ClosedCallback) -> None:
        import serial

        ser = serial.Serial()
        ser.port = self.port
        ser.baudrate = self.baudrate
        ser.timeout = 0.05
        ser.write_timeout = 2
        ser.dtr = True
        ser.rts = False
        ser.exclusive = True
        try:
            ser.open()
        except (serial.SerialException, OSError, ValueError) as e:
            raise TransportError(_explain_open_error(self.port, e)) from e
        self._ser = ser
        self._stop.clear()
        framer = LineFramer(MAX_INCOMING_LINE)

        def reader() -> None:
            reason = "closed"
            try:
                while not self._stop.is_set():
                    data = ser.read(max(1, ser.in_waiting))
                    if not data:
                        continue
                    for line in framer.feed(data):
                        if line is None:
                            log.warning("riga troppo lunga dal Polpo: scartata")
                        else:
                            on_line(line)
            except (serial.SerialException, OSError, TypeError) as e:
                if not self._stop.is_set():
                    log.info("porta %s chiusa: %s", self.port, e)
                    reason = "unplugged"
            finally:
                try:
                    ser.close()
                except Exception:
                    pass
                if reason == "unplugged" or not self._stop.is_set():
                    on_closed(reason)

        self._thread = threading.Thread(target=reader, name=f"seriale-{self.port}", daemon=True)
        self._thread.start()

    def write_line(self, line: bytes) -> None:
        import serial

        ser = self._ser
        if ser is None:
            raise TransportError("porta chiusa")
        try:
            with self._wlock:
                ser.write(line + b"\n")
        except (serial.SerialException, OSError) as e:
            raise TransportError(f"scrittura sulla porta {self.port} non riuscita: {e}") from e

    def close(self) -> None:
        self._stop.set()
        if self._thread and self._thread is not threading.current_thread():
            self._thread.join(timeout=1.5)
        self._ser = None


def _explain_open_error(port: str, e: Exception) -> str:
    text = str(e)
    low = text.lower()
    if "lock" in low or "busy" in low or "access is denied" in low or "accesso negato" in low:
        return (
            f"La porta {port} è già usata da un altro programma (monitor seriale di Arduino IDE o "
            "PlatformIO, un altro Polpo Studio). Chiudilo e riprova."
        )
    if "permission" in low:
        return (
            f"Permesso negato su {port}. Su Linux aggiungi il tuo utente al gruppo 'dialout' "
            "(poi esci e rientra) oppure installa la regola udev di Polpo Studio."
        )
    if "no such file" in low or "could not open" in low or "file not found" in low:
        return f"La porta {port} non esiste più: il Polpo è stato scollegato?"
    return f"Impossibile aprire {port}: {text}"


class VirtualTransport(Transport):
    """Collega il client a un :class:`VirtualPolpo` in memoria. Tutto è SIMULATO."""

    simulated = True

    def __init__(self, device: VirtualPolpo | None = None, *, own_device: bool | None = None) -> None:
        self.device = device or VirtualPolpo()
        self._own = own_device if own_device is not None else device is None
        self.name = "Polpo virtuale"
        self._open = False
        self._on_closed: ClosedCallback | None = None

    def open(self, on_line: LineCallback, on_closed: ClosedCallback) -> None:
        self._open = True
        self._on_closed = on_closed
        self.device.attach(on_line)

    def write_line(self, line: bytes) -> None:
        if not self._open:
            raise TransportError("Polpo virtuale scollegato")
        self.device.feed(line + b"\n")

    def unplug(self) -> None:
        """Simula lo scollegamento del cavo."""
        if self._open:
            self.close()
            if self._on_closed:
                self._on_closed("unplugged")

    def close(self) -> None:
        if not self._open:
            return
        self._open = False
        self.device.detach()
        if self._own:
            self.device.shutdown()
