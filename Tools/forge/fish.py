"""Pesci del Calderone: specie mediterranee stilizzate, disegnate da una descrizione parametrica.

Ogni specie è definita da profilo del corpo, pinne, colori e motivo; l'animazione nasce
piegando la spina dorsale con un'onda che cresce verso la coda. I pesci guardano a destra.

Per ogni specie escono gli sprite:
  <id>_swim_0..3   nuoto
  <id>_hurt_0      colpito (corpo contratto)
  <id>_dead_0      catturato (pancia in su, lo stesso disegno capovolto dal gioco non basta: occhio a croce)
"""
import math

from forge import Canvas, Grid, Palette, Sheet, spline

# ----------------------------------------------------------------------------
# Descrizione di una specie
# ----------------------------------------------------------------------------


class Species:
    def __init__(self, sid: str, length: float, height: float, colors: dict[str, str], *,
                 profile=None, back: float = 0.34, belly: float = 0.30,
                 tail: str = "fork", tail_len: float = 0.22, tail_h: float = 0.95,
                 dorsal=(0.22, 0.72, 0.30), dorsal2=None, anal=(0.55, 0.80, 0.22), pectoral: float = 0.30,
                 pelvic: float | None = None, eye: float = 0.13, eye_size: int = 2, eye_y: float = 0.0,
                 pattern=None, wave: float = 1.0, spiny: bool = False, extras=None, canvas_pad: int = 3):
        self.sid = sid
        self.length = length          # lunghezza del corpo senza coda, in pixel
        self.height = height          # altezza massima del corpo
        self.colors = colors
        # profilo: (t, metà superiore, metà inferiore) in frazioni dell'altezza; t=0 muso, t=1 base della coda
        self.profile = profile or [(0.0, 0.08, 0.08), (0.12, 0.34, 0.30), (0.35, 0.50, 0.48), (0.65, 0.40, 0.38), (0.88, 0.16, 0.15), (1.0, 0.10, 0.10)]
        self.back, self.belly = back, belly
        self.tail, self.tail_len, self.tail_h = tail, tail_len, tail_h
        self.dorsal, self.dorsal2, self.anal = dorsal, dorsal2, anal
        self.pectoral, self.pelvic = pectoral, pelvic
        self.eye, self.eye_size, self.eye_y = eye, eye_size, eye_y
        self.pattern = pattern
        self.wave = wave
        self.spiny = spiny
        self.extras = extras
        self.pad = canvas_pad

    def palette(self) -> Palette:
        base = {
            "o": self.colors.get("outline", "#101828"),
            "a": self.colors["back"],
            "b": self.colors["side"],
            "c": self.colors["belly"],
            "d": self.colors.get("fin", self.colors["back"]),
            "D": self.colors.get("fin_dark", self.colors.get("outline", "#101828")),
            "e": self.colors.get("accent", self.colors["side"]),
            "f": self.colors.get("accent2", self.colors["belly"]),
            "h": self.colors.get("light", "#ffffff"),
            "w": "#ffffff",
            "k": "#10141f",
            "x": self.colors.get("hurt", "#ff5a5a"),
        }
        return Palette(self.sid, base)


def _interp(profile, t: float) -> tuple[float, float]:
    for i in range(len(profile) - 1):
        t0, u0, l0 = profile[i]
        t1, u1, l1 = profile[i + 1]
        if t0 <= t <= t1:
            k = (t - t0) / max(t1 - t0, 1e-6)
            k = k * k * (3 - 2 * k)
            return (u0 + (u1 - u0) * k, l0 + (l1 - l0) * k)
    return (profile[-1][1], profile[-1][2])


