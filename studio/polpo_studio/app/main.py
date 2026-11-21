"""Avvio di Polpo Studio."""

from __future__ import annotations

import argparse
import os
import sys
from pathlib import Path

from .. import APP_NAME, __version__


def build_parser() -> argparse.ArgumentParser:
    ap = argparse.ArgumentParser(prog="polpo-studio", description=f"{APP_NAME}: il programma per PC del Polpo.")
    ap.add_argument("--virtuale", action="store_true", help="collega subito il Polpo virtuale (SIMULATO)")
    ap.add_argument("--dati", metavar="CARTELLA", help="cartella dei dati dell'utente")
    ap.add_argument("--lingua", choices=["it", "en"], help="lingua dell'interfaccia")
    ap.add_argument("--version", action="version", version=f"{APP_NAME} {__version__}")
    return ap


def main(argv: list[str] | None = None) -> int:
    args = build_parser().parse_args(argv)
    if args.dati:
        os.environ["POLPO_STUDIO_HOME"] = str(Path(args.dati).expanduser())

    from PySide6.QtWidgets import QApplication

    from ..core.logsetup import setup_logging
    from .context import AppContext
    from .main_window import MainWindow
    from .security_dialogs import unlock_or_setup
    from .themes import stylesheet

    ctx = AppContext.create()
    setup_logging(ctx.data_dir / "log")
    if args.lingua:
        ctx.settings.set("language", args.lingua)
    app = QApplication.instance() or QApplication(sys.argv[:1])
    app.setApplicationName(APP_NAME)
    app.setApplicationVersion(__version__)
    app.setOrganizationName("Polpo")
    app.setStyle("Fusion")
    s = ctx.settings
    app.setStyleSheet(stylesheet(s.get("theme"), s.get("accent"), s.get("font_scale")))
    if not unlock_or_setup(ctx):
        ctx.shutdown()
        return 0
    win = MainWindow(ctx)
    win.show()
    if args.virtuale:
        win.connect_virtual()
    rc = app.exec()
    ctx.shutdown()
    return rc
