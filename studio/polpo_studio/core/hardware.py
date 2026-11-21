"""Catalogo dell'hardware che Polpo Studio sa usare e stato attuale di ciascun elemento."""

from __future__ import annotations

import threading
from collections.abc import Callable
from dataclasses import dataclass

from .capability import HardwareStatus, Presence
from .i18n import T, tr


@dataclass(frozen=True)
class HardwareSpec:
    id: str
    name: T
    how: T  # come procurarlo o collegarlo
    group: str  # "polpo", "pc", "esterno"
    declarable: bool = False  # non rilevabile: l'utente può dichiarare di averlo collegato


HARDWARE: tuple[HardwareSpec, ...] = (
    HardwareSpec(
        "polpo",
        T("Polpo (Cardputer con firmware Polpo)", "Polpo (Cardputer with Polpo firmware)"),
        T(
            "Collega il Cardputer con un cavo USB dati e accetta il collegamento sul suo schermo.",
            "Connect the Cardputer with a USB data cable and accept the connection on its screen.",
        ),
        "polpo",
    ),
    HardwareSpec(
        "polpo.ir_tx",
        T("Trasmettitore IR del Polpo (integrato)", "Polpo IR transmitter (built in)"),
        T("È già nel Cardputer.", "Built into the Cardputer."),
        "polpo",
    ),
    HardwareSpec(
        "polpo.ir_unit",
        T("Ricevitore IR (M5Stack IR Unit, porta Grove)", "IR receiver (M5Stack IR Unit, Grove port)"),
        T(
            "Collega l'IR Unit alla porta Grove (anche tramite HUB). Il Polpo non può rilevarla da solo.",
            "Plug the IR Unit into the Grove port (also via the HUB). The Polpo cannot detect it by itself.",
        ),
        "polpo",
        declarable=True,
    ),
    HardwareSpec(
        "polpo.rf433",
        T("Radio 433 MHz (M5Stack RF433R / RF433T, porta Grove)", "433 MHz radio (M5Stack RF433R / RF433T, Grove port)"),
        T(
            "RF433R per ricevere, RF433T per trasmettere, sulla porta Grove. Il Polpo non può rilevarle da solo.",
            "RF433R to receive, RF433T to transmit, on the Grove port. The Polpo cannot detect them by itself.",
        ),
        "polpo",
        declarable=True,
    ),
    HardwareSpec(
        "polpo.rfid2",
        T("Modulo NFC M5Stack RFID2 (WS1850S, porta Grove)", "M5Stack RFID2 NFC unit (WS1850S, Grove port)"),
        T("Collega l'RFID2 alla porta Grove: il Polpo lo rileva sul bus I2C.", "Plug the RFID2 into the Grove port: the Polpo detects it on I2C."),
        "polpo",
    ),
    HardwareSpec("polpo.wifi", T("Wi-Fi del Polpo (integrato)", "Polpo Wi-Fi (built in)"), T("È già nel Cardputer.", "Built in."), "polpo"),
    HardwareSpec("polpo.ble", T("Bluetooth del Polpo (integrato)", "Polpo Bluetooth (built in)"), T("È già nel Cardputer.", "Built in."), "polpo"),
    HardwareSpec(
        "polpo.usb_hid",
        T("Tastiera USB del Polpo (integrata)", "Polpo USB keyboard (built in)"),
        T("È già nel Cardputer.", "Built in."),
        "polpo",
    ),
    HardwareSpec("pc.usb", T("Porte USB del PC", "PC USB ports"), T("Sempre presenti.", "Always present."), "pc"),
    HardwareSpec(
        "pc.serial",
        T("Porte seriali (USB-seriale, CDC)", "Serial ports (USB-serial, CDC)"),
        T("Servono i driver della scheda (CH340, CP210x, FTDI…) se il sistema non li ha.", "Board drivers (CH340, CP210x, FTDI…) may be needed."),
        "pc",
    ),
    HardwareSpec(
        "pc.hid",
        T("Elenco dispositivi HID", "HID device list"),
        T("Usa la libreria hidapi inclusa.", "Uses the bundled hidapi library."),
        "pc",
    ),
    HardwareSpec(
        "pc.ble",
        T("Adattatore Bluetooth del PC", "PC Bluetooth adapter"),
        T(
            "Bluetooth 4.0 o successivo, acceso. Su Linux serve BlueZ; su Windows 10/11 va bene quello integrato.",
            "Bluetooth 4.0 or later, switched on. Linux needs BlueZ; on Windows 10/11 the built-in one works.",
        ),
        "pc",
    ),
    HardwareSpec(
        "pc.pcsc",
        T("Lettore NFC PC/SC (es. ACR122U)", "PC/SC NFC reader (e.g. ACR122U)"),
        T(
            "Un lettore NFC USB compatibile PC/SC e il pacchetto opzionale pyscard (su Linux anche pcscd).",
            "A PC/SC-compatible USB NFC reader and the optional pyscard package (on Linux also pcscd).",
        ),
        "esterno",
    ),
    HardwareSpec(
        "rfid125.usb",
        T("Lettore RFID 125 kHz USB (tipo tastiera)", "125 kHz USB RFID reader (keyboard type)"),
        T(
            "Un lettore economico che \"scrive\" il codice come una tastiera. Non si può rilevare: dichiaralo.",
            "A cheap reader that \"types\" the code like a keyboard. It cannot be detected: declare it.",
        ),
        "esterno",
        declarable=True,
    ),
    HardwareSpec(
        "rfid125.rdm6300",
        T("Modulo RDM6300 con adattatore USB-seriale", "RDM6300 module with USB-serial adapter"),
        T(
            "Modulo 125 kHz con uscita seriale a 9600 baud, collegato a un adattatore USB-seriale a 5 V.",
            "125 kHz module with 9600 baud serial output, wired to a 5 V USB-serial adapter.",
        ),
        "esterno",
        declarable=True,
    ),
    HardwareSpec(
        "bridge",
        T("Polpo Bridge (Arduino/ESP32 con lo sketch Polpo Bridge)", "Polpo Bridge (Arduino/ESP32 with the Polpo Bridge sketch)"),
        T(
            "Una scheda Arduino o ESP32 con lo sketch Polpo Bridge, collegata via USB.",
            "An Arduino or ESP32 board running the Polpo Bridge sketch, connected via USB.",
        ),
        "esterno",
    ),
    HardwareSpec(
        "bridge.onewire",
        T("Sonda iButton / 1-Wire sul Polpo Bridge", "iButton / 1-Wire probe on the Polpo Bridge"),
        T(
            "Un lettore iButton (o una sonda 1-Wire) con resistenza di pull-up da 4,7 kΩ sul pin del Bridge.",
            "An iButton reader (or a 1-Wire probe) with a 4.7 kΩ pull-up resistor on the Bridge pin.",
        ),
        "esterno",
        declarable=True,
    ),
)

