"""Come lanciare esptool: con Python da sorgente, oppure dal programma stesso quando è impacchettato."""

from __future__ import annotations

import sys


def frozen() -> bool:
    return bool(getattr(sys, "frozen", False))


def esptool_argv(args: list[str]) -> list[str]:
    """Riga di comando completa (programma + argomenti) per eseguire esptool con ``args``."""
    if frozen():
        return [sys.executable, "--esptool", *args]
    return [sys.executable, "-m", "esptool", *args]


def run_embedded(args: list[str]) -> int:
    """Usato da ``PolpoStudio --esptool ...`` nel pacchetto: esegue esptool nello stesso processo."""
    import esptool

    try:
        esptool.main(args)
    except SystemExit as e:
        return int(e.code or 0)
    except Exception as e:  # noqa: BLE001 - errore mostrato nel registro di esptool
        print(f"esptool: {e}", file=sys.stderr)
        return 2
    return 0
