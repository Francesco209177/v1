"""Oggetti e particelle del mare: bolle, plancton, flora del fondale, rovine, corda di risalita, gozzo."""
import math
import random

from forge import Canvas, Grid, Palette, Sheet

PAL = Palette("sea", {
    "b": "#d6f3fbe6",  # bordo della bolla
    "i": "#bfe9f748",  # interno traslucido
    "w": "#ffffff",    # riflesso
    "p": "#e8f6d8b0",  # plancton chiaro
    "q": "#a8d8c880",  # plancton lontano
})

FLORA = Palette("flora", {
    "o": "#0f2f3a",  # contorno verde-blu scuro
    "g": "#1f7a5a",  # posidonia
    "G": "#145244",
    "l": "#49b36b",
    "L": "#9be08a",
    "r": "#c8364a",  # gorgonia rossa
    "R": "#7d1f3d",
    "s": "#f0747a",
    "y": "#f2b830",  # gorgonia gialla, spugna
    "Y": "#b97a1c",
    "z": "#ffe27a",
    "v": "#8a4fb0",  # gorgonia viola
    "V": "#532d7a",
    "u": "#c08ae0",
    "e": "#e8703a",  # spugna arancio
    "E": "#a8421f",
    "f": "#ffa25e",
    "k": "#2a1a2e",  # fori scuri
    "t": "#6fd0a0",  # tentacoli dell'anemone
    "T": "#3d9a7c",
    "m": "#b05cc0",  # punte viola
    "n": "#6a4a3a",  # piede dell'anemone
})

STONE = Palette("stone", {
    "o": "#141b2e",
    "a": "#e6e2d2",  # marmo in luce
    "b": "#b9b8ac",
    "c": "#8a8f92",
    "d": "#5b6474",
    "g": "#4f9a7e",  # muschio
    "G": "#2f6e5c",
    "k": "#1d1a24",  # basalto
    "K": "#38303a",
    "j": "#5a4a50",
    "y": "#f0c63c",  # zolfo, oro
    "Y": "#b98a22",
    "z": "#fff1a0",
    "h": "#ff8a3c",  # bagliore caldo
    "t": "#3fb8a4",  # verderame
    "T": "#1f7a70",
})

BOAT = Palette("boat", {
    "o": "#1a2238",
    "w": "#f4efe2",  # scafo bianco
    "W": "#cfc8b6",
    "x": "#a39c8c",
    "b": "#2f6fb5",  # fascia azzurra
    "B": "#1e4a80",
    "r": "#d8483a",  # carena rossa
    "R": "#9a2c2c",
    "n": "#9a6a3a",  # legno
    "N": "#6a4526",
    "m": "#c89a5a",
    "y": "#f2c23a",  # galleggiante
    "Y": "#c8881e",
    "e": "#e8e0c8",  # corda
    "E": "#a89c80",
    "s": "#f08a3a",  # boa arancio
    "S": "#b8541e",
    "k": "#3a3a48",
})

BUBBLES = [
    [".b.",
     "bib",
     ".b."],
    [".bbb.",
     "bwiib",
     "biiib",
     "biiib",
     ".bbb."],
    ["..bbb..",
     ".bwwib.",
     "bwiiiib",
     "biiiiib",
     "biiiiib",
     ".biiib.",
     "..bbb.."],
]

PLANKTON = [
    ["p"],
    ["q"],
    [".p.",
     "pqp",
     ".p."],
]


# ----------------------------------------------------------------------------
# Posidonia: ciuffi di foglie a nastro che ondeggiano con la corrente
# ----------------------------------------------------------------------------
def posidonia(variant: int, frame: int) -> Grid:
    rnd = random.Random(100 + variant)
    height = [16, 22, 28][variant]
    w, h = 22, height + 3
    c = Canvas(w, h, FLORA)
    sway = math.sin(2 * math.pi * frame / 4)
    leaves = 5 + variant
    base_x = w / 2
    order = list(range(leaves))
    rnd.shuffle(order)
    for n in order:
        spread = (n - (leaves - 1) / 2) / max(leaves - 1, 1)
        length = height * rnd.uniform(0.62, 1.0)
        lean = spread * 7.0 + rnd.uniform(-1.0, 1.0)
        phase = rnd.uniform(0, 1.5)
        pts = []
        for i in range(7):
            t = i / 6
            bend = math.sin(2 * math.pi * frame / 4 - t * 2.2 - phase) * 2.2 * t
            x = base_x + spread * 3.0 + lean * t * t + bend + sway * 0.6 * t
            y = h - 1.5 - length * t
            pts.append((x, y))
        key = ["g", "l", "g", "G", "l"][n % 5]
        c.curve(pts, 2.1, key, taper=0.45)
        if key != "G":
            c.curve(pts[4:], 1.0, "L" if key == "l" else "l", taper=0.6)
    g = c.grid(threshold=0.38)
    g.outline("o")
    return g


