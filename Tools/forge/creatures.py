"""Creature che non hanno la sagoma di un pesce: polpo, seppia, calamaro, medusa, aragosta,
tartaruga, cavalluccio. Stessi nomi di sprite dei pesci: <id>_swim_0..3, <id>_hurt_0, <id>_dead_0.
"""
import math

from forge import Canvas, Grid, Palette, Sheet


def pal(name: str, back: str, side: str, light: str, accent: str, outline: str, extra: str = "#ffffff") -> Palette:
    return Palette(name, {"o": outline, "a": back, "b": side, "c": light, "e": accent, "f": extra, "h": "#ffffff", "w": "#ffffff", "k": "#10141f"})


def eye(g: Grid, x: int, y: int, dead: bool, size: int = 2) -> None:
    for dx in range(size):
        for dy in range(size):
            g.set(x + dx, y + dy, "w")
    if dead:
        g.set(x, y, "k")
        g.set(x + size - 1, y + size - 1, "k")
    else:
        g.set(x + size - 1, y + size - 1, "k")
        if size > 1:
            g.set(x + size - 1, y, "k")


def polpo(phase: float, pose: str) -> Grid:
    P = pal("polpo", "#8a2e2a", "#c8553e", "#f0a07a", "#f6d2b0", "#3a1012")
    c = Canvas(34, 28, P)
    amp = 2.6 if pose == "hurt" else 1.4
    # tentacoli che ondeggiano dietro la testa
    for k in range(6):
        base_y = 12 + k * 1.6
        pts = []
        for i in range(7):
            t = i / 6
            x = 17 - t * (12 + (k % 3) * 2)
            y = base_y + (k - 2.5) * 2.6 * t + math.sin(phase + k * 0.9 - t * 3) * amp * t
            pts.append((x, y))
        c.curve(pts, 2.6, "a" if k % 2 else "b", taper=0.35)
    # mantello
    c.ellipse(23, 11, 8.5, 8.0, "b")
    c.ellipse(24.5, 8.5, 5.5, 4.2, "c")
    c.ellipse(20, 15.5, 5.5, 4.0, "a")
    for sx, sy in ((14, 18), (11, 20), (8, 17)):
        c.ellipse(sx, sy, 0.8, 0.8, "e")
    g = c.grid(threshold=0.4)
    eye(g, 25, 12, pose == "dead", 3)
    if pose == "hurt":
        g = g.replace({"b": "c"})
    g.outline("o")
    return g


def seppia(phase: float, pose: str) -> Grid:
    P = pal("seppia", "#6a4a3a", "#b08a6a", "#e8d4b8", "#3a2a22", "#241812", "#f6ecd8")
    c = Canvas(34, 18, P)
    # gonna ondulata attorno al corpo
    top, bottom = [], []
    for i in range(13):
        t = i / 12
        x = 5 + t * 18
        wave = math.sin(phase * 1.0 + t * 9) * (1.6 if pose == "hurt" else 0.9)
        top.append((x, 4.2 + wave))
        bottom.append((x, 13.8 - wave))
    c.poly(top + list(reversed(bottom)), "c")
    c.ellipse(14, 9, 10, 4.8, "b")
    c.ellipse(13, 7.2, 8.5, 2.6, "a")
    for i in range(5):
        x = 7 + i * 3.2
        c.line(x, 5.6, x + 1.2, 8.4, 0.8, "e")
    # braccia corte e due tentacoli lunghi
    for k in range(4):
        y = 7.5 + k * 1.1
        c.curve([(23, y), (27, y + (k - 1.5) * 0.9), (30 + math.sin(phase + k) * 0.8, y + (k - 1.5) * 1.8)], 1.3, "b", taper=0.5)
    c.curve([(23, 9), (28, 9.2), (32.5, 8.6 + math.sin(phase) * 1.2)], 1.0, "a", taper=0.7)
    g = c.grid(threshold=0.4)
    eye(g, 21, 8, pose == "dead", 2)
    if pose == "hurt":
        g = g.replace({"b": "f"})
    g.outline("o")
    return g


