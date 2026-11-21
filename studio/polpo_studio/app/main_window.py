"""Finestra principale: barra laterale, pagine, barra di stato, menu."""

from __future__ import annotations

import logging
from collections.abc import Callable

import time

from PySide6.QtCore import QByteArray, QEvent, QObject, Qt, QTimer
from PySide6.QtGui import QAction, QKeySequence
from PySide6.QtWidgets import (
    QApplication,
    QHBoxLayout,
    QLabel,
    QListWidget,
    QListWidgetItem,
    QMainWindow,
    QMenu,
    QMessageBox,
    QPushButton,
    QStackedWidget,
    QWidget,
)

from .. import APP_NAME, __version__
from ..core.capability import STATUS_HELP, STATUS_LABEL, Status
from ..core.catalog import MODULE_IDS, MODULES
from ..core.i18n import set_language, tr
from . import tools  # noqa: F401  (registra gli strumenti dei moduli)
from .activity_page import ActivityPage
from .connect_dialog import ConnectDialog
from .context import AppContext
from .dashboard import DashboardPage
from . import icons as icons_mod
from .icons import icon
from .module_page import ModulePage
from .qt_bridge import GuiBridge
from .security_dialogs import UnlockPanel
from .security_page import SecurityPage
from .settings_page import SettingsPage
from .themes import accent_text, effective_accent, stylesheet
from .widgets import LabTag, SimTag

log = logging.getLogger(__name__)