# ----------------------------------------------------------------------------
# Gorgonia: ventaglio ramificato
# ----------------------------------------------------------------------------
def gorgonia(variant: int) -> Grid:
    rnd = random.Random(200 + variant)
    dark, mid, light = [("R", "r", "s"), ("Y", "y", "z"), ("V", "v", "u")][variant]
    w, h = 30, 30
    c = Canvas(w, h, FLORA)

    def branch(x: float, y: float, ang: float, length: float, depth: int) -> None:
        x2 = x + math.cos(ang) * length
        y2 = y + math.sin(ang) * length
        key = dark if depth == 0 else (mid if depth < 3 else light)
        c.line(x, y, x2, y2, 1.35 if depth < 2 else 1.05, key)
        if depth < 4 and length > 2.2:
            n = 2 if depth > 0 else 3
            for k in range(n):
                off = (k - (n - 1) / 2) * rnd.uniform(0.45, 0.75)
                branch(x2, y2, ang + off + rnd.uniform(-0.12, 0.12), length * rnd.uniform(0.66, 0.82), depth + 1)

    branch(w / 2, h - 1.5, -math.pi / 2, 7.5, 0)
    g = c.grid(threshold=0.22)
    g.outline("o")
    return g


def sponge(variant: int) -> Grid:
    c = Canvas(18, 16, FLORA)
    dark, mid, light = [("E", "e", "f"), ("Y", "y", "z")][variant]
    tubes = [(5.0, 7.0, 2.6), (9.5, 9.5, 2.9), (13.0, 6.0, 2.3)] if variant == 0 else [(6.0, 8.0, 3.2), (11.5, 6.5, 2.7)]
    for x, top, r in tubes:
        c.capsule(x, 14.5, x, top, r, mid, r * 0.92)
        c.capsule(x + r * 0.45, 14.5, x + r * 0.45, top + 1.0, r * 0.42, dark, r * 0.4)
        c.ellipse(x, top - 0.4, r * 0.95, 1.5, light)
        c.ellipse(x, top - 0.3, r * 0.55, 0.85, "k")
    g = c.grid()
    g.outline("o")
    return g


def anemone(variant: int, frame: int) -> Grid:
    rnd = random.Random(300 + variant)
    c = Canvas(20, 16, FLORA)
    c.ellipse(10, 14.0, 4.6, 2.4, "n")
    n = 9 if variant == 0 else 7
    for k in range(n):
        spread = (k - (n - 1) / 2) / ((n - 1) / 2)
        length = rnd.uniform(6.5, 9.5)
        phase = rnd.uniform(0, 2.0)
        pts = []
        for i in range(6):
            t = i / 5
            wob = math.sin(2 * math.pi * frame / 3 + phase - t * 2.0) * 1.5 * t
            pts.append((10 + spread * (2.0 + 5.5 * t) + wob, 13.0 - length * t * (1 - 0.25 * abs(spread))))
        c.curve(pts, 1.7, "T" if k % 2 else "t", taper=0.7)
        c.ellipse(pts[-1][0], pts[-1][1], 0.9, 0.9, "m")
    g = c.grid(threshold=0.4)
    g.outline("o")
    return g


# ----------------------------------------------------------------------------
# Pietra: colonne della città sommersa, camini, cristalli
# ----------------------------------------------------------------------------
def column(variant: int) -> Grid:
    if variant == 0:  # colonna spezzata in piedi
        c = Canvas(16, 34, STONE)
        c.rect(2.0, 30.0, 14.0, 33.0, "c")
        c.rect(3.0, 28.5, 13.0, 30.0, "b")
        c.poly([(4.2, 28.5), (11.8, 28.5), (11.4, 6.0), (9.0, 3.5), (7.0, 6.5), (4.6, 4.5)], "b")
        for x in (5.4, 7.6, 9.8):
            c.rect(x, 7.0, x + 0.8, 28.0, "c")
        c.rect(4.3, 7.0, 5.2, 28.0, "a")
        c.poly([(4.4, 17.0), (8.5, 16.4), (9.5, 18.0), (4.4, 18.6)], "G")
        c.poly([(4.4, 17.0), (7.0, 16.6), (7.5, 17.6), (4.4, 18.0)], "g")
        g = c.grid()
    else:  # rocchio caduto
        c = Canvas(34, 16, STONE)
        c.capsule(5.0, 9.5, 28.0, 9.5, 4.6, "b")
        for y in (7.0, 9.2, 11.4):
            c.rect(6.0, y, 27.0, y + 0.8, "c")
        c.rect(6.0, 5.4, 27.0, 6.3, "a")
        c.ellipse(28.5, 9.5, 2.6, 4.6, "c")
        c.ellipse(28.8, 9.5, 1.3, 2.6, "d")
        c.poly([(10.0, 5.0), (17.0, 4.6), (18.0, 6.5), (10.5, 7.0)], "g")
        g = c.grid()
    g.outline("o")
    return g


