"""Sistema delle app: manifest, permessi dichiarati, compatibilità hardware, integrità.

* **App integrate**: fanno parte del programma (``polpo_studio/apps``).
* **App di terze parti**: cartelle con ``manifest.json`` e ``main.py`` installate nella cartella dei
  dati. Si usano SOLO in modalità laboratorio, sono segnate Sperimentali e NON sono isolate: il
  loro codice gira con gli stessi permessi di Polpo Studio. I permessi del manifest limitano solo
  ciò che passa dall'interfaccia ``AppApi``; un'app scritta male o malevola può aggirarli.
  All'installazione si registra l'impronta SHA-256 di ogni file: un'app modificata dopo
  l'installazione non viene più aperta.
"""

from __future__ import annotations

import hashlib
import importlib.util
import json
import re
import shutil
import sys
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

from .capability import Capability, Route
from .i18n import T

PERMISSIONS: dict[str, T] = {
    "polpo.info": T("leggere informazioni e stato del Polpo", "read Polpo info and status"),
    "polpo.ir": T("inviare segnali infrarossi con il Polpo", "send infrared signals with the Polpo"),
    "polpo.radio.rx": T("ricevere codici radio con il Polpo", "receive radio codes with the Polpo"),
    "polpo.nfc.read": T("leggere tag NFC con il Polpo", "read NFC tags with the Polpo"),
    "polpo.files.read": T("leggere file dalla microSD del Polpo", "read files from the Polpo microSD"),
    "vault.read": T("leggere file della cassaforte (solo le categorie indicate)", "read vault files (listed categories only)"),
    "vault.write": T("salvare file nella cassaforte (solo le categorie indicate)", "save files in the vault (listed categories only)"),
}

# Comandi di Polpo Link concessi da ciascun permesso. Nessun permesso concede trasmissioni o scritture.
COMMANDS_BY_PERMISSION = {
    "polpo.info": {"info", "diag"},
    "polpo.ir": {"ir.send"},
    "polpo.radio.rx": {"rf.rx.start", "rf.rx.stop"},
    "polpo.nfc.read": {"nfc.read"},
    "polpo.files.read": {"fs.list", "fs.read"},
}
APP_CATEGORIES = ("strumenti", "convertitori", "analizzatori", "radio", "nfc", "infrarossi", "elettronica", "altro")
_ID_RE = re.compile(r"^[a-z][a-z0-9_]{2,40}$")


class AppError(Exception):
    pass


@dataclass
class Manifest:
    id: str
    name: str
    description: str
    version: str
    category: str
    author: str
    icon: str = "apps"
    permissions: list[str] = field(default_factory=list)
    hardware: list[list[str]] = field(default_factory=list)  # alternative di hardware richiesto
    vault_categories: list[str] = field(default_factory=list)
    builtin: bool = False
    experimental: bool = False
    path: Path | None = None

    def capability(self) -> Capability:
        return Capability(
            "app." + self.id,
            T(self.name, self.name),
            T(self.description, self.description),
            tuple(Route(tuple(h)) for h in self.hardware),
            experimental=self.experimental or not self.builtin,
            needs_lab=not self.builtin,
        )


def parse_manifest(data: dict[str, Any], *, builtin: bool = False, path: Path | None = None) -> Manifest:
    from .hardware import SPECS

    def need(key: str, kind: type = str) -> Any:
        v = data.get(key)
        if not isinstance(v, kind) or (kind is str and not v.strip()):
            raise AppError(f"manifest: campo «{key}» mancante o non valido")
        return v

    app_id = need("id")
    if not _ID_RE.match(app_id):
        raise AppError("manifest: id con lettere minuscole, cifre e _ (3-41 caratteri)")
    perms = data.get("permissions", [])
    if not isinstance(perms, list) or any(p not in PERMISSIONS for p in perms):
        raise AppError(f"manifest: permessi sconosciuti {[p for p in perms if p not in PERMISSIONS]}")
    hw = data.get("hardware", [])
    if not isinstance(hw, list) or any(not isinstance(alt, list) or any(h not in SPECS for h in alt) for alt in hw):
        raise AppError("manifest: «hardware» deve essere una lista di alternative con id hardware noti")
    from ..security.vault import CATEGORIES

    cats = data.get("vault_categories", [])
    if not isinstance(cats, list) or any(c not in CATEGORIES for c in cats):
        raise AppError("manifest: categorie della cassaforte sconosciute")
    category = data.get("category", "altro")
    return Manifest(
        app_id,
        need("name")[:60],
        need("description")[:400],
        need("version")[:20],
        category if category in APP_CATEGORIES else "altro",
        need("author")[:80],
        str(data.get("icon", "apps")),
        list(perms),
        [list(a) for a in hw],
        list(cats),
        builtin,
        bool(data.get("experimental", False)),
        path,
    )


# ---------------- interfaccia offerta alle app ----------------


