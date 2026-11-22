"""Copia i file di sd_template/ dentro simulator/index.html (costante SAMPLES).

Così la microSD iniziale del simulatore coincide con quella che il firmware crea
al primo avvio. Uso: python3 scripts/sim_samples.py (dalla cartella polpo/).
"""
import json
import pathlib
import re

ROOT = pathlib.Path(__file__).resolve().parent.parent
TEMPLATE = ROOT / "sd_template"
PAGE = ROOT / "simulator" / "index.html"

samples = {}
for f in sorted(TEMPLATE.rglob("*")):
    if f.is_file() and f.name != ".gitkeep":
        samples["/" + f.relative_to(TEMPLATE).as_posix()] = f.read_text(encoding="utf-8")

page = PAGE.read_text(encoding="utf-8")
blob = json.dumps(samples, ensure_ascii=False).replace("</", "<\\/")
page, n = re.subn(r"(const SAMPLES = /\*__SAMPLES__\*/).*?;\n", lambda m: m.group(1) + blob + ";\n", page, count=1, flags=re.S)
if n != 1:
    raise SystemExit("segnaposto SAMPLES non trovato")
PAGE.write_text(page, encoding="utf-8")
print("inseriti %d file: %s" % (len(samples), ", ".join(samples)))