SPECS = {h.id: h for h in HARDWARE}
POLPO_MODULES = ("ir_tx", "ir_unit", "rf433", "rfid2", "wifi", "ble", "usb_hid")


def hardware_names() -> dict[str, str]:
    return {h.id: str(h.name) for h in HARDWARE}


class HardwareState:
    """Presenza di ciascun elemento, aggiornata dal vivo. Sicura tra thread."""

    def __init__(self) -> None:
        self._lock = threading.Lock()
        self._state: dict[str, HardwareStatus] = {}
        self._declared: dict[str, bool] = {}
        self._polpo_report: dict[str, str] = {}
        self._polpo: Presence = Presence.ABSENT
        self._listeners: list[Callable[[], None]] = []
        self._pc: dict[str, HardwareStatus] = {}
        self.refresh_pc()

    # ---------------- lettura ----------------

    def snapshot(self) -> dict[str, HardwareStatus]:
        with self._lock:
            return dict(self._state)

    def get(self, hw_id: str) -> HardwareStatus:
        with self._lock:
            return self._state.get(hw_id, HardwareStatus(Presence.ABSENT))

    def on_change(self, cb: Callable[[], None]) -> None:
        self._listeners.append(cb)

    # ---------------- aggiornamenti ----------------

    def set_declared(self, declared: dict[str, bool]) -> None:
        with self._lock:
            self._declared = {k: bool(v) for k, v in declared.items() if k in SPECS and SPECS[k].declarable}
        self._recompute()

    def set_polpo(self, presence: Presence, modules: dict[str, str] | None = None) -> None:
        """Dal collegamento: ``modules`` è il campo ``info.modules`` del Polpo."""
        with self._lock:
            self._polpo = presence
            self._polpo_report = dict(modules or {})
        self._recompute()

    def set_pc(self, hw_id: str, status: HardwareStatus) -> None:
        with self._lock:
            self._pc[hw_id] = status
        self._recompute()

    def refresh_pc(self) -> None:
        """Controlli veloci, senza aprire dispositivi."""
        pc = {"pc.usb": HardwareStatus(Presence.DETECTED, tr("elenco dal sistema operativo", "listed by the OS"))}
        pc["pc.serial"] = _module_status("serial", tr("libreria pyserial", "pyserial library"))
        pc["pc.hid"] = _module_status("hid", tr("libreria hidapi", "hidapi library"))
        with self._lock:
            pc.setdefault(
                "pc.ble",
                self._pc.get(
                    "pc.ble",
                    HardwareStatus(Presence.ABSENT, tr("non ancora verificato: apri il modulo Bluetooth", "not checked yet: open the Bluetooth module")),
                ),
            )
            pc.setdefault("pc.pcsc", self._pc.get("pc.pcsc", _pcsc_status()))
            pc.setdefault("bridge", self._pc.get("bridge", HardwareStatus(Presence.ABSENT, tr("non collegato", "not connected"))))
            self._pc.update(pc)
        self._recompute()

    def _recompute(self) -> None:
        with self._lock:
            st: dict[str, HardwareStatus] = dict(self._pc)
            for h in HARDWARE:
                if h.group == "esterno" and h.id not in st:
                    st[h.id] = self._declarable(h.id)
            if self._polpo == Presence.ABSENT:
                no = tr("Polpo non collegato", "Polpo not connected")
                st["polpo"] = HardwareStatus(Presence.ABSENT, no)
                for m in POLPO_MODULES:
                    st["polpo." + m] = HardwareStatus(Presence.ABSENT, no)
            else:
                st["polpo"] = HardwareStatus(
                    self._polpo,
                    tr("Polpo virtuale", "Virtual Polpo") if self._polpo == Presence.SIMULATED else tr("collegato via USB", "connected via USB"),
                )
                for m in POLPO_MODULES:
                    st["polpo." + m] = self._from_report("polpo." + m, self._polpo_report.get(m, "missing"))
            if st.get("bridge", HardwareStatus(Presence.ABSENT)).presence == Presence.ABSENT:
                st["bridge.onewire"] = HardwareStatus(Presence.ABSENT, tr("serve il Polpo Bridge", "needs the Polpo Bridge"))
            changed = st != self._state
            self._state = st
        if changed:
            for cb in list(self._listeners):
                cb()

    def _declarable(self, hw_id: str) -> HardwareStatus:
        if self._declared.get(hw_id):
            return HardwareStatus(Presence.DECLARED, tr("dichiarato da te in Impostazioni", "declared by you in Settings"))
        return HardwareStatus(
            Presence.UNVERIFIABLE,
            tr("non rilevabile automaticamente", "cannot be detected automatically"),
        )

    def _from_report(self, hw_id: str, value: str) -> HardwareStatus:
        if value == "available":
            return HardwareStatus(Presence.DETECTED, tr("rilevato dal Polpo", "detected by the Polpo"))
        if value == "simulated":
            return HardwareStatus(Presence.SIMULATED, tr("simulato", "simulated"))
        if value == "unverifiable":
            return self._declarable(hw_id)
        return HardwareStatus(Presence.ABSENT, tr("non trovato dal Polpo", "not found by the Polpo"))


def _module_status(module: str, label: str) -> HardwareStatus:
    import importlib.util

    if importlib.util.find_spec(module) is not None:
        return HardwareStatus(Presence.DETECTED, label)
    return HardwareStatus(Presence.ABSENT, tr("{x} non installata", "{x} not installed", x=label))


def _pcsc_status() -> HardwareStatus:
    try:
        from smartcard.System import readers  # type: ignore[import-not-found]
    except Exception:
        return HardwareStatus(
            Presence.ABSENT,
            tr("pacchetto opzionale pyscard non installato", "optional pyscard package not installed"),
        )
    try:
        found = readers()
    except Exception as e:  # servizio PC/SC spento
        return HardwareStatus(Presence.ABSENT, tr("servizio PC/SC non disponibile: {e}", "PC/SC service unavailable: {e}", e=e))
    if not found:
        return HardwareStatus(Presence.ABSENT, tr("nessun lettore collegato", "no reader connected"))
    return HardwareStatus(Presence.DETECTED, ", ".join(str(r) for r in found))