def render(sp: Species, phase: float, pose: str = "swim") -> Grid:
    pal = sp.palette()
    tail_px = sp.length * sp.tail_len
    w = int(math.ceil(sp.length + tail_px)) + sp.pad * 2 + 2
    fin_room = sp.height * 0.55
    h = int(math.ceil(sp.height + fin_room * 2)) + sp.pad * 2
    c = Canvas(w, h, pal)
    cy = h / 2
    nose_x = w - sp.pad - 1.0
    amp = sp.height * 0.11 * sp.wave
    if pose == "hurt":
        amp *= 2.2

    def spine(t: float) -> tuple[float, float]:
        x = nose_x - t * sp.length
        y = cy + math.sin(phase - t * 2.6) * amp * (t ** 1.7)
        return (x, y)

    steps = 24
    upper, lower, mid = [], [], []
    for i in range(steps + 1):
        t = i / steps
        u, l = _interp(sp.profile, t)
        x, y = spine(t)
        squash = 0.86 if pose == "hurt" else 1.0
        upper.append((x, y - u * sp.height * squash))
        lower.append((x, y + l * sp.height * squash))
        mid.append((x, y))

    # --- pinne dietro il corpo ---
    def fin_along(edge, t0: float, t1: float, height: float, key: str, down: bool, spiky: bool) -> None:
        pts = []
        n = 10
        for i in range(n + 1):
            t = t0 + (t1 - t0) * i / n
            idx = min(int(t * steps), steps)
            pts.append(edge[idx])
        tips = []
        for i, (x, y) in enumerate(pts):
            k = i / n
            shape = math.sin(k * math.pi) ** 0.6 * (1.0 - 0.35 * k)
            if spiky:
                shape *= 0.72 + 0.28 * (1 if i % 2 == 0 else 0.35)
            dy = height * sp.height * shape
            tips.append((x - 0.6 * dy * 0.25, y + dy if down else y - dy))
        c.poly(pts + list(reversed(tips)), key)

    if sp.dorsal:
        fin_along(upper, sp.dorsal[0], sp.dorsal[1], sp.dorsal[2], "d", False, sp.spiny)
    if sp.dorsal2:
        fin_along(upper, sp.dorsal2[0], sp.dorsal2[1], sp.dorsal2[2], "d", False, False)
    if sp.anal:
        fin_along(lower, sp.anal[0], sp.anal[1], sp.anal[2], "d", True, False)
    if sp.pelvic is not None:
        idx = int(sp.pelvic * steps)
        x, y = lower[idx]
        c.poly([(x + 1.0, y - 0.6), (x - 2.2, y - 0.4), (x - 3.2 - sp.height * 0.06, y + sp.height * 0.20)], "d")

    # --- coda ---
    bx, by = spine(1.0)
    swing = math.sin(phase - 2.9) * amp * 1.5
    tx = bx - tail_px
    th = sp.height * sp.tail_h / 2
    root = sp.height * _interp(sp.profile, 1.0)[0] * 1.15
    if sp.tail == "fork":
        c.poly([(bx + 0.6, by - root), (tx, by - th + swing), (tx + tail_px * 0.45, by + swing * 0.6),
                (tx, by + th + swing), (bx + 0.6, by + root)], "d")
    elif sp.tail == "lunate":
        c.poly([(bx + 0.6, by - root), (tx - 0.5, by - th * 1.15 + swing), (tx + tail_px * 0.62, by + swing * 0.5),
                (tx - 0.5, by + th * 1.15 + swing), (bx + 0.6, by + root)], "d")
    elif sp.tail == "round":
        pts = [(bx + 0.6, by - root)]
        for i in range(9):
            a = -math.pi / 2 + math.pi * i / 8
            pts.append((tx + tail_px * 0.45 - math.cos(a) * tail_px * 0.45, by + math.sin(a) * th + swing * (1 - abs(math.sin(a)) * 0.3)))
        pts.append((bx + 0.6, by + root))
        c.poly(pts, "d")
    else:  # tronca
        c.poly([(bx + 0.6, by - root), (tx, by - th + swing), (tx, by + th + swing), (bx + 0.6, by + root)], "d")

    # --- corpo: fianco, dorso, ventre ---
    c.poly(upper + list(reversed(lower)), "b")
    back_edge = [(x, yu + (ym - yu) * (1 - sp.back * 1.6)) for (x, yu), (_, ym) in zip(upper, mid)]
    c.poly(upper + list(reversed(back_edge)), "a")
    belly_edge = [(x, yl + (ym - yl) * (1 - sp.belly * 1.6)) for (x, yl), (_, ym) in zip(lower, mid)]
    c.poly(lower + list(reversed(belly_edge)), "c")

    # --- motivo, tenuto dentro la sagoma ---
    if sp.pattern:
        layer = c.blank_like()
        sp.pattern(layer, sp, upper, lower, mid, steps)
        c.paste_masked(layer, mask_keys={"a", "b", "c"})

    # --- pinna pettorale sopra il corpo ---
    if sp.pectoral:
        idx = int(sp.pectoral * steps)
        x, y = mid[idx]
        flap = math.sin(phase * 1.0 + 1.0) * 0.5
        size = sp.height * 0.26
        c.poly([(x + 0.4, y + size * 0.15), (x - size * 1.15, y + size * (0.55 + flap * 0.4)), (x - size * 0.55, y + size * 1.0 + flap)], "D")

    if sp.extras:
        sp.extras(c, sp, spine, upper, lower, phase)

    g = c.grid(threshold=0.42)

    # --- occhio, fatto a mano ---
    ex, ey = spine(sp.eye)
    u, _ = _interp(sp.profile, sp.eye)
    px = int(round(ex - 0.5))
    py = int(round(ey + sp.eye_y * sp.height - u * sp.height * 0.46 - 0.5))
    dead = pose == "dead"
    if sp.eye_size <= 1:
        g.set(px, py, "k")
    elif sp.eye_size == 2:
        for dx in (0, 1):
            for dy in (0, 1):
                g.set(px + dx, py + dy, "w")
        if dead:
            g.set(px, py, "k")
            g.set(px + 1, py + 1, "k")
        else:
            g.set(px + 1, py + 1, "k")
            g.set(px + 1, py, "k")
    else:
        for dx in range(3):
            for dy in range(3):
                g.set(px + dx, py + dy, "w")
        if dead:
            for d in range(3):
                g.set(px + d, py + d, "k")
                g.set(px + 2 - d, py + d, "k")
        else:
            g.set(px + 1, py + 1, "k")
            g.set(px + 2, py + 1, "k")
            g.set(px + 1, py + 2, "k")
            g.set(px + 2, py + 2, "k")
            g.set(px + 2, py, "w")
    if pose == "hurt":
        g = g.replace({"b": "h"})
    g.outline("o")
    return g


