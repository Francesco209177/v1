"""Fogli di anteprima: rasterizza i file .spr come farà il gioco e li impagina in PNG."""
from __future__ import annotations

import os

from PIL import Image, ImageDraw

from forge import read_spr, render_rows


def load_all(spr_dir: str):
    palettes: dict = {}
    sprites: list[dict] = []
    variants: list = []
    for name in sorted(os.listdir(spr_dir)):
        if not name.endswith(".spr"):
            continue
        p, s, v = read_spr(os.path.join(spr_dir, name))
        palettes.update(p)
        for sp in s:
            sp["file"] = name
        sprites.extend(s)
        variants.extend(v)
    return palettes, sprites, variants


def contact_sheet(spr_dir: str, out_path: str, prefixes: list[str] | None = None, scale: int = 4,
                  width: int = 1500, bg=(34, 74, 104), label: bool = True, files: list[str] | None = None) -> int:
    palettes, sprites, _ = load_all(spr_dir)
    chosen = []
    for sp in sprites:
        if files is not None and sp["file"] not in files:
            continue
        if prefixes is not None and not any(sp["name"].startswith(p) for p in prefixes):
            continue
        chosen.append(sp)
    if not chosen:
        return 0
    pad, text_h = 8, 12 if label else 0
    x, y, row_h = pad, pad, 0
    places = []
    for sp in chosen:
        w, h = sp["w"] * scale, sp["h"] * scale
        cell_w = max(w, 8 * len(sp["name"]) // 2 if label else w)
        if x + cell_w + pad > width:
            x, y, row_h = pad, y + row_h + text_h + pad, 0
        places.append((sp, x, y))
        x += cell_w + pad
        row_h = max(row_h, h)
    height = y + row_h + text_h + pad
    sheet = Image.new("RGBA", (width, height), bg + (255,))
    # scacchiera leggera per leggere bene le trasparenze
    d = ImageDraw.Draw(sheet)
    step = 16
    for cy in range(0, height, step):
        for cx in range(0, width, step):
            if (cx // step + cy // step) % 2 == 0:
                d.rectangle([cx, cy, cx + step - 1, cy + step - 1], fill=(bg[0] + 8, bg[1] + 8, bg[2] + 8, 255))
    for sp, px, py in places:
        img = render_rows(sp["rows"], palettes[sp["palette"]], scale)
        sheet.alpha_composite(img, (px, py))
        if label:
            d.text((px, py + sp["h"] * scale + 1), sp["name"], fill=(230, 240, 250, 255))
    os.makedirs(os.path.dirname(out_path), exist_ok=True)
    sheet.convert("RGB").save(out_path)
    return len(chosen)


def strip(spr_dir: str, out_path: str, prefix: str, scale: int = 6, bg=(34, 74, 104)) -> int:
    """Una riga con i fotogrammi `prefix_0..n` affiancati, per valutare un'animazione."""
    palettes, sprites, _ = load_all(spr_dir)
    frames = sorted((s for s in sprites if s["name"].startswith(prefix + "_") and s["name"][len(prefix) + 1:].isdigit()),
                    key=lambda s: int(s["name"].rsplit("_", 1)[1]))
    if not frames:
        return 0
    w = sum(f["w"] for f in frames) * scale + 8 * (len(frames) + 1)
    h = max(f["h"] for f in frames) * scale + 16
    img = Image.new("RGBA", (w, h), bg + (255,))
    x = 8
    for f in frames:
        img.alpha_composite(render_rows(f["rows"], palettes[f["palette"]], scale), (x, 8))
        x += f["w"] * scale + 8
    os.makedirs(os.path.dirname(out_path), exist_ok=True)
    img.convert("RGB").save(out_path)
    return len(frames)
