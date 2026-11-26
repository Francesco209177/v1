"""I sei boss del Calderone e ciò che mettono in acqua.

Ogni boss è fatto di pochi pezzi che il gioco muove e ruota: teste, segmenti di corpo,
tentacoli, trivella. Tutti guardano a destra; il gioco li specchia.
"""
import math

import fish
from forge import Canvas, Grid, Palette, Sheet

# ----------------------------------------------------------------------------
# Murena Baronessa
# ----------------------------------------------------------------------------
MURENA = Palette("murena_boss", {
    "o": "#1c1408", "a": "#4a3a1c", "b": "#7a5e26", "c": "#b89238", "e": "#e8cc5a", "f": "#f4e8a0",
    "m": "#7a1f2a", "M": "#3a0c14", "w": "#ffffff", "k": "#10141f", "y": "#ffd23a", "r": "#c8402f", "g": "#6a5a4a", "G": "#3a3028"})


def murena_head(open_mouth: bool) -> Grid:
    c = Canvas(46, 30, MURENA)
    cy = 15.0
    gape = 5.2 if open_mouth else 0.0
    # nuca e cresta
    c.capsule(4, cy, 22, cy, 9.0, "b", 8.4)
    c.poly([(2, cy - 8.5), (10, cy - 11.5), (22, cy - 10.5), (26, cy - 7.5)], "a")
    # mascella superiore e inferiore
    c.poly([(18, cy - 8.4), (34, cy - 6.2 - gape * 0.5), (43, cy - 1.6 - gape), (41, cy + 0.6 - gape), (20, cy + 1.0)], "b")
    c.poly([(18, cy + 8.0), (32, cy + 6.6 + gape * 0.5), (41, cy + 2.2 + gape), (39, cy + 0.4 + gape), (20, cy - 0.6)], "c")
    c.capsule(4, cy - 3.5, 30, cy - 5.0 - gape * 0.4, 4.2, "a", 2.4)
    if open_mouth:
        c.poly([(22, cy - 0.5), (40, cy - 0.4 - gape), (38.5, cy + 0.6 + gape), (22, cy + 1.0)], "m")
        c.poly([(22, cy), (33, cy - 1.0), (33, cy + 1.6), (22, cy + 0.8)], "M")
    # macchie gialle
    for x, y, r in ((8, cy + 2, 1.5), (13, cy - 1, 1.2), (17, cy + 4, 1.4), (24, cy - 3.2, 1.0), (10, cy + 5.5, 1.0), (5, cy - 1, 1.1)):
        c.ellipse(x, y, r, r, "e")
    g = c.grid(threshold=0.45)
    # occhio giallo con la pupilla a fessura
    ex, ey = 29, int(cy - 6 - (gape * 0.4))
    g.stamp(ex, ey, ["yyy", "yky", "yky"])
    g.set(ex + 1, ey - 1, "o")
    # denti
    if open_mouth:
        for x in (26, 29, 32, 35, 38):
            dy = int(round((x - 22) / 18 * -gape))
            g.set(x, int(cy) + dy, "w")
            g.set(x, int(cy) + 1 + dy, "w")
            g.set(x - 1, int(cy) + 2 - dy, "w")
    else:
        for x in (27, 31, 35, 39):
            g.set(x, int(cy), "w")
    g.outline("o")
    return g


def murena_body(variant: int) -> Grid:
    c = Canvas(20, 20, MURENA)
    c.ellipse(10, 10, 8.6, 8.6, "b")
    c.ellipse(10, 6.0, 7.4, 3.6, "a")
    c.ellipse(10, 14.4, 6.6, 2.6, "c")
    spots = ((6, 10, 1.4), (12, 11.5, 1.2), (14, 8, 1.0)) if variant == 0 else ((8, 12, 1.3), (13, 9.5, 1.3), (5, 8.5, 0.9))
    for x, y, r in spots:
        c.ellipse(x, y, r, r, "e")
    g = c.grid(threshold=0.45)
    g.outline("o")
    return g


def den(eyes: bool) -> Grid:
    c = Canvas(34, 34, MURENA)
    c.ellipse(17, 17, 15.5, 15.5, "g")
    c.ellipse(17, 17, 12.5, 12.5, "G")
    c.ellipse(17, 17.6, 10.6, 10.6, "k")
    for a in range(0, 360, 45):
        x = 17 + math.cos(math.radians(a)) * 14
        y = 17 + math.sin(math.radians(a)) * 14
        c.ellipse(x, y, 1.6, 1.6, "G")
    g = c.grid(threshold=0.45)
    if eyes:
        g.stamp(11, 15, ["yy", "ky"])
        g.stamp(20, 15, ["yy", "yk"])
    g.outline("o")
    return g


