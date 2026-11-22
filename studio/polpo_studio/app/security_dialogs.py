"""Finestre di sicurezza: prima apertura, sblocco, schermata di blocco, modalità laboratorio, conferme."""

from __future__ import annotations

from collections.abc import Callable

from PySide6.QtCore import Qt, Signal
from PySide6.QtGui import QFont, QGuiApplication
from PySide6.QtWidgets import (
    QApplication,
    QCheckBox,
    QDialog,
    QFileDialog,
    QHBoxLayout,
    QLabel,
    QLineEdit,
    QMessageBox,
    QPushButton,
    QSpinBox,
    QStackedWidget,
    QVBoxLayout,
    QWidget,
)

from ..core.i18n import tr
from ..security import crypto
from ..security.lab import ACTIONS, RULES
from ..security.vault import VaultError
from .context import AppContext
from .widgets import Mascot, Note, label

PASS_HINTS = {
    "short": ("almeno 12 caratteri", "at least 12 characters"),
    "repetitive": ("troppi caratteri ripetuti", "too many repeated characters"),
    "common": ("è una frase troppo comune", "it is too common"),
}


def keyring_available() -> tuple[bool, str]:
    try:
        import keyring

        kr = keyring.get_keyring()
    except Exception as e:  # pragma: no cover - dipende dal sistema
        return False, str(e)
    name = type(kr).__module__ + "." + type(kr).__name__
    if "fail" in name.lower() or "null" in name.lower():
        return False, tr("nessun portachiavi del sistema disponibile", "no system keyring available")
    return True, name


def password_field(placeholder: str = "") -> QLineEdit:
    e = QLineEdit()
    e.setEchoMode(QLineEdit.EchoMode.Password)
    e.setPlaceholderText(placeholder)
    e.setMinimumWidth(340)
    return e


def busy(fn: Callable[[], None]) -> None:
    """Le derivazioni scrypt durano mezzo secondo: cursore di attesa."""
    QApplication.setOverrideCursor(Qt.CursorShape.WaitCursor)
    try:
        fn()
    finally:
        QApplication.restoreOverrideCursor()


# ---------------- prima apertura ----------------