def vent(variant: int) -> Grid:
    c = Canvas(18, 24, STONE)
    top = 5.0 if variant == 0 else 9.0
    c.poly([(3.0, 23.0), (15.0, 23.0), (11.8, top + 1.0), (11.0, top), (7.0, top), (6.2, top + 1.0)], "K")
    c.poly([(9.0, 23.0), (15.0, 23.0), (11.8, top + 1.0), (10.0, top + 0.5)], "k")
    c.poly([(5.2, 20.0), (7.0, top + 2.0), (8.2, top + 2.0), (7.0, 20.0)], "j")
    c.ellipse(9.0, top + 0.3, 2.0, 0.9, "h")
    c.ellipse(9.0, top + 0.2, 1.0, 0.5, "z")
    c.ellipse(6.0, 15.0, 1.0, 0.8, "y")
    c.ellipse(11.5, 18.5, 1.2, 0.8, "Y")
    g = c.grid()
    g.outline("o")
    return g


def crystal(variant: int) -> Grid:
    c = Canvas(18, 18, STONE)
    shards = [(5.0, 17.0, -0.35, 9.0, 2.2), (9.0, 17.0, 0.05, 13.0, 2.8), (13.0, 17.0, 0.4, 8.0, 2.0)]
    light, mid, dark = ("z", "y", "Y") if variant == 0 else ("a", "t", "T")
    for x, y, lean, length, wd in shards:
        tx, ty = x + math.sin(lean) * length, y - math.cos(lean) * length
        c.poly([(x - wd, y), (x + wd, y), (tx + wd * 0.5, ty + wd), (tx, ty), (tx - wd * 0.5, ty + wd)], mid)
        c.poly([(x, y), (x + wd, y), (tx + wd * 0.5, ty + wd), (tx, ty)], dark)
        c.poly([(x - wd, y), (x - wd * 0.3, y), (tx - wd * 0.1, ty + wd), (tx - wd * 0.5, ty + wd)], light)
    g = c.grid()
    g.outline("o")
    return g


# ----------------------------------------------------------------------------
# Corda di risalita e gozzo
# ----------------------------------------------------------------------------
ROPE_SEGMENT = [
    ".eE.",
    ".eE.",
    ".Ee.",
    ".Ee.",
    ".eE.",
    ".eE.",
    ".Ee.",
    ".Ee.",
]


def rope_float() -> Grid:
    c = Canvas(12, 13, BOAT)
    c.ellipse(6, 6, 4.4, 4.6, "s")
    c.ellipse(7.4, 7.4, 2.6, 2.8, "S")
    c.rect(1.6, 5.2, 10.4, 7.0, "w")
    c.ellipse(4.4, 3.6, 1.1, 0.9, "y")
    g = c.grid()
    g.outline("o")
    return g