# ----------------------------------------------------------------------------
# Granseola Corazzata
# ----------------------------------------------------------------------------
GRANSEOLA = Palette("granseola_boss", {
    "o": "#2a0e0a", "a": "#8a2e1a", "b": "#c8552a", "c": "#e8854a", "h": "#f4b07a", "e": "#f0d8b0", "f": "#d8b88a",
    "l": "#a84220", "L": "#6a2410", "g": "#3a7a4a", "G": "#5aa86a", "w": "#ffffff", "k": "#10141f", "s": "#f4efe2"})

GW, GH = 76, 50


def _crab_legs(c: Canvas, cx: float, cy: float, phase: float, lift: float, up: bool = False) -> None:
    for side in (-1, 1):
        for k in range(4):
            sw = math.sin(phase + k * 1.6 + (0 if side < 0 else math.pi)) * 2.4
            hip_x = cx + side * (9 + k * 2.4)
            hip_y = cy + 2 + k * 1.4
            if up:
                knee = (hip_x + side * (9 + k * 2.0), hip_y - 10 - k * 1.2 + sw)
                foot = (knee[0] + side * (3 + sw * 0.6), knee[1] - 8 - (k % 2) * 3)
            else:
                knee = (hip_x + side * (10 + k * 2.2), hip_y - 7 + k * 1.6 - lift * 0.4)
                foot = (knee[0] + side * (5 + sw), GH - 2.0 - (1.5 if sw > 1.2 else 0))
            c.capsule(hip_x, hip_y, knee[0], knee[1], 1.9, "l", 1.6)
            c.capsule(knee[0], knee[1], foot[0], foot[1], 1.6, "L", 0.9)


def _crab_claw(c: Canvas, x: float, y: float, side: int, angle: float, open_: float) -> None:
    ex = x + side * math.cos(angle) * 9
    ey = y - math.sin(angle) * 9
    c.capsule(x, y, ex, ey, 2.6, "l", 2.4)
    tx = ex + side * math.cos(angle) * 9
    ty = ey - math.sin(angle) * 9
    c.capsule(ex, ey, tx, ty - open_, 3.6, "b", 1.6)
    c.capsule(ex, ey + 1.0, tx - side * 1.0, ty + 2.6 + open_, 2.4, "c", 1.0)


def granseola(pose: str, phase: float) -> Grid:
    c = Canvas(GW, GH, GRANSEOLA)
    cx = GW / 2
    bob = math.sin(phase * 2) * 0.8
    if pose == "flip":
        cy = 31.0
        _crab_legs(c, cx, cy - 6, phase * 2, 0, up=True)
        _crab_claw(c, cx - 16, cy - 2, -1, 0.9 + math.sin(phase) * 0.3, 1.5)
        _crab_claw(c, cx + 16, cy - 2, 1, 0.9 - math.sin(phase) * 0.3, 1.5)
        # ventre chiaro in su: è il punto debole
        c.ellipse(cx, cy, 19, 13.5, "a")
        c.ellipse(cx, cy - 2.0, 16.5, 10.5, "e")
        for i in range(4):
            c.line(cx - 12 + i * 1.5, cy - 7 + i * 3.4, cx + 12 - i * 1.5, cy - 7 + i * 3.4, 0.8, "f")
        c.poly([(cx - 5, cy - 9), (cx + 5, cy - 9), (cx, cy + 6)], "f")
        g = c.grid(threshold=0.45)
        g.stamp(int(cx) - 7, int(cy) + 9, ["k k", " k "])
        g.stamp(int(cx) + 5, int(cy) + 9, ["k k", " k "])
        g.outline("o")
        return g

    rear = pose == "rear"
    cy = (26.0 if not rear else 21.0) + bob
    low = 3.0 if pose == "charge" else 0.0
    cy += low
    _crab_legs(c, cx, cy + 2, phase * (2 if pose == "charge" else 1), lift=(8 if rear else 0))
    claw_angle = 1.15 if rear else (0.15 if pose == "charge" else 0.55 + math.sin(phase) * 0.12)
    claw_y = cy + (0 if rear else 4)
    _crab_claw(c, cx - 17, claw_y, -1, claw_angle, 2.2 if rear else 0.8)
    _crab_claw(c, cx + 17, claw_y, 1, claw_angle, 2.2 if rear else 0.8)
    # carapace a pera, pieno di spine
    c.ellipse(cx, cy, 20, 14.5, "b")
    c.ellipse(cx, cy - 6.5, 13, 8.5, "b")
    c.ellipse(cx, cy - 4.0, 15.5, 8.2, "c")
    c.ellipse(cx - 4, cy - 7.5, 6.5, 3.2, "h")
    c.ellipse(cx, cy + 6.5, 17, 6.8, "a")
    for i in range(9):
        a = math.pi * (1.05 + 0.9 * i / 8)
        x = cx + math.cos(a) * 19.5
        y = cy + math.sin(a) * 14.0
        c.poly([(x - 1.6, y + 1.2), (x + 1.6, y + 1.2), (x + math.cos(a) * 3.4, y + math.sin(a) * 3.4)], "c")
    for x, y in ((-9, -2), (8, -4), (-2, 3), (11, 3), (-13, 4), (3, -9)):
        c.ellipse(cx + x, cy + y, 1.5, 1.2, "a")
    # ciuffi d'alga sul guscio
    for x, y in ((-12, -8), (6, -12), (14, -5)):
        c.poly([(cx + x - 1.4, cy + y + 1), (cx + x + 1.4, cy + y + 1), (cx + x + 0.6, cy + y - 4.5), (cx + x - 1.0, cy + y - 3.0)], "g")
    if rear:
        # impennata: si vede il ventre
        c.ellipse(cx, cy + 6.5, 13.5, 6.4, "e")
        c.line(cx - 9, cy + 6, cx + 9, cy + 6, 0.8, "f")
        c.line(cx - 7, cy + 9, cx + 7, cy + 9, 0.8, "f")
    # peduncoli degli occhi
    c.capsule(cx - 5, cy - 11.5, cx - 6.5, cy - 16, 1.2, "l")
    c.capsule(cx + 5, cy - 11.5, cx + 6.5, cy - 16, 1.2, "l")
    g = c.grid(threshold=0.45)
    for ex in (int(cx - 8), int(cx + 5)):
        g.stamp(ex, int(cy - 18), ["ww", "kk"] if pose != "charge" else ["kk", "ww"])
    g.outline("o")
    return g


