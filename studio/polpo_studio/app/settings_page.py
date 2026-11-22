"""Impostazioni a schede: aspetto, menu e scorciatoie, dashboard, collegamento, hardware, dati."""

from __future__ import annotations

from PySide6.QtCore import Qt, QUrl
from PySide6.QtGui import QColor, QDesktopServices, QKeySequence
from PySide6.QtWidgets import (
    QCheckBox,
    QColorDialog,
    QComboBox,
    QFormLayout,
    QHBoxLayout,
    QHeaderView,
    QKeySequenceEdit,
    QListWidget,
    QListWidgetItem,
    QPushButton,
    QScrollArea,
    QSpinBox,
    QTableWidget,
    QTableWidgetItem,
    QTabWidget,
    QVBoxLayout,
    QWidget,
)

from ..core.catalog import MODULE_IDS, MODULES
from ..core.hardware import HARDWARE
from ..core.i18n import LANGUAGES, tr
from ..core.settings import DEFAULTS, THEMES
from .context import AppContext
from .widgets import label

THEME_NAMES = {"scuro": ("Scuro", "Dark"), "chiaro": ("Chiaro", "Light"), "alto_contrasto": ("Alto contrasto", "High contrast")}
CARD_NAMES = {
    "polpo": ("Polpo", "Polpo"),
    "notifications": ("Notifiche", "Notifications"),
    "hardware": ("Hardware", "Hardware"),
    "functions": ("Funzioni", "Functions"),
    "favorites": ("Preferiti", "Favourites"),
    "activity": ("Attività recente", "Recent activity"),
}


def scrolled(inner: QWidget) -> QScrollArea:
    sc = QScrollArea()
    sc.setWidgetResizable(True)
    sc.setWidget(inner)
    return sc


class OrderedChecklist(QWidget):
    """Elenco con caselle (visibile/nascosto) e pulsanti su/giù per l'ordine."""

    def __init__(self, items: list[tuple[str, str]], checked: set[str], on_change) -> None:
        super().__init__()
        self.on_change = on_change
        h = QHBoxLayout(self)
        h.setContentsMargins(0, 0, 0, 0)
        self.list = QListWidget()
        for key, text in items:
            it = QListWidgetItem(text)
            it.setData(Qt.ItemDataRole.UserRole, key)
            it.setFlags(it.flags() | Qt.ItemFlag.ItemIsUserCheckable)
            it.setCheckState(Qt.CheckState.Checked if key in checked else Qt.CheckState.Unchecked)
            self.list.addItem(it)
        self.list.itemChanged.connect(lambda _i: self.on_change())
        h.addWidget(self.list, 1)
        v = QVBoxLayout()
        for text, d in ((tr("Su", "Up"), -1), (tr("Giù", "Down"), 1)):
            b = QPushButton(text)
            b.clicked.connect(lambda _=False, dd=d: self.move(dd))
            v.addWidget(b)
        v.addStretch(1)
        h.addLayout(v)

    def move(self, d: int) -> None:
        r = self.list.currentRow()
        if r < 0 or not 0 <= r + d < self.list.count():
            return
        it = self.list.takeItem(r)
        self.list.insertItem(r + d, it)
        self.list.setCurrentRow(r + d)
        self.on_change()

    def order(self) -> list[str]:
        return [self.list.item(i).data(Qt.ItemDataRole.UserRole) for i in range(self.list.count())]

    def checked(self) -> list[str]:
        return [self.list.item(i).data(Qt.ItemDataRole.UserRole) for i in range(self.list.count()) if self.list.item(i).checkState() == Qt.CheckState.Checked]


