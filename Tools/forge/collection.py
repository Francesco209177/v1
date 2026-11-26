"""Oggetti del paese: maioliche dei Nerei, cartoline, ortaggi dell'orto, bocce, note della sfida a ritmo."""
import math

from forge import Canvas, Grid, Palette, Sheet

PAL = Palette("collection", {
    "o": "#1a1626", "w": "#f7f1e3", "W": "#d9d0bc", "b": "#1f4e9c", "B": "#16386e", "c": "#2bb7b3", "y": "#f2b84b", "Y": "#b8861d",
    "r": "#d8553b", "R": "#9a3423", "g": "#4f9a4a", "G": "#2f6a34", "k": "#10141f", "s": "#8fd6f0", "S": "#4a9ad0", "n": "#c8703a",
    "p": "#f4d0c0", "v": "#7a4a9a", "h": "#ffffff", "e": "#e5484d", "m": "#566676"})

T = 20


def _tile_base() -> Canvas:
    c = Canvas(T, T, PAL)
    c.rect(0, 0, T, T, "W")
    c.rect(1, 1, T - 1, T - 1, "w")
    return c


def _frame(g: Grid) -> Grid:
    for i in range(T):
        for x, y in ((i, 0), (i, T - 1), (0, i), (T - 1, i)):
            g.set(x, y, "b")
    for x, y in ((2, 2), (T - 3, 2), (2, T - 3), (T - 3, T - 3)):
        g.set(x, y, "y")
    return g


def tile(n: int) -> Grid:
    c = _tile_base()
    m = T / 2
    if n == 1:      # l'onda nel cerchio
        c.ellipse(m, m, 7, 7, "b")
        c.ellipse(m, m, 5.6, 5.6, "w")
        c.curve([(5.5, 11), (8, 8.5), (10, 11), (12, 13), (14.5, 10)], 1.3, "c")
    elif n == 2:    # il pesce con due code
        c.ellipse(m, m, 4.6, 2.6, "b")
        c.poly([(5.6, m), (2.6, m - 3), (2.6, m + 3)], "b")
        c.poly([(14.4, m), (17.4, m - 3), (17.4, m + 3)], "b")
        c.ellipse(m, m, 1.0, 1.0, "y")
    elif n == 3:    # la gorgonia
        for k in range(5):
            a = math.pi * (0.2 + 0.15 * k)
            c.line(m, 16, m - math.cos(a) * 8, 16 - math.sin(a) * 10, 1.1, "r")
        c.line(m, 16, m, 5, 1.1, "r")
    elif n == 4:    # il polpo che conta
        c.ellipse(m, 7.5, 3.6, 3.2, "v")
        for k in range(4):
            x = m - 4.5 + k * 3
            c.curve([(x, 10), (x - 0.8 + (k % 2) * 1.6, 13), (x, 16)], 1.1, "v")
    elif n == 5:    # la barca senza remi
        c.poly([(4, 8), (16, 8), (13.5, 12.5), (6.5, 12.5)], "n")
        c.line(4, 15, 16, 15, 1.0, "c")
    elif n == 6:    # la spada
        c.ellipse(8.5, m, 4.4, 2.2, "b")
        c.line(12, m, 17.5, m, 0.9, "b")
        c.poly([(4.6, m), (2.6, m - 3), (3.6, m), (2.6, m + 3)], "b")
        c.poly([(8, m - 2), (10, m - 5), (11, m - 2)], "b")
    elif n == 7:    # la piazza
        for k in range(7):
            a = 2 * math.pi * k / 7
            c.line(m + math.cos(a) * 2.4, m + math.sin(a) * 2.4, m + math.cos(a) * 7.5, m + math.sin(a) * 7.5, 1.0, "n")
        c.ellipse(m, m, 1.6, 1.6, "y")
    elif n == 8:    # la cuoca
        c.ellipse(m, 6.5, 2.4, 2.4, "n")
        c.poly([(m - 3.2, 16), (m - 1.6, 9), (m + 1.6, 9), (m + 3.2, 16)], "r")
        c.line(m + 2, 11, m + 6, 8, 0.9, "y")
        c.ellipse(m + 6.2, 7.6, 1.3, 1.3, "y")
    elif n == 9:    # il monte che respira
        c.poly([(3.5, 16), (8.5, 7), (11.5, 7), (16.5, 16)], "m")
        c.poly([(8.5, 7), (11.5, 7), (10.6, 9), (9.4, 9)], "r")
        c.ellipse(8, 4.5, 1.4, 1.2, "W")
        c.ellipse(12, 3.8, 1.6, 1.3, "W")
    elif n == 10:   # la ruota
        c.ellipse(m, m, 7, 7, "Y")
        c.ellipse(m, m, 5.4, 5.4, "w")
        for k in range(7):
            a = 2 * math.pi * k / 7
            c.line(m, m, m + math.cos(a) * 6, m + math.sin(a) * 6, 0.9, "Y")
        c.ellipse(m, m, 1.5, 1.5, "y")
    elif n == 11:   # la luce nel buio
        c.rect(2, 2, T - 2, T - 2, "k")
        c.ellipse(m, 8, 2.2, 2.2, "y")
        for k in range(5):
            x = 5 + k * 2.5
            c.poly([(x, 13), (x + 1.2, 16.5), (x + 2.4, 13)], "w")
    else:           # quanto basta
        c.ellipse(7.5, 7.5, 3.6, 2.8, "m")
        c.ellipse(7.5, 7.5, 2.4, 1.7, "w")
        c.line(10, 9.5, 16, 15.5, 1.3, "m")
    return _frame(c.grid(threshold=0.45))


