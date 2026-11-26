"""Interni dell'osteria e porto di Pietrasale: muri, maioliche, pavimento, cucina, botte, tavoli,
piatti, fumetti dei clienti, facciata dell'osteria e banchina.
"""
import math
import random

from forge import Canvas, Grid, Palette, Sheet

ROOM = Palette("room", {
    "o": "#2a1a1e",  # contorno caldo
    "p": "#f3dcae",  # intonaco
    "P": "#e3c48e",
    "q": "#fbebc8",
    "n": "#8a5a32",  # legno
    "N": "#5e3a22",
    "m": "#b8824a",
    "M": "#d9a868",
    "w": "#fbf6ea",  # maiolica bianca
    "W": "#dcd3c0",
    "b": "#2f6fb5",  # blu cobalto
    "B": "#1e4a80",
    "y": "#f2b830",  # giallo
    "Y": "#c88a1e",
    "t": "#c8663e",  # cotto
    "T": "#a04a2c",
    "u": "#e08a5a",
    "k": "#1c2440",  # notte fuori
    "K": "#3a4a7a",
    "s": "#f7a65e",  # tramonto
    "S": "#f2d27a",
    "g": "#4f9a6a",  # verde
    "G": "#2f6a4a",
    "r": "#d8483a",  # rosso
    "R": "#9a2c2c",
    "e": "#ffd98a",  # luce calda
    "E": "#ffb04a",
    "d": "#3a2a2e",  # buio della cucina
    "D": "#5a3a34",
    "a": "#c9d3dc",  # acciaio
    "A": "#7f8c9a",
    "v": "#7a1f3a",  # vino
    "V": "#b03a5a",
    "c": "#ffffff",
    "h": "#f6f0e2",  # tovaglia
    "H": "#d8d0bc",
    "z": "#8fdcef",  # vetro
})

FOOD = Palette("food", {
    "o": "#2a1a1e",
    "p": "#fbf6ea",  # piatto
    "P": "#cfc8b6",
    "a": "#c8663e",  # fritto dorato
    "A": "#f2b24a",
    "b": "#b9d3e6",  # pesce azzurro
    "B": "#6f8fb0",
    "r": "#d8483a",  # pomodoro
    "R": "#9a2c2c",
    "g": "#58c070",  # verde
    "G": "#2f8a4c",
    "y": "#f6d24a",  # limone, pasta
    "Y": "#d8a22e",
    "w": "#f4f0e0",  # carne bianca
    "W": "#d8d0b8",
    "k": "#4a3a2e",  # grigliato
    "u": "#e8703a",  # ricci
    "c": "#e0b8c0",  # crudo rosato
    "s": "#f6f6f6",  # sale
    "v": "#7a1f3a",
    "V": "#b03a5a",
    "z": "#c8e8f0",  # vetro
    "d": "#f6c86a",  # moneta
    "D": "#c8922e",
    "h": "#e5484d",  # cuore
    "x": "#1a1626",
})


def wall_tile(variant: int) -> Grid:
    """Tratto di parete largo 64: trave, intonaco, zoccolo di maioliche."""
    rnd = random.Random(40 + variant)
    c = Canvas(64, 104, ROOM, ss=3)
    c.rect(0, 0, 64, 104, "p")
    c.rect(0, 0, 64, 9, "n")
    c.rect(0, 0, 64, 2, "m")
    c.rect(0, 8, 64, 9, "N")
    c.rect(0, 9, 64, 12, "P")
    for _ in range(9):
        x, y = rnd.uniform(2, 60), rnd.uniform(14, 64)
        c.rect(x, y, x + rnd.uniform(2, 6), y + 1, "q" if rnd.random() < 0.6 else "P")
    # zoccolo: due file di piastrelle 16x16 a motivo alterno
    c.rect(0, 68, 64, 70, "n")
    for row in range(2):
        for col in range(4):
            x0, y0 = col * 16, 70 + row * 16
            c.rect(x0, y0, x0 + 16, y0 + 16, "w")
            c.rect(x0, y0, x0 + 16, y0 + 1, "W")
            c.rect(x0, y0, x0 + 1, y0 + 16, "W")
            cx, cy = x0 + 8, y0 + 8
            if (row + col + variant) % 2 == 0:
                c.poly([(cx, cy - 6), (cx + 6, cy), (cx, cy + 6), (cx - 6, cy)], "b")
                c.poly([(cx, cy - 3), (cx + 3, cy), (cx, cy + 3), (cx - 3, cy)], "y")
            else:
                c.rect(cx - 1.5, cy - 6, cx + 1.5, cy + 6, "b")
                c.rect(cx - 6, cy - 1.5, cx + 6, cy + 1.5, "b")
                c.ellipse(cx, cy, 2.4, 2.4, "y")
                for dx, dy in ((-5, -5), (5, -5), (-5, 5), (5, 5)):
                    c.ellipse(cx + dx, cy + dy, 1.3, 1.3, "B")
    c.rect(0, 102, 64, 104, "N")
    return c.grid()