# ----------------------------------------------------------------------------
# Lo Spadaccino
# ----------------------------------------------------------------------------
SPADA = fish.Species("spadaccino", 80, 18.0,
                     {"back": "#1c2748", "side": "#6f7fa8", "belly": "#dfe6f2", "fin": "#141c38", "accent": "#c8402f",
                      "accent2": "#f2c23a", "outline": "#0a1024", "light": "#ffffff"},
                     profile=[(0.0, 0.10, 0.10), (0.10, 0.40, 0.34), (0.32, 0.52, 0.48), (0.68, 0.32, 0.32), (0.92, 0.08, 0.08), (1.0, 0.05, 0.05)],
                     dorsal=(0.16, 0.36, 0.66), dorsal2=(0.80, 0.86, 0.14), anal=(0.62, 0.72, 0.24), pectoral=0.20, eye=0.085, eye_size=3,
                     tail="lunate", tail_len=0.17, tail_h=1.6, wave=0.9, canvas_pad=3)
SPADA.nose_room = SPADA.length * 0.40


def _spada_extras(c: Canvas, sp, spine, upper, lower, phase: float) -> None:
    x, y = spine(0.0)
    # la spada, con il filo chiaro
    c.poly([(x - 1.0, y - 1.5), (x + sp.length * 0.38, y - 0.3), (x + sp.length * 0.38, y + 0.7), (x - 1.0, y + 1.3)], "a")
    c.line(x, y - 0.2, x + sp.length * 0.36, y + 0.1, 0.7, "h")
    # la cicatrice rossa di tanti duelli
    sx, sy = spine(0.36)
    c.line(sx + 3, sy - 4.5, sx - 3, sy + 3.0, 1.2, "e")
    c.line(sx - 6, sy - 3.5, sx - 9, sy + 1.5, 0.9, "e")


SPADA.extras = _spada_extras


def spadaccino_frames():
    swim = [fish.render(SPADA, 2 * math.pi * i / 4) for i in range(4)]
    hurt = fish.render(SPADA, 1.2, "hurt")
    w = swim[0].w
    nose_x = w - SPADA.pad - 1.0 - SPADA.nose_room
    ax = int(nose_x - SPADA.length * 0.40)
    return swim, hurt, ax, swim[0].h // 2


# ----------------------------------------------------------------------------
# Sua Eccellenza il Polpo
# ----------------------------------------------------------------------------
POLPO = Palette("polpo_boss", {
    "o": "#2a0a1c", "a": "#7a2440", "b": "#b8485e", "c": "#e88a90", "h": "#f6c0b8", "e": "#f6d8c8", "f": "#d0a0a0",
    "w": "#f8f4e6", "k": "#10141f", "y": "#f2c23a", "Y": "#b8861d", "t": "#c8703a", "T": "#8a4622", "u": "#e8a05a", "n": "#5a2a14"})