def card(n: int) -> Grid:
    skies = ["s", "y", "S", "k", "s", "s", "y", "S", "r", "s"]
    seas = ["c", "b", "b", "B", "c", "S", "n", "c", "B", "c"]
    c = Canvas(28, 20, PAL)
    c.rect(0, 0, 28, 20, "W")
    c.rect(1, 1, 27, 19, "w")
    c.rect(3, 3, 19, 11, skies[n])
    c.rect(3, 11, 19, 17, seas[n])
    if n == 0:      # porto
        c.rect(6, 7, 12, 11, "w")
        c.poly([(5, 7), (9, 4.5), (13, 7)], "r")
    elif n == 1:    # guida: una stella
        c.poly([(11, 4), (12.4, 7.4), (16, 7.6), (13.2, 9.8), (14.2, 13.2), (11, 11.2), (7.8, 13.2), (8.8, 9.8), (6, 7.6), (9.6, 7.4)], "w")
    elif n == 2:    # parete: figurina
        c.ellipse(11, 12.5, 2.4, 1.0, "y")
    elif n == 3:    # fondo
        c.ellipse(11, 13, 1.4, 1.4, "y")
        c.rect(3, 15, 19, 17, "k")
    elif n == 4:    # quaderno
        c.rect(7, 5, 15, 15, "w")
        c.line(9, 8, 13, 8, 0.8, "b")
        c.line(9, 11, 13, 11, 0.8, "b")
    elif n == 5:    # cento pesci
        for x, y in ((7, 13), (11, 14.5), (15, 13), (9, 15.6), (13, 15.8)):
            c.ellipse(x, y, 1.6, 0.9, "w")
    elif n == 6:    # ricettario
        c.ellipse(11, 12, 4.6, 2.2, "w")
        c.ellipse(11, 11.4, 2.4, 1.2, "r")
    elif n == 7:    # ritratti
        c.ellipse(11, 13, 3.2, 2.4, "g")
        c.ellipse(14.6, 12.4, 1.2, 1.0, "g")
    elif n == 8:    # sei a zero
        for k in range(6):
            c.ellipse(5.5 + k * 2.2, 14, 0.9, 0.9, "y")
    else:           # conti
        c.ellipse(11, 8, 3.0, 3.0, "y")
        c.ellipse(11, 8, 1.6, 1.6, "Y")
    # francobollo e righe dell'indirizzo
    c.rect(21, 3, 25, 8, "r")
    c.line(21, 11, 25, 11, 0.7, "m")
    c.line(21, 13.5, 25, 13.5, 0.7, "m")
    c.line(21, 16, 24, 16, 0.7, "m")
    g = c.grid(threshold=0.45)
    g.outline("o")
    return g


