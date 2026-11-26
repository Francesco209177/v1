"""Ritratti del cast per i dialoghi: mezzo busto di fronte, 44x46, cinque umori ciascuno.

Le grandi forme (spalle, testa, capelli, cappelli) sono disegnate sulla tela vettoriale;
occhi, sopracciglia e bocca sono posati a mano pixel per pixel, perché è lì che sta l'espressione.
Nomi degli sprite: port_<personaggio>_<umore>, con umore tra calm, happy, angry, shock, sad.
"""
from forge import Canvas, Grid, Palette, Sheet

W, H = 44, 46
CX = 22.0
MOODS = ["calm", "happy", "angry", "shock", "sad"]


def shade(hexv: str, k: float) -> str:
    v = hexv.lstrip("#")
    r, g, b = (int(v[i:i + 2], 16) for i in (0, 2, 4))
    if k < 1:
        r, g, b = (int(c * k) for c in (r, g, b))
    else:
        r, g, b = (int(c + (255 - c) * (k - 1)) for c in (r, g, b))
    return "#%02x%02x%02x" % (r, g, b)


class Face:
    def __init__(self, pid: str, skin: str, hair: str, top: str, *, accent: str = "#f4efe2", hat: str | None = None,
                 hair_style: str = "short", hat_style: str | None = None, head_rx: float = 11.5, head_ry: float = 12.5,
                 glasses: bool = False, beard: str | None = None, moustache: str | None = None, collar: str = "round",
                 child: bool = False, blush: bool = False, extras: tuple = ()):
        self.pid, self.skin, self.hair, self.top = pid, skin, hair, top
        self.accent, self.hat = accent, hat
        self.hair_style, self.hat_style = hair_style, hat_style
        self.head_rx, self.head_ry = head_rx, head_ry
        self.glasses, self.beard, self.moustache, self.collar = glasses, beard, moustache, collar
        self.child, self.blush, self.extras = child, blush, extras

    def palette(self) -> Palette:
        hat = self.hat or "#d8483a"
        beard = self.beard or self.moustache or self.hair
        return Palette("port_" + self.pid, {
            "o": "#1a1626",
            "s": self.skin, "S": shade(self.skin, 0.80), "h": shade(self.skin, 1.30), "q": shade(self.skin, 0.64),
            "k": self.hair, "K": shade(self.hair, 1.40), "j": shade(self.hair, 0.70),
            "t": self.top, "T": shade(self.top, 0.72), "u": shade(self.top, 1.30),
            "a": self.accent, "A": shade(self.accent, 0.78),
            "c": hat, "C": shade(hat, 0.74), "d": shade(hat, 1.30),
            "b": beard, "B": shade(beard, 0.78),
            "w": "#ffffff", "e": "#1a1626", "m": "#a8403a", "M": "#5a1a22", "r": "#e88a80",
            "g": "#c8dcec", "y": "#f2c23a", "Y": "#b8861d", "n": "#3aa0a8", "p": "#f4efe2", "R": "#c8402f", "G": "#3a8a4a",
        })


RAMPS = {"s": ("S", "h"), "t": ("T", "u"), "k": ("j", "K"), "c": ("C", "d"), "a": ("A", ""), "b": ("B", "")}