def floor_tile() -> Grid:
    c = Canvas(32, 40, ROOM, ss=3)
    c.rect(0, 0, 32, 40, "t")
    for row in range(4):
        y0 = row * 10
        off = 8 if row % 2 else 0
        c.rect(0, y0, 32, y0 + 1, "T")
        for x in (off, off + 16):
            c.rect(x % 32, y0, x % 32 + 1, y0 + 10, "T")
        c.rect(0, y0 + 1, 32, y0 + 2, "u")
    return c.grid()


def window() -> Grid:
    c = Canvas(44, 48, ROOM)
    c.rect(1, 1, 43, 47, "N")
    c.rect(4, 4, 40, 44, "k")
    # cielo del tramonto e mare
    c.rect(4, 4, 40, 16, "K")
    c.rect(4, 16, 40, 26, "s")
    c.rect(4, 26, 40, 30, "S")
    c.rect(4, 30, 40, 44, "B")
    c.rect(10, 33, 30, 34, "b")
    c.ellipse(30, 27, 3.2, 3.2, "S")
    c.rect(21, 4, 23, 44, "N")
    c.rect(4, 23, 40, 25, "N")
    c.rect(0, 44, 44, 48, "n")
    c.rect(0, 44, 44, 45, "M")
    g = c.grid()
    g.outline("o")
    return g


def shelf() -> Grid:
    c = Canvas(48, 26, ROOM)
    c.rect(1, 20, 47, 24, "n")
    c.rect(1, 20, 47, 21, "M")
    bottles = [(6, "G", 14), (12, "v", 16), (18, "y", 10), (24, "G", 15), (31, "r", 9), (37, "b", 13), (42, "v", 15)]
    for x, key, h in bottles:
        c.rect(x - 2, 20 - h * 0.7, x + 2, 20, key)
        c.rect(x - 0.9, 20 - h, x + 0.9, 20 - h * 0.7, key)
        c.rect(x - 2, 20 - h * 0.45, x + 2, 20 - h * 0.3, "w")
    g = c.grid()
    g.outline("o")
    return g


def lantern() -> Grid:
    c = Canvas(14, 26, ROOM)
    c.rect(6.4, 0, 7.6, 8, "N")
    c.poly([(3, 9), (11, 9), (12.5, 12), (1.5, 12)], "N")
    c.rect(3, 12, 11, 21, "e")
    c.rect(5, 13, 9, 20, "c")
    c.rect(3, 12, 4, 21, "N")
    c.rect(10, 12, 11, 21, "N")
    c.rect(2, 21, 12, 23, "N")
    g = c.grid()
    g.outline("o")
    return g


def picture() -> Grid:
    c = Canvas(26, 20, ROOM)
    c.rect(1, 1, 25, 19, "n")
    c.rect(3, 3, 23, 17, "z")
    c.ellipse(12, 10, 6, 3, "b")
    c.poly([(18, 10), (21, 7), (21, 13)], "b")
    c.ellipse(9, 9.4, 0.8, 0.8, "k")
    g = c.grid()
    g.outline("o")
    return g


def garlic() -> Grid:
    c = Canvas(12, 28, ROOM)
    c.rect(5.4, 0, 6.6, 26, "M")
    for i, key in enumerate(("c", "r", "c", "r", "c", "c")):
        y = 5 + i * 3.8
        x = 4.2 if i % 2 else 7.8
        c.ellipse(x, y, 2.4, 2.2, key if key == "c" else "r")
    g = c.grid()
    g.outline("o")
    return g