class AppApi:
    """Ciò che un'app può chiedere a Polpo Studio. I controlli valgono per chi usa questa interfaccia."""

    def __init__(self, ctx, manifest: Manifest, say=None) -> None:
        self._ctx = ctx
        self.manifest = manifest
        self._say = say

    def _check(self, perm: str) -> None:
        if perm not in self.manifest.permissions:
            raise PermissionError(f"l'app «{self.manifest.name}» non ha dichiarato il permesso {perm}")

    def request(self, cmd: str, args: dict | None = None):
        allowed = set().union(*(COMMANDS_BY_PERMISSION.get(p, set()) for p in self.manifest.permissions)) if self.manifest.permissions else set()
        if cmd not in allowed:
            raise PermissionError(f"comando {cmd} non concesso all'app «{self.manifest.name}»")
        return self._ctx.devices.request(cmd, args)

    def vault_items(self, category: str):
        self._check("vault.read")
        if category not in self.manifest.vault_categories:
            raise PermissionError(f"categoria {category} non dichiarata")
        return self._ctx.vault.items(category)

    def vault_get(self, item_id: str) -> bytes:
        self._check("vault.read")
        it = self._ctx.vault.item(item_id)
        if it.category not in self.manifest.vault_categories:
            raise PermissionError(f"categoria {it.category} non dichiarata")
        return self._ctx.vault.get(item_id)

    def vault_put(self, category: str, name: str, data: bytes):
        self._check("vault.write")
        if category not in self.manifest.vault_categories:
            raise PermissionError(f"categoria {category} non dichiarata")
        item = self._ctx.vault.put(category, name, data, meta={"app": self.manifest.id})
        self._ctx.bus.publish("vault.changed")
        return item

    def log(self, message: str, level: str = "info") -> None:
        self._ctx.activity.add("app", f"[{self.manifest.name}] {message}", level, self._ctx.devices.simulated)

    def say(self, message: str) -> None:
        if self._say:
            self._say(message)


# ---------------- app di terze parti ----------------


def _hashes(folder: Path) -> dict[str, str]:
    out = {}
    for p in sorted(folder.rglob("*")):
        if p.is_file() and "__pycache__" not in p.parts:
            out[p.relative_to(folder).as_posix()] = hashlib.sha256(p.read_bytes()).hexdigest()
    return out


class ThirdPartyApps:
    def __init__(self, folder: Path, settings) -> None:
        self.folder = folder
        self.settings = settings

    def _records(self) -> dict[str, Any]:
        return self.settings.get("third_party_apps")

    def installed(self) -> list[Manifest]:
        out = []
        for app_id in self._records():
            d = self.folder / app_id
            try:
                out.append(parse_manifest(json.loads((d / "manifest.json").read_text(encoding="utf-8")), path=d))
            except (OSError, ValueError, AppError):
                continue
        return out

    def read_candidate(self, source: Path) -> Manifest:
        mf = source / "manifest.json"
        if not mf.is_file() or not (source / "main.py").is_file():
            raise AppError("la cartella deve contenere manifest.json e main.py")
        try:
            data = json.loads(mf.read_text(encoding="utf-8"))
        except ValueError as e:
            raise AppError(f"manifest.json non valido: {e}") from e
        return parse_manifest(data, path=source)

    def install(self, source: Path) -> Manifest:
        m = self.read_candidate(source)
        total = sum(p.stat().st_size for p in source.rglob("*") if p.is_file())
        if total > 5 * 1024 * 1024:
            raise AppError("app troppo grande (max 5 MB)")
        dest = self.folder / m.id
        if dest.exists():
            shutil.rmtree(dest)
        shutil.copytree(source, dest, ignore=shutil.ignore_patterns("__pycache__", "*.pyc"))
        recs = self._records()
        recs[m.id] = {"version": m.version, "sha256": _hashes(dest)}
        self.settings.set("third_party_apps", recs)
        m.path = dest
        return m

    def uninstall(self, app_id: str) -> None:
        recs = self._records()
        recs.pop(app_id, None)
        self.settings.set("third_party_apps", recs)
        shutil.rmtree(self.folder / app_id, ignore_errors=True)

    def verify(self, app_id: str) -> list[str]:
        rec = self._records().get(app_id)
        if rec is None:
            return ["app non installata"]
        now = _hashes(self.folder / app_id)
        problems = [f"{f}: modificato" for f, h in rec["sha256"].items() if now.get(f) != h]
        problems += [f"{f}: aggiunto dopo l'installazione" for f in now if f not in rec["sha256"]]
        return problems

    def load(self, m: Manifest):
        """Importa ``main.py`` dell'app (solo se integra). Restituisce il modulo."""
        problems = self.verify(m.id)
        if problems:
            raise AppError("app modificata dopo l'installazione: " + "; ".join(problems))
        assert m.path is not None
        name = f"polpo_app_{m.id}"
        spec = importlib.util.spec_from_file_location(name, m.path / "main.py")
        if spec is None or spec.loader is None:
            raise AppError("main.py non caricabile")
        mod = importlib.util.module_from_spec(spec)
        sys.modules[name] = mod
        try:
            spec.loader.exec_module(mod)
        except Exception as e:  # noqa: BLE001 - errore del codice dell'app
            sys.modules.pop(name, None)
            raise AppError(f"errore nel codice dell'app: {e}") from e
        if not callable(getattr(mod, "create", None)):
            raise AppError("main.py deve definire create(api)")
        return mod