class SettingsPage(QWidget):
    def __init__(self, ctx: AppContext, actions_provider=None) -> None:
        super().__init__()
        self.ctx = ctx
        self.actions_provider = actions_provider
        outer = QVBoxLayout(self)
        outer.setContentsMargins(24, 20, 24, 24)
        outer.addWidget(label(tr("Impostazioni", "Settings"), heading=1))
        self.tabs = QTabWidget()
        outer.addWidget(self.tabs)
        self.tabs.addTab(scrolled(self._appearance()), tr("Aspetto", "Appearance"))
        self.tabs.addTab(scrolled(self._menu()), tr("Menu e scorciatoie", "Menu and shortcuts"))
        self.tabs.addTab(scrolled(self._dashboard()), tr("Dashboard", "Dashboard"))
        self.tabs.addTab(scrolled(self._connection()), tr("Collegamento e notifiche", "Connection and notifications"))
        self.tabs.addTab(scrolled(self._hardware()), tr("Hardware", "Hardware"))
        self.tabs.addTab(scrolled(self._data()), tr("Dati", "Data"))

    # ---------------- aspetto ----------------

    def _appearance(self) -> QWidget:
        s = self.ctx.settings
        w = QWidget()
        f = QFormLayout(w)
        self.lang = QComboBox()
        for code, name in LANGUAGES.items():
            self.lang.addItem(name, code)
        self.lang.setCurrentIndex(list(LANGUAGES).index(s.get("language")))
        self.lang.currentIndexChanged.connect(lambda _i: s.set("language", self.lang.currentData()))
        f.addRow(tr("Lingua", "Language"), self.lang)
        self.theme = QComboBox()
        for t in THEMES:
            self.theme.addItem(tr(*THEME_NAMES[t]), t)
        self.theme.setCurrentIndex(THEMES.index(s.get("theme")))
        self.theme.currentIndexChanged.connect(lambda _i: s.set("theme", self.theme.currentData()))
        f.addRow(tr("Tema", "Theme"), self.theme)
        self.accent = QPushButton(s.get("accent"))
        self.accent.clicked.connect(self._pick_accent)
        f.addRow(tr("Colore principale", "Accent colour"), self.accent)
        self.font = QSpinBox()
        self.font.setRange(80, 160)
        self.font.setSingleStep(10)
        self.font.setSuffix(" %")
        self.font.setValue(round(s.get("font_scale") * 100))
        self.font.valueChanged.connect(lambda v: s.set("font_scale", v / 100))
        f.addRow(tr("Dimensione del testo", "Text size"), self.font)
        self.icons = QComboBox()
        self.icons.addItem(tr("A linea", "Outline"), "linea")
        self.icons.addItem(tr("Piene", "Filled"), "pieno")
        self.icons.setCurrentIndex(0 if s.get("icon_style") == "linea" else 1)
        self.icons.currentIndexChanged.connect(lambda _i: s.set("icon_style", self.icons.currentData()))
        f.addRow(tr("Icone", "Icons"), self.icons)
        self.density = QComboBox()
        self.density.addItem(tr("Comoda", "Comfortable"), "comoda")
        self.density.addItem(tr("Compatta", "Compact"), "compatta")
        self.density.setCurrentIndex(0 if s.get("density") == "comoda" else 1)
        self.density.currentIndexChanged.connect(lambda _i: s.set("density", self.density.currentData()))
        f.addRow(tr("Densità", "Density"), self.density)
        self.compact = QCheckBox(tr("Barra laterale con sole icone", "Icon-only sidebar"))
        self.compact.setChecked(s.get("sidebar_compact"))
        self.compact.toggled.connect(lambda v: s.set("sidebar_compact", v))
        f.addRow(self.compact)
        return w

    def _pick_accent(self) -> None:
        c = QColorDialog.getColor(QColor(self.ctx.settings.get("accent")), self, tr("Colore principale", "Accent colour"))
        if c.isValid():
            self.ctx.settings.set("accent", c.name())
            self.accent.setText(c.name())

    # ---------------- menu e scorciatoie ----------------

    def _menu(self) -> QWidget:
        s = self.ctx.settings
        w = QWidget()
        v = QVBoxLayout(w)
        v.addWidget(label(tr("Ordine dei moduli nella barra laterale (togli la spunta per nasconderli).", "Order of the modules in the sidebar (untick to hide)."), muted=True, wrap=True))
        order = [m for m in s.get("sidebar_order") if m in MODULE_IDS] + [m.id for m in MODULES if m.id not in s.get("sidebar_order")]
        hidden = set(s.get("hidden_modules"))
        self.menu_list = OrderedChecklist([(m, str(MODULE_IDS[m].title)) for m in order], {m for m in order if m not in hidden}, self._save_menu)
        self.menu_list.setMinimumHeight(320)
        v.addWidget(self.menu_list)
        v.addWidget(label(tr("Scorciatoie da tastiera (clic sulla casella e premi i tasti).", "Keyboard shortcuts (click the box and press the keys)."), muted=True, wrap=True))
        self.keys = QTableWidget(0, 2)
        self.keys.setHorizontalHeaderLabels([tr("Azione", "Action"), tr("Scorciatoia", "Shortcut")])
        self.keys.verticalHeader().setVisible(False)
        self.keys.horizontalHeader().setSectionResizeMode(0, QHeaderView.ResizeMode.Stretch)
        self.keys.setMinimumHeight(320)
        v.addWidget(self.keys)
        b = QPushButton(tr("Ripristina le scorciatoie predefinite", "Restore default shortcuts"))
        b.clicked.connect(lambda: s.set("shortcuts", {}))
        v.addWidget(b)
        self._fill_keys()
        return w

    def _save_menu(self) -> None:
        self.ctx.settings.set("sidebar_order", self.menu_list.order())
        self.ctx.settings.set("hidden_modules", [m for m in self.menu_list.order() if m not in self.menu_list.checked()])

    def _fill_keys(self) -> None:
        acts = self.actions_provider() if self.actions_provider else []
        custom = self.ctx.settings.get("shortcuts")
        self.keys.setRowCount(len(acts))
        self.key_edits: dict[str, QKeySequenceEdit] = {}
        for r, (aid, name, default, _fn) in enumerate(acts):
            self.keys.setItem(r, 0, QTableWidgetItem(name))
            ed = QKeySequenceEdit(QKeySequence(custom.get(aid, default)))
            ed.editingFinished.connect(lambda a=aid, e=ed: self._set_key(a, e.keySequence().toString()))
            self.keys.setCellWidget(r, 1, ed)
            self.key_edits[aid] = ed

    def _set_key(self, aid: str, seq: str) -> None:
        custom = self.ctx.settings.get("shortcuts")
        custom[aid] = seq
        self.ctx.settings.set("shortcuts", custom)

    # ---------------- dashboard ----------------

    def _dashboard(self) -> QWidget:
        s = self.ctx.settings
        w = QWidget()
        v = QVBoxLayout(w)
        v.addWidget(label(tr("Schede della Home: ordine e visibilità. Hardware e Funzioni occupano tutta la larghezza.", "Home cards: order and visibility. Hardware and Functions take the full width."), muted=True, wrap=True))
        shown = s.get("dashboard_cards")
        order = shown + [k for k in DEFAULTS["dashboard_cards"] if k not in shown]
        self.cards = OrderedChecklist([(k, tr(*CARD_NAMES[k])) for k in order], set(shown), lambda: s.set("dashboard_cards", self.cards.checked()))
        self.cards.setMinimumHeight(260)
        v.addWidget(self.cards)
        v.addStretch(1)
        return w

    # ---------------- collegamento ----------------

    def _connection(self) -> QWidget:
        s = self.ctx.settings
        w = QWidget()
        f = QFormLayout(w)
        self.ping = QSpinBox()
        self.ping.setRange(5, 60)
        self.ping.setSuffix(" s")
        self.ping.setValue(s.get("ping_interval_s"))
        self.ping.valueChanged.connect(lambda v: s.set("ping_interval_s", v))
        f.addRow(tr("Controllo del collegamento ogni", "Check the connection every"), self.ping)
        self.vconf = QCheckBox(tr("Mostra le conferme del Polpo virtuale in una finestra", "Show the virtual Polpo confirmations in a window"))
        self.vconf.setChecked(s.get("virtual_confirm_dialog"))
        self.vconf.toggled.connect(lambda v: s.set("virtual_confirm_dialog", v))
        f.addRow(self.vconf)
        self.notif = QCheckBox(tr("Notifiche (gli errori si mostrano sempre)", "Notifications (errors are always shown)"))
        self.notif.setChecked(s.get("notifications"))
        self.notif.toggled.connect(lambda v: s.set("notifications", v))
        f.addRow(self.notif)
        return w

    # ---------------- hardware ----------------

    def _hardware(self) -> QWidget:
        s = self.ctx.settings
        w = QWidget()
        v = QVBoxLayout(w)
        v.addWidget(
            label(
                tr(
                    "Questi componenti non si possono riconoscere da soli. Spunta quelli che hai davvero collegato: "
                    "le funzioni che li usano diventeranno \"Disponibili (dichiarato da te)\".",
                    "These parts cannot be recognised automatically. Tick the ones you really have connected: "
                    "the functions using them will become \"Available (declared by you)\".",
                ),
                muted=True,
                wrap=True,
            )
        )
        declared = s.get("declared_hardware")
        self.decl: dict[str, QCheckBox] = {}
        for h in HARDWARE:
            if not h.declarable:
                continue
            cb = QCheckBox(str(h.name))
            cb.setToolTip(str(h.how))
            cb.setChecked(bool(declared.get(h.id)))
            cb.toggled.connect(self._save_declared)
            self.decl[h.id] = cb
            v.addWidget(cb)
            v.addWidget(label("    " + str(h.how), muted=True, wrap=True))
        v.addStretch(1)
        return w

    def _save_declared(self) -> None:
        self.ctx.settings.set("declared_hardware", {k: cb.isChecked() for k, cb in self.decl.items() if cb.isChecked()})

    # ---------------- dati ----------------

    def _data(self) -> QWidget:
        w = QWidget()
        v = QVBoxLayout(w)
        h = QHBoxLayout()
        h.addWidget(label(str(self.ctx.data_dir), selectable=True, wrap=True), 1)
        b = QPushButton(tr("Apri cartella", "Open folder"))
        b.clicked.connect(lambda: QDesktopServices.openUrl(QUrl.fromLocalFile(str(self.ctx.data_dir))))
        h.addWidget(b)
        v.addLayout(h)
        v.addWidget(label(tr("Qui ci sono le impostazioni, la cassaforte cifrata, il registro tecnico e le app di terze parti.", "This holds the settings, the encrypted vault, the technical log and third-party apps."), muted=True, wrap=True))
        v.addStretch(1)
        return w