def portrait(f: Face, mood: str) -> Grid:
    c = Canvas(W, H, f.palette())
    hy = 20.0 if not f.child else 21.5
    rx, ry = f.head_rx, f.head_ry

    # --- capelli dietro la testa ---
    hs = f.hair_style
    if hs == "braid":
        c.ellipse(CX, hy - 2, rx + 1.6, ry + 0.6, "k")
        c.capsule(CX + rx - 1, hy + 4, CX + rx + 1.5, hy + 19, 3.0, "k", 2.2)
        c.ellipse(CX + rx + 1.6, hy + 20.5, 1.8, 1.8, "y")
    elif hs == "bun":
        c.ellipse(CX, hy - 2.5, rx + 1.2, ry + 0.2, "k")
        c.ellipse(CX, hy - ry - 3.2, 5.2, 4.4, "k")
    elif hs == "pigtails":
        c.ellipse(CX, hy - 2, rx + 1.4, ry + 0.4, "k")
        c.ellipse(CX - rx - 3.0, hy + 2.5, 3.8, 5.2, "k")
        c.ellipse(CX + rx + 3.0, hy + 2.5, 3.8, 5.2, "k")
        c.ellipse(CX - rx - 0.8, hy - 2.0, 1.5, 1.5, "c")
        c.ellipse(CX + rx + 0.8, hy - 2.0, 1.5, 1.5, "c")
    elif hs == "curly":
        for dx, dy, r in ((-9, -8, 5.0), (-3, -12, 5.4), (4, -12, 5.4), (10, -8, 5.0), (-12, -1, 4.2), (12, -1, 4.2), (-11, 5, 3.4), (11, 5, 3.4)):
            c.ellipse(CX + dx, hy + dy, r, r, "k")
    elif hs == "sides":
        # calvo con i capelli ai lati
        c.ellipse(CX - rx + 0.5, hy + 0.5, 3.4, 5.6, "k")
        c.ellipse(CX + rx - 0.5, hy + 0.5, 3.4, 5.6, "k")
    elif hs == "short":
        c.ellipse(CX, hy - 2.6, rx + 0.9, ry - 0.2, "k")

    # --- collo e spalle ---
    c.rect(CX - 3.6, hy + ry - 3, CX + 3.6, hy + ry + 5, "S")
    c.ellipse(CX, H + 3.5, 18.5 if not f.child else 15.5, 11.5, "t")
    if f.collar == "priest":
        c.poly([(CX - 5, hy + ry + 1.5), (CX + 5, hy + ry + 1.5), (CX + 3.5, hy + ry + 5.5), (CX - 3.5, hy + ry + 5.5)], "T")
        c.rect(CX - 1.6, hy + ry + 2.2, CX + 1.6, hy + ry + 4.6, "p")
    elif f.collar == "chef":
        c.poly([(CX - 6, hy + ry + 1), (CX, hy + ry + 6.5), (CX + 6, hy + ry + 1), (CX + 7, hy + ry + 5), (CX, hy + ry + 9), (CX - 7, hy + ry + 5)], "R")
        for i in range(3):
            c.ellipse(CX - 4.5, hy + ry + 9.5 + i * 2.6, 0.8, 0.8, "T")
            c.ellipse(CX + 4.5, hy + ry + 9.5 + i * 2.6, 0.8, 0.8, "T")
    elif f.collar == "suit":
        c.poly([(CX - 4.5, hy + ry + 1.5), (CX, hy + ry + 8), (CX + 4.5, hy + ry + 1.5), (CX + 2, hy + ry + 12), (CX - 2, hy + ry + 12)], "p")
        c.poly([(CX - 1.2, hy + ry + 4.5), (CX + 1.2, hy + ry + 4.5), (CX + 1.6, hy + ry + 12), (CX - 1.6, hy + ry + 12)], "R")
        c.poly([(CX - 6.5, hy + ry + 1.0), (CX - 4.2, hy + ry + 1.2), (CX - 0.6, hy + ry + 9.5), (CX - 3.5, hy + ry + 12)], "T")
        c.poly([(CX + 6.5, hy + ry + 1.0), (CX + 4.2, hy + ry + 1.2), (CX + 0.6, hy + ry + 9.5), (CX + 3.5, hy + ry + 12)], "T")
    elif f.collar == "wetsuit":
        c.poly([(CX - 6, hy + ry + 0.5), (CX + 6, hy + ry + 0.5), (CX + 4.5, hy + ry + 3.5), (CX - 4.5, hy + ry + 3.5)], "T")
        c.line(CX - 12, hy + ry + 8, CX - 5, hy + ry + 4.5, 1.4, "a")
        c.line(CX + 12, hy + ry + 8, CX + 5, hy + ry + 4.5, 1.4, "a")
    elif f.collar == "apron":
        c.poly([(CX - 5.2, hy + ry + 1.5), (CX + 5.2, hy + ry + 1.5), (CX + 3.0, hy + ry + 5.0), (CX - 3.0, hy + ry + 5.0)], "S")
        c.line(CX - 6.5, hy + ry + 2.5, CX - 3.5, hy + ry + 13, 2.0, "a")
        c.line(CX + 6.5, hy + ry + 2.5, CX + 3.5, hy + ry + 13, 2.0, "a")
        c.rect(CX - 4.5, hy + ry + 9.5, CX + 4.5, hy + ry + 14, "a")
    elif f.collar == "overalls":
        c.poly([(CX - 5.2, hy + ry + 1.5), (CX + 5.2, hy + ry + 1.5), (CX + 3.0, hy + ry + 5.0), (CX - 3.0, hy + ry + 5.0)], "S")
        c.line(CX - 8, hy + ry + 3, CX - 5.5, hy + ry + 13, 2.6, "a")
        c.line(CX + 8, hy + ry + 3, CX + 5.5, hy + ry + 13, 2.6, "a")
        c.rect(CX - 6.5, hy + ry + 9, CX + 6.5, hy + ry + 14, "a")
    else:
        c.poly([(CX - 5.2, hy + ry + 1.5), (CX + 5.2, hy + ry + 1.5), (CX + 2.6, hy + ry + 5.5), (CX - 2.6, hy + ry + 5.5)], "S")
    if "sash" in f.extras:
        c.line(CX - 13, hy + ry + 5, CX + 6, hy + ry + 14, 1.3, "G")
        c.line(CX - 12, hy + ry + 3.8, CX + 7, hy + ry + 12.8, 1.3, "p")
        c.line(CX - 11, hy + ry + 2.6, CX + 8, hy + ry + 11.6, 1.3, "R")
    if "pendant" in f.extras:
        c.ellipse(CX, hy + ry + 7.4, 2.3, 2.3, "y")
        c.ellipse(CX, hy + ry + 7.4, 1.1, 1.1, "n")

    # --- orecchie e testa ---
    c.ellipse(CX - rx + 0.4, hy + 1.0, 2.0, 2.8, "s")
    c.ellipse(CX + rx - 0.4, hy + 1.0, 2.0, 2.8, "s")
    c.ellipse(CX, hy, rx, ry, "s")
    if f.head_rx >= 12.5:
        # guance piene
        c.ellipse(CX, hy + 4.0, rx + 0.4, ry - 4.0, "s")

    # --- capelli davanti ---
    if hs == "braid":
        c.poly([(CX - rx - 0.8, hy - 2), (CX - rx + 1.0, hy - 9), (CX - 3, hy - ry - 0.8), (CX + 4, hy - ry - 0.8), (CX + rx - 1.0, hy - 9),
                (CX + rx + 0.8, hy - 2), (CX + rx - 2.4, hy - 5.5), (CX + 3, hy - 8.4), (CX - 2, hy - 6.2), (CX - rx + 2.4, hy - 4.4)], "k")
    elif hs == "bun":
        c.poly([(CX - rx - 0.4, hy - 2), (CX - rx + 1.2, hy - 9), (CX, hy - ry - 0.8), (CX + rx - 1.2, hy - 9), (CX + rx + 0.4, hy - 2),
                (CX + rx - 2.6, hy - 6.6), (CX, hy - 9.0), (CX - rx + 2.6, hy - 6.6)], "k")
    elif hs == "pigtails":
        c.poly([(CX - rx - 0.6, hy - 1), (CX - rx + 1.0, hy - 9), (CX, hy - ry - 0.8), (CX + rx - 1.0, hy - 9), (CX + rx + 0.6, hy - 1),
                (CX + rx - 2.2, hy - 5.0), (CX + 4, hy - 6.2), (CX + 1, hy - 4.2), (CX - 3, hy - 6.4), (CX - rx + 2.2, hy - 5.0)], "k")
    elif hs == "short":
        c.poly([(CX - rx - 0.3, hy - 2.5), (CX - rx + 1.2, hy - 9), (CX, hy - ry - 0.8), (CX + rx - 1.2, hy - 9), (CX + rx + 0.3, hy - 2.5),
                (CX + rx - 2.4, hy - 6.4), (CX + 2, hy - 8.0), (CX - 4, hy - 7.0), (CX - rx + 2.4, hy - 5.4)], "k")
    elif hs == "comb":
        # riporto: poche ciocche tirate da una parte
        c.ellipse(CX - rx + 0.5, hy - 1.0, 2.6, 4.6, "k")
        c.ellipse(CX + rx - 0.5, hy - 1.0, 2.6, 4.6, "k")
        for i in range(2):
            c.line(CX - rx + 3.0, hy - 8.6 - i * 2.2, CX + rx - 5.0, hy - 10.6 - i * 1.2, 0.7, "k")

    # --- cappelli ---
    ht = f.hat_style
    if ht == "bandana":
        c.poly([(CX - rx - 0.6, hy - 4.6), (CX - rx + 1.4, hy - 10), (CX, hy - ry - 1.4), (CX + rx - 1.4, hy - 10), (CX + rx + 0.6, hy - 4.6),
                (CX, hy - 7.6)], "c")
        c.poly([(CX + rx - 0.5, hy - 6.5), (CX + rx + 4.5, hy - 4.0), (CX + rx + 2.5, hy - 1.0)], "c")
    elif ht == "straw":
        c.ellipse(CX, hy - ry + 2.0, rx - 1.5, 7.2, "c")
        c.ellipse(CX, hy - 6.2, rx + 8.5, 3.2, "c")
        c.rect(CX - rx + 1.5, hy - 9.6, CX + rx - 1.5, hy - 8.0, "R")
    elif ht == "toque":
        c.rect(CX - rx + 1.0, hy - ry - 6.0, CX + rx - 1.0, hy - 7.0, "c")
        for dx in (-7.5, -2.5, 2.5, 7.5):
            c.ellipse(CX + dx, hy - ry - 6.5, 4.0, 4.0, "c")
        c.rect(CX - rx + 0.2, hy - 9.4, CX + rx - 0.2, hy - 6.8, "c")
    elif ht == "fedora":
        c.poly([(CX - rx + 2.0, hy - 7.5), (CX - rx + 3.0, hy - ry - 5.0), (CX - 2, hy - ry - 6.4), (CX, hy - ry - 5.0), (CX + 2, hy - ry - 6.4),
                (CX + rx - 3.0, hy - ry - 5.0), (CX + rx - 2.0, hy - 7.5)], "c")
        c.ellipse(CX, hy - 7.0, rx + 6.0, 2.6, "c")
        c.rect(CX - rx + 2.2, hy - 10.4, CX + rx - 2.2, hy - 8.6, "C")

    # --- barba ---
    if f.beard:
        c.poly([(CX - rx + 0.6, hy + 2.5), (CX - rx + 2.0, hy + 9.5), (CX - 4, hy + ry + 1.8), (CX + 4, hy + ry + 1.8), (CX + rx - 2.0, hy + 9.5),
                (CX + rx - 0.6, hy + 2.5), (CX + 6, hy + 5.6), (CX, hy + 4.8), (CX - 6, hy + 5.6)], "b")

    g = c.grid(threshold=0.5)
    g.rim(RAMPS)

    # --- viso, a mano ---
    ey = int(round(hy)) - (0 if not f.child else 0)
    lx, rxp = 15, 26                      # colonna sinistra dei due occhi (larghi 3)
    by = ey - 3                            # riga delle sopracciglia
    brow = "j" if f.hair_style not in ("sides", "comb") or f.hat_style else "q"
    if f.pid in ("pinuccio", "saverio"):
        brow = "B" if f.beard else "j"

    def put(x: int, y: int, rows: list[str]) -> None:
        g.stamp(x, y, rows)

    if f.glasses:
        # dietro le lenti: fondo chiaro e pupille piccole, altrimenti l'occhio diventa una macchia nera
        lens = {"calm": (["www", "wee", "wee"], ["www", "eew", "eew"]),
                "happy": (["www", "wew", "eWe".replace("W", "w")], ["www", "wew", "ewe"]),
                "angry": (["eee", "wee", "www"], ["eee", "eew", "www"]),
                "shock": (["www", "wew", "www"], ["www", "wew", "www"]),
                "sad": (["www", "eee", "wee"], ["www", "eee", "eew"])}[mood]
        put(lx, ey, lens[0])
        put(rxp, ey, lens[1])
        if mood == "angry":
            put(lx - 1, by - 1, [brow * 2 + "  ", "  " + brow * 2])
            put(rxp, by - 1, ["  " + brow * 2, brow * 2 + "  "])
        elif mood == "sad":
            put(lx - 1, by - 1, ["  " + brow * 2, brow * 2 + "  "])
            put(rxp, by - 1, [brow * 2 + "  ", "  " + brow * 2])
        elif mood == "shock":
            put(lx - 1, by - 2, [brow * 4])
            put(rxp, by - 2, [brow * 4])
        else:
            put(lx - 1, by - 1, [brow * 4])
            put(rxp, by - 1, [brow * 4])
    elif mood == "calm":
        put(lx, ey, ["eee", "wee", "wee"])
        put(rxp, ey, ["eee", "eew", "eew"])
        put(lx - 1, by, [brow * 4])
        put(rxp, by, [brow * 4])
    elif mood == "happy":
        put(lx, ey, ["   ", " e ", "e e"])
        put(rxp, ey, ["   ", " e ", "e e"])
        put(lx - 1, by - 1, [brow * 4])
        put(rxp, by - 1, [brow * 4])
    elif mood == "angry":
        put(lx, ey, ["   ", "eee", "wee"])
        put(rxp, ey, ["   ", "eee", "eew"])
        put(lx - 1, by, [brow * 2 + "   ", "  " + brow * 2 + " ", "    " + brow])
        put(rxp - 1, by, ["   " + brow * 2, " " + brow * 2 + "  ", brow + "    "])
    elif mood == "shock":
        put(lx, ey - 1, ["eee", "www", "wew", "www"])
        put(rxp, ey - 1, ["eee", "www", "wew", "www"])
        put(lx - 1, by - 2, [" " + brow * 3, brow + "   "])
        put(rxp, by - 2, [brow * 3 + " ", "   " + brow])
    elif mood == "sad":
        put(lx, ey, ["   ", "eee", "wee"])
        put(rxp, ey, ["   ", "eee", "eew"])
        put(lx - 1, by, ["    " + brow, "  " + brow * 2 + " ", brow * 2 + "   "])
        put(rxp - 1, by, [brow + "    ", " " + brow * 2 + "  ", "   " + brow * 2])

    # naso
    g.set(22, ey + 4, "S")
    g.set(22, ey + 5, "S")
    g.set(21, ey + 5, "S")
    if f.head_rx >= 12.5 or f.pid in ("lustri", "critico"):
        g.set(23, ey + 5, "S")
        g.set(22, ey + 3, "S")

    # bocca
    my = ey + 8
    if mood == "calm":
        put(20, my, ["mmmm"])
        g.set(19, my - 1, "S")
    elif mood == "happy":
        put(19, my - 1, ["mwwwwm", " mMMm ", "  mm  "])
    elif mood == "angry":
        put(19, my, [" mmmm ", "m    m"])
    elif mood == "shock":
        put(20, my - 1, [" mm ", "mMMm", "mMMm", " mm "])
    elif mood == "sad":
        put(20, my, [" mm ", "m  m"])

    if f.moustache:
        put(18, my - 2, [" bb  bb ", "bbb  bbb"] if f.pid == "lustri" else ["  bbbb  ", " bbbbbb "])
    if f.beard and mood in ("calm", "sad", "angry"):
        # la bocca si legge anche in mezzo alla barba
        pass
    if f.blush or mood == "happy":
        for x in (13, 14, 29, 30):
            if g.get(x, ey + 5) in ("s", "h", "S"):
                g.set(x, ey + 5, "r")
    if "freckles" in f.extras:
        for x, y in ((13, ey + 4), (15, ey + 5), (28, ey + 5), (30, ey + 4)):
            if g.get(x, y) in ("s", "h"):
                g.set(x, y, "S")
    if "wrinkles" in f.extras:
        g.set(18, my - 1, "S")
        g.set(25, my - 1, "S")
        g.set(13, ey + 1, "S")
        g.set(30, ey + 1, "S")
    if "smudge" in f.extras:
        g.set(28, ey + 5, "q")
        g.set(29, ey + 5, "q")
        g.set(29, ey + 6, "q")
    if "earring" in f.extras:
        g.set(int(CX - rx) + 0, ey + 4, "y")
        g.set(int(CX + rx) - 0, ey + 4, "y")
    if f.glasses:
        for x0 in (lx - 1, rxp - 1):
            for dx in range(5):
                g.set(x0 + dx, ey - 1, "o")
                g.set(x0 + dx, ey + 3, "o")
            for dy in range(5):
                g.set(x0, ey - 1 + dy, "o")
                g.set(x0 + 4, ey - 1 + dy, "o")
        for x in range(lx + 4, rxp - 1):
            g.set(x, ey, "o")
    g.outline("o")
    return g


