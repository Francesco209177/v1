"""Console seriale per schede Arduino/ESP32 (non per il Polpo, che usa Polpo Link)."""

from __future__ import annotations

import threading
from collections.abc import Callable

BAUD_RATES = (300, 2400, 4800, 9600, 19200, 38400, 57600, 74880, 115200, 230400, 460800, 921600)
LINE_ENDINGS = {"": "", "LF": "\n", "CR": "\r", "CRLF": "\r\n"}


class ConsoleError(Exception):
    pass


class SerialConsole:
    def __init__(self, port: str, baud: int, on_data: Callable[[bytes], None], on_closed: Callable[[str], None], *, reset_on_open: bool = True) -> None:
        if baud == 1200:
            raise ConsoleError("1200 baud fa ripartire molte schede (ESP32-S3, Leonardo) nel bootloader: scegli un'altra velocità")
        self.port, self.baud = port, baud
        self.on_data, self.on_closed = on_data, on_closed
        self.reset_on_open = reset_on_open
        self._ser = None
        self._stop = threading.Event()
        self._thread: threading.Thread | None = None

    def open(self) -> None:
        import serial

        s = serial.Serial()
        s.port, s.baudrate, s.timeout = self.port, self.baud, 0.05
        s.exclusive = True
        if not self.reset_on_open:  # alcune schede si riavviano quando il PC alza DTR
            s.dtr = False
            s.rts = False
        try:
            s.open()
        except (serial.SerialException, OSError, ValueError) as e:
            from .transport import _explain_open_error

            raise ConsoleError(_explain_open_error(self.port, e)) from e
        self._ser = s
        self._stop.clear()

        def reader() -> None:
            try:
                while not self._stop.is_set():
                    data = s.read(max(1, s.in_waiting))
                    if data:
                        self.on_data(data)
            except (serial.SerialException, OSError, TypeError):
                if not self._stop.is_set():
                    self.on_closed("unplugged")
            finally:
                try:
                    s.close()
                except Exception:
                    pass

        self._thread = threading.Thread(target=reader, name=f"console-{self.port}", daemon=True)
        self._thread.start()

    def write(self, data: bytes) -> None:
        if self._ser is None:
            raise ConsoleError("porta chiusa")
        self._ser.write(data)

    def close(self) -> None:
        self._stop.set()
        if self._thread:
            self._thread.join(timeout=1.5)
        self._ser = None


def hexdump(data: bytes) -> str:
    return " ".join(f"{b:02X}" for b in data)