class MainWindow(QMainWindow):
    def __init__(self, ctx: AppContext) -> None:
        super().__init__()
        self.ctx = ctx
        self.bridge = GuiBridge(ctx.bus)
        self.pages: dict[str, QWidget] = {}
        self._virtual_boxes: list[QMessageBox] = []
        self._settings_tab = 0
        self.setWindowTitle(APP_NAME)
        self.resize(1280, 820)
        geo = ctx.settings.get("window_geometry")
        if geo:
            self.restoreGeometry(QByteArray.fromBase64(geo.encode()))
        ctx.devices.virtual_confirm = self._virtual_confirm
        self.bridge.event.connect(self._on_event)
        self.root = QStackedWidget()
        self.setCentralWidget(self.root)
        self.main_area: QWidget | None = None
        self.lock_page = UnlockPanel(ctx, allow_pin=True)
        self.lock_page.unlocked.connect(self._unlocked)
        self.root.addWidget(self.lock_page)
        self.apply_theme()
        self.build()
        self._last_input = time.monotonic()
        self._idle = _IdleWatcher(self)
        QApplication.instance().installEventFilter(self._idle)
        self._tick = QTimer(self)
        self._tick.timeout.connect(self._on_tick)
        self._tick.start(1000)
        if not ctx.vault.unlocked or ctx.vault.quick_locked:
            self.lock(quick=ctx.vault.unlocked)

    # ---------------- costruzione ----------------

    def build(self) -> None:
        current = self.current_page()
        old = self.main_area
        central = QWidget()
        lay = QHBoxLayout(central)
        lay.setContentsMargins(0, 0, 0, 0)
        lay.setSpacing(0)
        self.sidebar = QListWidget()
        self.sidebar.setObjectName("sidebar")
        compact = self.ctx.settings.get("sidebar_compact")
        self.sidebar.setFixedWidth(64 if compact else 232)
        self.sidebar.setIconSize(_qsize(22))
        self.stack = QStackedWidget()
        lay.addWidget(self.sidebar)
        lay.addWidget(self.stack, 1)
        self.root.insertWidget(0, central)
        if old is not None:
            was_current = self.root.currentWidget() is old
            self.root.removeWidget(old)
            old.deleteLater()
            if was_current:
                self.root.setCurrentWidget(central)
        else:
            self.root.setCurrentWidget(central)
        self.main_area = central
        self.pages = {}
        self.sidebar.clear()

        actions = {
            "connect_usb": self.connect_usb,
            "connect_virtual": self.connect_virtual,
            "disconnect": self.disconnect,
            "refresh": self.refresh_polpo,
        }
        self._add_page("home", tr("Home", "Home"), "home", DashboardPage(self.ctx, self.bridge, self.show_page, actions))
        for m in self._module_order():
            self._add_page(m.id, str(m.title), m.icon, ModulePage(self.ctx, self.bridge, m))
        sep = QListWidgetItem("")
        sep.setFlags(Qt.ItemFlag.NoItemFlags)
        sep.setSizeHint(_qsize(10, 8))
        self.sidebar.addItem(sep)
        self._add_page("activity", tr("Registro attività", "Activity log"), "activity", ActivityPage(self.ctx, self.bridge))
        self._add_page("security", tr("Sicurezza", "Security"), "security", SecurityPage(self.ctx, self.bridge, self.lock))
        settings_page = SettingsPage(self.ctx, self.actions_catalog)
        settings_page.tabs.setCurrentIndex(self._settings_tab)
        settings_page.tabs.currentChanged.connect(lambda i: setattr(self, "_settings_tab", i))
        self._add_page("settings", tr("Impostazioni", "Settings"), "settings", settings_page)
        self.sidebar.currentRowChanged.connect(self._on_row)
        self._build_menus()
        self._build_status()
        self.show_page(current or "home")
        self._update_status()

    def _module_order(self):
        order = [m for m in self.ctx.settings.get("sidebar_order") if m in MODULE_IDS]
        rest = [m.id for m in MODULES if m.id not in order]
        hidden = set(self.ctx.settings.get("hidden_modules"))
        return [MODULE_IDS[m] for m in order + rest if m not in hidden]

    def _add_page(self, key: str, title: str, icon_key: str, page: QWidget) -> None:
        acc = effective_accent(self.ctx.settings.get("theme"), self.ctx.settings.get("accent"))
        compact = self.ctx.settings.get("sidebar_compact")
        item = QListWidgetItem(icon(icon_key, acc, 44, accent_text(acc)), "" if compact else title)
        item.setToolTip(title)
        item.setData(Qt.ItemDataRole.UserRole, key)
        self.sidebar.addItem(item)
        self.stack.addWidget(page)
        self.pages[key] = page

    def actions_catalog(self) -> list[tuple[str, str, str, Callable]]:
        """(id, nome, scorciatoia predefinita, funzione): personalizzabili in Impostazioni."""
        out = [
            ("lock", tr("Blocca ora", "Lock now"), "Ctrl+Shift+B", self.lock),
            ("connect_usb", tr("Collega via USB…", "Connect via USB…"), "Ctrl+L", self.connect_usb),
            ("connect_virtual", tr("Usa il Polpo virtuale (SIMULATO)", "Use the virtual Polpo (SIMULATED)"), "Ctrl+Shift+L", self.connect_virtual),
            ("refresh", tr("Aggiorna informazioni", "Refresh info"), "F5", self.refresh_polpo),
            ("disconnect", tr("Scollega", "Disconnect"), "", self.disconnect),
        ]
        keys = ["home"] + [x.id for x in self._module_order()] + ["activity", "security", "settings"]
        extra = {"home": tr("Home", "Home"), "activity": tr("Registro attività", "Activity log"), "security": tr("Sicurezza", "Security"), "settings": tr("Impostazioni", "Settings")}
        for i, k in enumerate(keys):
            name = str(MODULE_IDS[k].title) if k in MODULE_IDS else extra[k]
            out.append((f"go.{k}", tr("Vai a: {n}", "Go to: {n}", n=name), f"Ctrl+{i + 1}" if i < 9 else "", lambda key=k: self.show_page(key)))
        return out

    def _build_menus(self) -> None:
        mb = self.menuBar()
        mb.clear()
        custom = self.ctx.settings.get("shortcuts")
        acts = {a[0]: a for a in self.actions_catalog()}
        self.qactions: dict[str, QAction] = {}

        def add(menu: QMenu, aid: str) -> None:
            _id, name, default, fn = acts[aid]
            self.qactions[aid] = self._act(menu, name.removeprefix(tr("Vai a: ", "Go to: ")), fn, custom.get(aid, default) or None)

        m = mb.addMenu(tr("&File", "&File"))
        add(m, "lock")
        self._act(m, tr("Esci", "Quit"), self.close, QKeySequence.StandardKey.Quit)
        m = mb.addMenu(tr("&Polpo", "&Polpo"))
        for aid in ("connect_usb", "connect_virtual", "refresh", "disconnect"):
            add(m, aid)
        m = mb.addMenu(tr("&Vai", "&Go"))
        for aid in acts:
            if aid.startswith("go."):
                add(m, aid)
        m = mb.addMenu(tr("&Aiuto", "&Help"))
        self._act(m, tr("Legenda degli stati", "Status legend"), self.show_legend)
        self._act(m, tr("Informazioni su Polpo Studio", "About Polpo Studio"), self.show_about)

    def _act(self, menu: QMenu, text: str, fn: Callable, shortcut=None) -> QAction:
        a = QAction(text, self)
        a.triggered.connect(lambda _=False: fn())
        if shortcut:
            a.setShortcut(QKeySequence(shortcut))
        menu.addAction(a)
        return a

    def _build_status(self) -> None:
        sb = self.statusBar()
        for w in getattr(self, "_status_widgets", []):
            sb.removeWidget(w)
            w.deleteLater()
        self.st_conn = QLabel()
        self.st_sim = SimTag()
        self.st_batt = QLabel()
        self.st_notif = QPushButton()
        self.st_notif.setProperty("flat", "true")
        self.st_notif.clicked.connect(self.show_notifications)
        self.st_lab = LabTag()
        self.st_lab.setToolTip(tr("Modalità laboratorio attiva: clic per spegnerla", "Lab mode on: click to switch it off"))
        self.st_lab.mousePressEvent = lambda _e: self._lab_off()
        self.st_lab.setVisible(False)
        self._status_widgets = [self.st_conn, self.st_lab, self.st_sim, self.st_batt, self.st_notif]
        sb.addWidget(self.st_conn, 1)
        sb.addPermanentWidget(self.st_lab)
        sb.addPermanentWidget(self.st_sim)
        sb.addPermanentWidget(self.st_batt)
        sb.addPermanentWidget(self.st_notif)

    def apply_theme(self) -> None:
        s = self.ctx.settings
        app = QApplication.instance()
        if app is not None:
            app.setStyleSheet(stylesheet(s.get("theme"), s.get("accent"), s.get("font_scale"), s.get("density")))
        icons_mod.STYLE["filled"] = s.get("icon_style") == "pieno"

    # ---------------- navigazione ----------------

    def current_page(self) -> str:
        if not hasattr(self, "sidebar"):
            return ""
        it = self.sidebar.currentItem()
        return it.data(Qt.ItemDataRole.UserRole) if it else ""

    def show_page(self, key: str) -> None:
        for row in range(self.sidebar.count()):
            if self.sidebar.item(row).data(Qt.ItemDataRole.UserRole) == key:
                self.sidebar.setCurrentRow(row)
                return

    def _on_row(self, row: int) -> None:
        item = self.sidebar.item(row)
        key = item.data(Qt.ItemDataRole.UserRole) if item else None
        if key in self.pages:
            self.stack.setCurrentWidget(self.pages[key])

    # ---------------- Polpo ----------------

    def connect_usb(self) -> None:
        dlg = ConnectDialog(self, self.ctx.settings.get("last_port"))
        if dlg.exec() != ConnectDialog.DialogCode.Accepted or not dlg.selected_port():
            return
        port = dlg.selected_port()
        self.bridge.watch(self.ctx.devices.connect_serial(port), lambda _i: self._connected(), self._connect_failed)

    def connect_virtual(self) -> None:
        self.bridge.watch(self.ctx.devices.connect_virtual(), lambda _i: self._connected(), self._connect_failed)

    def disconnect(self) -> None:
        self.bridge.watch(self.ctx.devices.disconnect(), lambda _r: self._update_status())

    def refresh_polpo(self) -> None:
        self.bridge.watch(self.ctx.devices.refresh_info(), None, self._connect_failed)

    def _connected(self) -> None:
        self._update_status()
        sim = self.ctx.devices.simulated
        self.ctx.notifications.push(
            tr("Polpo collegato", "Polpo connected"),
            tr("Polpo virtuale: tutti i dati sono SIMULATI.", "Virtual Polpo: all data is SIMULATED.") if sim else tr("Collegamento USB attivo.", "USB connection active."),
            "ok",
        )

    def _connect_failed(self, exc: BaseException) -> None:
        self._update_status()
        log.info("collegamento non riuscito: %s", exc)
        code = getattr(exc, "code", "")
        if code == "denied":
            text = tr("Hai rifiutato il collegamento sullo schermo del Polpo (o è scaduto il tempo).", "The connection was refused on the Polpo screen (or it timed out).")
        else:
            text = str(exc)
        self.ctx.activity.add("polpo", tr("Collegamento non riuscito: {t}", "Connection failed: {t}", t=text), "errore")
        QMessageBox.warning(self, tr("Collegamento non riuscito", "Connection failed"), text)

    def _virtual_confirm(self, title: str, body: str, respond: Callable[[bool], None]) -> None:
        """Lo "schermo" del Polpo virtuale: chiamata dal suo thread, mostrata nel thread di Qt."""
        if not self.ctx.settings.get("virtual_confirm_dialog"):
            respond(True)
            return

        def show() -> None:
            box = QMessageBox(self)
            box.setWindowTitle(tr("Schermo del Polpo virtuale (SIMULATO)", "Virtual Polpo screen (SIMULATED)"))
            box.setText(f"<b>{title}</b>")
            box.setInformativeText(body + "\n\n" + tr("Sul Polpo vero questa domanda compare sul suo schermo.", "On the real Polpo this question appears on its screen."))
            yes = box.addButton(tr("Sì", "Yes"), QMessageBox.ButtonRole.YesRole)
            no = box.addButton(tr("No", "No"), QMessageBox.ButtonRole.NoRole)
            box.setDefaultButton(no)
            box.setWindowModality(Qt.WindowModality.NonModal)

            def finished(_r: int) -> None:
                respond(box.clickedButton() is yes)
                if box in self._virtual_boxes:
                    self._virtual_boxes.remove(box)

            box.finished.connect(finished)
            QTimer.singleShot(20_000, box.reject)  # come il Polpo: dopo 20 s vale "No"
            self._virtual_boxes.append(box)
            box.open()

        self.bridge.call_in_gui(show)

    # ---------------- blocco ----------------

    def lock(self, quick: bool = True) -> None:
        """Blocco dello schermo: serve il PIN (se impostato) o la frase per riprendere."""
        if quick and self.ctx.vault.unlocked:
            self.ctx.vault.quick_lock()
        if self.ctx.lab.enabled:
            self.ctx.lab.disable()
        self.menuBar().setEnabled(False)
        self.statusBar().setEnabled(False)
        self.lock_page.reset()
        self.root.setCurrentWidget(self.lock_page)
        self._on_tick()
        self.lock_page.field.setFocus()

    @property
    def locked(self) -> bool:
        return self.root.currentWidget() is self.lock_page

    def _unlocked(self) -> None:
        self._last_input = time.monotonic()
        self.menuBar().setEnabled(True)
        self.statusBar().setEnabled(True)
        if self.main_area is not None:
            self.root.setCurrentWidget(self.main_area)
        self._update_status()

    def _on_tick(self) -> None:
        minutes = self.ctx.settings.get("autolock_min")
        if minutes and not self.locked and time.monotonic() - self._last_input > minutes * 60:
            self.ctx.activity.add("sicurezza", tr("Blocco automatico per inattività", "Automatic lock after inactivity"), "info")
            self.lock()
        lab = self.ctx.lab
        on = lab.enabled
        self.st_lab.setVisible(on)
        if on:
            m, sec = divmod(lab.remaining_s, 60)
            self.st_lab.setText(tr("Laboratorio {m}:{s:02d}", "Lab {m}:{s:02d}", m=m, s=sec))

    def _lab_off(self) -> None:
        if self.ctx.lab.enabled:
            self.ctx.lab.disable()
            self.ctx.activity.add("sicurezza", tr("Modalità laboratorio disattivata", "Lab mode disabled"), "info")
        self._on_tick()

    # ---------------- stato ----------------

    def _on_event(self, topic: str, payload: dict) -> None:
        if topic == "vault.locked" and not self.locked:
            self.lock(quick=False)
            return
        if topic == "lab.changed":
            self._on_tick()
            return
        if topic in ("polpo.state", "polpo.info", "polpo.phase", "hardware.changed", "notification"):
            if topic == "polpo.phase" and payload.get("text"):
                self.st_conn.setText(payload["text"])
            else:
                self._update_status()
        elif topic == "settings.changed":
            key = payload.get("key")
            if key in ("theme", "accent", "font_scale", "density", "icon_style"):
                self.apply_theme()
                if key in ("accent", "theme", "icon_style"):
                    QTimer.singleShot(0, self.build)
            elif key == "language":
                set_language(payload.get("value", "it"))
                QTimer.singleShot(0, self.build)
            elif key in ("sidebar_order", "hidden_modules", "sidebar_compact", "shortcuts"):
                QTimer.singleShot(0, self.build)

    def _update_status(self) -> None:
        dev = self.ctx.devices
        self.st_conn.setText(dev.describe())
        sim = dev.connected and dev.simulated
        self.st_sim.setVisible(sim)
        info = dev.info if dev.connected else {}
        self.st_batt.setText(tr("Batteria {b}%", "Battery {b}%", b=info["battery"]) if "battery" in info else "")
        unread = self.ctx.notifications.unread()
        self.st_notif.setText(tr("Notifiche ({n})", "Notifications ({n})", n=unread) if unread else tr("Notifiche", "Notifications"))
        title = APP_NAME
        if dev.connected:
            title += " — " + (tr("Polpo virtuale (SIMULATO)", "Virtual Polpo (SIMULATED)") if sim else tr("Polpo collegato", "Polpo connected"))
        self.setWindowTitle(title)

    def show_notifications(self) -> None:
        menu = QMenu(self)
        items = self.ctx.notifications.items()[:15]
        if not items:
            menu.addAction(tr("Nessuna notifica", "No notifications")).setEnabled(False)
        for n in items:
            menu.addAction(f"{'• ' if not n.read else ''}{n.title}: {n.text}").setEnabled(False)
        self.ctx.notifications.mark_all_read()
        menu.exec(self.st_notif.mapToGlobal(self.st_notif.rect().topLeft()))
        self._update_status()

    def show_legend(self) -> None:
        text = "".join(f"<p><b>{STATUS_LABEL[s]}</b><br>{STATUS_HELP[s]}</p>" for s in Status)
        QMessageBox.information(self, tr("Legenda degli stati", "Status legend"), text)

    def show_about(self) -> None:
        QMessageBox.about(
            self,
            tr("Informazioni", "About"),
            f"<h3>{APP_NAME} {__version__}</h3>"
            + tr(
                "<p>Il programma per PC del Polpo (M5Stack Cardputer).</p>"
                "<p>Usa solo dispositivi tuoi o per cui hai l'autorizzazione. Le funzioni per entrare in sistemi altrui "
                "(cancelli, veicoli, allarmi, carte di altri) non ci sono, per scelta.</p><p>Licenza MIT.</p>",
                "<p>The PC companion for the Polpo (M5Stack Cardputer).</p>"
                "<p>Only use devices you own or are authorised to use. Features for breaking into other people's "
                "systems (gates, vehicles, alarms, other people's cards) are deliberately absent.</p><p>MIT licence.</p>",
            ),
        )

    def closeEvent(self, event) -> None:  # noqa: N802 (Qt)
        self.ctx.settings.set("window_geometry", bytes(self.saveGeometry().toBase64()).decode())
        for box in list(self._virtual_boxes):
            box.reject()
        self._tick.stop()
        QApplication.instance().removeEventFilter(self._idle)
        self.bridge.close()
        self.ctx.shutdown()
        super().closeEvent(event)


class _IdleWatcher(QObject):
    """Annota l'ultimo uso di tastiera e mouse per il blocco automatico."""

    KINDS = (QEvent.Type.KeyPress, QEvent.Type.MouseButtonPress, QEvent.Type.MouseMove, QEvent.Type.Wheel)

    def __init__(self, win: MainWindow) -> None:
        super().__init__(win)
        self.win = win

    def eventFilter(self, _obj, event) -> bool:  # noqa: N802 (Qt)
        if event.type() in self.KINDS:
            self.win._last_input = time.monotonic()
        return False


def _qsize(w: int, h: int | None = None):
    from PySide6.QtCore import QSize

    return QSize(w, h if h is not None else w)