def polpo_head(pose: str) -> Grid:
    c = Canvas(58, 54, POLPO)
    cx = 29.0
    # mantello
    c.ellipse(cx, 20, 23, 19, "b")
    c.ellipse(cx, 34, 20, 13, "b")
    c.ellipse(cx - 5, 12, 13, 8, "c")
    c.ellipse(cx - 8, 9, 6, 3.4, "h")
    c.ellipse(cx, 40, 17, 8.5, "a")
    for x, y, r in ((12, 24, 2.2), (17, 30, 1.6), (44, 22, 2.4), (40, 30, 1.6), (22, 6, 1.4), (38, 8, 1.6)):
        c.ellipse(x, y, r, r, "a")
    # attaccatura dei tentacoli
    for i in range(6):
        c.ellipse(cx - 17.5 + i * 7, 46.5, 4.2, 4.6, "b" if i % 2 else "a")
    g = c.grid(threshold=0.45)
    ey = 27
    lx, rx = 18, 34
    if pose == "calm":
        g.stamp(lx, ey, ["wwwww", "wkkkw", "wwwww"])
        g.stamp(rx, ey, ["wwwww", "wkkkw", "wwwww"])
        g.stamp(lx, ey - 2, ["aaaaa"])
        g.stamp(rx, ey - 2, ["aaaaa"])
    elif pose == "angry":
        g.stamp(lx, ey, ["ooo  ", "wwwoo", "wkkkw", "wwwww"])
        g.stamp(rx, ey, ["  ooo", "oowww", "wkkkw", "wwwww"])
    else:  # stordito
        g.stamp(lx, ey, ["k   k", " k k ", "  k  ", " k k ", "k   k"])
        g.stamp(rx, ey, ["k   k", " k k ", "  k  ", " k k ", "k   k"])
    # il monocolo di Sua Eccellenza
    if pose != "stun":
        for dx in range(7):
            g.set(rx - 1 + dx, ey - 2, "y")
            g.set(rx - 1 + dx, ey + 4, "y")
        for dy in range(7):
            g.set(rx - 1, ey - 2 + dy, "y")
            g.set(rx + 5, ey - 2 + dy, "y")
        g.set(rx + 5, ey + 5, "Y")
        g.set(rx + 6, ey + 6, "Y")
        g.set(rx + 6, ey + 7, "Y")
    g.outline("o")
    return g


def polpo_arm(size: float) -> Grid:
    n = int(size * 2 + 4)
    c = Canvas(n, n, POLPO)
    m = n / 2
    c.ellipse(m, m, size, size, "b")
    c.ellipse(m, m - size * 0.35, size * 0.8, size * 0.45, "c")
    c.ellipse(m, m + size * 0.45, size * 0.75, size * 0.4, "a")
    c.ellipse(m, m + size * 0.3, size * 0.32, size * 0.28, "e")
    g = c.grid(threshold=0.45)
    g.outline("o")
    return g


def amphora(w: int, h: int) -> Grid:
    c = Canvas(w, h, POLPO)
    cx = w / 2
    c.ellipse(cx, h * 0.52, w * 0.36, h * 0.30, "t")
    c.poly([(cx - w * 0.18, h * 0.72), (cx + w * 0.18, h * 0.72), (cx + w * 0.06, h - 1.2), (cx - w * 0.06, h - 1.2)], "t")
    c.rect(cx - w * 0.13, h * 0.10, cx + w * 0.13, h * 0.30, "t")
    c.rect(cx - w * 0.20, h * 0.05, cx + w * 0.20, h * 0.13, "u")
    c.ellipse(cx - w * 0.14, h * 0.44, w * 0.10, h * 0.14, "u")
    c.line(cx - w * 0.30, h * 0.50, cx + w * 0.30, h * 0.50, max(0.8, h * 0.035), "n")
    c.curve([(cx - w * 0.15, h * 0.16), (cx - w * 0.40, h * 0.22), (cx - w * 0.32, h * 0.42)], max(0.9, w * 0.07), "T")
    c.curve([(cx + w * 0.15, h * 0.16), (cx + w * 0.40, h * 0.22), (cx + w * 0.32, h * 0.42)], max(0.9, w * 0.07), "T")
    g = c.grid(threshold=0.42)
    g.outline("o")
    return g


# ----------------------------------------------------------------------------
# La Lanterna
# ----------------------------------------------------------------------------
LANTERNA = Palette("lanterna_boss", {
    "o": "#08060e", "a": "#1c1828", "b": "#2e2840", "c": "#463e5e", "h": "#6a6088", "e": "#8a3a4a", "m": "#5a1420", "M": "#2a060c",
    "w": "#f4f0dc", "W": "#c8c0a0", "k": "#000000", "y": "#f8f090", "Y": "#e8c040", "g": "#a8f0d0", "r": "#ff5a4a", "R": "#c82a2a"})


