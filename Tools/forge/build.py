#!/usr/bin/env python3
"""Rigenera tutti i file .spr del gioco e i fogli di anteprima.

Uso:  python3 Tools/forge/build.py            (dalla radice del repository)
Scrive in MareaProfonda/Resources/Sprites/ e in Tools/forge/out/ (anteprime, non versionate).
"""
import importlib
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(os.path.dirname(HERE))
SPRITES = os.path.join(ROOT, "MareaProfonda", "Resources", "Sprites")
OUT = os.path.join(HERE, "out")
sys.path.insert(0, HERE)

# Ogni modulo espone build(out_dir) -> percorso del file scritto.
MODULES = ["font", "tecla", "sea_props", "ui_icons", "fish", "people", "osteria", "creatures"]


def main() -> None:
    import sheet

    only = set(sys.argv[1:])
    written = []
    for name in MODULES:
        if only and name not in only:
            continue
        try:
            module = importlib.import_module(name)
        except ModuleNotFoundError as exc:
            if exc.name == name:
                continue
            raise
        written.append(module.build(SPRITES))
    for path in written:
        base = os.path.basename(path)
        n = sheet.contact_sheet(SPRITES, os.path.join(OUT, base.replace(".spr", ".png")), files=[base])
        print(f"{base}: {n} sprite")


if __name__ == "__main__":
    main()
