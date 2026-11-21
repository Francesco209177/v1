"""Impostazioni: aspetto, lingua, collegamento, notifiche, hardware dichiarato, cartella dei dati."""

from __future__ import annotations

from PySide6.QtCore import QUrl
from PySide6.QtGui import QColor, QDesktopServices
from PySide6.QtWidgets import (
    QCheckBox,
    QColorDialog,
    QComboBox,
    QFormLayout,
    QGroupBox,
    QHBoxLayout,
    QPushButton,
    QScrollArea,
    QSpinBox,
    QVBoxLayout,
    QWidget,
)

from ..core.hardware import HARDWARE
from ..core.i18n import LANGUAGES, tr
from ..core.settings import THEMES
from .context import AppContext
from .widgets import label

THEME_NAMES = {"scuro": ("Scuro", "Dark"), "chiaro": ("Chiaro", "Light"), "alto_contrasto": ("Alto contrasto", "High contrast")}


class SettingsPage(QWidget):
    def __init__(self, ctx: AppContext) -> None:
        super().__init__()
        self.ctx = ctx
        s = ctx.settings
        outer = QVBoxLayout(self)
        outer.setContentsMargins(0, 0, 0, 0)
        scroll = QScrollArea()
        scroll.setWidgetResizable(True)
        outer.addWidget(scroll)
        inner = QWidget()
        scroll.setWidget(inner)
        lay = QVBoxLayout(inner)
        lay.setContentsMargins(24, 20, 24, 24)
        lay.setSpacing(12)
        lay.addWidget(label(tr("Impostazioni", "Settings"), heading=1))

        # aspetto
        g = QGroupBox(tr("Aspetto e lingua", "Appearance and language"))
        f = QFormLayout(g)
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
        lay.addWidget(g)

        # collegamento
        g = QGroupBox(tr("Collegamento con il Polpo", "Polpo connection"))
        f = QFormLayout(g)
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
        lay.addWidget(g)

        # hardware dichiarato
        g = QGroupBox(tr("Hardware che non si può rilevare", "Hardware that cannot be detected"))
        v = QVBoxLayout(g)
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
        lay.addWidget(g)

        # dati
        g = QGroupBox(tr("Dati", "Data"))
        h = QHBoxLayout(g)
        h.addWidget(label(str(ctx.data_dir), selectable=True, wrap=True), 1)
        b = QPushButton(tr("Apri cartella", "Open folder"))
        b.clicked.connect(lambda: QDesktopServices.openUrl(QUrl.fromLocalFile(str(ctx.data_dir))))
        h.addWidget(b)
        lay.addWidget(g)
        lay.addStretch(1)

    def _pick_accent(self) -> None:
        c = QColorDialog.getColor(QColor(self.ctx.settings.get("accent")), self, tr("Colore principale", "Accent colour"))
        if c.isValid():
            self.ctx.settings.set("accent", c.name())
            self.accent.setText(c.name())

    def _save_declared(self) -> None:
        self.ctx.settings.set("declared_hardware", {k: cb.isChecked() for k, cb in self.decl.items() if cb.isChecked()})
