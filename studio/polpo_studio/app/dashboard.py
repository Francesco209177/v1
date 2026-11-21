"""Dashboard: stato del Polpo e dell'hardware, funzioni per stato, preferiti, attività, notifiche."""

from __future__ import annotations

import time
from collections.abc import Callable

from PySide6.QtCore import Qt
from PySide6.QtWidgets import (
    QGridLayout,
    QHBoxLayout,
    QHeaderView,
    QProgressBar,
    QPushButton,
    QScrollArea,
    QTableWidget,
    QTableWidgetItem,
    QTreeWidget,
    QTreeWidgetItem,
    QVBoxLayout,
    QWidget,
)

from .. import __version__
from ..core.capability import STATUS_HELP, STATUS_LABEL, Presence, Status, evaluate
from ..core.catalog import MODULE_IDS, MODULES
from ..core.hardware import HARDWARE, hardware_names
from ..core.i18n import tr
from .context import AppContext
from .icons import icon
from .qt_bridge import GuiBridge
from .themes import effective_accent
from .widgets import Card, Mascot, PresencePill, SimTag, StatusBadge, clear_layout, human_bytes, label

WIDE = ("hardware", "functions")  # schede a tutta larghezza
ORDER = (Status.AVAILABLE, Status.NEEDS_HARDWARE, Status.SIMULATED, Status.EXPERIMENTAL, Status.NOT_AVAILABLE)


def _time(ts: float) -> str:
    return time.strftime("%H:%M:%S", time.localtime(ts))