class SetupDialog(QDialog):
    """Crea la cassaforte: frase di accesso, chiave di recupero, PIN facoltativo."""

    def __init__(self, ctx: AppContext, parent: QWidget | None = None) -> None:
        super().__init__(parent)
        self.ctx = ctx
        self.recovery = ""
        self.setWindowTitle(tr("Benvenuto in Polpo Studio", "Welcome to Polpo Studio"))
        self.setMinimumWidth(620)
        lay = QVBoxLayout(self)
        self.pages = QStackedWidget()
        lay.addWidget(self.pages)
        self.err = label("", wrap=True)
        self.err.setProperty("error", "true")
        lay.addWidget(self.err)
        row = QHBoxLayout()
        row.addStretch(1)
        self.back = QPushButton(tr("Esci", "Quit"))
        self.next = QPushButton(tr("Avanti", "Next"))
        self.next.setProperty("primary", "true")
        self.next.setDefault(True)
        row.addWidget(self.back)
        row.addWidget(self.next)
        lay.addLayout(row)
        self.back.clicked.connect(self._back)
        self.next.clicked.connect(self._next)
        self._page_intro()
        self._page_pass()
        self._page_recovery()
        self._page_extra()
        self._update()

    def _page_intro(self) -> None:
        w = QWidget()
        v = QVBoxLayout(w)
        h = QHBoxLayout()
        h.addWidget(Mascot(size=96))
        h.addWidget(label(tr("Prima di tutto, una cassaforte", "First of all, a vault"), heading=1), 1)
        v.addLayout(h)
        v.addWidget(
            label(
                tr(
                    "Polpo Studio salva le tue letture (tag, telecomandi, codici radio), i backup e il registro delle "
                    "attività in una <b>cassaforte cifrata</b> (AES-256). Per aprirla serve una <b>frase di accesso</b> "
                    "che scegli tu.<br><br>Se dimentichi la frase, l'unico modo per recuperare i dati è la <b>chiave di "
                    "recupero</b> che riceverai tra poco: nessuno, nemmeno chi ha scritto il programma, può aprirla al "
                    "posto tuo.",
                    "Polpo Studio keeps your reads (tags, remotes, radio codes), backups and activity log in an "
                    "<b>encrypted vault</b> (AES-256). Opening it needs a <b>passphrase</b> you choose.<br><br>If you "
                    "forget the passphrase, the only way back is the <b>recovery key</b> you will get in a moment: "
                    "nobody, not even the program's authors, can open it for you.",
                ),
                wrap=True,
            )
        )
        v.addStretch(1)
        self.pages.addWidget(w)

    def _page_pass(self) -> None:
        w = QWidget()
        v = QVBoxLayout(w)
        v.addWidget(label(tr("Scegli la frase di accesso", "Choose your passphrase"), heading=2))
        v.addWidget(
            label(
                tr(
                    "Meglio una frase di più parole che una password corta: per esempio quattro parole a caso.",
                    "A phrase of several words beats a short password: for example four random words.",
                ),
                muted=True,
                wrap=True,
            )
        )
        self.p1 = password_field(tr("Frase di accesso", "Passphrase"))
        self.p2 = password_field(tr("Ripeti la frase", "Repeat the passphrase"))
        self.p1.textChanged.connect(self._update)
        self.p2.textChanged.connect(self._update)
        self.p_hint = label("", muted=True, wrap=True)
        show = QCheckBox(tr("Mostra", "Show"))
        show.toggled.connect(lambda on: [e.setEchoMode(QLineEdit.EchoMode.Normal if on else QLineEdit.EchoMode.Password) for e in (self.p1, self.p2)])
        for x in (self.p1, self.p2, show, self.p_hint):
            v.addWidget(x)
        v.addStretch(1)
        self.pages.addWidget(w)

    def _page_recovery(self) -> None:
        w = QWidget()
        v = QVBoxLayout(w)
        v.addWidget(label(tr("La tua chiave di recupero", "Your recovery key"), heading=2))
        v.addWidget(
            label(
                tr(
                    "Scrivila su carta o salvala in un posto sicuro, lontano da questo computer. Serve solo se dimentichi la frase.",
                    "Write it on paper or save it somewhere safe, away from this computer. It is only needed if you forget the passphrase.",
                ),
                wrap=True,
            )
        )
        self.key_label = QLabel()
        f = QFont("monospace")
        f.setStyleHint(QFont.StyleHint.Monospace)
        f.setPointSize(16)
        f.setBold(True)
        self.key_label.setFont(f)
        self.key_label.setTextInteractionFlags(Qt.TextInteractionFlag.TextSelectableByMouse)
        self.key_label.setAlignment(Qt.AlignmentFlag.AlignCenter)
        v.addWidget(self.key_label)
        row = QHBoxLayout()
        copy = QPushButton(tr("Copia", "Copy"))
        copy.clicked.connect(lambda: QGuiApplication.clipboard().setText(self.recovery))
        save = QPushButton(tr("Salva in un file…", "Save to a file…"))
        save.clicked.connect(self._save_key)
        prn = QPushButton(tr("Stampa…", "Print…"))
        prn.clicked.connect(self._print_key)
        for b in (copy, save, prn):
            row.addWidget(b)
        row.addStretch(1)
        v.addLayout(row)
        self.kept = QCheckBox(tr("Ho conservato la chiave di recupero in un posto sicuro", "I have stored the recovery key somewhere safe"))
        self.kept.toggled.connect(self._update)
        v.addWidget(self.kept)
        v.addStretch(1)
        self.pages.addWidget(w)

    def _page_extra(self) -> None:
        w = QWidget()
        v = QVBoxLayout(w)
        v.addWidget(label(tr("Comodità (facoltative)", "Convenience (optional)"), heading=2))
        v.addWidget(
            label(
                tr(
                    "Il PIN serve per sbloccare velocemente lo schermo dopo una pausa, mentre il programma è aperto. "
                    "Dopo 5 PIN sbagliati serve di nuovo la frase.",
                    "The PIN quickly unlocks the screen after a pause while the program is open. "
                    "After 5 wrong PINs the passphrase is needed again.",
                ),
                muted=True,
                wrap=True,
            )
        )
        self.pin1 = password_field(tr("PIN (da 4 a 12 cifre, facoltativo)", "PIN (4 to 12 digits, optional)"))
        self.pin2 = password_field(tr("Ripeti il PIN", "Repeat the PIN"))
        self.pin1.textChanged.connect(self._update)
        self.pin2.textChanged.connect(self._update)
        v.addWidget(self.pin1)
        v.addWidget(self.pin2)
        ok, why = keyring_available()
        self.remember = QCheckBox(tr("Ricorda la cassaforte su questo computer (portachiavi del sistema)", "Remember the vault on this computer (system keyring)"))
        self.remember.setEnabled(ok)
        v.addWidget(self.remember)
        v.addWidget(
            label(
                tr(
                    "Comodo ma meno sicuro: chi usa il tuo account del computer può aprire la cassaforte senza frase.",
                    "Convenient but less safe: anyone using your computer account can open the vault without the passphrase.",
                )
                + ("" if ok else "\n" + tr("Non disponibile qui: {w}.", "Not available here: {w}.", w=why)),
                muted=True,
                wrap=True,
            )
        )
        v.addStretch(1)
        self.pages.addWidget(w)

    def _save_key(self) -> None:
        path, _ = QFileDialog.getSaveFileName(self, tr("Salva la chiave di recupero", "Save the recovery key"), "chiave-recupero-polpo.txt", "Testo (*.txt)")
        if path:
            with open(path, "w", encoding="utf-8") as f:
                f.write(tr("Chiave di recupero di Polpo Studio", "Polpo Studio recovery key") + f"\n\n{self.recovery}\n")

    def _print_key(self) -> None:
        from PySide6.QtGui import QTextDocument
        from PySide6.QtPrintSupport import QPrintDialog, QPrinter

        printer = QPrinter()
        if QPrintDialog(printer, self).exec() == QDialog.DialogCode.Accepted:
            doc = QTextDocument()
            doc.setHtml(f"<h2>{tr('Chiave di recupero di Polpo Studio', 'Polpo Studio recovery key')}</h2><p style='font-size:20pt;font-family:monospace'>{self.recovery}</p>")
            doc.print_(printer)

    def _update(self) -> None:
        i = self.pages.currentIndex()
        self.err.setText("")
        self.back.setText(tr("Esci", "Quit") if i in (0, 1) else tr("Indietro", "Back"))
        self.back.setEnabled(True)
        if i == 1:
            probs = crypto.passphrase_problems(self.p1.text())
            same = self.p1.text() == self.p2.text()
            hints = [tr(*PASS_HINTS[p]) for p in probs]
            if self.p2.text() and not same:
                hints.append(tr("le due frasi non coincidono", "the two phrases differ"))
            self.p_hint.setText(tr("Da sistemare: ", "To fix: ") + ", ".join(hints) if hints else tr("Va bene.", "Looks good."))
            self.next.setEnabled(not probs and same and bool(self.p1.text()))
            self.next.setText(tr("Crea la cassaforte", "Create the vault"))
        elif i == 2:
            self.next.setEnabled(self.kept.isChecked())
            if not self.kept.isChecked():
                self.err.setText(tr("Spunta la casella qui sopra per continuare.", "Tick the box above to continue."))
            self.next.setText(tr("Avanti", "Next"))
            self.back.setEnabled(False)
        elif i == 3:
            pin, again = self.pin1.text(), self.pin2.text()
            ok = not pin or (pin.isdigit() and 4 <= len(pin) <= 12 and pin == again)
            self.next.setEnabled(ok)
            if pin and not pin.isdigit():
                self.err.setText(tr("Il PIN può contenere solo cifre (0-9). Oppure lascia vuote le due caselle.", "The PIN can only contain digits (0-9). Or leave both boxes empty."))
            elif pin and not 4 <= len(pin) <= 12:
                self.err.setText(tr("Il PIN deve avere da 4 a 12 cifre.", "The PIN must have 4 to 12 digits."))
            elif pin and not again:
                self.err.setText(tr("Ripeti il PIN nella seconda casella.", "Repeat the PIN in the second box."))
            elif pin and pin != again:
                self.err.setText(tr("I due PIN non coincidono.", "The two PINs differ."))
            self.next.setText(tr("Fine", "Finish"))
            self.back.setEnabled(False)
        else:
            self.next.setEnabled(True)
            self.next.setText(tr("Avanti", "Next"))

    def _back(self) -> None:
        i = self.pages.currentIndex()
        if i <= 1:
            self.reject()
        else:
            self.pages.setCurrentIndex(i - 1)
            self._update()

    def _next(self) -> None:
        i = self.pages.currentIndex()
        if i == 1:
            try:
                busy(lambda: setattr(self, "recovery", self.ctx.vault.create(self.p1.text())))
            except VaultError as e:
                self.err.setText(str(e))
                return
            self.p1.clear()
            self.p2.clear()
            self.key_label.setText(self.recovery)
        if i == 3:
            try:
                if self.pin1.text():
                    self.ctx.vault.set_pin(self.pin1.text())
                if self.remember.isChecked():
                    self.ctx.vault.remember_on_this_computer(True)
                    self.ctx.settings.set("remember_key", True)
            except VaultError as e:
                self.err.setText(str(e))
                return
            self.accept()
            return
        self.pages.setCurrentIndex(i + 1)
        self._update()

    def reject(self) -> None:
        if self.ctx.vault.exists() and self.ctx.vault.unlocked:
            return  # la cassaforte è già creata: si finisce la procedura
        super().reject()


