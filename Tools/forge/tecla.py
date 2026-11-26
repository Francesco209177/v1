"""Tecla, la protagonista: ex apneista, muta petrolio, pinne lunghe gialle, treccia scura.

Lo sprite guarda a destra; il gioco lo specchia e lo ruota secondo la direzione.
"""
import math

from forge import Canvas, Grid, Palette, Sheet, rot

PAL = Palette("tecla", {
    "o": "#141a2c",  # contorno
    "s": "#f0b98a",  # pelle
    "S": "#c58560",  # pelle in ombra
    "h": "#ffdcb6",  # pelle in luce
    "k": "#3a2233",  # capelli
    "K": "#6a4257",  # capelli in luce
    "t": "#1d8a8e",  # muta
    "T": "#135a66",  # muta in ombra
    "u": "#46bfae",  # muta in luce
    "y": "#ffc233",  # pinne, riga della muta
    "Y": "#d6861d",  # giallo in ombra
    "z": "#ffe98a",  # giallo in luce
    "r": "#ea5240",  # maschera
    "R": "#a52c34",  # maschera in ombra
    "l": "#8fdcef",  # lente
    "L": "#e9fbff",  # riflesso
    "g": "#56627a",  # cintura dei pesi
    "G": "#39425a",
    "w": "#ffffff",
})

W, H = 56, 30
AX, AY = 30, 15  # punto di ancoraggio: centro del busto

RAMPS = {"t": ("T", "u"), "s": ("S", "h"), "y": ("Y", "z"), "k": ("", "K"), "r": ("R", ""), "g": ("G", "")}

CY = 15.0
HEAD_X = 41.0


def _body(c: Canvas, phase: float, kick: float, bob: float, arm_swing: float, braid_phase: float,
          look: float = 0.0, arm_pose: str = "trail") -> None:
    cy = CY + bob
    hip = (24.0, cy + 0.5)
    shoulder = (33.5, cy + 0.2)
    head = (HEAD_X, cy - 1.0 + look)

    def leg(sign: float, near: bool) -> None:
        a = math.sin(phase) * kick * sign + sign * 0.9   # le gambe non si sovrappongono mai del tutto
        lag = math.sin(phase - 1.1) * kick * sign + sign * 0.9
        knee = (19.0, hip[1] + a * 0.55)
        ankle = (14.2, hip[1] + a * 1.0)
        # pala lunga da apnea: segue la gamba in ritardo e si flette
        mid = (8.4, ankle[1] + (lag - a) * 0.55 + a * 0.15)
        tip = (2.2, ankle[1] + (lag - a) * 1.25 + a * 0.2)
        suit = "t" if near else "T"
        fin = "y" if near else "Y"
        blade = [ankle, mid, tip]
        upper, lower = [], []
        widths = [0.9, 1.25, 1.45]
        for i, (px, py) in enumerate(blade):
            j0, j1 = max(0, i - 1), min(len(blade) - 1, i + 1)
            ang = math.atan2(blade[j1][1] - blade[j0][1], blade[j1][0] - blade[j0][0])
            nx, ny = -math.sin(ang), math.cos(ang)
            upper.append((px + nx * widths[i], py + ny * widths[i]))
            lower.append((px - nx * widths[i], py - ny * widths[i]))
        c.poly(upper + list(reversed(lower)), fin)
        c.capsule(hip[0], hip[1], knee[0], knee[1], 2.5, suit, 2.1)
        c.capsule(knee[0], knee[1], ankle[0], ankle[1], 2.1, suit, 1.6)
        c.ellipse(ankle[0] - 0.2, ankle[1], 1.6, 1.5, "G" if near else "o")  # scarpetta della pinna

    leg(-1.0, near=False)

    # braccio lontano, appena visibile dietro il busto
    if arm_pose == "trail":
        c.capsule(shoulder[0] - 0.8, shoulder[1] - 1.2, 27.0, cy - 1.6 - arm_swing * 0.5, 1.2, "T")

    # busto: più pieno al torace, più stretto in vita
    c.capsule(hip[0], hip[1], shoulder[0], shoulder[1], 3.2, "t", 3.9)
    c.capsule(hip[0] + 1.5, hip[1] + 1.7, shoulder[0] - 1.0, shoulder[1] + 2.2, 0.55, "y")   # riga gialla sul fianco
    c.poly([(26.3, cy - 3.1), (27.9, cy - 3.2), (28.1, cy + 4.0), (26.5, cy + 3.9)], "g")      # cintura dei pesi

    leg(1.0, near=True)

    # treccia: parte dalla nuca e ondeggia sopra la schiena
    pts = []
    for i in range(8):
        t = i / 7
        x = head[0] - 4.6 - t * 10.5
        y = head[1] - 2.2 - t * 3.0 + math.sin(braid_phase - t * 3.0) * (0.3 + t * 1.5)
        pts.append((x, y))
    c.curve(pts, 2.4, "k", taper=0.6)
    c.ellipse(pts[-2][0], pts[-2][1], 1.15, 1.15, "y")

    # testa grande (proporzioni da cartone): capelli dietro e sopra, viso davanti
    c.ellipse(head[0] - 0.8, head[1] - 0.8, 5.6, 5.3, "k")
    c.ellipse(head[0] + 1.1, head[1] + 0.9, 4.6, 4.3, "s")
    c.ellipse(head[0] - 3.0, head[1] - 0.6, 3.0, 4.4, "k")
    c.ellipse(head[0] + 0.2, head[1] - 3.6, 4.6, 2.2, "k")   # frangia

    # maschera: cinghiolo, telaio, lente
    c.capsule(head[0] - 5.0, head[1] - 0.9, head[0] + 1.0, head[1] - 0.8, 0.55, "R")
    mx, my = head[0] + 0.9, head[1] - 3.1
    c.poly([(mx, my), (mx + 4.6, my + 0.1), (mx + 4.9, my + 4.1), (mx + 0.2, my + 4.2)], "r")
    c.poly([(mx + 0.95, my + 0.95), (mx + 3.9, my + 1.0), (mx + 4.0, my + 3.15), (mx + 1.0, my + 3.2)], "l")

    # braccio vicino
    if arm_pose == "trail":
        hand = (26.4, cy + 1.6 + arm_swing * 0.8)
        c.capsule(shoulder[0] - 0.4, shoulder[1] + 0.9, hand[0], hand[1], 1.45, "u", 1.25)
        c.ellipse(hand[0] - 1.0, hand[1] + 0.1, 1.3, 1.2, "s")
    elif arm_pose == "forward":
        hand = (46.5, cy + 4.6 + arm_swing)
        c.capsule(shoulder[0] - 0.2, shoulder[1] + 2.0, hand[0], hand[1], 1.55, "u", 1.3)
        c.ellipse(hand[0] + 0.8, hand[1], 1.35, 1.25, "s")


