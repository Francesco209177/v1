"""Marea Profonda — fucina degli sprite (strumento di authoring).

Le forme si disegnano in unità di "pixel d'arte" con coordinate decimali; la
tela le campiona a risoluzione maggiore e sceglie per ogni pixel il colore di
maggioranza. Il risultato è una matrice di caratteri (un carattere = una voce
di palette) che viene scritta nei file .spr letti dal gioco.

Il gioco non usa mai questo strumento: legge soltanto i file .spr.
"""
from __future__ import annotations

import math
import os
from collections import Counter

from PIL import Image, ImageDraw

TRANSPARENT = "."


# ----------------------------------------------------------------------------
# Palette
# ----------------------------------------------------------------------------
class Palette:
    """Palette indicizzata: un carattere ASCII per colore."""

    def __init__(self, name: str, entries: dict[str, str]):
        self.name = name
        self.entries: dict[str, tuple[int, int, int, int]] = {}
        for key, value in entries.items():
            if len(key) != 1 or key in (TRANSPARENT, " ", "#"):
                raise ValueError(f"chiave di palette non valida: {key!r}")
            self.entries[key] = parse_hex(value)

    def keys(self) -> list[str]:
        return list(self.entries.keys())

    def rgba(self, key: str) -> tuple[int, int, int, int]:
        if key == TRANSPARENT:
            return (0, 0, 0, 0)
        return self.entries[key]


def parse_hex(value: str) -> tuple[int, int, int, int]:
    v = value.lstrip("#")
    if len(v) == 6:
        v += "ff"
    if len(v) != 8:
        raise ValueError(f"colore non valido: {value}")
    return tuple(int(v[i:i + 2], 16) for i in (0, 2, 4, 6))  # type: ignore[return-value]


def mix_hex(a: str, b: str, t: float) -> str:
    ca, cb = parse_hex(a), parse_hex(b)
    return "#%02x%02x%02x" % tuple(round(ca[i] + (cb[i] - ca[i]) * t) for i in range(3))


# ----------------------------------------------------------------------------
# Griglia di pixel d'arte (dopo il campionamento)
# ----------------------------------------------------------------------------
class Grid:
    def __init__(self, w: int, h: int, fill: str = TRANSPARENT):
        self.w, self.h = w, h
        self.px = [[fill] * w for _ in range(h)]

    def copy(self) -> "Grid":
        g = Grid(self.w, self.h)
        g.px = [row[:] for row in self.px]
        return g

    def get(self, x: int, y: int) -> str:
        if 0 <= x < self.w and 0 <= y < self.h:
            return self.px[y][x]
        return TRANSPARENT

    def set(self, x: int, y: int, key: str) -> None:
        if 0 <= x < self.w and 0 <= y < self.h:
            self.px[y][x] = key

    def rows(self) -> list[str]:
        return ["".join(r) for r in self.px]

    @staticmethod
    def from_rows(rows: list[str]) -> "Grid":
        g = Grid(len(rows[0]), len(rows))
        for y, row in enumerate(rows):
            if len(row) != g.w:
                raise ValueError(f"riga {y} larga {len(row)}, attesa {g.w}")
            g.px[y] = list(row)
        return g

    def stamp(self, x: int, y: int, rows: list[str]) -> None:
        """Sovrascrive con pixel fatti a mano. Lo spazio lascia intatto, '.' cancella."""
        for dy, row in enumerate(rows):
            for dx, ch in enumerate(row):
                if ch != " ":
                    self.set(x + dx, y + dy, ch)

    def blit(self, other: "Grid", x: int, y: int) -> None:
        for dy in range(other.h):
            for dx in range(other.w):
                ch = other.px[dy][dx]
                if ch != TRANSPARENT:
                    self.set(x + dx, y + dy, ch)

    def flipped_h(self) -> "Grid":
        g = Grid(self.w, self.h)
        g.px = [list(reversed(r)) for r in self.px]
        return g

    def replace(self, mapping: dict[str, str]) -> "Grid":
        g = Grid(self.w, self.h)
        g.px = [[mapping.get(c, c) for c in r] for r in self.px]
        return g

    def crop(self, x: int, y: int, w: int, h: int) -> "Grid":
        g = Grid(w, h)
        for yy in range(h):
            for xx in range(w):
                g.px[yy][xx] = self.get(x + xx, y + yy)
        return g

    def bounds(self) -> tuple[int, int, int, int]:
        xs = [x for y in range(self.h) for x in range(self.w) if self.px[y][x] != TRANSPARENT]
        ys = [y for y in range(self.h) for x in range(self.w) if self.px[y][x] != TRANSPARENT]
        if not xs:
            return (0, 0, 0, 0)
        return (min(xs), min(ys), max(xs) + 1, max(ys) + 1)

    # -- rifiniture tipiche della pixel art --------------------------------
    def outline(self, key: str, mapping: dict[str, str] | None = None, diagonal: bool = False) -> "Grid":
        """Contorno esterno di un pixel. Con `mapping` il contorno prende un colore
        scelto in base al pixel vicino (outline selettiva)."""
        src = self.copy()
        neigh = [(1, 0), (-1, 0), (0, 1), (0, -1)]
        if diagonal:
            neigh += [(1, 1), (-1, 1), (1, -1), (-1, -1)]
        for y in range(self.h):
            for x in range(self.w):
                if src.px[y][x] != TRANSPARENT:
                    continue
                found = None
                for dx, dy in neigh:
                    c = src.get(x + dx, y + dy)
                    if c != TRANSPARENT:
                        found = c
                        break
                if found is not None:
                    self.px[y][x] = mapping.get(found, key) if mapping else key
        return self

    def rim(self, ramps: dict[str, tuple[str, str]], solid: set[str] | None = None) -> "Grid":
        """Luce dall'alto: il bordo superiore di ogni area prende il tono chiaro,
        quello inferiore il tono scuro. ramps: base -> (scuro, chiaro)."""
        src = self.copy()

        def empty(x: int, y: int) -> bool:
            c = src.get(x, y)
            if solid is not None:
                return c not in solid
            return c == TRANSPARENT

        for y in range(self.h):
            for x in range(self.w):
                c = src.px[y][x]
                if c not in ramps:
                    continue
                dark, light = ramps[c]
                if empty(x, y - 1):
                    if light:
                        self.px[y][x] = light
                elif empty(x, y + 1):
                    if dark:
                        self.px[y][x] = dark
        return self