# ---------------- sblocco ----------------


class UnlockPanel(QWidget):
    """Pannello riusabile: frase di accesso, chiave di recupero o PIN."""

    unlocked = Signal()

    def __init__(self, ctx: AppContext, *, allow_pin: bool) -> None:
        super().__init__()
        self.ctx = ctx
        v = QVBoxLayout(self)
        v.setAlignment(Qt.AlignmentFlag.AlignCenter)
        self.mascot = Mascot(size=110)
        self.mascot.set_mood("dorme")
        v.addWidget(self.mascot, 0, Qt.AlignmentFlag.AlignHCenter)
        self.title = label(tr("Polpo Studio è bloccato", "Polpo Studio is locked"), heading=1)
        self.title.setAlignment(Qt.AlignmentFlag.AlignCenter)
        v.addWidget(self.title)
        self.prompt = label("", muted=True, wrap=True)
        self.prompt.setAlignment(Qt.AlignmentFlag.AlignCenter)
        v.addWidget(self.prompt)
        self.field = password_field()
        self.field.returnPressed.connect(self.submit)
        v.addWidget(self.field, 0, Qt.AlignmentFlag.AlignHCenter)
        self.err = label("", wrap=True)
        self.err.setProperty("error", "true")
        self.err.setAlignment(Qt.AlignmentFlag.AlignCenter)
        v.addWidget(self.err)
        self.go = QPushButton(tr("Sblocca", "Unlock"))
        self.go.setProperty("primary", "true")
        self.go.clicked.connect(self.submit)
        v.addWidget(self.go, 0, Qt.AlignmentFlag.AlignHCenter)
        row = QHBoxLayout()
        self.to_pass = QPushButton(tr("Usa la frase di accesso", "Use the passphrase"))
        self.to_rec = QPushButton(tr("Ho perso la frase: chiave di recupero", "Lost the passphrase: recovery key"))
        for b in (self.to_pass, self.to_rec):
            b.setProperty("flat", "true")
            row.addWidget(b)
        v.addLayout(row)
        self.to_pass.clicked.connect(lambda: self.set_mode("frase"))
        self.to_rec.clicked.connect(lambda: self.set_mode("recupero"))
        self.allow_pin = allow_pin
        self.reset()

    def reset(self) -> None:
        vault = self.ctx.vault
        self.set_mode("pin" if self.allow_pin and vault.unlocked and vault.has_pin else "frase")

    def set_mode(self, mode: str) -> None:
        self.mode = mode
        self.err.setText("")
        self.field.clear()
        if mode == "pin":
            self.prompt.setText(tr("Inserisci il PIN.", "Enter your PIN."))
            self.field.setPlaceholderText("PIN")
        elif mode == "recupero":
            self.prompt.setText(tr("Inserisci la chiave di recupero (32 caratteri, i trattini non contano).", "Enter the recovery key (32 characters, dashes don't matter)."))
            self.field.setPlaceholderText("ABCD-EFGH-…")
        else:
            self.prompt.setText(tr("Inserisci la frase di accesso.", "Enter your passphrase."))
            self.field.setPlaceholderText(tr("Frase di accesso", "Passphrase"))
        self.field.setEchoMode(QLineEdit.EchoMode.Normal if mode == "recupero" else QLineEdit.EchoMode.Password)
        self.to_pass.setVisible(mode != "frase")
        self.to_rec.setVisible(mode != "recupero")
        self.field.setFocus()

    def submit(self) -> None:
        vault = self.ctx.vault
        text = self.field.text()
        if not text:
            return
        was_open = vault.unlocked
        try:
            if self.mode == "pin":
                if not vault.unlock_pin(text):
                    if not vault.unlocked:
                        self.ctx.lock_full()
                        self.set_mode("frase")
                        self.err.setText(tr("Troppi PIN sbagliati: serve la frase di accesso.", "Too many wrong PINs: the passphrase is needed."))
                    else:
                        self.err.setText(tr("PIN sbagliato ({n} di 5).", "Wrong PIN ({n} of 5).", n=vault.pin_errors))
                    self.field.clear()
                    return
            elif self.mode == "recupero":
                busy(lambda: vault.unlock_recovery(text))
            elif was_open:
                ok = [False]
                busy(lambda: ok.__setitem__(0, vault.check_passphrase(text)))
                if not ok[0]:
                    raise VaultError("wrong", tr("Frase di accesso sbagliata.", "Wrong passphrase."))
                vault.quick_locked = False
                vault.pin_errors = 0
            else:
                busy(lambda: vault.unlock(text))
        except VaultError as e:
            self.err.setText(tr("Frase di accesso sbagliata.", "Wrong passphrase.") if e.code == "wrong" and self.mode == "frase" else str(e))
            self.field.clear()
            return
        self.field.clear()
        if not was_open:
            self.ctx.on_unlocked()
        self.unlocked.emit()