def _finish(c: Canvas, mouth: str = "closed", eye: str = "open", bob: float = 0.0, look: float = 0.0) -> Grid:
    g = c.grid()
    g.rim(RAMPS)
    hx = int(round(HEAD_X))
    hy = int(round(CY + bob - 1.0 + look))
    # occhio dentro la lente e riflesso
    if eye == "open":
        g.set(hx + 4, hy - 1, "o")
        g.set(hx + 4, hy, "o")
    elif eye == "wide":
        g.set(hx + 3, hy - 1, "o")
        g.set(hx + 4, hy - 1, "o")
        g.set(hx + 3, hy, "o")
        g.set(hx + 4, hy, "o")
    elif eye == "closed":
        g.set(hx + 3, hy, "T")
        g.set(hx + 4, hy, "T")
    g.set(hx + 2, hy - 2, "L")
    # bocca
    if mouth == "closed":
        g.set(hx + 4, hy + 3, "S")
        g.set(hx + 3, hy + 3, "S")
    elif mouth == "open":
        g.set(hx + 4, hy + 3, "R")
        g.set(hx + 3, hy + 3, "R")
        g.set(hx + 4, hy + 4, "R")
    elif mouth == "smile":
        g.set(hx + 2, hy + 3, "S")
        g.set(hx + 3, hy + 4, "S")
        g.set(hx + 4, hy + 3, "S")
    g.outline("o")
    return g


def swim_frames(n: int = 6) -> list[Grid]:
    frames = []
    for i in range(n):
        ph = 2 * math.pi * i / n
        c = Canvas(W, H, PAL)
        bob = math.sin(ph * 2) * 0.25
        _body(c, ph, kick=3.2, bob=bob, arm_swing=math.sin(ph + 0.6) * 0.7, braid_phase=ph)
        frames.append(_finish(c, bob=bob))
    return frames


def idle_frames(n: int = 4) -> list[Grid]:
    frames = []
    for i in range(n):
        ph = 2 * math.pi * i / n
        c = Canvas(W, H, PAL)
        bob = math.sin(ph) * 0.6
        _body(c, ph, kick=1.3, bob=bob, arm_swing=math.sin(ph) * 0.5, braid_phase=ph * 1.0 + 1.0)
        frames.append(_finish(c, bob=bob, eye="closed" if i == 3 else "open"))
    return frames


def dash_frames(n: int = 3) -> list[Grid]:
    frames = []
    for i in range(n):
        ph = 2 * math.pi * i / n
        c = Canvas(W, H, PAL)
        _body(c, ph, kick=4.2, bob=0.0, arm_swing=-1.2, braid_phase=ph * 2.0, arm_pose="forward")
        frames.append(_finish(c, mouth="closed"))
    return frames


def build(out_dir: str) -> str:
    sheet = Sheet("Tecla")
    sheet.add_palette(PAL)
    sheet.add_frames("tecla_swim", swim_frames(), PAL, AX, AY)
    sheet.add_frames("tecla_idle", idle_frames(), PAL, AX, AY)
    sheet.add_frames("tecla_dash", dash_frames(), PAL, AX, AY)
    path = f"{out_dir}/tecla.spr"
    sheet.write(path)
    return path
