"""Pagina Sicurezza: cassaforte, PIN e blocco automatico, portachiavi, modalità laboratorio, backup, registro."""

from __future__ import annotations

from pathlib import Path

from PySide6.QtWidgets import (
    QCheckBox,
    QDialog,
    QFileDialog,
    QFormLayout,
    QHBoxLayout,
    QLineEdit,
    QMessageBox,
    QPushButton,
    QScrollArea,
    QSpinBox,
    QVBoxLayout,
    QWidget,
)

from ..core.i18n import tr
from ..security import crypto
from ..security.backup import BackupError, export_backup, import_backup
from ..security.lab import ACTIONS
from ..security.vault import VaultError
from .context import AppContext
from .qt_bridge import GuiBridge
from .security_dialogs import LabModeDialog, busy, keyring_available, password_field
from .widgets import Card, LabTag, human_bytes, label


class _Form(QDialog):
    """Piccola finestra con campi password."""

    def __init__(self, parent: QWidget, title: str, fields: list[str]) -> None:
        super().__init__(parent)
        self.setWindowTitle(title)
        v = QVBoxLayout(self)
        f = QFormLayout()
        self.edits: list[QLineEdit] = []
        for name in fields:
            e = password_field()
            self.edits.append(e)
            f.addRow(name, e)
        v.addLayout(f)
        self.err = label("", wrap=True)
        self.err.setProperty("error", "true")
        v.addWidget(self.err)
        row = QHBoxLayout()
        row.addStretch(1)
        c = QPushButton(tr("Annulla", "Cancel"))
        c.clicked.connect(self.reject)
        ok = QPushButton(tr("OK", "OK"))
        ok.setProperty("primary", "true")
        ok.clicked.connect(self.accept)
        row.addWidget(c)
        row.addWidget(ok)
        v.addLayout(row)

    def values(self) -> list[str]:
        return [e.text() for e in self.edits]


