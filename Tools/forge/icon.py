#!/usr/bin/env python3
"""Genera l'icona dell'app a partire dagli sprite: 1024x1024 per iOS e 192x192 per Android.
Sono gli unici PNG del repository.

Uso: python3 Tools/forge/icon.py
"""
import math
import os
import sys

from PIL import Image

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(os.path.dirname(HERE))
sys.path.insert(0, HERE)

from forge import read_spr, render_rows  # noqa: E402

SPRITES = os.path.join(ROOT, "MareaProfonda", "Resources", "Sprites")
TARGET = os.path.join(ROOT, "MareaProfonda", "Resources", "Assets.xcassets", "AppIcon.appiconset", "AppIcon.png")
# La stessa scena, ingrandita 3 volte, è l'icona dell'app Android.
ANDROID = os.path.join(ROOT, "Android", "res", "mipmap-xxxhdpi", "ic_launcher.png")

N = 64  # l'icona è una scena di 64x64 pixel d'arte ingrandita 16 volte


def lerp(a, b, t):
    return tuple(round(a[i] + (b[i] - a[i]) * t) for i in range(3))


def main() -> None:
    top, mid, bottom = (86, 214, 208), (28, 132, 170), (11, 40, 84)
    img = Image.new("RGB", (N, N))
    px = img.load()
    for y in range(N):
        band = (y // 3) * 3 / (N - 1)          # fasce di tre righe: sfumatura "a pixel"
        base = lerp(top, mid, band / 0.5) if band < 0.5 else lerp(mid, bottom, (band - 0.5) / 0.5)
        for x in range(N):
            c = base
            # raggi di luce obliqui, più forti in alto
            s = (x + y * 0.55) % 17
            if s < 4.5 and y < 46:
                k = (1 - y / 46) * 0.22
                c = lerp(c, (255, 246, 205), k)
            px[x, y] = c
    # fondale: profilo di roccia e ciuffi di posidonia
    for x in range(N):
        h = 7 + 3 * math.sin(x * 0.21 + 0.6) + 2 * math.sin(x * 0.53 + 2.0)
        ground = N - int(round(h))
        for y in range(ground, N):
            px[x, y] = (9, 28, 62) if y > ground else (20, 60, 98)
        if x % 5 == 2:
            blade = 5 + (x * 7) % 5
            for i in range(blade):
                yy = ground - 1 - i
                xx = x + (1 if i > blade // 2 and (x // 5) % 2 == 0 else 0)
                if 0 <= xx < N and yy >= 0:
                    px[xx, yy] = (24, 98, 96) if i < blade - 1 else (58, 150, 120)

    palettes, sprites, _ = read_spr(os.path.join(SPRITES, "tecla.spr"))
    tecla = next(s for s in sprites if s["name"] == "tecla_swim_2")
    figure = render_rows(tecla["rows"], palettes[tecla["palette"]])
    img = img.convert("RGBA")
    img.alpha_composite(figure, (4, 17))
    # bolle davanti al viso
    px = img.load()
    for bx, by in ((57, 19), (60, 14), (58, 9), (61, 5)):
        if 0 <= bx < N and 0 <= by < N:
            px[bx, by] = (232, 250, 255, 255)
    for bx, by in ((59, 13), (61, 13), (60, 12), (60, 15)):
        px[bx, by] = (190, 235, 247, 255)

    big = img.convert("RGB").resize((1024, 1024), Image.NEAREST)
    os.makedirs(os.path.dirname(TARGET), exist_ok=True)
    big.save(TARGET, optimize=True)
    os.makedirs(os.path.dirname(ANDROID), exist_ok=True)
    img.resize((N * 3, N * 3), Image.NEAREST).save(ANDROID, optimize=True)
    print("icona:", TARGET, os.path.getsize(TARGET), "byte")


if __name__ == "__main__":
    main()
