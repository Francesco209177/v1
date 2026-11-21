"""Pagina di un modulo: funzioni con lo stato calcolato dal vivo, hardware necessario, strumenti."""

from __future__ import annotations

from collections.abc import Callable

from PySide6.QtCore import Qt
from PySide6.QtWidgets import QFrame, QGridLayout, QHBoxLayout, QLabel, QPushButton, QScrollArea, QVBoxLayout, QWidget

from ..core.capability import Status, evaluate
from ..core.catalog import ModuleSpec
from ..core.hardware import SPECS, hardware_names
from ..core.i18n import tr
from .context import AppContext
from .icons import icon
from .qt_bridge import GuiBridge
from .themes import effective_accent, palette
from .widgets import Card, LabTag, Note, PresencePill, StatusBadge, clear_layout, label

# Gli strumenti di ogni modulo si registrano qui (id modulo -> costruttore del widget).
ToolFactory = Callable[[AppContext, GuiBridge], QWidget]
TOOL_FACTORIES: dict[str, ToolFactory] = {}


class CapabilityRow(QFrame):
    def __init__(self, cap) -> None:
        super().__init__()
        self.cap = cap
        self.setObjectName("capRow")
        g = QGridLayout(self)
        g.setContentsMargins(12, 10, 12, 10)
        g.setHorizontalSpacing(12)
        self.title = label(str(cap.title), heading=3)
        self.desc = label(str(cap.description), muted=True, wrap=True)
        self.reason = label("", wrap=True)
        self.badge = StatusBadge()
        tags = QHBoxLayout()
        tags.addWidget(self.badge)
        if cap.needs_lab:
            tags.addWidget(LabTag())
        tags.addStretch(1)
        g.addWidget(self.title, 0, 0)
        g.addLayout(tags, 0, 1, Qt.AlignmentFlag.AlignRight)
        g.addWidget(self.desc, 1, 0, 1, 2)
        g.addWidget(self.reason, 2, 0, 1, 2)
        g.setColumnStretch(0, 1)

    def update_state(self, hw, names) -> Status:
        ev = evaluate(self.cap, hw, names)
        self.badge.set_status(ev.status)
        self.reason.setText(ev.reason)
        self.setAccessibleName(f"{self.cap.title}: {ev.label}")
        return ev.status


class ModulePage(QWidget):
    def __init__(self, ctx: AppContext, bridge: GuiBridge, spec: ModuleSpec) -> None:
        super().__init__()
        self.ctx, self.bridge, self.spec = ctx, bridge, spec
        outer = QVBoxLayout(self)
        outer.setContentsMargins(0, 0, 0, 0)
        scroll = QScrollArea()
        scroll.setWidgetResizable(True)
        outer.addWidget(scroll)
        inner = QWidget()
        scroll.setWidget(inner)
        lay = QVBoxLayout(inner)
        lay.setContentsMargins(24, 20, 24, 24)
        lay.setSpacing(14)

        head = QHBoxLayout()
        ic = QLabel()
        accent = effective_accent(ctx.settings.get("theme"), ctx.settings.get("accent"))
        ic.setPixmap(icon(spec.icon, accent, 48).pixmap(48, 48))
        head.addWidget(ic)
        titles = QVBoxLayout()
        titles.addWidget(label(str(spec.title), heading=1))
        titles.addWidget(label(str(spec.summary), muted=True, wrap=True))
        head.addLayout(titles, 1)
        self.star = QPushButton()
        self.star.setProperty("flat", "true")
        self.star.clicked.connect(self._toggle_favorite)
        head.addWidget(self.star, 0, Qt.AlignmentFlag.AlignTop)
        lay.addLayout(head)

        self.tools_box = QVBoxLayout()
        lay.addLayout(self.tools_box)
        factory = TOOL_FACTORIES.get(spec.id)
        if factory is not None:
            self.tools_box.addWidget(factory(ctx, bridge))
        else:
            lay.addWidget(
                Note(
                    tr(
                        "Qui sotto trovi tutte le funzioni del modulo con il loro stato attuale. "
                        "Gli strumenti di lavoro di questo modulo non sono ancora in questa versione.",
                        "Below are all the module's functions with their current status. "
                        "This module's working tools are not in this version yet.",
                    )
                )
            )

        caps = Card(tr("Funzioni", "Functions"))
        self.summary = label("", muted=True)
        caps.header.addWidget(self.summary)
        self.rows = [CapabilityRow(c) for c in spec.capabilities]
        for r in self.rows:
            caps.body.addWidget(r)
        lay.addWidget(caps)

        self.hw_card = Card(tr("Cosa serve", "What you need"))
        self.hw_grid = QGridLayout()
        self.hw_grid.setColumnStretch(1, 1)
        self.hw_card.body.addLayout(self.hw_grid)
        lay.addWidget(self.hw_card)
        lay.addStretch(1)

        bridge.event.connect(self._on_event)
        self.refresh()

    def _on_event(self, topic: str, _payload) -> None:
        if topic in ("hardware.changed", "settings.changed"):
            self.refresh()

    def _toggle_favorite(self) -> None:
        favs = self.ctx.settings.get("favorites")
        if self.spec.id in favs:
            favs.remove(self.spec.id)
        else:
            favs.append(self.spec.id)
        self.ctx.settings.set("favorites", favs)

    def refresh(self) -> None:
        hw = self.ctx.hardware.snapshot()
        names = hardware_names()
        counts: dict[Status, int] = {}
        for r in self.rows:
            st = r.update_state(hw, names)
            counts[st] = counts.get(st, 0) + 1
        usable = sum(counts.get(s, 0) for s in (Status.AVAILABLE, Status.EXPERIMENTAL, Status.SIMULATED))
        self.summary.setText(tr("{u} di {n} utilizzabili ora", "{u} of {n} usable now", u=usable, n=len(self.rows)))
        fav = self.spec.id in self.ctx.settings.get("favorites")
        self.star.setText(("★ " if fav else "☆ ") + (tr("Nei preferiti", "In favourites") if fav else tr("Aggiungi ai preferiti", "Add to favourites")))

        clear_layout(self.hw_grid)
        needed: list[str] = []
        for c in self.spec.capabilities:
            for route in c.routes:
                for h in route.hardware:
                    if h not in needed:
                        needed.append(h)
        if not needed:
            self.hw_grid.addWidget(label(tr("Nessun hardware: funziona tutto sul PC.", "No hardware: everything runs on the PC."), muted=True), 0, 0)
            return
        p = palette(self.ctx.settings.get("theme"))
        for i, h in enumerate(needed):
            spec = SPECS[h]
            st = hw.get(h)
            pill = PresencePill(st.presence if st else None)
            self.hw_grid.addWidget(pill, i, 0, Qt.AlignmentFlag.AlignTop)
            text = label(f"<b>{spec.name}</b><br><span style='color:{p.muted}'>{spec.how}</span>", wrap=True)
            text.setTextFormat(Qt.TextFormat.RichText)
            self.hw_grid.addWidget(text, i, 1)
            if st and st.detail:
                self.hw_grid.addWidget(label(st.detail, muted=True, wrap=True), i, 2, Qt.AlignmentFlag.AlignTop)