# ----------------------------------------------------------------------------
# Tela vettoriale con campionamento a maggioranza
# ----------------------------------------------------------------------------
class Canvas:
    def __init__(self, w: int, h: int, palette: Palette, ss: int = 6):
        self.w, self.h, self.ss = w, h, ss
        self.palette = palette
        self.keys = [TRANSPARENT] + palette.keys()
        self.index = {k: i for i, k in enumerate(self.keys)}
        self.img = Image.new("L", (w * ss, h * ss), 0)
        self.d = ImageDraw.Draw(self.img)

    def _i(self, key: str) -> int:
        return self.index[key]

    def _p(self, pts):
        s = self.ss
        return [(x * s, y * s) for x, y in pts]

    def poly(self, pts, key: str) -> None:
        if len(pts) >= 3:
            self.d.polygon(self._p(pts), fill=self._i(key))

    def ellipse(self, cx: float, cy: float, rx: float, ry: float, key: str) -> None:
        s = self.ss
        self.d.ellipse([(cx - rx) * s, (cy - ry) * s, (cx + rx) * s, (cy + ry) * s], fill=self._i(key))

    def rot_ellipse(self, cx: float, cy: float, rx: float, ry: float, angle: float, key: str, n: int = 28) -> None:
        ca, sa = math.cos(angle), math.sin(angle)
        pts = []
        for i in range(n):
            t = 2 * math.pi * i / n
            x, y = rx * math.cos(t), ry * math.sin(t)
            pts.append((cx + x * ca - y * sa, cy + x * sa + y * ca))
        self.poly(pts, key)

    def rect(self, x0: float, y0: float, x1: float, y1: float, key: str) -> None:
        s = self.ss
        self.d.rectangle([x0 * s, y0 * s, x1 * s - 1, y1 * s - 1], fill=self._i(key))

    def capsule(self, x0: float, y0: float, x1: float, y1: float, r0: float, key: str, r1: float | None = None) -> None:
        """Segmento spesso con estremi arrotondati; r1 diverso da r0 lo rende affusolato."""
        if r1 is None:
            r1 = r0
        ang = math.atan2(y1 - y0, x1 - x0)
        nx, ny = -math.sin(ang), math.cos(ang)
        self.poly([(x0 + nx * r0, y0 + ny * r0), (x1 + nx * r1, y1 + ny * r1),
                   (x1 - nx * r1, y1 - ny * r1), (x0 - nx * r0, y0 - ny * r0)], key)
        self.ellipse(x0, y0, r0, r0, key)
        self.ellipse(x1, y1, r1, r1, key)

    def line(self, x0: float, y0: float, x1: float, y1: float, width: float, key: str) -> None:
        s = self.ss
        self.d.line([x0 * s, y0 * s, x1 * s, y1 * s], fill=self._i(key), width=max(1, round(width * s)))

    def curve(self, pts, width: float, key: str, taper: float = 1.0) -> None:
        """Linea spessa lungo una serie di punti; `taper` < 1 la assottiglia verso la fine."""
        n = len(pts)
        for i in range(n - 1):
            t0, t1 = i / (n - 1), (i + 1) / (n - 1)
            r0 = width / 2 * (1 + (taper - 1) * t0)
            r1 = width / 2 * (1 + (taper - 1) * t1)
            self.capsule(pts[i][0], pts[i][1], pts[i + 1][0], pts[i + 1][1], r0, key, r1)

    def paste_masked(self, other: "Canvas", mask_key: str | None = None, mask_keys: set[str] | None = None) -> None:
        """Copia `other` su questa tela solo dove questa tela ha già il colore indicato
        (serve per disegnare motivi che restano dentro la sagoma)."""
        keys = mask_keys if mask_keys is not None else ({mask_key} if mask_key else None)
        base = self.img.load()
        src = other.img.load()
        allowed = None if keys is None else {self._i(k) for k in keys}
        for y in range(self.img.height):
            for x in range(self.img.width):
                v = src[x, y]
                if v == 0:
                    continue
                if allowed is None:
                    if base[x, y] != 0:
                        base[x, y] = v
                elif base[x, y] in allowed:
                    base[x, y] = v

    def blank_like(self) -> "Canvas":
        return Canvas(self.w, self.h, self.palette, self.ss)

    def grid(self, threshold: float = 0.5) -> Grid:
        """Campiona: per ogni pixel d'arte vince il colore più presente, se la
        copertura non trasparente supera la soglia."""
        s = self.ss
        data = self.img.tobytes()
        stride = self.img.width
        g = Grid(self.w, self.h)
        need = threshold * s * s
        for y in range(self.h):
            for x in range(self.w):
                counts: Counter = Counter()
                for sy in range(s):
                    off = (y * s + sy) * stride + x * s
                    counts.update(data[off:off + s])
                opaque = s * s - counts.get(0, 0)
                if opaque >= need and opaque > 0:
                    counts.pop(0, None)
                    g.px[y][x] = self.keys[counts.most_common(1)[0][0]]
        return g