class DashboardPage(QWidget):
    def __init__(
        self,
        ctx: AppContext,
        bridge: GuiBridge,
        navigate: Callable[[str], None],
        actions: dict[str, Callable[[], None]],
    ) -> None:
        super().__init__()
        self.ctx, self.bridge, self.navigate, self.actions = ctx, bridge, navigate, actions
        self.phase_text = ""
        outer = QVBoxLayout(self)
        outer.setContentsMargins(0, 0, 0, 0)
        scroll = QScrollArea()
        scroll.setWidgetResizable(True)
        outer.addWidget(scroll)
        inner = QWidget()
        scroll.setWidget(inner)
        lay = QVBoxLayout(inner)
        lay.setContentsMargins(24, 20, 24, 24)
        lay.setSpacing(16)

        head = QHBoxLayout()
        self.mascot = Mascot(size=88)
        head.addWidget(self.mascot)
        t = QVBoxLayout()
        t.addWidget(label("Polpo Studio", heading=1))
        self.subtitle = label("", muted=True, wrap=True)
        t.addWidget(self.subtitle)
        head.addLayout(t, 1)
        lay.addLayout(head)

        self.grid = QGridLayout()
        self.grid.setSpacing(16)
        self.grid.setColumnStretch(0, 1)
        self.grid.setColumnStretch(1, 1)
        lay.addLayout(self.grid)
        lay.addStretch(1)

        self.cards = {
            "polpo": self._polpo_card(),
            "hardware": self._hardware_card(),
            "functions": self._functions_card(),
            "favorites": self._favorites_card(),
            "activity": self._activity_card(),
            "notifications": self._notifications_card(),
        }
        self._place_cards()
        bridge.event.connect(self._on_event)
        self.refresh_all()

    # ---------------- schede ----------------

    def _place_cards(self) -> None:
        """Due colonne, nell'ordine scelto in Impostazioni."""
        for c in self.cards.values():
            c.setParent(None)
        wanted = [k for k in self.ctx.settings.get("dashboard_cards") if k in self.cards]
        row = col = 0
        for key in wanted:
            if key in WIDE:
                if col:
                    row, col = row + 1, 0
                self.grid.addWidget(self.cards[key], row, 0, 1, 2)
                row += 1
            else:
                self.grid.addWidget(self.cards[key], row, col)
                row, col = (row + 1, 0) if col else (row, 1)
        for key, card in self.cards.items():
            card.setVisible(key in wanted)

    def _polpo_card(self) -> Card:
        c = Card(tr("Polpo", "Polpo"))
        self.sim_tag = SimTag()
        c.header.addWidget(self.sim_tag)
        self.polpo_state = label("", heading=3, wrap=True)
        self.polpo_details = label("", muted=True, wrap=True, selectable=True)
        self.battery = QProgressBar()
        self.battery.setRange(0, 100)
        self.battery.setFormat(tr("Batteria %p%", "Battery %p%"))
        self.budget = label("", muted=True, wrap=True)
        c.body.addWidget(self.polpo_state)
        c.body.addWidget(self.polpo_details)
        c.body.addWidget(self.battery)
        c.body.addWidget(self.budget)
        row = QHBoxLayout()
        self.btn_usb = QPushButton(tr("Collega via USB…", "Connect via USB…"))
        self.btn_usb.setProperty("primary", "true")
        self.btn_usb.clicked.connect(self.actions["connect_usb"])
        self.btn_virtual = QPushButton(tr("Usa il Polpo virtuale", "Use the virtual Polpo"))
        self.btn_virtual.setToolTip(tr("Un Polpo SIMULATO per provare il programma senza hardware.", "A SIMULATED Polpo to try the program without hardware."))
        self.btn_virtual.clicked.connect(self.actions["connect_virtual"])
        self.btn_refresh = QPushButton(tr("Aggiorna", "Refresh"))
        self.btn_refresh.clicked.connect(self.actions["refresh"])
        self.btn_disconnect = QPushButton(tr("Scollega", "Disconnect"))
        self.btn_disconnect.clicked.connect(self.actions["disconnect"])
        for b in (self.btn_usb, self.btn_virtual, self.btn_refresh, self.btn_disconnect):
            row.addWidget(b)
        row.addStretch(1)
        c.body.addLayout(row)
        return c

    def _hardware_card(self) -> Card:
        c = Card(tr("Hardware", "Hardware"))
        self.hw_tree = QTreeWidget()
        self.hw_tree.setColumnCount(3)
        self.hw_tree.setHeaderLabels([tr("Elemento", "Item"), tr("Stato", "Status"), tr("Dettagli", "Details")])
        self.hw_tree.setRootIsDecorated(False)
        self.hw_tree.setMinimumHeight(260)
        self.hw_tree.header().setSectionResizeMode(0, QHeaderView.ResizeMode.Stretch)
        self.hw_tree.header().setSectionResizeMode(1, QHeaderView.ResizeMode.ResizeToContents)
        self.hw_tree.header().setSectionResizeMode(2, QHeaderView.ResizeMode.Stretch)
        c.body.addWidget(self.hw_tree)
        return c

    def _functions_card(self) -> Card:
        c = Card(tr("Funzioni", "Functions"))
        self.legend = QGridLayout()
        c.body.addLayout(self.legend)
        self.fn_table = QTableWidget(0, 1 + len(ORDER))
        self.fn_table.verticalHeader().setVisible(False)
        self.fn_table.setEditTriggers(QTableWidget.EditTrigger.NoEditTriggers)
        self.fn_table.setSelectionBehavior(QTableWidget.SelectionBehavior.SelectRows)
        self.fn_table.setMinimumHeight(260)
        self.fn_table.cellDoubleClicked.connect(lambda r, _c: self.navigate(MODULES[r].id))
        self.fn_table.setToolTip(tr("Doppio clic per aprire il modulo", "Double-click to open the module"))
        c.body.addWidget(self.fn_table)
        return c

    def _favorites_card(self) -> Card:
        c = Card(tr("Preferiti", "Favourites"))
        self.fav_box = QVBoxLayout()
        c.body.addLayout(self.fav_box)
        return c

    def _activity_card(self) -> Card:
        c = Card(tr("Attività recente", "Recent activity"))
        btn = QPushButton(tr("Registro completo", "Full log"))
        btn.setProperty("flat", "true")
        btn.clicked.connect(lambda: self.navigate("activity"))
        c.header.addWidget(btn)
        self.act_box = QVBoxLayout()
        c.body.addLayout(self.act_box)
        return c

    def _notifications_card(self) -> Card:
        c = Card(tr("Notifiche", "Notifications"))
        self.not_box = QVBoxLayout()
        c.body.addLayout(self.not_box)
        return c

    # ---------------- aggiornamenti ----------------

    def _on_event(self, topic: str, payload: dict) -> None:
        if topic in ("hardware.changed", "polpo.info", "polpo.state"):
            self.refresh_polpo()
            self.refresh_hardware()
            self.refresh_functions()
        elif topic == "polpo.phase":
            self.phase_text = payload.get("text", "") if payload.get("phase") not in ("connected", "failed") else ""
            self.refresh_polpo()
        elif topic == "activity.added":
            self.refresh_activity()
        elif topic == "notification":
            self.refresh_notifications()
        elif topic == "settings.changed" and payload.get("key") in ("favorites", "dashboard_cards"):
            if payload.get("key") == "dashboard_cards":
                self._place_cards()
            self.refresh_favorites()

    def refresh_all(self) -> None:
        self.refresh_polpo()
        self.refresh_hardware()
        self.refresh_functions()
        self.refresh_favorites()
        self.refresh_activity()
        self.refresh_notifications()

    def refresh_polpo(self) -> None:
        dev = self.ctx.devices
        info = dev.info if dev.connected else {}
        sim = dev.connected and (dev.simulated or bool(info.get("virtual")))
        self.sim_tag.setVisible(sim)
        self.mascot.set_mood("simulato" if sim else "collegato" if info else "felice")
        if self.phase_text:
            self.polpo_state.setText(self.phase_text)
        else:
            self.polpo_state.setText(dev.describe())
        if info:
            sd = info.get("sd") or {}
            sd_text = (
                tr("microSD: {u} usati su {t}", "microSD: {u} used of {t}", u=human_bytes(sd.get("used", 0)), t=human_bytes(sd.get("total", 0)))
                if sd.get("ok")
                else tr("microSD assente", "no microSD")
            )
            self.polpo_details.setText(
                tr("Scheda: {b} · Firmware: {f}", "Board: {b} · Firmware: {f}", b=info.get("board", "?"), f=info.get("firmware", "?"))
                + "\n"
                + sd_text
            )
            self.battery.setVisible(True)
            self.battery.setValue(int(info.get("battery", 0)))
            b = info.get("rf_budget") or {}
            if b.get("limit_ms"):
                self.budget.setText(
                    tr(
                        "Radio: {u} s di trasmissione usati su {l} s disponibili in un'ora",
                        "Radio: {u} s of transmission used out of {l} s per hour",
                        u=round(b.get("used_ms", 0) / 1000),
                        l=round(b["limit_ms"] / 1000),
                    )
                )
            self.budget.setVisible(bool(b.get("limit_ms")))
        else:
            self.polpo_details.setText(
                tr(
                    "Collega il Cardputer con il firmware Polpo, oppure prova il Polpo virtuale (SIMULATO).",
                    "Connect the Cardputer running the Polpo firmware, or try the virtual Polpo (SIMULATED).",
                )
            )
            self.battery.setVisible(False)
            self.budget.setVisible(False)
        busy = bool(self.phase_text)
        self.btn_usb.setEnabled(not busy)
        self.btn_virtual.setEnabled(not busy)
        self.btn_refresh.setEnabled(dev.connected and not busy)
        self.btn_disconnect.setEnabled(dev.client is not None or busy)
        self.subtitle.setText(
            tr(
                "Versione {v}. Ogni funzione mostra se è Disponibile, se Richiede hardware esterno, se è Simulata o Sperimentale.",
                "Version {v}. Every function shows whether it is Available, Needs external hardware, is Simulated or Experimental.",
                v=__version__,
            )
        )

    def refresh_hardware(self) -> None:
        snap = self.ctx.hardware.snapshot()
        self.hw_tree.clear()
        groups = {"polpo": tr("Polpo e moduli Grove", "Polpo and Grove units"), "pc": tr("Questo PC", "This PC"), "esterno": tr("Lettori e schede esterne", "External readers and boards")}
        for g, title in groups.items():
            head = QTreeWidgetItem([title, "", ""])
            f = head.font(0)
            f.setBold(True)
            head.setFont(0, f)
            head.setFirstColumnSpanned(True)
            self.hw_tree.addTopLevelItem(head)
            for h in HARDWARE:
                if h.group != g:
                    continue
                st = snap.get(h.id)
                item = QTreeWidgetItem(["   " + str(h.name), "", st.detail if st else ""])
                item.setToolTip(0, str(h.how))
                self.hw_tree.addTopLevelItem(item)
                self.hw_tree.setItemWidget(item, 1, PresencePill(st.presence if st else Presence.ABSENT))

    def refresh_functions(self) -> None:
        snap = self.ctx.hardware.snapshot()
        names = hardware_names()
        totals = {s: 0 for s in ORDER}
        self.fn_table.setRowCount(len(MODULES))
        self.fn_table.setHorizontalHeaderLabels([tr("Modulo", "Module")] + [str(STATUS_LABEL[s]) for s in ORDER])
        accent = effective_accent(self.ctx.settings.get("theme"), self.ctx.settings.get("accent"))
        for r, m in enumerate(MODULES):
            counts = {s: 0 for s in ORDER}
            for c in m.capabilities:
                counts[evaluate(c, snap, names).status] += 1
            item = QTableWidgetItem(icon(m.icon, accent, 32), str(m.title))
            self.fn_table.setItem(r, 0, item)
            for i, s in enumerate(ORDER):
                cell = QTableWidgetItem(str(counts[s]) if counts[s] else "·")
                cell.setTextAlignment(Qt.AlignmentFlag.AlignCenter)
                self.fn_table.setItem(r, 1 + i, cell)
                totals[s] += counts[s]
        hdr = self.fn_table.horizontalHeader()
        hdr.setSectionResizeMode(0, QHeaderView.ResizeMode.Stretch)
        for i in range(len(ORDER)):
            hdr.setSectionResizeMode(1 + i, QHeaderView.ResizeMode.ResizeToContents)
        clear_layout(self.legend)
        for i, s in enumerate(ORDER):
            self.legend.addWidget(StatusBadge(s), i // 3, (i % 3) * 2)
            n = label(str(totals[s]), heading=3)
            n.setToolTip(str(STATUS_HELP[s]))
            self.legend.addWidget(n, i // 3, (i % 3) * 2 + 1)

    def refresh_favorites(self) -> None:
        clear_layout(self.fav_box)
        favs = [f for f in self.ctx.settings.get("favorites") if f in MODULE_IDS]
        if not favs:
            self.fav_box.addWidget(
                label(tr("Nessun preferito: apri un modulo e premi ☆.", "No favourites yet: open a module and press ☆."), muted=True, wrap=True)
            )
            return
        accent = effective_accent(self.ctx.settings.get("theme"), self.ctx.settings.get("accent"))
        for f in favs:
            m = MODULE_IDS[f]
            b = QPushButton(icon(m.icon, accent, 32), "  " + str(m.title))
            b.setStyleSheet("text-align: left;")
            b.clicked.connect(lambda _=False, mid=f: self.navigate(mid))
            self.fav_box.addWidget(b)

    def refresh_activity(self) -> None:
        clear_layout(self.act_box)
        entries = self.ctx.activity.entries()[-8:][::-1]
        if not entries:
            self.act_box.addWidget(label(tr("Ancora nessuna attività.", "No activity yet."), muted=True))
        for e in entries:
            row = QHBoxLayout()
            row.addWidget(label(_time(e.ts), muted=True))
            row.addWidget(label(e.message, wrap=True), 1)
            if e.simulated:
                row.addWidget(SimTag())
            self.act_box.addLayout(row)

    def refresh_notifications(self) -> None:
        clear_layout(self.not_box)
        items = self.ctx.notifications.items()[:5]
        if not items:
            self.not_box.addWidget(label(tr("Nessuna notifica.", "No notifications."), muted=True))
        for n in items:
            lb = label(f"<b>{n.title}</b> · {_time(n.ts)}<br>{n.text}", wrap=True)
            lb.setTextFormat(Qt.TextFormat.RichText)
            if n.level == "errore":
                lb.setProperty("error", "true")
            self.not_box.addWidget(lb)