# ----------------------------------------------------------------------------
# Motivi
# ----------------------------------------------------------------------------
def bands(key: str, positions: list[float], width: float = 0.05, top_only: float = 1.0):
    """Fasce verticali (sarago, pesce scorpione...). top_only < 1 le ferma a metà fianco."""
    def draw(layer: Canvas, sp: Species, upper, lower, mid, steps: int) -> None:
        for t in positions:
            i = min(int(t * steps), steps - 1)
            x, yu = upper[i]
            _, yl = lower[i]
            y1 = yu + (yl - yu) * top_only
            wd = max(width * sp.length, 1.0)
            layer.poly([(x + wd / 2, yu - 1), (x - wd / 2, yu - 1), (x - wd / 2, y1), (x + wd / 2, y1)], key)
    return draw


def stripes_h(key: str, offsets: list[float], width: float = 0.07, t0: float = 0.12, t1: float = 0.95):
    """Linee longitudinali (donzella, salpa...). offsets: da -1 dorso a +1 ventre."""
    def draw(layer: Canvas, sp: Species, upper, lower, mid, steps: int) -> None:
        for off in offsets:
            pts = []
            for i in range(int(t0 * steps), int(t1 * steps) + 1):
                (x, yu), (_, yl), (_, ym) = upper[i], lower[i], mid[i]
                y = ym + (ym - yu) * off * -1 if off < 0 else ym + (yl - ym) * off
                pts.append((x, y))
            layer.curve(pts, max(width * sp.height, 0.9), key)
    return draw


def tiger(key: str, count: int = 9, t0: float = 0.18, t1: float = 0.92, depth: float = 0.55):
    """Tigrature oblique sul dorso (sgombro, palamita)."""
    def draw(layer: Canvas, sp: Species, upper, lower, mid, steps: int) -> None:
        for n in range(count):
            t = t0 + (t1 - t0) * n / max(count - 1, 1)
            i = min(int(t * steps), steps - 1)
            (x, yu), (_, ym) = upper[i], mid[i]
            yd = yu + (ym - yu) * depth
            layer.line(x + 0.8, yu - 0.5, x - 1.4, yd, 0.95, key)
    return draw


def spots(key: str, points: list[tuple[float, float]], radius: float = 0.07):
    """Macchie: (t, posizione verticale da -1 dorso a +1 ventre)."""
    def draw(layer: Canvas, sp: Species, upper, lower, mid, steps: int) -> None:
        for t, off in points:
            i = min(int(t * steps), steps - 1)
            (x, yu), (_, yl), (_, ym) = upper[i], lower[i], mid[i]
            y = ym + ((ym - yu) * off * -1 if off < 0 else (yl - ym) * off)
            r = max(radius * sp.height, 0.75)
            layer.ellipse(x, y, r * 1.15, r, key)
    return draw