def calamaro(phase: float, pose: str) -> Grid:
    P = pal("calamaro", "#c86a7a", "#f0b0b8", "#fbe4e4", "#a83a4a", "#4a1a26")
    c = Canvas(36, 16, P)
    pulse = math.sin(phase) * (1.2 if pose == "hurt" else 0.6)
    c.poly([(4, 8), (9, 4.2), (24, 5.0), (24, 11.0), (9, 11.8)], "b")
    c.poly([(4, 8), (9, 4.2), (20, 4.8), (20, 7.0), (9, 7.2)], "a")
    # pinne a rombo in coda
    c.poly([(3, 8), (8, 1.8 - pulse * 0.4), (12, 4.8), (12, 11.2), (8, 14.2 + pulse * 0.4)], "c")
    for x, y in ((12, 9.5), (16, 10), (20, 9.4), (14, 6), (18, 6.2)):
        c.ellipse(x, y, 0.7, 0.7, "e")
    for k in range(5):
        y = 6.2 + k * 0.9
        c.curve([(24, y), (28, y + (k - 2) * (0.5 + pulse * 0.3)), (32 + (k % 2), y + (k - 2) * (1.0 + pulse * 0.5))], 1.1, "b", taper=0.5)
    g = c.grid(threshold=0.4)
    eye(g, 22, 7, pose == "dead", 2)
    if pose == "hurt":
        g = g.replace({"b": "c"})
    g.outline("o")
    return g


def medusa(phase: float, pose: str) -> Grid:
    P = Palette("medusa", {"o": "#4a2a6a", "a": "#b06ad8c8", "b": "#d8a0f0b0", "c": "#f4dcffd0", "e": "#f06ab0", "f": "#ffffff", "h": "#ffffff", "w": "#ffffff", "k": "#10141f"})
    c = Canvas(22, 30, P)
    squeeze = math.sin(phase) * 1.2
    rx = 8.0 - squeeze
    ry = 6.0 + squeeze * 0.6
    c.ellipse(11, 8, rx, ry, "b")
    c.rect(11 - rx, 8, 11 + rx, 8 + ry, "b")
    c.ellipse(11, 6.2, rx * 0.7, ry * 0.5, "c")
    c.rect(11 - rx, 8 + ry * 0.55, 11 + rx, 8 + ry + 0.5, "a")
    for k in range(5):
        x0 = 11 - rx + 1.5 + k * (rx * 2 - 3) / 4
        pts = []
        for i in range(6):
            t = i / 5
            pts.append((x0 + math.sin(phase + k * 1.3 + t * 3.5) * 1.6 * t, 8 + ry + t * (12 + (k % 2) * 3)))
        c.curve(pts, 1.2, "e" if k % 2 else "a", taper=0.5)
    for dx in (-3.5, 0, 3.5):
        c.ellipse(11 + dx, 9.5, 1.0, 1.4, "e")
    g = c.grid(threshold=0.35)
    if pose == "hurt":
        g = g.replace({"b": "f"})
    g.outline("o")
    return g


def aragosta(phase: float, pose: str) -> Grid:
    P = pal("aragosta", "#8a2a1e", "#d8552e", "#f6a05a", "#f6d27a", "#3a1008")
    c = Canvas(40, 20, P)
    tw = math.sin(phase) * (2.0 if pose == "hurt" else 1.0)
    # antenne lunghe in avanti
    c.curve([(27, 8), (33, 4 + tw), (39, 2.5 + tw * 1.4)], 0.9, "a", taper=0.6)
    c.curve([(27, 9), (34, 8 - tw * 0.6), (39, 9 - tw)], 0.9, "a", taper=0.6)
    # zampe
    for k in range(5):
        x = 14 + k * 3
        s = math.sin(phase + k * 1.2) * 1.0
        c.line(x, 11.5, x + 1.5 + s, 16.5, 0.9, "a")
    # corpo a segmenti e coda a ventaglio
    c.ellipse(22, 9.5, 6.5, 3.8, "b")
    for k in range(4):
        x = 15.5 - k * 3.0
        c.ellipse(x, 10 + k * 0.5, 2.6, 3.2 - k * 0.3, "b" if k % 2 else "a")
    c.poly([(5.5, 11.5), (1.5, 8.5), (1.0, 12.5), (2.5, 15.5), (6.0, 13.5)], "c")
    c.ellipse(23, 8.0, 4.0, 1.6, "c")
    for sx in (19, 22, 25):
        c.ellipse(sx, 10.4, 0.7, 0.7, "e")
    g = c.grid(threshold=0.4)
    eye(g, 27, 7, pose == "dead", 2)
    if pose == "hurt":
        g = g.replace({"b": "c"})
    g.outline("o")
    return g