# ----------------------------------------------------------------------------
# Utilità geometriche
# ----------------------------------------------------------------------------
def rot(x: float, y: float, a: float, ox: float = 0.0, oy: float = 0.0) -> tuple[float, float]:
    ca, sa = math.cos(a), math.sin(a)
    dx, dy = x - ox, y - oy
    return (ox + dx * ca - dy * sa, oy + dx * sa + dy * ca)


def spline(points, steps: int = 8):
    """Catmull-Rom passante per i punti dati."""
    if len(points) < 3:
        return list(points)
    pts = [points[0]] + list(points) + [points[-1]]
    out = []
    for i in range(1, len(pts) - 2):
        p0, p1, p2, p3 = pts[i - 1], pts[i], pts[i + 1], pts[i + 2]
        for s in range(steps):
            t = s / steps
            t2, t3 = t * t, t * t * t
            x = 0.5 * ((2 * p1[0]) + (-p0[0] + p2[0]) * t + (2 * p0[0] - 5 * p1[0] + 4 * p2[0] - p3[0]) * t2 + (-p0[0] + 3 * p1[0] - 3 * p2[0] + p3[0]) * t3)
            y = 0.5 * ((2 * p1[1]) + (-p0[1] + p2[1]) * t + (2 * p0[1] - 5 * p1[1] + 4 * p2[1] - p3[1]) * t2 + (-p0[1] + 3 * p1[1] - 3 * p2[1] + p3[1]) * t3)
            out.append((x, y))
    out.append(points[-1])
    return out


# ----------------------------------------------------------------------------
# Scrittura e lettura dei file .spr
# ----------------------------------------------------------------------------
class Sprite:
    def __init__(self, name: str, grid: Grid, palette: str, ax: int | None = None, ay: int | None = None):
        self.name, self.grid, self.palette = name, grid, palette
        self.ax = grid.w // 2 if ax is None else ax
        self.ay = grid.h // 2 if ay is None else ay