def lanterna(open_mouth: bool) -> Grid:
    c = Canvas(66, 52, LANTERNA)
    cx, cy = 31.0, 28.0
    # coda e pinne
    c.poly([(cx - 17, cy - 3), (cx - 27, cy - 11), (cx - 24, cy), (cx - 27, cy + 10), (cx - 17, cy + 4)], "a")
    c.poly([(cx - 6, cy - 15), (cx - 12, cy - 23), (cx - 8, cy - 17), (cx - 3, cy - 24), (cx - 1, cy - 17), (cx + 4, cy - 22), (cx + 4, cy - 14)], "a")
    c.poly([(cx - 4, cy + 12), (cx - 11, cy + 20), (cx - 2, cy + 16)], "a")
    # corpo a pallone
    c.ellipse(cx, cy, 19, 16.5, "b")
    c.ellipse(cx - 3, cy - 7, 13, 7, "c")
    c.ellipse(cx - 6, cy - 10, 6, 2.8, "h")
    c.ellipse(cx - 2, cy + 9, 15, 6.5, "a")
    for x, y, r in ((-12, 2, 1.6), (-7, 8, 1.2), (-14, -5, 1.2), (2, -12, 1.0)):
        c.ellipse(cx + x, cy + y, r, r, "a")
    # bocca enorme
    gape = 8.5 if open_mouth else 2.2
    c.poly([(cx + 3, cy + 1 - gape * 0.2), (cx + 22, cy - 5 - gape * 0.9), (cx + 25, cy - 2 - gape * 0.5), (cx + 9, cy + 4)], "c")
    c.poly([(cx + 2, cy + 6), (cx + 21, cy + 6 + gape * 0.9), (cx + 24, cy + 3 + gape * 0.6), (cx + 9, cy + 3)], "b")
    c.poly([(cx + 6, cy + 3.0), (cx + 23, cy - 2.6 - gape * 0.55), (cx + 23, cy + 3.6 + gape * 0.65), (cx + 6, cy + 4.4)], "m")
    if open_mouth:
        c.ellipse(cx + 11, cy + 4.0, 5.5, 4.4, "M")
    # canna dell'esca, dalla fronte in avanti
    c.curve([(cx + 6, cy - 14), (cx + 9, cy - 22), (cx + 15, cy - 25), (cx + 19, cy - 22.5)], 1.3, "c", taper=0.8)
    g = c.grid(threshold=0.45)
    # denti ad ago
    top_y = lambda x: int(round(cy - 2.6 - gape * 0.55 * (x - (cx + 6)) / 17 + 0.5))
    bot_y = lambda x: int(round(cy + 3.6 + gape * 0.65 * (x - (cx + 6)) / 17 - 0.5))
    for i, x in enumerate(range(int(cx) + 9, int(cx) + 24, 3)):
        length = 3 if open_mouth else 2
        for d in range(length if i % 2 == 0 else length - 1):
            g.set(x, top_y(x) + d, "w")
        for d in range(length if i % 2 == 1 else length - 1):
            g.set(x + 1, bot_y(x + 1) - d, "w")
    # occhio piccolo e spento
    g.stamp(int(cx) + 6, int(cy) - 9, ["WWW", "WkW", "WWW"])
    g.outline("o")
    return g


def lure(red: bool) -> Grid:
    c = Canvas(11, 11, LANTERNA)
    c.ellipse(5.5, 5.5, 4.6, 4.6, "R" if red else "Y")
    c.ellipse(5.5, 5.5, 3.2, 3.2, "r" if red else "y")
    c.ellipse(4.6, 4.4, 1.3, 1.3, "w")
    return c.grid(threshold=0.45)


# ----------------------------------------------------------------------------
# La Talpa d'Acciaio
# ----------------------------------------------------------------------------
TALPA = Palette("talpa_boss", {
    "o": "#10161e", "a": "#34404e", "b": "#566676", "c": "#7e8e9e", "h": "#aebccc", "r": "#a8502a", "R": "#6e3018",
    "y": "#f2c23a", "Y": "#b8861d", "k": "#16181e", "w": "#fff8d0", "W": "#f8e080", "e": "#e5484d", "E": "#8a1c22",
    "g": "#48d8c0", "G": "#1e8a80", "n": "#c89a4a", "N": "#8a6a2a", "s": "#dfe6ee"})

TW, TH = 100, 56