CAST = [
    Face("tecla", "#f0b98a", "#3a2233", "#1d8a8e", accent="#ffc233", hair_style="braid", collar="wetsuit", extras=("earring",)),
    Face("ines", "#eab58a", "#c9c9d2", "#3a3340", accent="#e8a0a8", hair_style="bun", collar="apron", glasses=True, head_rx=12.0,
         extras=("pendant", "wrinkles")),
    Face("zaira", "#c98a5a", "#1f1a24", "#d99a3a", accent="#4a6a8a", hat="#d8483a", hair_style="short", hat_style="bandana", collar="overalls",
         extras=("smudge",)),
    Face("bianca", "#f4c9a4", "#a8683a", "#f2c23a", accent="#f4efe2", hat="#d8553b", hair_style="pigtails", child=True, head_rx=11.0, head_ry=11.5,
         blush=True, extras=("freckles",)),
    Face("pinuccio", "#f0c0a0", "#9a9aa6", "#1e1e28", hair_style="sides", collar="priest", glasses=True, head_rx=13.0, head_ry=12.5, blush=True),
    Face("saverio", "#c9905a", "#e8e0d0", "#5a8a4a", hat="#e8c86a", hair_style="sides", hat_style="straw", beard="#e8e0d0", head_rx=12.0,
         extras=("wrinkles",)),
    Face("lustri", "#f4d2b8", "#1f1a24", "#f4efe2", hat="#f7f4ec", hair_style="short", hat_style="toque", collar="chef", moustache="#1f1a24",
         head_rx=10.5, head_ry=12.5),
    Face("fulgenzio", "#eab090", "#3a2a22", "#2a2f4a", hair_style="comb", collar="suit", moustache="#3a2a22", head_rx=13.2, head_ry=12.5,
         blush=True, extras=("sash",)),
    Face("critico", "#e8c0a0", "#2a2a36", "#4a3a5a", hat="#3a3a48", hair_style="short", hat_style="fedora", collar="suit", glasses=True,
         head_rx=10.5, head_ry=12.5),
]


def build(out_dir: str) -> str:
    sheet = Sheet("Ritratti del cast per i dialoghi")
    for face in CAST:
        pal = sheet.add_palette(face.palette())
        for mood in MOODS:
            sheet.add(f"port_{face.pid}_{mood}", portrait(face, mood), pal, ax=W // 2, ay=H - 1)
    path = f"{out_dir}/portraits.spr"
    sheet.write(path)
    return path