def gozzo() -> Grid:
    """Il gozzo di famiglia visto di lato: scafo bianco, fascia azzurra, carena rossa."""
    w, h = 78, 34
    c = Canvas(w, h, BOAT)
    deck = 16.0
    hull = [(3.0, deck - 3.5), (8.0, deck), (70.0, deck), (75.5, deck - 5.0), (73.0, deck + 4.0), (66.0, deck + 9.5),
            (14.0, deck + 9.5), (7.0, deck + 5.5)]
    c.poly(hull, "w")
    c.poly([(7.0, deck + 5.5), (14.0, deck + 9.5), (66.0, deck + 9.5), (73.0, deck + 4.0), (72.0, deck + 6.0),
            (65.0, deck + 12.0), (15.0, deck + 12.0), (8.0, deck + 8.0)], "r")
    c.poly([(5.0, deck - 1.0), (8.0, deck + 1.2), (70.5, deck + 1.2), (74.8, deck - 3.0), (74.6, deck - 0.8),
            (70.5, deck + 3.2), (8.0, deck + 3.2), (5.2, deck + 1.0)], "b")
    c.poly([(8.0, deck + 6.5), (70.0, deck + 6.0), (69.0, deck + 8.0), (10.0, deck + 8.4)], "W")
    c.rect(7.0, deck - 1.2, 71.0, deck, "n")          # falchetta di legno
    c.rect(30.0, deck - 6.0, 46.0, deck - 1.2, "m")   # piccola tuga
    c.rect(32.0, deck - 4.8, 36.0, deck - 2.4, "b")
    c.rect(39.0, deck - 4.8, 43.0, deck - 2.4, "b")
    c.rect(29.0, deck - 7.0, 47.0, deck - 6.0, "N")
    c.rect(52.0, deck - 14.0, 53.2, deck - 1.2, "N")  # alberetto
    c.poly([(53.2, deck - 13.6), (60.0, deck - 11.8), (53.2, deck - 10.0)], "r")
    c.capsule(12.0, deck - 2.4, 18.0, deck - 2.4, 1.3, "y")  # parabordo
    g = c.grid()
    g.rim({"w": ("W", ""), "r": ("R", ""), "b": ("B", ""), "m": ("n", "")})
    g.outline("o")
    return g


# ----------------------------------------------------------------------------
# Attrezzi e oggetti da raccogliere
# ----------------------------------------------------------------------------
GEAR = Palette("gear", {
    "o": "#141b2e",
    "m": "#c9d3dc",  # acciaio
    "M": "#7f8c9a",
    "h": "#ffffff",
    "n": "#9a6a3a",  # legno
    "e": "#e8e0c8",  # lenza
    "p": "#5b2a6e",  # riccio
    "P": "#34173f",
    "q": "#9a5ab0",
    "c": "#f6d9d2",  # conchiglia
    "C": "#e39aa0",
    "d": "#b9656f",
    "g": "#58c070",  # lattuga di mare
    "G": "#2f8a4c",
    "l": "#a8ec9a",
    "b": "#c9923a",  # bronzo della campana
    "B": "#8a5f22",
    "y": "#f6d27a",
    "a": "#bfeaf6b0",  # aria
    "A": "#ffffffd0",
    "k": "#7c858f",  # campana esaurita
    "K": "#4d555e",
    "r": "#e5484d",  # avviso
    "w": "#ffffff",
})

HARPOON_TIP = [
    "......o.....",
    ".....omo....",
    "ooooooMmoo..",
    "nnnnMMmmmho.",
    "ooooooMmoo..",
    ".....omo....",
    "......o.....",
]

ALERT = [
    ".ooo.",
    "orrro",
    "orwro",
    "orwro",
    "orwro",
    "orrro",
    ".oro.",
    "orrro",
    "orwro",
    ".ooo.",
]

STAR = [
    "...o...",
    "..oyo..",
    "ooyyyoo",
    "oyyyyyo",
    ".oyyyo.",
    "oyyoyyo",
    "oo...oo",
]


def riccio() -> Grid:
    c = Canvas(16, 13, GEAR)
    for i in range(13):
        a = math.pi + math.pi * i / 12
        c.line(8, 9.5, 8 + math.cos(a) * 7.0, 9.5 + math.sin(a) * 7.5, 0.8, "P" if i % 2 else "q")
    c.ellipse(8, 9.2, 4.6, 3.6, "p")
    c.ellipse(6.6, 8.0, 1.6, 1.0, "q")
    g = c.grid(threshold=0.3)
    g.outline("o")
    return g


def conchiglia() -> Grid:
    c = Canvas(15, 12, GEAR)
    pts = [(7.5, 10.5)]
    for i in range(11):
        a = math.pi * 1.08 + (math.pi * 0.84) * i / 10
        pts.append((7.5 + math.cos(a) * 6.0, 9.5 + math.sin(a) * 7.4))
    c.poly(pts, "c")
    for i in range(5):
        a = math.pi * 1.18 + (math.pi * 0.64) * i / 4
        c.line(7.5, 10.0, 7.5 + math.cos(a) * 5.4, 9.5 + math.sin(a) * 6.8, 0.8, "C")
    c.rect(5.0, 9.6, 10.0, 11.0, "d")
    g = c.grid()
    g.outline("o")
    return g