def kitchen() -> Grid:
    """La cucina a vista: un grande passavivande da cui Nonna Ines porge i piatti."""
    c = Canvas(120, 104, ROOM, ss=3)
    c.rect(0, 0, 120, 104, "p")
    c.rect(0, 0, 120, 9, "n")
    c.rect(0, 0, 120, 2, "m")
    c.rect(0, 8, 120, 9, "N")
    # apertura
    c.rect(14, 18, 104, 66, "N")
    c.rect(17, 21, 101, 66, "d")
    c.rect(17, 21, 101, 30, "D")
    # fuochi e pentole nel fondo
    c.rect(60, 50, 98, 66, "A")
    c.rect(60, 50, 98, 52, "a")
    c.ellipse(72, 48, 7, 4, "a")
    c.rect(65, 48, 79, 52, "a")
    c.ellipse(88, 47, 5, 3, "N")
    c.rect(83, 47, 93, 51, "N")
    c.ellipse(72, 44, 4, 1.4, "E")
    for x in (26, 36, 46):
        c.rect(x - 0.6, 21, x + 0.6, 28, "A")
        c.ellipse(x, 31, 3.6, 3.2, "a" if x != 36 else "n")
    # mensola del passavivande
    c.rect(10, 66, 108, 71, "m")
    c.rect(10, 66, 108, 67, "M")
    c.rect(10, 70, 108, 71, "N")
    # pannello sotto
    c.rect(14, 71, 104, 102, "n")
    for x in range(14, 104, 15):
        c.rect(x, 71, x + 1, 102, "N")
    c.rect(0, 102, 120, 104, "N")
    # insegna
    c.rect(40, 11, 78, 17, "b")
    c.rect(41, 12, 77, 16, "B")
    return c.grid()


def door() -> Grid:
    c = Canvas(64, 104, ROOM, ss=3)
    c.rect(0, 0, 64, 104, "p")
    c.rect(0, 0, 64, 9, "n")
    c.rect(0, 0, 64, 2, "m")
    c.rect(0, 8, 64, 9, "N")
    c.ellipse(34, 44, 20, 22, "N")
    c.rect(14, 44, 54, 102, "N")
    c.ellipse(34, 44, 17, 19, "k")
    c.rect(17, 44, 51, 102, "k")
    c.rect(17, 60, 51, 80, "K")
    c.ellipse(42, 36, 3, 3, "S")
    c.rect(17, 80, 51, 102, "B")
    c.rect(20, 86, 40, 87, "b")
    c.rect(0, 102, 64, 104, "N")
    c.rect(12, 100, 56, 102, "R")
    return c.grid()


def barrel() -> Grid:
    c = Canvas(34, 42, ROOM)
    c.rect(4, 34, 30, 40, "N")
    c.rect(7, 30, 12, 36, "N")
    c.rect(22, 30, 27, 36, "N")
    c.ellipse(17, 20, 13, 13, "n")
    c.ellipse(17, 20, 10, 10, "m")
    c.ellipse(17, 20, 6, 6, "n")
    for ang in range(0, 360, 45):
        a = math.radians(ang)
        c.line(17, 20, 17 + math.cos(a) * 12, 20 + math.sin(a) * 12, 0.7, "N")
    c.ellipse(17, 20, 13, 13, "N") if False else None
    c.rect(15.5, 30, 18.5, 33, "a")
    c.rect(14, 32, 20, 34, "A")
    c.ellipse(17, 20, 1.6, 1.6, "Y")
    g = c.grid()
    g.outline("o")
    return g


def table(dirty: bool) -> Grid:
    c = Canvas(40, 30, ROOM)
    # gambe
    c.rect(8, 14, 10.5, 29, "N")
    c.rect(25, 14, 27.5, 29, "N")
    # tovaglia a quadri
    c.poly([(3, 6), (33, 6), (34.5, 16), (1.5, 16)], "h")
    for i in range(6):
        x = 4 + i * 5
        c.rect(x, 12, x + 2.5, 16, "r")
    c.rect(3, 6, 33, 8, "H")
    c.rect(2, 4.5, 34, 6.5, "n")
    c.rect(2, 4.5, 34, 5.2, "M")
    if dirty:
        c.ellipse(12, 3.6, 4.2, 1.2, "W")
        c.ellipse(23, 3.4, 3.2, 1.0, "W")
        c.rect(17, 2.2, 18.4, 4.4, "z")
        c.rect(26, 3.0, 28, 3.8, "T")
        c.rect(7, 3.2, 8.4, 3.9, "T")
    g = c.grid()
    g.outline("o")
    return g