def combine(*patterns):
    def draw(layer: Canvas, sp: Species, upper, lower, mid, steps: int) -> None:
        for p in patterns:
            p(layer, sp, upper, lower, mid, steps)
    return draw


def mottled(key: str, seed: int, density: float = 0.34):
    """Chiazze irregolari (cernia, scorfano, murena)."""
    def draw(layer: Canvas, sp: Species, upper, lower, mid, steps: int) -> None:
        import random
        rnd = random.Random(seed)
        n = int(sp.length * sp.height * density / 9)
        for _ in range(n):
            t = rnd.uniform(0.1, 0.95)
            i = min(int(t * steps), steps - 1)
            (x, yu), (_, yl) = upper[i], lower[i]
            y = rnd.uniform(yu, yl)
            layer.ellipse(x + rnd.uniform(-1, 1), y, rnd.uniform(0.9, 2.0), rnd.uniform(0.7, 1.4), key)
    return draw


# ----------------------------------------------------------------------------
# Specie con forma di pesce
# ----------------------------------------------------------------------------
def barbels(c: Canvas, sp: Species, spine, upper, lower, phase: float) -> None:
    """Barbigli della triglia sotto il mento."""
    x, y = spine(0.06)
    wob = math.sin(phase) * 0.6
    c.line(x - 0.5, y + sp.height * 0.22, x - 3.0, y + sp.height * 0.55 + wob, 0.8, "f")
    c.line(x - 1.5, y + sp.height * 0.24, x - 4.5, y + sp.height * 0.50 - wob, 0.8, "f")


def sword(c: Canvas, sp: Species, spine, upper, lower, phase: float) -> None:
    x, y = spine(0.0)
    c.poly([(x - 1.0, y - 1.0), (x + sp.length * 0.36, y - 0.2), (x + sp.length * 0.36, y + 0.5), (x - 1.0, y + 0.9)], "a")