def talpa_hull() -> Grid:
    c = Canvas(TW, TH, TALPA)
    cx, cy = 48.0, 28.0
    # timoni di coda
    c.poly([(cx - 30, cy - 3), (cx - 42, cy - 15), (cx - 36, cy - 15), (cx - 24, cy - 5)], "a")
    c.poly([(cx - 30, cy + 3), (cx - 42, cy + 15), (cx - 36, cy + 15), (cx - 24, cy + 5)], "a")
    # scafo a sigaro
    c.ellipse(cx, cy, 33, 20.5, "b")
    c.ellipse(cx - 3, cy - 8, 27, 9.5, "c")
    c.ellipse(cx - 8, cy - 13, 14, 3.4, "h")
    c.ellipse(cx, cy + 11, 28, 8.5, "a")
    # torretta
    c.rect(cx - 10, cy - 25, cx + 6, cy - 17, "b")
    c.rect(cx - 10, cy - 25, cx + 6, cy - 23, "c")
    # fasce di ruggine e giunture
    for x in (-18, -4, 12):
        c.line(cx + x, cy - 19.5 + abs(x) * 0.05, cx + x, cy + 19.5 - abs(x) * 0.05, 1.0, "a")
    c.poly([(cx + 4, cy + 5), (cx + 12, cy + 7), (cx + 9, cy + 15), (cx + 3, cy + 12)], "r")
    c.poly([(cx - 22, cy - 10), (cx - 15, cy - 12), (cx - 16, cy - 5)], "r")
    # collare giallo e nero prima della trivella
    c.poly([(cx + 23, cy - 14.5), (cx + 30, cy - 9.5), (cx + 30, cy + 9.5), (cx + 23, cy + 14.5)], "y")
    for i in range(4):
        y0 = cy - 13 + i * 7.4
        c.poly([(cx + 23, y0), (cx + 30, y0 + 3.2), (cx + 30, y0 + 6.4), (cx + 23, y0 + 3.2)], "k")
    # oblò
    for x in (-12, 0, 12):
        c.ellipse(cx + x, cy - 2, 4.2, 4.2, "a")
        c.ellipse(cx + x, cy - 2, 3.0, 3.0, "W")
        c.ellipse(cx + x - 0.8, cy - 2.8, 1.2, 1.2, "w")
    # la sigla del Consorzio
    c.rect(cx - 26, cy + 4, cx - 14, cy + 9, "s")
    g = c.grid(threshold=0.45)
    g.stamp(int(cx) - 25, int(cy) + 5, ["eEeEeEeEeE", "E e E e E "])
    # chiodatura
    for x in range(int(cx) - 26, int(cx) + 22, 6):
        if g.get(x, int(cy) + 16) != ".":
            g.set(x, int(cy) + 16, "o")
        if g.get(x, int(cy) - 15) != ".":
            g.set(x, int(cy) - 15, "a")
    # luce rossa sulla torretta
    g.stamp(int(cx) - 3, int(cy) - 28, [" e ", "eEe"])
    g.outline("o")
    return g


def talpa_drill(frame: int) -> Grid:
    c = Canvas(28, 34, TALPA)
    cy = 17.0
    c.poly([(1, cy - 13.5), (26.5, cy), (1, cy + 13.5)], "c")
    c.poly([(1, cy - 13.5), (26.5, cy), (1, cy - 3)], "h")
    c.poly([(1, cy + 6), (26.5, cy), (1, cy + 13.5)], "b")
    # scanalature oblique che scorrono verso la punta: è così che si vede girare
    groove = c.blank_like()
    for k in range(-2, 6):
        x0 = k * 6.0 + frame * 2.0
        groove.line(x0, cy - 14, x0 + 7.5, cy + 14, 1.5, "a")
    c.paste_masked(groove, mask_keys={"c", "h", "b"})
    g = c.grid(threshold=0.45)
    g.outline("o")
    return g


def talpa_valve(lit: bool) -> Grid:
    c = Canvas(16, 16, TALPA)
    c.ellipse(8, 8, 7.0, 7.0, "N")
    c.ellipse(8, 8, 5.6, 5.6, "n")
    c.ellipse(8, 8, 3.2, 3.2, "g" if lit else "G")
    for a in range(0, 360, 60):
        x = 8 + math.cos(math.radians(a)) * 5.4
        y = 8 + math.sin(math.radians(a)) * 5.4
        c.line(8, 8, x, y, 0.9, "N")
    c.ellipse(8, 8, 1.6, 1.6, "w" if lit else "g")
    g = c.grid(threshold=0.45)
    g.outline("o")
    return g


def talpa_prop(frame: int) -> Grid:
    c = Canvas(10, 26, TALPA)
    if frame == 0:
        c.ellipse(5, 6.5, 2.4, 6.0, "b")
        c.ellipse(5, 19.5, 2.4, 6.0, "a")
    else:
        c.ellipse(5, 9, 3.4, 3.0, "b")
        c.ellipse(5, 17, 3.4, 3.0, "a")
    c.ellipse(5, 13, 2.2, 2.2, "c")
    g = c.grid(threshold=0.45)
    g.outline("o")
    return g


# ----------------------------------------------------------------------------
# Pericoli
# ----------------------------------------------------------------------------
HAZ = Palette("hazards", {
    "o": "#1a1626", "a": "#5a5262", "b": "#857c88", "c": "#b0a8ac", "t": "#c8703a", "T": "#8a4622", "u": "#e8a05a",
    "i": "#140c20e6", "I": "#2a1a3cd0", "j": "#3e2a52a0", "g": "#a8f0d0", "G": "#48c8a0", "w": "#ffffff", "W": "#d8f4ff",
    "k": "#16181e", "m": "#566676", "M": "#34404e", "e": "#e5484d", "E": "#ff9a8a", "y": "#f2c23a", "s": "#bfe9f7c0", "S": "#7fc8e8a0",
    "f": "#fff2dcc8", "F": "#ffb878a8", "d": "#c8c0b090"})