def chair() -> Grid:
    c = Canvas(16, 30, ROOM)
    c.rect(10, 2, 12.5, 29, "n")
    c.rect(3, 15, 12, 17.5, "m")
    c.rect(3, 17, 5, 29, "n")
    c.rect(10, 5, 12.5, 12, "M")
    g = c.grid()
    g.outline("o")
    return g


# ----------------------------------------------------------------------------
# Piatti: un disegno per famiglia di ricetta
# ----------------------------------------------------------------------------
def plate(kind: str) -> Grid:
    c = Canvas(16, 10, FOOD)
    c.ellipse(8, 7.2, 7.2, 2.2, "P")
    c.ellipse(8, 6.4, 7.0, 2.2, "p")
    if kind == "fried":
        for x, y in ((5, 4.6), (8, 3.8), (11, 4.8), (7, 5.2), (10, 4.0)):
            c.ellipse(x, y, 1.9, 1.2, "A" if (x + y) % 2 < 1 else "a")
        c.ellipse(12.4, 5.6, 1.2, 0.9, "y")
    elif kind == "rolls":
        for x in (4.6, 7.4, 10.2):
            c.ellipse(x, 4.6, 1.5, 1.7, "b")
            c.ellipse(x, 4.2, 0.9, 0.8, "A")
        c.ellipse(12.4, 5.4, 1.1, 0.8, "g")
    elif kind == "whole":
        c.ellipse(8, 4.6, 5.2, 1.9, "w")
        c.poly([(12.6, 4.6), (14.6, 3.0), (14.6, 6.2)], "W")
        c.ellipse(4.6, 4.2, 0.6, 0.6, "x")
        c.rect(6, 3.4, 10, 3.9, "W")
        c.ellipse(11.5, 6.2, 1.0, 0.7, "y")
    elif kind == "salt":
        c.ellipse(8, 4.4, 5.6, 2.4, "s")
        c.ellipse(6.4, 3.6, 1.6, 0.8, "p")
        c.ellipse(10.2, 4.8, 1.2, 0.6, "W")
    elif kind == "red":
        c.ellipse(8, 4.8, 5.4, 2.0, "r")
        c.ellipse(6.4, 4.2, 2.0, 1.1, "u")
        c.ellipse(10, 4.6, 1.8, 1.0, "u")
        c.ellipse(8.4, 3.8, 0.7, 0.5, "g")
    elif kind == "grill":
        c.ellipse(8, 4.6, 5.2, 1.7, "B")
        for x in (5.5, 7.5, 9.5):
            c.line(x, 3.2, x + 1.2, 6.0, 0.6, "k")
        c.ellipse(12.2, 5.8, 1.1, 0.8, "y")
    elif kind == "soup":
        c.ellipse(8, 5.0, 5.8, 2.4, "P")
        c.ellipse(8, 4.6, 4.8, 1.8, "r")
        c.ellipse(6.6, 4.2, 1.3, 0.8, "u")
        c.ellipse(9.8, 4.8, 1.0, 0.6, "g")
    elif kind == "pasta":
        c.ellipse(8, 4.4, 4.8, 2.2, "y")
        c.ellipse(7.2, 3.6, 2.2, 1.0, "Y")
        c.ellipse(8.6, 3.4, 1.4, 0.9, "u")
    elif kind == "salad":
        c.ellipse(8, 4.6, 5.0, 2.0, "g")
        c.ellipse(6.4, 4.0, 1.4, 0.9, "G")
        c.ellipse(9.6, 4.2, 1.2, 0.8, "w")
        c.ellipse(8.2, 5.2, 0.9, 0.6, "r")
    else:  # crudo
        for i, x in enumerate((4.6, 6.6, 8.6, 10.6)):
            c.ellipse(x, 4.6 + (i % 2) * 0.4, 1.3, 1.6, "c")
        c.ellipse(12.6, 5.4, 0.9, 0.7, "g")
    g = c.grid(threshold=0.4)
    g.outline("o")
    return g


DISH_KIND = {
    "sarde_beccafico": "rolls", "frittura_paranza": "fried", "donzelle_fritte": "fried", "triglie_livornese": "red",
    "sgombro_griglia": "grill", "sarago_forno": "whole", "orata_sale": "salt", "zuppa_scorfano": "soup",
    "spaghetti_ricci": "pasta", "insalata_mare": "salad", "barracuda_scapece": "grill", "dentice_forno": "whole",
    "ricciola_crudo": "crudo", "cernia_matalotta": "red",
}

