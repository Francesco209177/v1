"""Modalità laboratorio e permessi.

Le azioni che cambiano qualcosa nel mondo fisico (trasmettere, scrivere tag, programmare schede,
pilotare uscite) o che eseguono codice di terzi restano spente finché l'utente non attiva la
modalità laboratorio: va riconfermata con la frase o il PIN, si spegne da sola dopo un tempo
stabilito e a ogni riavvio del programma.
"""

from __future__ import annotations

import threading
import time
from collections.abc import Callable

from ..core.i18n import T

ACTIONS: dict[str, T] = {
    "rf.tx": T("trasmettere a 433 MHz", "transmit at 433 MHz"),
    "nfc.write": T("scrivere un tag NFC", "write an NFC tag"),
    "fw.flash": T("aggiornare il firmware del Polpo", "update the Polpo firmware"),
    "esp.flash": T("programmare una scheda ESP32", "flash an ESP32 board"),
    "gpio.output": T("pilotare uscite GPIO", "drive GPIO outputs"),
    "apps.third_party": T("usare app di terze parti", "use third-party apps"),
}

RULES = T(
    "Userò queste funzioni solo con dispositivi miei o per cui ho un'autorizzazione esplicita. "
    "Non le userò per entrare in cancelli, veicoli, allarmi o sistemi di altre persone, né per disturbare "
    "comunicazioni radio. So che trasmettere o scrivere può cambiare lo stato reale dei dispositivi.",
    "I will only use these features with devices I own or am explicitly authorised to use. "
    "I will not use them to get into gates, vehicles, alarms or other people's systems, nor to disrupt "
    "radio communications. I know that transmitting or writing can change the real state of devices.",
)


class PermissionDenied(Exception):
    pass


class LabMode:
    def __init__(self, on_change: Callable[[bool], None] | None = None) -> None:
        self._lock = threading.Lock()
        self._until = 0.0
        self.on_change = on_change

    @property
    def enabled(self) -> bool:
        with self._lock:
            active = self._until > time.monotonic()
            expired = self._until and not active
            if expired:
                self._until = 0.0
        if expired and self.on_change:
            self.on_change(False)
        return active

    @property
    def remaining_s(self) -> int:
        return max(0, int(self._until - time.monotonic())) if self.enabled else 0

    def enable(self, minutes: int) -> None:
        with self._lock:
            self._until = time.monotonic() + max(1, minutes) * 60
        if self.on_change:
            self.on_change(True)

    def disable(self) -> None:
        with self._lock:
            was = self._until > time.monotonic()
            self._until = 0.0
        if was and self.on_change:
            self.on_change(False)

    def require(self, action: str) -> None:
        if action not in ACTIONS:
            raise KeyError(action)
        if not self.enabled:
            raise PermissionDenied(
                T(
                    "Per {a} serve la modalità laboratorio (Sicurezza › Modalità laboratorio).",
                    "To {a} you need lab mode (Security › Lab mode).",
                ).format(a=ACTIONS[action])
            )