def hz_rock() -> Grid:
    c = Canvas(16, 16, HAZ)
    c.poly([(2, 9), (4, 3), (9, 1.5), (13.5, 5), (14, 11), (10, 14.5), (4, 13.5)], "b")
    c.poly([(4, 3), (9, 1.5), (13.5, 5), (9, 6.5), (5, 6)], "c")
    c.poly([(2, 9), (5, 9), (9, 12), (10, 14.5), (4, 13.5)], "a")
    g = c.grid(threshold=0.45)
    g.outline("o")
    return g


def hz_shard() -> Grid:
    c = Canvas(11, 9, HAZ)
    c.poly([(1, 5), (5, 1), (10, 3), (8, 7.5), (3, 8)], "t")
    c.poly([(5, 1), (10, 3), (7, 4)], "u")
    g = c.grid(threshold=0.45)
    g.outline("o")
    return g


def hz_bubble() -> Grid:
    c = Canvas(14, 14, HAZ)
    c.ellipse(7, 7, 6.2, 6.2, "S")
    c.ellipse(7, 7, 4.8, 4.8, "s")
    c.ellipse(5, 5, 1.6, 1.6, "w")
    g = c.grid(threshold=0.45)
    g.outline("W")
    return g


def hz_ink(frame: int) -> Grid:
    c = Canvas(76, 76, HAZ)
    lobes = 9
    for k in range(lobes):
        a = 2 * math.pi * k / lobes + frame * 0.35
        r = 22 + 5 * math.sin(k * 2.3 + frame * 1.7)
        c.ellipse(38 + math.cos(a) * r, 38 + math.sin(a) * r, 13 + (k % 3) * 2, 12 + (k % 2) * 3, "j")
    for k in range(7):
        a = 2 * math.pi * k / 7 + 0.4 - frame * 0.3
        c.ellipse(38 + math.cos(a) * 13, 38 + math.sin(a) * 13, 12, 11, "I")
    c.ellipse(38, 38, 17, 16, "i")
    return c.grid(threshold=0.5)


def hz_spore(frame: int) -> Grid:
    c = Canvas(11, 11, HAZ)
    r = 4.4 if frame == 0 else 3.6
    c.ellipse(5.5, 5.5, r, r, "G")
    c.ellipse(5.5, 5.5, r - 1.4, r - 1.4, "g")
    c.ellipse(5.0, 5.0, 1.0, 1.0, "w")
    return c.grid(threshold=0.45)


def hz_mine(lit: bool) -> Grid:
    c = Canvas(20, 20, HAZ)
    for a in range(0, 360, 45):
        x = 10 + math.cos(math.radians(a)) * 8.4
        y = 10 + math.sin(math.radians(a)) * 8.4
        c.line(10, 10, x, y, 1.6, "M")
    c.ellipse(10, 10, 6.4, 6.4, "m")
    c.ellipse(8.6, 8.2, 3.2, 2.6, "b")
    c.ellipse(10, 11, 2.2, 2.2, "e" if lit else "k")
    g = c.grid(threshold=0.45)
    if lit:
        g.set(10, 10, "E")
    g.outline("o")
    return g


def hz_torpedo() -> Grid:
    c = Canvas(20, 10, HAZ)
    c.capsule(4, 5, 15, 5, 3.4, "m", 2.6)
    c.ellipse(15.5, 5, 2.6, 2.6, "e")
    c.poly([(2, 5), (5, 1), (6.5, 4)], "M")
    c.poly([(2, 5), (5, 9), (6.5, 6)], "M")
    c.line(6, 3.6, 12, 3.4, 0.8, "b")
    g = c.grid(threshold=0.45)
    g.outline("o")
    return g


def hz_wave() -> Grid:
    c = Canvas(14, 24, HAZ)
    pts_out = [(3 + math.sin(math.pi * i / 10) * 9.5, 1.5 + i * 2.1) for i in range(11)]
    pts_in = [(2 + math.sin(math.pi * i / 10) * 5.5, 1.5 + i * 2.1) for i in range(11)]
    c.poly(pts_out + list(reversed(pts_in)), "W")
    inner = [(2.6 + math.sin(math.pi * i / 10) * 8.2, 2.5 + i * 1.9) for i in range(11)]
    c.curve(inner, 1.0, "w")
    return c.grid(threshold=0.45)


def hz_jet(frame: int) -> Grid:
    c = Canvas(24, 16, HAZ)
    for k in range(6):
        x = 4 + ((k * 7 + frame * 5) % 17)
        y = 2 + ((k * 5 + frame * 9) % 12)
        r = 3.0 + (k % 3)
        c.ellipse(x, y, r, r, "F" if k % 2 else "f")
    for k in range(3):
        c.ellipse(7 + k * 5, (4 + k * 5 + frame * 6) % 15, 1.4, 1.4, "w")
    return c.grid(threshold=0.4)