BUBBLE = [
    "..oooooooooooooooooooo..",
    ".oppppppppppppppppppppo.",
    "oppppppppppppppppppppppo",
    "oppppppppppppppppppppppo",
    "oppppppppppppppppppppppo",
    "oppppppppppppppppppppppo",
    "oppppppppppppppppppppppo",
    "oppppppppppppppppppppppo",
    "oppppppppppppppppppppppo",
    "oppppppppppppppppppppppo",
    "oppppppppppppppppppppppo",
    "oppppppppppppppppppppppo",
    "oppppppppppppppppppppppo",
    ".oppppppppppppppppppppo.",
    "..ooooopppoooooooooooo..",
    "......oppo..............",
    "......opo...............",
    "......oo................",
]

WINE_ICON = [
    ".oooooo.",
    "ozzzzzzo",
    "ovvvvvvo",
    "ovVvvvvo",
    ".ovvvvo.",
    "..ovvo..",
    "...oo...",
    "...oo...",
    "..oooo..",
    ".oPPPPo.",
]

COIN = [
    "..oooo..",
    ".oddddo.",
    "oddDDddo",
    "odDddDdo",
    "odDddDdo",
    "oddDDddo",
    ".oddddo.",
    "..oooo..",
]

HEART = [
    ".oo...oo.",
    "ohho.ohho",
    "ohhhohhho",
    "ohhhhhhho",
    ".ohhhhho.",
    "..ohhho..",
    "...oho...",
    "....o....",
]

ANGER = [
    "x..x..x",
    ".x.x.x.",
    "..hhh..",
    "xxhhhxx",
    "..hhh..",
    ".x.x.x.",
    "x..x..x",
]

ORDER = [
    ".ooo.",
    "oAAAo",
    "oAAAo",
    "oAAAo",
    "oAAAo",
    ".oAo.",
    ".ooo.",
    "oAAAo",
    ".ooo.",
]


# ----------------------------------------------------------------------------
# Porto: facciata dell'osteria, banchina, bitte
# ----------------------------------------------------------------------------
def facade() -> Grid:
    c = Canvas(150, 112, ROOM, ss=3)
    # tetto di coppi
    c.poly([(2, 30), (20, 12), (130, 12), (148, 30)], "t")
    for x in range(8, 146, 8):
        c.rect(x, 14 + abs(x - 75) * 0.12, x + 1, 30, "T")
    c.rect(2, 29, 148, 32, "T")
    # muro a calce
    c.rect(8, 32, 142, 110, "q")
    c.rect(8, 32, 142, 35, "P")
    c.rect(8, 100, 142, 110, "W")
    # porta
    c.rect(62, 62, 88, 110, "B")
    c.rect(64, 64, 86, 110, "b")
    c.rect(74.5, 64, 75.5, 110, "B")
    c.ellipse(71, 88, 1.2, 1.2, "y")
    # finestre con persiane
    for x in (22, 108):
        c.rect(x, 58, x + 22, 88, "N")
        c.rect(x + 2, 60, x + 20, 86, "e")
        c.rect(x + 10.4, 60, x + 11.6, 86, "N")
        c.rect(x - 7, 58, x - 1, 88, "b")
        c.rect(x + 23, 58, x + 29, 88, "b")
        for y in range(61, 87, 4):
            c.rect(x - 7, y, x - 1, y + 1, "B")
            c.rect(x + 23, y, x + 29, y + 1, "B")
        c.rect(x - 1, 88, x + 23, 92, "n")
        for i in range(4):
            c.ellipse(x + 3 + i * 5.5, 87, 2.4, 2.2, "r" if i % 2 else "g")
    # tenda a righe sopra la porta
    c.poly([(50, 50), (100, 50), (106, 62), (44, 62)], "h")
    for i in range(6):
        x0 = 50 + i * 8.4
        c.poly([(x0, 50), (x0 + 4.2, 50), (x0 + 4.9 - (3 - i) * 0.9 + 3 * 0.9 - 2.7, 62), (x0 - (3 - i) * 0.9 + 3 * 0.9 - 2.7 + 0.2, 62)], "r")
    c.rect(44, 61, 106, 63, "R")
    # insegna
    c.rect(40, 36, 110, 48, "n")
    c.rect(42, 38, 108, 46, "b")
    c.rect(42, 38, 108, 39, "B")
    # lanterne
    for x in (46, 104):
        c.rect(x - 0.5, 48, x + 0.5, 52, "N")
        c.rect(x - 2, 52, x + 2, 58, "e")
    # buganvillea sull'angolo
    for i in range(22):
        rnd = random.Random(i)
        c.ellipse(132 + rnd.uniform(-9, 9), 40 + rnd.uniform(-6, 30), 2.6, 2.2, "V" if i % 3 else "g")
    g = c.grid()
    g.outline("o")
    return g