SPECIES: list[Species] = [
    # Sardina: piccola, argentea, dorso blu, una fila di puntini
    Species("sardina", 15, 5.2, {"back": "#2f5f9e", "side": "#b9d3e6", "belly": "#f1f7fb", "fin": "#6f8fb0", "accent": "#24406e", "outline": "#172a48"},
            profile=[(0.0, 0.10, 0.10), (0.15, 0.38, 0.36), (0.40, 0.50, 0.50), (0.70, 0.36, 0.36), (0.90, 0.15, 0.15), (1.0, 0.10, 0.10)],
            dorsal=(0.38, 0.56, 0.28), anal=(0.66, 0.82, 0.14), pectoral=0.0, eye=0.14, eye_size=1, eye_y=0.0, tail_len=0.26,
            pattern=spots("e", [(0.32, -0.15), (0.44, -0.15), (0.56, -0.15), (0.68, -0.15)], 0.10), wave=1.3),
    # Castagnola: piccola e scura, coda a forbice
    Species("castagnola", 13, 7.5, {"back": "#2a2338", "side": "#4a3d5c", "belly": "#6a5a78", "fin": "#231c30", "accent": "#7f6fa0", "outline": "#120e1c"},
            dorsal=(0.22, 0.80, 0.26), anal=(0.58, 0.84, 0.24), pectoral=0.34, eye=0.15, eye_size=2, tail_len=0.36, tail_h=1.05, wave=1.1),
    # Donzella: affusolata, linea arancione a zig-zag sul fianco
    Species("donzella", 20, 5.6, {"back": "#2e7f8f", "side": "#63c7b8", "belly": "#f4f0d2", "fin": "#3fa3a8", "accent": "#f08a3c", "accent2": "#2b4a8c", "outline": "#143b47"},
            profile=[(0.0, 0.10, 0.10), (0.14, 0.36, 0.34), (0.40, 0.50, 0.50), (0.75, 0.38, 0.38), (0.92, 0.20, 0.20), (1.0, 0.16, 0.16)],
            dorsal=(0.18, 0.90, 0.20), anal=(0.52, 0.90, 0.16), pectoral=0.28, eye=0.12, eye_size=2, tail="round", tail_len=0.16,
            pattern=combine(stripes_h("e", [-0.05], 0.22), stripes_h("f", [-0.62], 0.12)), wave=1.25),
    # Sarago: disco argenteo con fasce scure e macchia sul peduncolo
    Species("sarago", 21, 13.0, {"back": "#6f7f96", "side": "#c8d2de", "belly": "#f3f6fa", "fin": "#56637a", "accent": "#2b3346", "outline": "#1b2233"},
            profile=[(0.0, 0.10, 0.12), (0.14, 0.40, 0.34), (0.38, 0.52, 0.48), (0.66, 0.40, 0.38), (0.88, 0.14, 0.13), (1.0, 0.09, 0.09)],
            dorsal=(0.24, 0.80, 0.22), anal=(0.60, 0.82, 0.18), pectoral=0.30, pelvic=0.40, eye=0.14, eye_size=2, spiny=True,
            pattern=combine(bands("e", [0.26, 0.40, 0.54, 0.68], 0.045, 0.72), bands("e", [0.92], 0.07, 1.0))),
    # Orata: corpo alto, fascia dorata tra gli occhi, macchia scura sull'opercolo
    Species("orata", 26, 14.5, {"back": "#7d8ea6", "side": "#cfd9e4", "belly": "#f7f9fc", "fin": "#8494aa", "accent": "#f2c02e", "accent2": "#2c3447", "outline": "#1c2334"},
            profile=[(0.0, 0.12, 0.14), (0.10, 0.40, 0.32), (0.34, 0.54, 0.46), (0.64, 0.42, 0.38), (0.88, 0.15, 0.14), (1.0, 0.10, 0.10)],
            dorsal=(0.26, 0.80, 0.20), anal=(0.60, 0.82, 0.16), pectoral=0.30, pelvic=0.38, eye=0.13, eye_size=2, spiny=True,
            pattern=combine(spots("e", [(0.075, -0.55)], 0.11), spots("f", [(0.24, -0.25)], 0.10), stripes_h("e", [0.25], 0.07, 0.3, 0.85))),
    # Triglia: rossa, muso spiovente, barbigli
    Species("triglia", 22, 7.4, {"back": "#c8402f", "side": "#f0806a", "belly": "#fbe6da", "fin": "#f2b24a", "accent": "#f6d24a", "accent2": "#f6e6d0", "outline": "#5a1a1e"},
            profile=[(0.0, 0.06, 0.20), (0.10, 0.44, 0.36), (0.30, 0.52, 0.44), (0.66, 0.38, 0.36), (0.90, 0.16, 0.15), (1.0, 0.11, 0.11)],
            dorsal=(0.26, 0.44, 0.34), dorsal2=(0.56, 0.74, 0.22), anal=(0.60, 0.76, 0.16), pectoral=0.28, eye=0.11, eye_size=2, 
            pattern=stripes_h("e", [0.15], 0.14, 0.2, 0.9), extras=barbels),
    # Scorfano: testa enorme, spine, chiazze, sta posato sul fondo
    Species("scorfano", 22, 13.0, {"back": "#8c2f2a", "side": "#c85a40", "belly": "#f0b08a", "fin": "#a83a30", "accent": "#5e1c22", "accent2": "#f4d2a0", "outline": "#3a1016"},
            profile=[(0.0, 0.22, 0.26), (0.10, 0.50, 0.46), (0.30, 0.54, 0.50), (0.60, 0.36, 0.38), (0.86, 0.17, 0.17), (1.0, 0.13, 0.13)],
            dorsal=(0.18, 0.84, 0.38), anal=(0.60, 0.82, 0.24), pectoral=0.30, pelvic=0.36, eye=0.13, eye_size=3,  spiny=True,
            tail="round", tail_len=0.20, pattern=combine(mottled("e", 7), spots("f", [(0.22, 0.5), (0.5, 0.2), (0.7, -0.3)], 0.07)), wave=0.6),
    # Cernia bruna: grossa, bocca larga, chiazze chiare
    Species("cernia", 40, 19.0, {"back": "#4a3a2e", "side": "#7a6248", "belly": "#c8ad84", "fin": "#3c2f26", "accent": "#b89a6a", "accent2": "#2a2018", "outline": "#1e1610"},
            profile=[(0.0, 0.20, 0.26), (0.10, 0.44, 0.44), (0.32, 0.52, 0.50), (0.64, 0.42, 0.42), (0.88, 0.20, 0.20), (1.0, 0.15, 0.15)],
            dorsal=(0.22, 0.86, 0.24), anal=(0.62, 0.84, 0.20), pectoral=0.30, pelvic=0.36, eye=0.12, eye_size=3,  spiny=True,
            tail="round", tail_len=0.18, pattern=combine(mottled("e", 3, 0.40), stripes_h("f", [0.55], 0.05, 0.02, 0.12)), wave=0.75),
    # Sgombro: siluro blu-verde tigrato
    Species("sgombro", 26, 6.6, {"back": "#1f6f8a", "side": "#8fd0d8", "belly": "#f2f8fb", "fin": "#3a6f86", "accent": "#123a52", "outline": "#0e2433"},
            profile=[(0.0, 0.06, 0.06), (0.14, 0.36, 0.34), (0.40, 0.50, 0.50), (0.72, 0.34, 0.34), (0.92, 0.10, 0.10), (1.0, 0.07, 0.07)],
            dorsal=(0.26, 0.40, 0.30), dorsal2=(0.62, 0.74, 0.20), anal=(0.64, 0.76, 0.18), pectoral=0.22, eye=0.11, eye_size=2,
            tail_len=0.24, tail_h=1.15, pattern=tiger("e", 10), wave=1.3),
    # Dentice: predatore rosato con riflessi azzurri
    Species("dentice", 34, 15.0, {"back": "#8a6f8a", "side": "#e0b8c0", "belly": "#f8f0f0", "fin": "#b0889a", "accent": "#5fb0d8", "accent2": "#4a3050", "outline": "#2a1c30"},
            profile=[(0.0, 0.14, 0.18), (0.10, 0.44, 0.34), (0.32, 0.54, 0.46), (0.64, 0.40, 0.36), (0.88, 0.14, 0.13), (1.0, 0.09, 0.09)],
            dorsal=(0.24, 0.80, 0.22), anal=(0.60, 0.80, 0.16), pectoral=0.30, pelvic=0.38, eye=0.12, eye_size=3, spiny=True,
            tail_len=0.24, tail_h=1.1, pattern=spots("e", [(0.3, -0.3), (0.42, -0.1), (0.54, -0.35), (0.66, -0.1), (0.36, 0.2), (0.5, 0.3)], 0.045)),
    # Ricciola: grande pelagico, banda gialla sul fianco
    Species("ricciola", 44, 12.5, {"back": "#4f6f8c", "side": "#b4c8d8", "belly": "#f4f7fa", "fin": "#5a7690", "accent": "#e8c64a", "accent2": "#2a3a52", "outline": "#18243a"},
            profile=[(0.0, 0.08, 0.10), (0.14, 0.38, 0.34), (0.38, 0.50, 0.48), (0.70, 0.34, 0.34), (0.92, 0.09, 0.09), (1.0, 0.06, 0.06)],
            dorsal=(0.30, 0.42, 0.20), dorsal2=(0.50, 0.88, 0.22), anal=(0.62, 0.88, 0.16), pectoral=0.24, eye=0.10, eye_size=3,
            tail="lunate", tail_len=0.22, tail_h=1.4, pattern=combine(stripes_h("e", [-0.02], 0.12, 0.12, 0.94), stripes_h("f", [-0.5], 0.06, 0.0, 0.14)), wave=1.15),
    # Barracuda mediterraneo: lungo, mascella sporgente
    Species("barracuda", 48, 7.0, {"back": "#4a6a74", "side": "#b8ccd0", "belly": "#f2f6f6", "fin": "#56747c", "accent": "#2a424a", "outline": "#14252b"},
            profile=[(0.0, 0.05, 0.10), (0.16, 0.34, 0.36), (0.40, 0.50, 0.50), (0.76, 0.40, 0.40), (0.93, 0.14, 0.14), (1.0, 0.10, 0.10)],
            dorsal=(0.34, 0.44, 0.34), dorsal2=(0.68, 0.78, 0.30), anal=(0.70, 0.80, 0.28), pectoral=0.22, eye=0.10, eye_size=2,
            tail_len=0.16, tail_h=1.3, pattern=bands("e", [0.26, 0.36, 0.46, 0.56, 0.66, 0.76, 0.86], 0.022, 0.5), wave=1.1),
]


def build(out_dir: str) -> str:
    sheet = Sheet("Pesci")
    for sp in SPECIES:
        pal = sheet.add_palette(sp.palette())
        frames = [render(sp, 2 * math.pi * i / 4) for i in range(4)]
        ax, ay = frames[0].w // 2, frames[0].h // 2
        sheet.add_frames(f"{sp.sid}_swim", frames, pal, ax, ay)
        sheet.add(f"{sp.sid}_hurt_0", render(sp, 1.2, "hurt"), pal, ax, ay)
        sheet.add(f"{sp.sid}_dead_0", render(sp, 0.0, "dead"), pal, ax, ay)
    path = f"{out_dir}/fish.spr"
    sheet.write(path)
    return path