class SecurityPage(QWidget):
    def __init__(self, ctx: AppContext, bridge: GuiBridge, lock_now) -> None:
        super().__init__()
        self.ctx = ctx
        self.lock_now = lock_now
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
        lay.addWidget(label(tr("Sicurezza", "Security"), heading=1))

        # cassaforte
        c = Card(tr("Cassaforte cifrata", "Encrypted vault"))
        self.vault_info = label("", wrap=True, selectable=True)
        c.body.addWidget(self.vault_info)
        row = QHBoxLayout()
        for text, fn in (
            (tr("Blocca ora", "Lock now"), self.lock_now),
            (tr("Cambia frase di accesso…", "Change passphrase…"), self._change_pass),
            (tr("Nuova chiave di recupero…", "New recovery key…"), self._new_recovery),
            (tr("Verifica integrità", "Check integrity"), self._verify),
        ):
            b = QPushButton(text)
            b.clicked.connect(lambda _=False, f=fn: f())
            row.addWidget(b)
        row.addStretch(1)
        c.body.addLayout(row)
        self.verify_out = label("", wrap=True, selectable=True)
        c.body.addWidget(self.verify_out)
        lay.addWidget(c)

        # PIN e blocco
        c = Card(tr("PIN e blocco automatico", "PIN and auto-lock"))
        self.pin_info = label("", muted=True, wrap=True)
        c.body.addWidget(self.pin_info)
        row = QHBoxLayout()
        self.btn_pin = QPushButton()
        self.btn_pin.clicked.connect(self._set_pin)
        self.btn_nopin = QPushButton(tr("Togli il PIN", "Remove PIN"))
        self.btn_nopin.clicked.connect(self._clear_pin)
        row.addWidget(self.btn_pin)
        row.addWidget(self.btn_nopin)
        row.addStretch(1)
        c.body.addLayout(row)
        f = QFormLayout()
        self.autolock = QSpinBox()
        self.autolock.setRange(0, 240)
        self.autolock.setSuffix(tr(" minuti (0 = mai)", " minutes (0 = never)"))
        self.autolock.setValue(ctx.settings.get("autolock_min"))
        self.autolock.valueChanged.connect(lambda v: ctx.settings.set("autolock_min", v))
        f.addRow(tr("Blocca dopo un'inattività di", "Lock after inactivity of"), self.autolock)
        c.body.addLayout(f)
        ok, why = keyring_available()
        self.remember = QCheckBox(tr("Ricorda la cassaforte su questo computer (portachiavi del sistema)", "Remember the vault on this computer (system keyring)"))
        self.remember.setChecked(ctx.settings.get("remember_key") and ok)
        self.remember.setEnabled(ok)
        self.remember.toggled.connect(self._remember)
        c.body.addWidget(self.remember)
        c.body.addWidget(
            label(
                tr(
                    "Comodo ma meno sicuro: chi usa il tuo account del computer può aprire la cassaforte senza frase.",
                    "Convenient but less safe: anyone using your computer account can open the vault without the passphrase.",
                )
                + ("" if ok else " " + tr("Non disponibile qui: {w}.", "Not available here: {w}.", w=why)),
                muted=True,
                wrap=True,
            )
        )
        lay.addWidget(c)

        # laboratorio
        c = Card(tr("Modalità laboratorio", "Lab mode"))
        c.header.addWidget(LabTag())
        self.lab_info = label("", wrap=True)
        c.body.addWidget(self.lab_info)
        c.body.addWidget(label(tr("Serve per: ", "Needed to: ") + "; ".join(str(a) for a in ACTIONS.values()) + ".", muted=True, wrap=True))
        self.btn_lab = QPushButton()
        self.btn_lab.clicked.connect(self._toggle_lab)
        row = QHBoxLayout()
        row.addWidget(self.btn_lab)
        row.addStretch(1)
        c.body.addLayout(row)
        lay.addWidget(c)

        # backup
        c = Card(tr("Copie di sicurezza (.polpobak)", "Backups (.polpobak)"))
        c.body.addWidget(
            label(
                tr(
                    "Tutto il contenuto della cassaforte in un solo file cifrato, con una password a parte: si può ripristinare anche su un altro computer.",
                    "All the vault content in one encrypted file with its own password: it can be restored on another computer too.",
                ),
                muted=True,
                wrap=True,
            )
        )
        row = QHBoxLayout()
        b1 = QPushButton(tr("Crea un backup…", "Create a backup…"))
        b1.clicked.connect(self._backup)
        b2 = QPushButton(tr("Ripristina un backup…", "Restore a backup…"))
        b2.clicked.connect(self._restore)
        row.addWidget(b1)
        row.addWidget(b2)
        row.addStretch(1)
        c.body.addLayout(row)
        self.backup_out = label("", wrap=True)
        c.body.addWidget(self.backup_out)
        lay.addWidget(c)
        lay.addStretch(1)

        bridge.event.connect(lambda topic, _p: self.refresh() if topic in ("lab.changed", "vault.unlocked", "activity.added") else None)
        self.refresh()

    # ---------------- stato ----------------

    def refresh(self) -> None:
        v = self.ctx.vault
        if v.unlocked:
            st = v.stats()
            self.vault_info.setText(
                tr(
                    "Aperta. {n} file ({b}), di cui {s} dal Polpo virtuale.\nCartella: {f}\nCifratura AES-256-GCM, chiavi da scrypt (N={k}).",
                    "Open. {n} files ({b}), {s} of them from the virtual Polpo.\nFolder: {f}\nAES-256-GCM encryption, keys from scrypt (N={k}).",
                    n=st["count"],
                    b=human_bytes(st["bytes"]),
                    s=st["simulated"],
                    f=v.folder,
                    k=v._keys.get("kdf", {}).get("n", "?"),
                )
            )
        self.pin_info.setText(
            tr("PIN impostato: sblocca lo schermo dopo una pausa.", "PIN set: it unlocks the screen after a pause.")
            if v.has_pin
            else tr("Nessun PIN: per sbloccare lo schermo serve la frase di accesso.", "No PIN: unlocking the screen needs the passphrase.")
        )
        self.btn_pin.setText(tr("Cambia PIN…", "Change PIN…") if v.has_pin else tr("Imposta un PIN…", "Set a PIN…"))
        self.btn_nopin.setEnabled(v.has_pin)
        lab = self.ctx.lab
        if lab.enabled:
            m, s = divmod(lab.remaining_s, 60)
            self.lab_info.setText(tr("ATTIVA: si spegne tra {m}:{s:02d}.", "ON: switches off in {m}:{s:02d}.", m=m, s=s))
            self.btn_lab.setText(tr("Disattiva ora", "Switch off now"))
        else:
            self.lab_info.setText(tr("Spenta. Trasmissioni, scritture e programmazione di schede sono bloccate.", "Off. Transmissions, writes and board flashing are blocked."))
            self.btn_lab.setText(tr("Attiva…", "Enable…"))

    # ---------------- azioni ----------------

    def _change_pass(self) -> None:
        d = _Form(self, tr("Cambia frase di accesso", "Change passphrase"), [tr("Frase attuale", "Current passphrase"), tr("Nuova frase", "New passphrase"), tr("Ripeti", "Repeat")])
        if d.exec() != QDialog.DialogCode.Accepted:
            return
        old, new, again = d.values()
        if new != again:
            QMessageBox.warning(self, "Polpo Studio", tr("Le due frasi nuove non coincidono.", "The two new phrases differ."))
            return
        if crypto.passphrase_problems(new):
            QMessageBox.warning(self, "Polpo Studio", tr("La nuova frase deve avere almeno 12 caratteri e non essere ripetitiva.", "The new phrase needs at least 12 characters and must not be repetitive."))
            return
        try:
            busy(lambda: self.ctx.vault.change_passphrase(old, new))
        except VaultError as e:
            QMessageBox.warning(self, "Polpo Studio", str(e))
            return
        self.ctx.activity.add("sicurezza", tr("Frase di accesso cambiata", "Passphrase changed"), "ok")
        QMessageBox.information(self, "Polpo Studio", tr("Frase di accesso cambiata.", "Passphrase changed."))

    def _new_recovery(self) -> None:
        if QMessageBox.question(self, "Polpo Studio", tr("La chiave di recupero attuale smetterà di funzionare. Continuare?", "The current recovery key will stop working. Continue?")) != QMessageBox.StandardButton.Yes:
            return
        key = [""]
        busy(lambda: key.__setitem__(0, self.ctx.vault.new_recovery_key()))
        self.ctx.activity.add("sicurezza", tr("Nuova chiave di recupero creata", "New recovery key created"), "avviso")
        box = QMessageBox(self)
        box.setWindowTitle(tr("Nuova chiave di recupero", "New recovery key"))
        box.setText(tr("Conservala in un posto sicuro:", "Store it somewhere safe:"))
        box.setInformativeText(key[0])
        box.setTextInteractionFlags(box.textInteractionFlags())
        box.exec()

    def _verify(self) -> None:
        problems: list[str] = []
        busy(lambda: problems.extend(f"{p.item_id[:8]}: {p.what}" for p in self.ctx.vault.verify()))
        if self.ctx.audit is not None:
            problems += [tr("registro: ", "log: ") + p for p in self.ctx.audit.verify()]
        if problems:
            self.verify_out.setText(tr("Problemi trovati:\n", "Problems found:\n") + "\n".join(problems))
            self.ctx.activity.add("sicurezza", tr("Verifica integrità: {n} problemi", "Integrity check: {n} problems", n=len(problems)), "errore")
        else:
            self.verify_out.setText(tr("Tutto integro: file e registro attività non sono stati alterati.", "All intact: files and activity log have not been altered."))
            self.ctx.activity.add("sicurezza", tr("Verifica integrità: nessun problema", "Integrity check: no problems"), "ok")

    def _set_pin(self) -> None:
        d = _Form(self, tr("PIN", "PIN"), [tr("Nuovo PIN (4–12 cifre)", "New PIN (4–12 digits)"), tr("Ripeti", "Repeat")])
        if d.exec() != QDialog.DialogCode.Accepted:
            return
        a, b = d.values()
        if a != b:
            QMessageBox.warning(self, "Polpo Studio", tr("I due PIN non coincidono.", "The two PINs differ."))
            return
        try:
            self.ctx.vault.set_pin(a)
        except VaultError as e:
            QMessageBox.warning(self, "Polpo Studio", str(e))
            return
        self.ctx.activity.add("sicurezza", tr("PIN impostato", "PIN set"), "ok")
        self.refresh()

    def _clear_pin(self) -> None:
        self.ctx.vault.clear_pin()
        self.ctx.activity.add("sicurezza", tr("PIN tolto", "PIN removed"), "avviso")
        self.refresh()

    def _remember(self, on: bool) -> None:
        try:
            self.ctx.vault.remember_on_this_computer(on)
        except VaultError as e:
            QMessageBox.warning(self, "Polpo Studio", str(e))
            self.remember.setChecked(False)
            return
        self.ctx.settings.set("remember_key", on)
        self.ctx.activity.add(
            "sicurezza",
            tr("Cassaforte ricordata su questo computer", "Vault remembered on this computer") if on else tr("Cassaforte non più ricordata", "Vault no longer remembered"),
            "avviso",
        )

    def _toggle_lab(self) -> None:
        if self.ctx.lab.enabled:
            self.ctx.lab.disable()
            self.ctx.activity.add("sicurezza", tr("Modalità laboratorio disattivata", "Lab mode disabled"), "info")
        else:
            LabModeDialog(self.ctx, self).exec()
        self.refresh()

    def _backup(self) -> None:
        d = _Form(self, tr("Password del backup", "Backup password"), [tr("Password (almeno 8 caratteri)", "Password (at least 8 characters)"), tr("Ripeti", "Repeat")])
        if d.exec() != QDialog.DialogCode.Accepted:
            return
        a, b = d.values()
        if a != b:
            QMessageBox.warning(self, "Polpo Studio", tr("Le due password non coincidono.", "The two passwords differ."))
            return
        path, _ = QFileDialog.getSaveFileName(self, tr("Salva il backup", "Save the backup"), "polpo-studio.polpobak", "Backup Polpo (*.polpobak)")
        if not path:
            return
        n = [0]
        try:
            busy(lambda: n.__setitem__(0, export_backup(self.ctx.vault, Path(path), a, kdf_n=self.ctx.vault.kdf_n)))
        except (BackupError, OSError) as e:
            QMessageBox.warning(self, "Polpo Studio", str(e))
            return
        self.backup_out.setText(tr("Backup creato: {n} file in {p}", "Backup created: {n} files in {p}", n=n[0], p=path))
        self.ctx.activity.add("sicurezza", tr("Backup creato ({n} file)", "Backup created ({n} files)", n=n[0]), "ok")

    def _restore(self) -> None:
        path, _ = QFileDialog.getOpenFileName(self, tr("Apri un backup", "Open a backup"), "", "Backup Polpo (*.polpobak)")
        if not path:
            return
        d = _Form(self, tr("Password del backup", "Backup password"), [tr("Password", "Password")])
        if d.exec() != QDialog.DialogCode.Accepted:
            return
        res = [(0, 0)]
        try:
            busy(lambda: res.__setitem__(0, import_backup(self.ctx.vault, Path(path), d.values()[0])))
        except (BackupError, OSError, ValueError) as e:
            QMessageBox.warning(self, "Polpo Studio", str(e))
            return
        added, skipped = res[0]
        self.backup_out.setText(tr("Ripristinati {a} file, {s} già presenti.", "Restored {a} files, {s} already present.", a=added, s=skipped))
        self.ctx.activity.add("sicurezza", tr("Backup ripristinato: {a} file", "Backup restored: {a} files", a=added), "ok")
        self.ctx.bus.publish("vault.changed")