def quay_tile() -> Grid:
    c = Canvas(32, 28, ROOM, ss=3)
    c.rect(0, 0, 32, 28, "W")
    c.rect(0, 0, 32, 3, "q")
    c.rect(0, 3, 32, 4, "H")
    for row in range(3):
        y0 = 4 + row * 8
        off = 8 if row % 2 else 0
        c.rect(0, y0 + 7, 32, y0 + 8, "A")
        for x in (off, off + 16):
            c.rect(x % 32, y0, x % 32 + 1, y0 + 8, "A")
    return c.grid()


def bollard() -> Grid:
    c = Canvas(12, 16, ROOM)
    c.rect(3, 4, 9, 15, "A")
    c.ellipse(6, 4, 4.4, 2.6, "a")
    c.rect(2, 13, 10, 15, "d")
    g = c.grid()
    g.outline("o")
    return g


def crate() -> Grid:
    c = Canvas(22, 18, ROOM)
    c.rect(1, 3, 21, 17, "m")
    c.rect(1, 3, 21, 5, "M")
    c.rect(1, 9, 21, 10.4, "n")
    for x in (5, 11, 17):
        c.rect(x, 3, x + 1, 17, "n")
    c.ellipse(7, 2.6, 3.4, 1.6, "z")
    c.ellipse(14, 2.4, 3.4, 1.6, "a")
    g = c.grid()
    g.outline("o")
    return g


def build(out_dir: str) -> str:
    sheet = Sheet("Osteria e porto")
    sheet.add_palette(ROOM)
    sheet.add_palette(FOOD)
    for v in range(2):
        sheet.add(f"room_wall{v}", wall_tile(v), ROOM, ax=0, ay=104)
    sheet.add("room_floor", floor_tile(), ROOM, ax=0, ay=0)
    k = kitchen()
    sheet.add("room_kitchen", k, ROOM, ax=0, ay=104)
    # Mensola e pannello sotto il passavivande, da disegnare davanti a Nonna Ines.
    sheet.add("room_kitchen_front", k.crop(0, 66, 120, 38), ROOM, ax=0, ay=38)
    sheet.add("room_door", door(), ROOM, ax=0, ay=104)
    for name, grid in (("window", window()), ("shelf", shelf()), ("lantern", lantern()), ("picture", picture()), ("garlic", garlic())):
        sheet.add(f"room_{name}", grid, ROOM, ax=grid.w // 2, ay=0)
    for name, grid in (("barrel", barrel()), ("table", table(False)), ("table_dirty", table(True)), ("chair", chair())):
        sheet.add(f"room_{name}", grid, ROOM, ax=grid.w // 2, ay=grid.h - 1)
    kinds = sorted(set(DISH_KIND.values()))
    for kind in kinds:
        g = plate(kind)
        sheet.add(f"plate_{kind}", g, FOOD, ax=g.w // 2, ay=g.h - 1)
    sheet.add("bubble", Grid.from_rows(BUBBLE), FOOD, ax=7, ay=17)
    for name, rows in (("icon_wine", WINE_ICON), ("icon_coin", COIN), ("icon_heart", HEART), ("icon_anger", ANGER), ("icon_order", ORDER)):
        sheet.add(name, Grid.from_rows(rows), FOOD)
    f = facade()
    sheet.add("port_facade", f, ROOM, ax=f.w // 2, ay=f.h - 1)
    sheet.add("port_quay", quay_tile(), ROOM, ax=0, ay=0)
    for name, grid in (("bollard", bollard()), ("crate", crate())):
        sheet.add(f"port_{name}", grid, ROOM, ax=grid.w // 2, ay=grid.h - 1)
    path = f"{out_dir}/osteria.spr"
    sheet.write(path)
    return path