class UnlockDialog(QDialog):
    def __init__(self, ctx: AppContext, parent: QWidget | None = None, allow_pin: bool = False) -> None:
        super().__init__(parent)
        self.setWindowTitle("Polpo Studio")
        self.setMinimumWidth(520)
        v = QVBoxLayout(self)
        self.panel = UnlockPanel(ctx, allow_pin=allow_pin)
        self.panel.title.setText(tr("Apri la cassaforte", "Open the vault"))
        self.panel.unlocked.connect(self.accept)
        v.addWidget(self.panel)


def unlock_or_setup(ctx: AppContext) -> bool:
    """All'avvio: crea la cassaforte la prima volta, altrimenti la apre."""
    vault = ctx.vault
    if not vault.exists():
        dlg = SetupDialog(ctx)
        if dlg.exec() != QDialog.DialogCode.Accepted:
            return False
        ctx.on_unlocked()
        ctx.activity.add("sicurezza", tr("Cassaforte creata", "Vault created"), "ok")
        return True
    if ctx.settings.get("remember_key") and vault.try_keyring():
        if not vault.has_pin:
            ctx.on_unlocked()
            return True
        vault.quick_lock()
        dlg = UnlockDialog(ctx, allow_pin=True)
        dlg.panel.title.setText(tr("Bentornato", "Welcome back"))
        if dlg.exec() != QDialog.DialogCode.Accepted:
            vault.lock()
            return False
        if ctx.audit is None:
            ctx.on_unlocked()
        return True
    dlg = UnlockDialog(ctx)
    return dlg.exec() == QDialog.DialogCode.Accepted