def alga() -> Grid:
    c = Canvas(15, 13, GEAR)
    for cx, cy, r, key in ((4.5, 8.5, 3.6, "G"), (10.0, 8.0, 4.0, "g"), (7.5, 5.5, 3.8, "g"), (7.0, 9.5, 3.0, "G")):
        c.ellipse(cx, cy, r, r * 0.8, key)
    for cx, cy in ((6.5, 4.5), (10.5, 6.5), (4.0, 7.5)):
        c.ellipse(cx, cy, 1.5, 0.9, "l")
    g = c.grid()
    g.outline("o")
    return g


def campana(full: bool) -> Grid:
    """Campana d'aria: una cupola di bronzo con una bolla d'aria sotto, da cui Tecla respira."""
    c = Canvas(26, 26, GEAR)
    body, dark, light = ("b", "B", "y") if full else ("k", "K", "k")
    pts = [(4.0, 17.0)]
    for i in range(13):
        a = math.pi + math.pi * i / 12
        pts.append((13 + math.cos(a) * 9.0, 12.0 + math.sin(a) * 9.5))
    pts.append((22.0, 17.0))
    c.poly(pts, body)
    c.poly([(13.0, 2.6), (22.0, 12.0), (22.0, 17.0), (15.0, 17.0)], dark)
    c.rect(3.0, 16.0, 23.0, 18.4, dark)
    c.rect(11.4, 0.5, 14.6, 3.0, dark)
    c.ellipse(8.0, 8.5, 1.8, 2.8, light)
    if full:
        c.ellipse(13, 19.5, 7.5, 3.2, "a")
        c.ellipse(10.5, 18.8, 2.2, 0.9, "A")
    c.line(13, 21.5, 13, 25.5, 1.0, "e")
    g = c.grid()
    g.outline("o")
    return g


def build(out_dir: str) -> str:
    sheet = Sheet("Mare: particelle, flora, pietra, barca")
    sheet.add_palette(GEAR)
    tip = Grid.from_rows(HARPOON_TIP)
    sheet.add("harpoon_tip", tip, GEAR, ax=4, ay=3)
    sheet.add("alert", Grid.from_rows(ALERT), GEAR, ax=2, ay=9)
    sheet.add("star", Grid.from_rows(STAR), GEAR)
    for name, grid in (("riccio", riccio()), ("conchiglia", conchiglia()), ("alga", alga())):
        sheet.add(f"pickup_{name}", grid, GEAR, ax=grid.w // 2, ay=grid.h - 1)
    for name, grid in (("campana", campana(True)), ("campana_vuota", campana(False))):
        sheet.add(f"pickup_{name}", grid, GEAR, ax=grid.w // 2, ay=18)
    for pal in (PAL, FLORA, STONE, BOAT):
        sheet.add_palette(pal)
    for i, rows in enumerate(BUBBLES):
        sheet.add(f"bubble_{i}", Grid.from_rows(rows), PAL)
    for i, rows in enumerate(PLANKTON):
        sheet.add(f"plankton_{i}", Grid.from_rows(rows), PAL)

    for v in range(3):
        frames = [posidonia(v, f) for f in range(4)]
        sheet.add_frames(f"posidonia{v}", frames, FLORA, ax=frames[0].w // 2, ay=frames[0].h - 1)
        g = gorgonia(v)
        sheet.add(f"gorgonia{v}_0", g, FLORA, ax=g.w // 2, ay=g.h - 1)
    for v in range(2):
        g = sponge(v)
        sheet.add(f"sponge{v}_0", g, FLORA, ax=g.w // 2, ay=g.h - 1)
        frames = [anemone(v, f) for f in range(3)]
        sheet.add_frames(f"anemone{v}", frames, FLORA, ax=frames[0].w // 2, ay=frames[0].h - 1)
        g = column(v)
        sheet.add(f"column{v}_0", g, STONE, ax=g.w // 2, ay=g.h - 1)
        g = vent(v)
        sheet.add(f"vent{v}_0", g, STONE, ax=g.w // 2, ay=g.h - 1)
        g = crystal(v)
        sheet.add(f"crystal{v}_0", g, STONE, ax=g.w // 2, ay=g.h - 1)

    sheet.add("rope_segment", Grid.from_rows(ROPE_SEGMENT), BOAT, ax=2, ay=0)
    f = rope_float()
    sheet.add("rope_float", f, BOAT, ax=f.w // 2, ay=f.h // 2)
    boat = gozzo()
    sheet.add("gozzo", boat, BOAT, ax=boat.w // 2, ay=17)

    path = f"{out_dir}/sea_props.spr"
    sheet.write(path)
    return path