def hz_dust() -> Grid:
    c = Canvas(18, 8, HAZ)
    for x, y, r in ((4, 4, 3), (9, 3.4, 3.6), (14, 4.4, 2.8)):
        c.ellipse(x, y, r, r * 0.8, "d")
    return c.grid(threshold=0.4)


def build(out_dir: str) -> str:
    sheet = Sheet("Boss del Calderone e loro pericoli")
    sheet.add_palette(MURENA)
    for i, g in enumerate([murena_head(False), murena_head(True)]):
        sheet.add(f"murena_boss_head_{i}", g, MURENA, ax=20, ay=15)
    for i in range(2):
        sheet.add(f"murena_boss_body_{i}", murena_body(i), MURENA)
    sheet.add("den_0", den(False), MURENA)
    sheet.add("den_1", den(True), MURENA)

    sheet.add_palette(GRANSEOLA)
    ax, ay = GW // 2, 30
    sheet.add_frames("granseola_walk", [granseola("walk", 2 * math.pi * i / 4) for i in range(4)], GRANSEOLA, ax, ay)
    sheet.add_frames("granseola_charge", [granseola("charge", math.pi * i) for i in range(2)], GRANSEOLA, ax, ay)
    sheet.add_frames("granseola_rear", [granseola("rear", 0.6 * i) for i in range(2)], GRANSEOLA, ax, ay)
    sheet.add_frames("granseola_flip", [granseola("flip", math.pi * i / 2) for i in range(2)], GRANSEOLA, ax, ay)

    pal = sheet.add_palette(SPADA.palette())
    swim, hurt, sax, say = spadaccino_frames()
    sheet.add_frames("spadaccino_swim", swim, pal, sax, say)
    sheet.add("spadaccino_hurt_0", hurt, pal, sax, say)

    sheet.add_palette(POLPO)
    for i, pose in enumerate(["calm", "angry", "stun"]):
        sheet.add(f"polpo_boss_head_{i}", polpo_head(pose), POLPO, ax=29, ay=30)
    sheet.add("polpo_boss_arm_0", polpo_arm(6.0), POLPO)
    sheet.add("polpo_boss_arm_1", polpo_arm(4.4), POLPO)
    sheet.add("polpo_boss_arm_2", polpo_arm(3.0), POLPO)
    sheet.add("polpo_boss_shield_0", amphora(24, 34), POLPO)
    sheet.add("hz_amphora_0", amphora(15, 20), POLPO)

    sheet.add_palette(LANTERNA)
    sheet.add("lanterna_boss_0", lanterna(False), LANTERNA, ax=31, ay=28)
    sheet.add("lanterna_boss_1", lanterna(True), LANTERNA, ax=31, ay=28)
    sheet.add("lanterna_lure_0", lure(False), LANTERNA)
    sheet.add("lanterna_lure_1", lure(True), LANTERNA)

    sheet.add_palette(TALPA)
    sheet.add("talpa_hull_0", talpa_hull(), TALPA, ax=48, ay=28)
    for i in range(3):
        sheet.add(f"talpa_drill_{i}", talpa_drill(i), TALPA, ax=1, ay=17)
    sheet.add("talpa_valve_0", talpa_valve(False), TALPA)
    sheet.add("talpa_valve_1", talpa_valve(True), TALPA)
    sheet.add("talpa_prop_0", talpa_prop(0), TALPA)
    sheet.add("talpa_prop_1", talpa_prop(1), TALPA)

    sheet.add_palette(HAZ)
    sheet.add("hz_rock_0", hz_rock(), HAZ)
    sheet.add("hz_shard_0", hz_shard(), HAZ)
    sheet.add("hz_bubble_0", hz_bubble(), HAZ)
    sheet.add("hz_ink_0", hz_ink(0), HAZ)
    sheet.add("hz_ink_1", hz_ink(1), HAZ)
    sheet.add("hz_spore_0", hz_spore(0), HAZ)
    sheet.add("hz_spore_1", hz_spore(1), HAZ)
    sheet.add("hz_mine_0", hz_mine(False), HAZ)
    sheet.add("hz_mine_1", hz_mine(True), HAZ)
    sheet.add("hz_torpedo_0", hz_torpedo(), HAZ)
    sheet.add("hz_wave_0", hz_wave(), HAZ)
    sheet.add("hz_jet_0", hz_jet(0), HAZ)
    sheet.add("hz_jet_1", hz_jet(1), HAZ)
    sheet.add("hz_dust_0", hz_dust(), HAZ)

    path = f"{out_dir}/bosses.spr"
    sheet.write(path)
    return path