# ---------------- modalità laboratorio ----------------


class LabModeDialog(QDialog):
    def __init__(self, ctx: AppContext, parent: QWidget | None = None) -> None:
        super().__init__(parent)
        self.ctx = ctx
        self.setWindowTitle(tr("Modalità laboratorio", "Lab mode"))
        self.setMinimumWidth(560)
        v = QVBoxLayout(self)
        v.addWidget(label(tr("Attivare la modalità laboratorio?", "Enable lab mode?"), heading=2))
        v.addWidget(
            label(
                tr("Permette di: ", "Allows you to: ") + "; ".join(str(a) for a in ACTIONS.values()) + ".",
                wrap=True,
            )
        )
        v.addWidget(Note(str(RULES)))
        self.accept_rules = QCheckBox(tr("Ho letto e accetto queste regole", "I have read and accept these rules"))
        v.addWidget(self.accept_rules)
        row = QHBoxLayout()
        row.addWidget(label(tr("Si spegne da sola dopo", "Switches itself off after")))
        self.minutes = QSpinBox()
        self.minutes.setRange(1, 240)
        self.minutes.setSuffix(tr(" minuti", " minutes"))
        self.minutes.setValue(ctx.settings.get("lab_minutes"))
        row.addWidget(self.minutes)
        row.addStretch(1)
        v.addLayout(row)
        self.secret = password_field(tr("PIN o frase di accesso, per conferma", "PIN or passphrase, to confirm"))
        self.secret.returnPressed.connect(self._ok)
        v.addWidget(self.secret)
        self.err = label("", wrap=True)
        self.err.setProperty("error", "true")
        v.addWidget(self.err)
        row = QHBoxLayout()
        row.addStretch(1)
        cancel = QPushButton(tr("Annulla", "Cancel"))
        cancel.clicked.connect(self.reject)
        self.ok = QPushButton(tr("Attiva", "Enable"))
        self.ok.setProperty("primary", "true")
        self.ok.clicked.connect(self._ok)
        row.addWidget(cancel)
        row.addWidget(self.ok)
        v.addLayout(row)

    def _ok(self) -> None:
        if not self.accept_rules.isChecked():
            self.err.setText(tr("Serve accettare le regole.", "You need to accept the rules."))
            return
        vault, text = self.ctx.vault, self.secret.text()
        good = [False]
        if vault.has_pin and text.isdigit():
            good[0] = vault.unlock_pin(text)
            if not vault.unlocked:
                self.ctx.lock_full()
                self.reject()
                return
        else:
            busy(lambda: good.__setitem__(0, vault.check_passphrase(text)))
        if not good[0]:
            self.err.setText(tr("PIN o frase sbagliati.", "Wrong PIN or passphrase."))
            self.secret.clear()
            return
        self.ctx.settings.set("lab_minutes", self.minutes.value())
        self.ctx.lab.enable(self.minutes.value())
        self.ctx.activity.add(
            "sicurezza",
            tr("Modalità laboratorio attivata per {m} minuti", "Lab mode enabled for {m} minutes", m=self.minutes.value()),
            "avviso",
        )
        self.accept()


def confirm_sensitive(parent: QWidget, title: str, text: str, *, own_device: bool = True) -> bool:
    """Conferma per le azioni che cambiano qualcosa nel mondo reale. Predefinito: No."""
    box = QMessageBox(parent)
    box.setIcon(QMessageBox.Icon.Warning)
    box.setWindowTitle(title)
    box.setText(f"<b>{title}</b>")
    box.setInformativeText(text)
    check = None
    if own_device:
        check = QCheckBox(tr("Il dispositivo è mio o ho l'autorizzazione a usarlo", "The device is mine or I am authorised to use it"))
        box.setCheckBox(check)
    yes = box.addButton(tr("Procedi", "Proceed"), QMessageBox.ButtonRole.AcceptRole)
    no = box.addButton(tr("Annulla", "Cancel"), QMessageBox.ButtonRole.RejectRole)
    box.setDefaultButton(no)
    if check is not None:
        yes.setEnabled(False)
        check.toggled.connect(yes.setEnabled)
    box.exec()
    return box.clickedButton() is yes