class Sheet:
    """Un file .spr: palette, sprite e varianti di colore."""

    def __init__(self, title: str):
        self.title = title
        self.palettes: list[Palette] = []
        self.sprites: list[Sprite] = []
        self.variants: list[tuple[str, str, str]] = []

    def add_palette(self, pal: Palette) -> Palette:
        self.palettes.append(pal)
        return pal

    def add(self, name: str, grid: Grid, palette: Palette | str, ax: int | None = None, ay: int | None = None) -> None:
        pname = palette if isinstance(palette, str) else palette.name
        self.sprites.append(Sprite(name, grid, pname, ax, ay))

    def add_frames(self, prefix: str, grids: list[Grid], palette: Palette | str, ax: int | None = None, ay: int | None = None) -> None:
        for i, g in enumerate(grids):
            self.add(f"{prefix}_{i}", g, palette, ax, ay)

    def add_variant(self, new_prefix: str, source_prefix: str, palette: Palette | str) -> None:
        pname = palette if isinstance(palette, str) else palette.name
        self.variants.append((new_prefix, source_prefix, pname))

    def write(self, path: str) -> None:
        out = [f"# {self.title}", "# Generato da Tools/forge: non modificare a mano, rigenera con `python3 Tools/forge/build.py`.", ""]
        for pal in self.palettes:
            out.append(f"palette {pal.name}")
            for key, (r, g, b, a) in pal.entries.items():
                out.append(f"{key} {r:02x}{g:02x}{b:02x}{a:02x}")
            out.append("end")
            out.append("")
        for sp in self.sprites:
            out.append(f"sprite {sp.name} {sp.grid.w} {sp.grid.h} {sp.palette} ax={sp.ax} ay={sp.ay}")
            out.extend(sp.grid.rows())
            out.append("end")
            out.append("")
        for new_prefix, source_prefix, pname in self.variants:
            out.append(f"variant {new_prefix} {source_prefix} {pname}")
        os.makedirs(os.path.dirname(path), exist_ok=True)
        with open(path, "w", encoding="ascii", newline="\n") as f:
            f.write("\n".join(out).rstrip("\n") + "\n")


def read_spr(path: str):
    """Legge un file .spr esattamente come fa il gioco. Ritorna (palette, sprite, varianti)."""
    palettes: dict[str, dict[str, tuple[int, int, int, int]]] = {}
    sprites: list[dict] = []
    variants: list[tuple[str, str, str]] = []
    with open(path, encoding="ascii") as f:
        lines = f.read().split("\n")
    i = 0
    while i < len(lines):
        line = lines[i].rstrip("\r")
        i += 1
        if not line or line.startswith("#"):
            continue
        parts = line.split()
        if parts[0] == "palette":
            table: dict[str, tuple[int, int, int, int]] = {}
            while lines[i].strip() != "end":
                key, hexv = lines[i].split()
                table[key] = parse_hex(hexv)
                i += 1
            i += 1
            palettes[parts[1]] = table
        elif parts[0] == "sprite":
            w, h = int(parts[2]), int(parts[3])
            opts = dict(p.split("=") for p in parts[5:])
            rows = [lines[i + r].rstrip("\r") for r in range(h)]
            for r in rows:
                if len(r) != w:
                    raise ValueError(f"{path}: {parts[1]} ha una riga larga {len(r)} invece di {w}")
            i += h
            if lines[i].strip() != "end":
                raise ValueError(f"{path}: manca 'end' dopo {parts[1]}")
            i += 1
            sprites.append({"name": parts[1], "w": w, "h": h, "palette": parts[4], "rows": rows,
                            "ax": int(opts.get("ax", w // 2)), "ay": int(opts.get("ay", h // 2))})
        elif parts[0] == "variant":
            variants.append((parts[1], parts[2], parts[3]))
        else:
            raise ValueError(f"{path}: riga non riconosciuta: {line}")
    return palettes, sprites, variants


def render_rows(rows: list[str], table: dict[str, tuple[int, int, int, int]], scale: int = 1) -> Image.Image:
    h, w = len(rows), len(rows[0])
    img = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    px = img.load()
    for y, row in enumerate(rows):
        for x, ch in enumerate(row):
            if ch != TRANSPARENT:
                px[x, y] = table[ch]
    if scale != 1:
        img = img.resize((w * scale, h * scale), Image.NEAREST)
    return img
