"""Widget comuni: etichette di stato, schede, mascotte."""

from __future__ import annotations

from PySide6.QtCore import QRectF, QSize, Qt
from PySide6.QtGui import QPainter
from PySide6.QtWidgets import QFrame, QHBoxLayout, QLabel, QSizePolicy, QVBoxLayout, QWidget

from ..core.capability import STATUS_HELP, STATUS_LABEL, Presence, Status
from ..core.i18n import tr
from .icons import paint_mascot

PRESENCE_LABEL = {
    Presence.DETECTED: ("Rilevato", "Detected"),
    Presence.DECLARED: ("Dichiarato", "Declared"),
    Presence.SIMULATED: ("Simulato", "Simulated"),
    Presence.UNVERIFIABLE: ("Non verificabile", "Unverifiable"),
    Presence.ABSENT: ("Assente", "Absent"),
}


def repolish(w: QWidget) -> None:
    w.style().unpolish(w)
    w.style().polish(w)


def label(text: str = "", *, muted: bool = False, heading: int = 0, wrap: bool = False, selectable: bool = False) -> QLabel:
    lb = QLabel(text)
    if muted:
        lb.setProperty("muted", "true")
    if heading:
        lb.setProperty("heading", str(heading))
    if wrap:
        lb.setWordWrap(True)
    if selectable:
        lb.setTextInteractionFlags(Qt.TextInteractionFlag.TextSelectableByMouse)
    return lb


class StatusBadge(QLabel):
    def __init__(self, status: Status | None = None) -> None:
        super().__init__()
        self.setAlignment(Qt.AlignmentFlag.AlignCenter)
        self.setSizePolicy(QSizePolicy.Policy.Maximum, QSizePolicy.Policy.Fixed)
        if status is not None:
            self.set_status(status)

    def set_status(self, status: Status) -> None:
        self.setText(str(STATUS_LABEL[status]))
        self.setToolTip(str(STATUS_HELP[status]))
        self.setAccessibleName(str(STATUS_LABEL[status]))
        self.setProperty("status", status.value)
        repolish(self)


class PresencePill(QLabel):
    def __init__(self, presence: Presence | None = None) -> None:
        super().__init__()
        self.setAlignment(Qt.AlignmentFlag.AlignCenter)
        self.setSizePolicy(QSizePolicy.Policy.Maximum, QSizePolicy.Policy.Fixed)
        if presence is not None:
            self.set_presence(presence)

    def set_presence(self, presence: Presence) -> None:
        it, en = PRESENCE_LABEL[presence]
        self.setText(tr(it, en))
        self.setProperty("presence", presence.value)
        repolish(self)


class SimTag(QLabel):
    """L'etichetta SIMULATO: compare ovunque ci siano dati del Polpo virtuale."""

    def __init__(self) -> None:
        super().__init__(tr("SIMULATO", "SIMULATED"))
        self.setProperty("sim", "true")
        self.setToolTip(
            tr(
                "Dati del Polpo virtuale: inventati, non si inviano al Polpo vero.",
                "Virtual Polpo data: made up, never sent to the real Polpo.",
            )
        )
        self.setSizePolicy(QSizePolicy.Policy.Maximum, QSizePolicy.Policy.Fixed)


class LabTag(QLabel):
    def __init__(self) -> None:
        super().__init__(tr("Modalità laboratorio", "Lab mode"))
        self.setProperty("lab", "true")
        self.setToolTip(
            tr(
                "Serve la modalità laboratorio: trasmissioni, scritture e flash sono spenti finché non la attivi.",
                "Needs lab mode: transmissions, writes and flashing stay off until you enable it.",
            )
        )
        self.setSizePolicy(QSizePolicy.Policy.Maximum, QSizePolicy.Policy.Fixed)


class Card(QFrame):
    def __init__(self, title: str = "", parent: QWidget | None = None) -> None:
        super().__init__(parent)
        self.setObjectName("card")
        self.body = QVBoxLayout(self)
        self.body.setContentsMargins(16, 14, 16, 14)
        self.body.setSpacing(8)
        self.body.setAlignment(Qt.AlignmentFlag.AlignTop)
        self.header = QHBoxLayout()
        self.title = label(title, heading=2)
        self.header.addWidget(self.title)
        self.header.addStretch(1)
        self.body.addLayout(self.header)


class Note(QFrame):
    def __init__(self, text: str) -> None:
        super().__init__()
        self.setObjectName("note")
        lay = QHBoxLayout(self)
        lay.setContentsMargins(12, 8, 12, 8)
        self.text = label(text, wrap=True)
        lay.addWidget(self.text)


class Mascot(QWidget):
    def __init__(self, color: str = "#ff8a5c", size: int = 96) -> None:
        super().__init__()
        self.color = color
        self.mood = "felice"
        self._size = size
        self.setFixedSize(size, size)
        self.setAccessibleName(tr("Il Polpo, la mascotte", "Polpo, the mascot"))

    def sizeHint(self) -> QSize:
        return QSize(self._size, self._size)

    def set_mood(self, mood: str) -> None:
        if mood != self.mood:
            self.mood = mood
            self.update()

    def paintEvent(self, _event) -> None:  # noqa: N802 (Qt)
        p = QPainter(self)
        paint_mascot(p, QRectF(self.rect()), self.color, self.mood)
        p.end()


def clear_layout(layout) -> None:
    while layout.count():
        item = layout.takeAt(0)
        w = item.widget()
        if w is not None:
            w.deleteLater()
        elif item.layout() is not None:
            clear_layout(item.layout())


def human_bytes(n: float) -> str:
    for unit in ("B", "KB", "MB", "GB", "TB"):
        if n < 1024 or unit == "TB":
            return f"{n:.0f} {unit}" if unit == "B" else f"{n:.1f} {unit}".replace(".", ",")
        n /= 1024
    return f"{n} B"