def crop(name: str) -> Grid:
    c = Canvas(14, 14, PAL)
    if name == "pomodoro":
        c.ellipse(7, 8, 5, 4.6, "r")
        c.ellipse(5.4, 6.4, 1.6, 1.2, "p")
        c.poly([(5, 4), (7, 2.4), (9, 4), (7, 5)], "g")
    elif name == "basilico":
        c.ellipse(4.6, 8, 3.2, 4.2, "g")
        c.ellipse(9.4, 7, 3.4, 4.6, "g")
        c.line(4.6, 5, 4.6, 11, 0.7, "G")
        c.line(9.4, 4, 9.4, 10.5, 0.7, "G")
    elif name == "limone":
        c.ellipse(7, 7.5, 5.4, 4.0, "y")
        c.ellipse(1.8, 7.5, 1.2, 1.0, "y")
        c.ellipse(12.2, 7.5, 1.2, 1.0, "y")
        c.ellipse(5.4, 6, 1.8, 1.0, "w")
        c.poly([(7, 3.6), (9.6, 1.6), (9.4, 4.2)], "g")
    elif name == "capperi":
        for x, y in ((4.4, 5), (9, 4.4), (6.4, 9), (10.4, 9.4), (3.4, 10)):
            c.ellipse(x, y, 2.0, 2.2, "g")
            c.ellipse(x - 0.6, y - 0.8, 0.7, 0.6, "c")
    else:  # aglio
        c.ellipse(7, 8.6, 4.6, 4.2, "w")
        c.poly([(5.6, 5.6), (7, 1.6), (8.4, 5.6)], "w")
        c.line(7, 5, 7, 12.4, 0.7, "W")
        c.line(4.6, 7, 5.4, 12, 0.7, "W")
        c.line(9.4, 7, 8.6, 12, 0.7, "W")
    g = c.grid(threshold=0.42)
    g.outline("o")
    return g


def pickup_maiolica() -> Grid:
    c = Canvas(14, 12, PAL)
    c.poly([(2, 5), (9, 2), (12, 7), (5, 10.5)], "w")
    c.poly([(3.6, 5.4), (8.6, 3.4), (10.4, 6.8), (5.6, 9)], "b")
    c.ellipse(7, 6.2, 1.5, 1.2, "y")
    g = c.grid(threshold=0.45)
    g.set(10, 2, "h")
    g.set(11, 1, "h")
    g.set(11, 3, "h")
    g.set(12, 2, "h")
    g.outline("o")
    return g


def ball(key: str, light: str, r: float) -> Grid:
    n = int(r * 2 + 3)
    c = Canvas(n, n, PAL)
    m = n / 2
    c.ellipse(m, m, r, r, key)
    c.ellipse(m - r * 0.3, m - r * 0.35, r * 0.4, r * 0.3, light)
    g = c.grid(threshold=0.45)
    g.outline("o")
    return g


def note(kind: str) -> Grid:
    c = Canvas(16, 16, PAL)
    if kind == "knife":
        c.ellipse(8, 8, 7, 7, "r")
        c.poly([(4, 10.5), (11.5, 3.5), (12.5, 5.5), (6.5, 11.5)], "w")
        c.line(3.6, 12.4, 5.6, 10.6, 1.6, "k")
    else:
        c.ellipse(8, 8, 7, 7, "c")
        c.ellipse(7, 8.5, 3.8, 3.0, "k")
        c.ellipse(7, 8.2, 2.6, 1.9, "m")
        c.line(10, 7, 13.5, 4.5, 1.3, "k")
    g = c.grid(threshold=0.45)
    g.outline("o")
    return g


def build(out_dir: str) -> str:
    sheet = Sheet("Collezione, orto e giochi del bar")
    sheet.add_palette(PAL)
    for n in range(1, 13):
        sheet.add(f"tile_{n}", tile(n), PAL)
    for n in range(10):
        sheet.add(f"card_{n + 1}", card(n), PAL)
    for name in ("pomodoro", "basilico", "limone", "capperi", "aglio"):
        sheet.add(f"crop_{name}", crop(name), PAL)
    g = pickup_maiolica()
    sheet.add("pickup_maiolica", g, PAL, ax=g.w // 2, ay=g.h - 1)
    sheet.add("boccia_0", ball("c", "h", 4.0), PAL)
    sheet.add("boccia_1", ball("r", "p", 4.0), PAL)
    sheet.add("pallino_0", ball("w", "h", 2.4), PAL)
    sheet.add("note_0", note("knife"), PAL)
    sheet.add("note_1", note("pan"), PAL)
    path = f"{out_dir}/collection.spr"
    sheet.write(path)
    return path
