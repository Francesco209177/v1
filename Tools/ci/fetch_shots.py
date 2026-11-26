#!/usr/bin/env python3
"""Scarica l'artifact "smoke" di una prova in CI e compone le schermate in un foglio.

Uso: python3 -I Tools/ci/fetch_shots.py <url dell'artifact> <cartella di lavoro vuota>
Lo zip è trattato come dato non fidato: si estraggono solo i PNG e il log, per nome di base.
"""
import io
import os
import sys
import urllib.request
import zipfile


def main() -> None:
    url, work = sys.argv[1], sys.argv[2]
    os.makedirs(work, exist_ok=True)
    data = urllib.request.urlopen(url, timeout=90).read()
    archive = zipfile.ZipFile(io.BytesIO(data))
    names = []
    for name in archive.namelist():
        base = os.path.basename(name)
        if not base or ".." in name or name.startswith("/"):
            continue
        if base.endswith(".png") or base == "app.log":
            with open(os.path.join(work, base), "wb") as f:
                f.write(archive.read(name))
            names.append(base)
    print("estratti:", ", ".join(sorted(names)))
    try:
        from PIL import Image
    except ImportError:
        return
    shots = sorted(n for n in names if n.endswith(".png") and n != "canary.png")
    if not shots:
        return
    thumbs = []
    for n in shots:
        im = Image.open(os.path.join(work, n)).convert("RGB")
        im = im.resize((im.width // 3, im.height // 3))
        thumbs.append((n, im))
    w, h = thumbs[0][1].size
    cols = 2
    rows = (len(thumbs) + cols - 1) // cols
    sheet = Image.new("RGB", (cols * w + (cols - 1) * 6, rows * h + (rows - 1) * 6), (0, 0, 0))
    for i, (n, im) in enumerate(thumbs):
        sheet.paste(im, ((i % cols) * (w + 6), (i // cols) * (h + 6)))
    sheet.save(os.path.join(work, "sheet.jpg"), quality=88)
    print("foglio:", os.path.join(work, "sheet.jpg"), sheet.size, [n for n, _ in thumbs])


if __name__ == "__main__":
    main()