def tartaruga(phase: float, pose: str) -> Grid:
    P = pal("tartaruga", "#5a4a2a", "#8a7440", "#c8b070", "#3a2e18", "#201808", "#d8c890")
    c = Canvas(46, 26, P)
    flap = math.sin(phase) * 3.4
    # pinne
    c.poly([(26, 12), (36, 4 - flap), (40, 6 - flap), (31, 14)], "c")
    c.poly([(14, 14), (6, 19 + flap * 0.5), (4, 17 + flap * 0.5), (12, 12)], "c")
    c.poly([(26, 14), (34, 21 + flap * 0.6), (30, 22 + flap * 0.6), (22, 16)], "b")
    # carapace a scudi
    c.ellipse(21, 12, 13, 7.5, "b")
    c.ellipse(21, 10.5, 11, 5.2, "a")
    for x in (13, 18, 23, 28):
        c.line(x, 6.5, x + 1, 14.5, 0.8, "e")
    c.line(10, 10.5, 32, 10.5, 0.8, "e")
    c.ellipse(21, 17.2, 10, 2.0, "f")
    # testa
    c.ellipse(37, 12.5, 4.4, 3.4, "c")
    c.ellipse(36, 11.2, 2.6, 1.4, "b")
    g = c.grid(threshold=0.4)
    eye(g, 38, 11, pose == "dead", 2)
    if pose == "hurt":
        g = g.replace({"b": "f"})
    g.outline("o")
    return g


def cavalluccio(phase: float, pose: str) -> Grid:
    P = pal("cavalluccio", "#b8861e", "#f0c040", "#fbe58a", "#8a5a12", "#3a2608")
    c = Canvas(16, 26, P)
    bob = math.sin(phase) * 0.8
    spine = [(8, 5 + bob), (9, 9 + bob), (9.5, 13 + bob), (8, 17 + bob), (6, 20 + bob), (7.5, 22.5 + bob), (9.5, 21.5 + bob)]
    c.curve(spine, 4.2, "b", taper=0.3)
    c.ellipse(8.5, 5 + bob, 3.2, 2.8, "b")
    c.poly([(10.5, 4.4 + bob), (14.5, 5.4 + bob), (10.5, 6.6 + bob)], "b")
    c.poly([(7, 2.6 + bob), (8.5, 0.8 + bob), (9.6, 2.8 + bob)], "a")
    fin = math.sin(phase * 2) * 0.8
    c.poly([(6.2, 10 + bob), (3.0 - fin, 11.5 + bob), (6.2, 13.5 + bob)], "c")
    for y in (9, 12, 15):
        c.line(7.2, y + bob, 10.4, y + bob, 0.7, "a")
    g = c.grid(threshold=0.4)
    eye(g, 9, int(round(4 + bob)), pose == "dead", 1)
    if pose == "hurt":
        g = g.replace({"b": "c"})
    g.outline("o")
    return g


CREATURES = {
    "polpo": polpo,
    "seppia": seppia,
    "calamaro": calamaro,
    "medusa": medusa,
    "aragosta": aragosta,
    "tartaruga": tartaruga,
    "cavalluccio": cavalluccio,
}


def build(out_dir: str) -> str:
    sheet = Sheet("Creature")
    for name, draw in CREATURES.items():
        frames = [draw(2 * math.pi * i / 4, "swim") for i in range(4)]
        # la palette è definita dentro ogni funzione: la ricavo ridisegnando una tela
        palette = _palette_of(name)
        sheet.add_palette(palette)
        ax, ay = frames[0].w // 2, frames[0].h // 2
        sheet.add_frames(f"{name}_swim", frames, palette, ax, ay)
        sheet.add(f"{name}_hurt_0", draw(1.2, "hurt"), palette, ax, ay)
        sheet.add(f"{name}_dead_0", draw(0.0, "dead"), palette, ax, ay)
    path = f"{out_dir}/creatures.spr"
    sheet.write(path)
    return path


def _palette_of(name: str) -> Palette:
    table = {
        "polpo": pal("polpo", "#8a2e2a", "#c8553e", "#f0a07a", "#f6d2b0", "#3a1012"),
        "seppia": pal("seppia", "#6a4a3a", "#b08a6a", "#e8d4b8", "#3a2a22", "#241812", "#f6ecd8"),
        "calamaro": pal("calamaro", "#c86a7a", "#f0b0b8", "#fbe4e4", "#a83a4a", "#4a1a26"),
        "medusa": Palette("medusa", {"o": "#4a2a6a", "a": "#b06ad8c8", "b": "#d8a0f0b0", "c": "#f4dcffd0", "e": "#f06ab0", "f": "#ffffff", "h": "#ffffff", "w": "#ffffff", "k": "#10141f"}),
        "aragosta": pal("aragosta", "#8a2a1e", "#d8552e", "#f6a05a", "#f6d27a", "#3a1008"),
        "tartaruga": pal("tartaruga", "#5a4a2a", "#8a7440", "#c8b070", "#3a2e18", "#201808", "#d8c890"),
        "cavalluccio": pal("cavalluccio", "#b8861e", "#f0c040", "#fbe58a", "#8a5a12", "#3a2608"),
    }
    return table[name]
