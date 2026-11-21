"""Modello delle capacità: ogni funzione dice, dal vivo, se è davvero utilizzabile.

Stati mostrati all'utente (mai solo con il colore, sempre con la parola):

* **Disponibile** – l'hardware necessario è presente e rilevato (o dichiarato da te);
* **Richiede hardware esterno** – manca un componente, oppure non si può rilevare da solo;
* **Simulato** – funziona con il Polpo virtuale: i dati sono inventati;
* **Sperimentale** – funziona, ma non è stato provato a fondo sull'hardware vero;
* **Non disponibile** – escluso per scelta di sicurezza o impossibile con questo hardware.
"""

from __future__ import annotations

from collections.abc import Mapping
from dataclasses import dataclass, field
from enum import Enum

from .i18n import T, tr


class Status(str, Enum):
    AVAILABLE = "disponibile"
    NEEDS_HARDWARE = "richiede_hardware"
    SIMULATED = "simulato"
    EXPERIMENTAL = "sperimentale"
    NOT_AVAILABLE = "non_disponibile"


STATUS_LABEL = {
    Status.AVAILABLE: T("Disponibile", "Available"),
    Status.NEEDS_HARDWARE: T("Richiede hardware esterno", "Needs external hardware"),
    Status.SIMULATED: T("Simulato", "Simulated"),
    Status.EXPERIMENTAL: T("Sperimentale", "Experimental"),
    Status.NOT_AVAILABLE: T("Non disponibile", "Not available"),
}

STATUS_HELP = {
    Status.AVAILABLE: T(
        "L'hardware necessario è collegato e rilevato, oppure non serve hardware.",
        "The required hardware is connected and detected, or no hardware is needed.",
    ),
    Status.NEEDS_HARDWARE: T(
        "Manca un componente, oppure non si può rilevare automaticamente: guarda cosa serve.",
        "A component is missing or cannot be detected automatically: see what is needed.",
    ),
    Status.SIMULATED: T(
        "Funziona con il Polpo virtuale. I dati sono inventati e non si inviano al Polpo vero.",
        "Works with the virtual Polpo. The data is made up and is never sent to the real Polpo.",
    ),
    Status.EXPERIMENTAL: T(
        "Funziona ma non è stato provato a fondo sull'hardware vero: usala con attenzione.",
        "Works but has not been tested thoroughly on real hardware: use it with care.",
    ),
    Status.NOT_AVAILABLE: T(
        "Esclusa per scelta di sicurezza o impossibile con questo hardware.",
        "Excluded for safety reasons or impossible with this hardware.",
    ),
}


class Presence(str, Enum):
    DETECTED = "rilevato"  # visto dal programma o dal Polpo
    DECLARED = "dichiarato"  # non rilevabile, ma l'utente dice che è collegato
    SIMULATED = "simulato"  # fornito dal Polpo virtuale
    UNVERIFIABLE = "non_verificabile"  # potrebbe esserci: non si può sapere
    ABSENT = "assente"


@dataclass(frozen=True)
class HardwareStatus:
    presence: Presence
    detail: str = ""


@dataclass(frozen=True)
class Route:
    """Un modo di ottenere la funzione: l'insieme dell'hardware che serve, tutto insieme."""

    hardware: tuple[str, ...]
    experimental: bool = False
    note: T | None = None


@dataclass(frozen=True)
class Capability:
    id: str
    title: T
    description: T
    routes: tuple[Route, ...] = ()  # vuoto = solo software
    experimental: bool = False
    needs_lab: bool = False  # richiede la modalità laboratorio (trasmissioni, scritture, flash)
    unsupported: T | None = None  # motivo per cui non è disponibile


@dataclass
class Evaluation:
    status: Status
    reason: str
    usable: bool
    route: Route | None = None
    missing: list[str] = field(default_factory=list)

    @property
    def label(self) -> str:
        return str(STATUS_LABEL[self.status])


HardwareNames = Mapping[str, str]


def _names(ids: list[str], names: HardwareNames) -> str:
    return ", ".join(names.get(i, i) for i in ids)


def _route_eval(cap: Capability, route: Route, hw: Mapping[str, HardwareStatus], names: HardwareNames) -> Evaluation:
    absent, unverifiable, simulated, declared = [], [], [], []
    for h in route.hardware:
        st = hw.get(h, HardwareStatus(Presence.ABSENT))
        if st.presence == Presence.ABSENT:
            absent.append(h)
        elif st.presence == Presence.UNVERIFIABLE:
            unverifiable.append(h)
        elif st.presence == Presence.SIMULATED:
            simulated.append(h)
        elif st.presence == Presence.DECLARED:
            declared.append(h)
    if absent:
        need = absent + unverifiable
        return Evaluation(Status.NEEDS_HARDWARE, tr("Serve: {x}", "Needs: {x}", x=_names(need, names)), False, route, need)
    if unverifiable:
        return Evaluation(
            Status.NEEDS_HARDWARE,
            tr(
                "Non rilevabile automaticamente: {x}. Se è collegato, dichiaralo in Impostazioni › Hardware.",
                "Cannot be detected automatically: {x}. If it is connected, declare it in Settings › Hardware.",
                x=_names(unverifiable, names),
            ),
            True,
            route,
            unverifiable,
        )
    if simulated:
        return Evaluation(
            Status.SIMULATED,
            tr("Con il Polpo virtuale: dati inventati.", "With the virtual Polpo: made-up data."),
            True,
            route,
        )
    status = Status.EXPERIMENTAL if (cap.experimental or route.experimental) else Status.AVAILABLE
    reason = tr("Pronto con: {x}", "Ready with: {x}", x=_names(list(route.hardware), names))
    if declared:
        reason += tr(" (dichiarato da te: {x})", " (declared by you: {x})", x=_names(declared, names))
    if route.note:
        reason += " — " + str(route.note)
    return Evaluation(status, reason, True, route)


_RANK = {Status.AVAILABLE: 0, Status.EXPERIMENTAL: 0, Status.SIMULATED: 1}


def _rank(e: Evaluation) -> tuple[int, int]:
    if e.status in _RANK:
        return (_RANK[e.status], 1 if e.status == Status.EXPERIMENTAL else 0)
    return (2 if e.usable else 3, len(e.missing))


def evaluate(cap: Capability, hw: Mapping[str, HardwareStatus], names: HardwareNames | None = None) -> Evaluation:
    names = names or {}
    if cap.unsupported is not None:
        return Evaluation(Status.NOT_AVAILABLE, str(cap.unsupported), False)
    if not cap.routes:
        status = Status.EXPERIMENTAL if cap.experimental else Status.AVAILABLE
        return Evaluation(status, tr("Funziona sul PC, non serve hardware.", "Runs on the PC, no hardware needed."), True)
    return min((_route_eval(cap, r, hw, names) for r in cap.routes), key=_rank)
