"""Personaggi a terra: Tecla in sala, Nonna Ines ai fornelli, i clienti dell'osteria.

Figure tozze con la testa grande, viste di tre quarti e rivolte a destra (il gioco le specchia).
Ogni personaggio è descritto da colori, capelli e corporatura; le pose nascono dagli angoli
di braccia e gambe, così camminate e gesti restano coerenti tra tutti.
"""
import math

from forge import Canvas, Grid, Palette, Sheet

W, H = 26, 34
GROUND = 32.0          # y dei piedi
AX, AY = 13, 32        # ancoraggio: tra i piedi


class Look:
    def __init__(self, pid: str, skin: str, hair: str, top: str, bottom: str, *, shoes: str = "#3a2a2a",
                 accent: str = "#f2c23a", hair_style: str = "short", build: float = 1.0, height: float = 1.0,
                 apron: str | None = None, hat: str | None = None, beard: bool = False, glasses: bool = False,
                 hat_style: str = "cap", sash: bool = False, moustache: bool = False):
        self.pid = pid
        self.hat_style, self.sash, self.moustache = hat_style, sash, moustache
        self.skin, self.hair, self.top, self.bottom = skin, hair, top, bottom
        self.shoes, self.accent = shoes, accent
        self.hair_style, self.build, self.height = hair_style, build, height
        self.apron, self.hat, self.beard, self.glasses = apron, hat, beard, glasses

    def palette(self) -> Palette:
        def shade(hexv: str, k: float) -> str:
            v = hexv.lstrip("#")
            r, g, b = (int(v[i:i + 2], 16) for i in (0, 2, 4))
            if k < 1:
                r, g, b = (int(c * k) for c in (r, g, b))
            else:
                r, g, b = (int(c + (255 - c) * (k - 1)) for c in (r, g, b))
            return "#%02x%02x%02x" % (r, g, b)

        entries = {
            "o": "#1a1626",
            "s": self.skin, "S": shade(self.skin, 0.78), "h": shade(self.skin, 1.35),
            "k": self.hair, "K": shade(self.hair, 1.45),
            "t": self.top, "T": shade(self.top, 0.72), "u": shade(self.top, 1.35),
            "b": self.bottom, "B": shade(self.bottom, 0.72),
            "f": self.shoes,
            "y": self.accent, "Y": shade(self.accent, 0.72),
            "a": self.apron or "#f4efe2", "A": shade(self.apron or "#f4efe2", 0.80),
            "c": self.hat or "#d8483a", "C": shade(self.hat or "#d8483a", 0.72),
            "w": "#ffffff", "e": "#1a1626", "m": "#b0453c", "g": "#9fb4c8",
            "p": "#f4efe2", "P": "#cfc8b6", "r": "#c8402f", "n": "#9a6a3a", "N": "#6a4526",
            "v": "#7a1f3a", "V": "#b03a5a",
        }
        return Palette(self.pid, entries)


RAMPS = {"t": ("T", "u"), "s": ("S", "h"), "b": ("B", ""), "k": ("", "K"), "a": ("A", ""), "c": ("C", "")}


def _limb(c: Canvas, x0: float, y0: float, angle: float, length: float, r0: float, r1: float, key: str) -> tuple[float, float]:
    """Segmento che parte da (x0, y0); angolo 0 = verso il basso, positivo = in avanti (destra)."""
    x1 = x0 + math.sin(angle) * length
    y1 = y0 + math.cos(angle) * length
    c.capsule(x0, y0, x1, y1, r0, key, r1)
    return (x1, y1)


def figure(look: Look, *, leg_a: float = 0.0, leg_b: float = 0.0, arm_near: float = 0.0, arm_far: float = 0.0,
           elbow_near: float = 0.0, bob: float = 0.0, lean: float = 0.0, seated: bool = False,
           mouth: str = "smile", eyes: str = "open", carry: str | None = None, hold_up: bool = False,
           brow: str | None = None) -> Grid:
    pal = look.palette()
    c = Canvas(W, H, pal)
    scale = look.height
    leg_len = (8.0 if not seated else 5.0) * scale
    torso_h = 8.5 * scale
    hip_y = GROUND - leg_len - 1.0 + bob
    hip_x = 13.0 + lean * 2
    shoulder_y = hip_y - torso_h
    shoulder_x = hip_x + lean * 2.5
    body_r = 3.6 * look.build
    head_r = 5.4
    head_x = shoulder_x + 0.9
    head_y = shoulder_y - head_r + 1.2

    # braccio lontano
    fx, fy = _limb(c, shoulder_x - 1.2, shoulder_y + 1.6, arm_far, 6.4 * scale, 1.5, 1.3, "T")
    c.ellipse(fx, fy, 1.3, 1.3, "S")

    # gambe
    if seated:
        # seduto: cosce in avanti, stinchi giù
        kx, ky = hip_x + 5.0, hip_y + 0.6
        c.capsule(hip_x, hip_y, kx, ky, 2.1, "b")
        c.capsule(kx, ky, kx + 0.4, GROUND - 1.5, 1.8, "B")
        c.ellipse(kx + 1.4, GROUND - 0.9, 2.3, 1.2, "f")
    else:
        for ang, key in ((leg_b, "B"), (leg_a, "b")):
            kx, ky = _limb(c, hip_x, hip_y, ang * 0.9, leg_len * 0.55, 2.0 * look.build, 1.8, key)
            # il ginocchio si piega quando la gamba è dietro
            bend = ang - max(0.0, -ang) * 0.9 - 0.15 * abs(ang)
            ax_, ay_ = _limb(c, kx, ky, bend, leg_len * 0.55, 1.8, 1.5, key)
            c.ellipse(ax_ + 1.1, min(ay_ + 0.6, GROUND - 0.6), 2.2, 1.2, "f")

    # busto
    c.capsule(hip_x, hip_y, shoulder_x, shoulder_y + 1.0, body_r, "t", body_r * 0.92)
    if look.apron:
        c.poly([(hip_x - 0.5, shoulder_y + 3.0), (hip_x + body_r + 0.6, shoulder_y + 3.4),
                (hip_x + body_r + 0.9, hip_y + 4.0), (hip_x - 1.0, hip_y + 4.0)], "a")
        c.line(hip_x - 1.0, shoulder_y + 3.0, hip_x + body_r + 0.6, shoulder_y + 3.4, 0.8, "A")
    else:
        c.rect(hip_x - body_r, hip_y - 0.4, hip_x + body_r, hip_y + 1.2, "B")

    # testa
    c.ellipse(head_x, head_y, head_r, head_r * 0.96, "s")
    hs = look.hair_style
    if hs == "bald":
        c.ellipse(head_x - 2.6, head_y + 0.5, 3.0, 3.2, "k")
    elif hs == "bun":
        c.ellipse(head_x - 1.0, head_y - 1.8, head_r + 0.2, head_r * 0.80, "k")
        c.ellipse(head_x - 5.2, head_y - 3.4, 2.5, 2.4, "k")
        c.ellipse(head_x + 1.6, head_y + 1.4, head_r - 1.3, head_r - 1.6, "s")
    elif hs == "long":
        c.ellipse(head_x - 1.2, head_y - 1.2, head_r + 0.4, head_r * 0.92, "k")
        c.capsule(head_x - 4.0, head_y, head_x - 4.6, head_y + 8.0, 2.4, "k", 1.6)
        c.ellipse(head_x + 1.8, head_y + 1.5, head_r - 1.4, head_r - 1.6, "s")
    elif hs == "braid":
        c.ellipse(head_x - 1.0, head_y - 1.4, head_r + 0.3, head_r * 0.90, "k")
        c.capsule(head_x - 4.4, head_y + 1.0, head_x - 6.2, head_y + 9.5, 1.7, "k", 1.2)
        c.ellipse(head_x - 6.0, head_y + 9.0, 1.2, 1.2, "y")
        c.ellipse(head_x + 1.8, head_y + 1.5, head_r - 1.4, head_r - 1.6, "s")
        c.ellipse(head_x + 0.4, head_y - 3.8, 4.2, 1.9, "k")
    elif hs == "curly":
        for dx, dy, r in ((-3.4, -2.6, 2.8), (-0.6, -4.0, 3.0), (2.4, -3.4, 2.6), (-5.0, 0.2, 2.4), (-4.4, 2.8, 2.0)):
            c.ellipse(head_x + dx, head_y + dy, r, r, "k")
    else:  # short
        c.ellipse(head_x - 1.0, head_y - 1.8, head_r + 0.2, head_r * 0.78, "k")
        c.ellipse(head_x + 1.6, head_y + 1.2, head_r - 1.2, head_r - 1.5, "s")
    if look.hat and look.hat_style == "toque":
        # cappello da cuoco, alto e gonfio in cima
        c.rect(head_x - 3.6, head_y - 10.5, head_x + 3.4, head_y - 3.4, "c")
        c.ellipse(head_x - 2.4, head_y - 10.6, 2.6, 2.2, "c")
        c.ellipse(head_x + 2.0, head_y - 10.6, 2.6, 2.2, "c")
    elif look.hat and look.hat_style == "straw":
        c.ellipse(head_x - 0.2, head_y - 4.6, head_r - 0.6, 3.0, "c")
        c.ellipse(head_x + 0.2, head_y - 3.0, head_r + 3.4, 1.3, "c")
    elif look.hat and look.hat_style == "bandana":
        c.ellipse(head_x - 0.4, head_y - 3.6, head_r + 0.3, 2.6, "c")
        c.poly([(head_x - 5.0, head_y - 3.4), (head_x - 8.0, head_y - 1.4), (head_x - 5.6, head_y - 0.6)], "c")
    elif look.hat:
        c.ellipse(head_x - 0.2, head_y - 4.2, head_r + 0.6, 2.6, "c")
        c.rect(head_x - 1.0, head_y - 2.6, head_x + head_r + 2.6, head_y - 1.4, "C")
    if look.beard:
        c.ellipse(head_x + 1.6, head_y + 3.2, 3.6, 2.4, "k")

    # braccio vicino, con eventuale gomito piegato
    ex, ey = _limb(c, shoulder_x + 1.0, shoulder_y + 2.0, arm_near, 3.6 * scale, 1.7, 1.5, "u")
    hx, hy = _limb(c, ex, ey, arm_near + elbow_near, 3.4 * scale, 1.5, 1.3, "u")
    c.ellipse(hx, hy, 1.4, 1.4, "s")

    # oggetti in mano
    if carry == "plate":
        c.ellipse(hx + 2.0, hy - 0.6, 4.2, 1.2, "p")
        c.ellipse(hx + 2.0, hy - 1.6, 2.6, 1.3, "r")
        c.rect(hx - 1.4, hy + 0.2, hx + 5.4, hy + 0.9, "P")
    elif carry == "wine":
        c.poly([(hx + 0.4, hy - 4.6), (hx + 3.4, hy - 4.6), (hx + 3.0, hy + 0.6), (hx + 0.8, hy + 0.6)], "v")
        c.rect(hx + 0.6, hy - 4.6, hx + 3.2, hy - 3.6, "g")
    elif carry == "spoon":
        c.line(hx, hy, hx + 1.2, hy - 6.5, 0.9, "n")
        c.ellipse(hx + 1.3, hy - 7.2, 1.3, 1.6, "n")
    elif carry == "cloth":
        c.poly([(hx - 1.0, hy), (hx + 3.6, hy - 0.6), (hx + 3.0, hy + 2.6), (hx - 0.4, hy + 2.2)], "p")
    elif carry == "fork":
        c.line(hx, hy, hx + 0.6, hy - 4.0, 0.8, "g")

    if look.sash:
        c.line(shoulder_x - 2.6, shoulder_y + 1.6, hip_x + 3.0, hip_y - 0.6, 1.5, "y")

    g = c.grid(threshold=0.46)
    g.rim(RAMPS)

    # viso, fatto a mano
    ex_ = int(round(head_x + 1.6))
    ey_ = int(round(head_y - 0.2))
    if eyes == "open":
        g.set(ex_, ey_, "e")
        g.set(ex_ + 3, ey_, "e")
    elif eyes == "wide":
        for dx in (0, 3):
            g.set(ex_ + dx, ey_ - 1, "e")
            g.set(ex_ + dx, ey_, "e")
    elif eyes == "closed":
        g.set(ex_ - 1, ey_, "S")
        g.set(ex_, ey_, "S")
        g.set(ex_ + 3, ey_, "S")
    elif eyes == "angry":
        g.set(ex_, ey_, "e")
        g.set(ex_ + 3, ey_, "e")
        g.set(ex_ - 1, ey_ - 2, "e")
        g.set(ex_, ey_ - 1, "e")
        g.set(ex_ + 3, ey_ - 1, "e")
        g.set(ex_ + 4, ey_ - 2, "e")
    if look.glasses:
        for dx in (-1, 0, 1, 2, 3, 4):
            g.set(ex_ + dx, ey_ - 1, "g")
        g.set(ex_ - 1, ey_, "g")
        g.set(ex_ + 1, ey_, "g")
        g.set(ex_ + 2, ey_, "g")
        g.set(ex_ + 4, ey_, "g")
    my = ey_ + 3
    if mouth == "smile":
        g.set(ex_ + 1, my, "m")
        g.set(ex_ + 2, my, "m")
        g.set(ex_ + 3, my - 1, "m")
    elif mouth == "open":
        g.set(ex_ + 1, my, "m")
        g.set(ex_ + 2, my, "m")
        g.set(ex_ + 1, my + 1, "m")
        g.set(ex_ + 2, my + 1, "m")
    elif mouth == "flat":
        g.set(ex_ + 1, my, "S")
        g.set(ex_ + 2, my, "S")
    elif mouth == "frown":
        g.set(ex_ + 1, my, "m")
        g.set(ex_ + 2, my, "m")
        g.set(ex_ + 3, my + 1, "m")
    if look.moustache:
        g.set(ex_ + 1, my - 1, "k")
        g.set(ex_ + 2, my - 1, "k")
        g.set(ex_ + 3, my - 1, "k")
    g.outline("o")
    return g


def walk(look: Look, carry: str | None = None, n: int = 6) -> list[Grid]:
    frames = []
    for i in range(n):
        ph = 2 * math.pi * i / n
        swing = math.sin(ph) * 0.62
        bob = -abs(math.cos(ph)) * 0.8
        if carry:
            frames.append(figure(look, leg_a=swing, leg_b=-swing, arm_near=0.85, elbow_near=0.55, arm_far=0.7, bob=bob, carry=carry))
        else:
            frames.append(figure(look, leg_a=swing, leg_b=-swing, arm_near=-swing * 0.8, arm_far=swing * 0.8, bob=bob))
    return frames


def idle(look: Look, n: int = 4, carry: str | None = None) -> list[Grid]:
    frames = []
    for i in range(n):
        bob = [0.0, 0.5, 0.0, -0.3][i % 4]
        eyes = "closed" if i == n - 1 else "open"
        if carry:
            frames.append(figure(look, arm_near=0.85, elbow_near=0.55, arm_far=0.7, bob=bob, eyes=eyes, carry=carry))
        else:
            frames.append(figure(look, arm_near=0.08, arm_far=-0.08, bob=bob, eyes=eyes))
    return frames


# ----------------------------------------------------------------------------
# Personaggi
# ----------------------------------------------------------------------------
TECLA = Look("tecla_land", "#f0b98a", "#3a2233", "#1d8a8e", "#2f4a6a", accent="#ffc233", hair_style="braid",
             apron="#f4efe2", shoes="#d6861d")
INES = Look("ines", "#eab58a", "#c9c9d2", "#3a3340", "#3a3340", accent="#e06a7a", hair_style="bun", build=1.28,
            height=0.86, apron="#e8a0a8", shoes="#2a2030", glasses=True)

CUSTOMERS = [
    Look("cust0", "#f0b98a", "#5a3a22", "#d8553b", "#3a4a6a", hair_style="short"),
    Look("cust1", "#d9a070", "#1f1a24", "#f2b84b", "#5a4a3a", hair_style="long"),
    Look("cust2", "#f4c9a4", "#b8b8c4", "#4f7fb0", "#3a3a48", hair_style="bald", beard=True, build=1.2),
    Look("cust3", "#c98a5a", "#2a1a1a", "#7fb86a", "#4a3a5a", hair_style="curly"),
    Look("cust4", "#f0b98a", "#a85a2a", "#b06ac0", "#2f3a4a", hair_style="bun", glasses=True),
    Look("cust5", "#e8b08a", "#3a2a1a", "#f4efe2", "#2f4a6a", hair_style="short", hat="#2f6fb5", build=1.1),
    Look("cust6", "#b87a50", "#101018", "#e8703a", "#3a3a3a", hair_style="long", height=0.92),
    Look("cust7", "#f4c9a4", "#d8c8a0", "#2bb7b3", "#5a3a3a", hair_style="short", beard=True, hat="#f2c23a"),
]

# Ospiti speciali: il parroco e il critico della guida.
PINUCCIO = Look("pinuccio", "#f0c0a0", "#8a8a96", "#1e1e28", "#1e1e28", hair_style="bald", build=1.3, glasses=True, accent="#f4efe2")
CRITICO = Look("critico", "#e8c0a0", "#2a2a36", "#4a3a5a", "#2a2a36", hair_style="short", glasses=True, hat="#3a3a48", height=1.05)


# Il resto del cast: compare nelle scene della storia.
ZAIRA = Look("zaira", "#c98a5a", "#1f1a24", "#d99a3a", "#4a6a8a", hair_style="short", hat="#d8483a", hat_style="bandana",
             apron="#4a6a8a", shoes="#3a2a2a", build=1.1)
BIANCA = Look("bianca", "#f4c9a4", "#a8683a", "#f2c23a", "#b0453c", hair_style="curly", height=0.70, build=0.86, shoes="#f4efe2")
SAVERIO = Look("saverio", "#c9905a", "#e8e0d0", "#5a8a4a", "#6a5a3a", hair_style="bald", hat="#e8c86a", hat_style="straw", beard=True, build=1.15)
LUSTRI = Look("lustri", "#f4d2b8", "#1f1a24", "#f4efe2", "#2a2a36", hair_style="short", hat="#f7f4ec", hat_style="toque", moustache=True,
              accent="#c8402f", height=1.06, build=0.92)
FULGENZIO = Look("fulgenzio", "#eab090", "#3a2a22", "#2a2f4a", "#2a2f4a", hair_style="bald", build=1.42, moustache=True, sash=True,
                 accent="#3a8a4a", shoes="#1a1626")

STORY_CAST = [ZAIRA, BIANCA, SAVERIO, LUSTRI, FULGENZIO]


def talk(look: Look) -> list[Grid]:
    """Due fotogrammi: bocca aperta con la mano che accompagna, poi bocca chiusa."""
    return [figure(look, arm_near=1.25, elbow_near=0.9, arm_far=0.2, mouth="open", bob=-0.4),
            figure(look, arm_near=0.9, elbow_near=1.2, arm_far=0.1, mouth="smile")]


def shock(look: Look) -> list[Grid]:
    return [figure(look, arm_near=2.7, elbow_near=0.2, arm_far=2.5, mouth="open", eyes="wide", bob=b) for b in (0.0, -1.2)]


def customer_frames(look: Look) -> dict[str, list[Grid]]:
    return {
        "walk": walk(look, n=4),
        "sit": [figure(look, seated=True, arm_near=0.9, elbow_near=0.9, arm_far=0.8, bob=b, eyes=e)
                for b, e in ((0.0, "open"), (0.4, "open"), (0.0, "closed"))],
        "eat": [figure(look, seated=True, arm_near=1.2, elbow_near=el, arm_far=0.8, mouth=m, carry="fork")
                for el, m in ((0.4, "smile"), (1.5, "open"), (1.9, "open"), (0.9, "smile"))],
        "happy": [figure(look, seated=True, arm_near=2.6, elbow_near=0.3, arm_far=2.4, mouth="open", eyes="closed", bob=b) for b in (0.0, -0.8)],
        "angry": [figure(look, seated=True, arm_near=0.9, elbow_near=1.2, arm_far=0.8, mouth="frown", eyes="angry", bob=b) for b in (0.0, 0.5)],
    }


def build(out_dir: str) -> str:
    sheet = Sheet("Personaggi a terra")
    pal = sheet.add_palette(TECLA.palette())
    sheet.add_frames("tecla_walk", walk(TECLA), pal, AX, AY)
    sheet.add_frames("tecla_stand", idle(TECLA), pal, AX, AY)
    sheet.add_frames("tecla_carry", walk(TECLA, carry="plate"), pal, AX, AY)
    sheet.add_frames("tecla_carrywine", walk(TECLA, carry="wine"), pal, AX, AY)
    sheet.add_frames("tecla_hold", idle(TECLA, carry="plate"), pal, AX, AY)
    sheet.add_frames("tecla_serve", [figure(TECLA, arm_near=a, elbow_near=e, arm_far=0.5, lean=l, carry="plate")
                                     for a, e, l in ((0.9, 0.5, 0.0), (1.3, 0.2, 0.3), (1.5, 0.0, 0.5), (1.1, 0.4, 0.2))], pal, AX, AY)
    sheet.add_frames("tecla_clean", [figure(TECLA, arm_near=1.2 + s * 0.3, elbow_near=0.2, arm_far=0.4, lean=0.4, carry="cloth")
                                     for s in (-1, 0, 1, 0)], pal, AX, AY)
    sheet.add_frames("tecla_pour", [figure(TECLA, arm_near=1.5, elbow_near=0.5 + s * 0.15, arm_far=0.6, lean=0.2, carry="wine", eyes=e)
                                    for s, e in ((0, "open"), (1, "open"), (0, "closed"), (-1, "open"))], pal, AX, AY)
    sheet.add_frames("tecla_shock", [figure(TECLA, arm_near=2.7, elbow_near=0.2, arm_far=2.5, mouth="open", eyes="wide", bob=b)
                                     for b in (0.0, -1.4, -0.6, 0.0)], pal, AX, AY)
    sheet.add_frames("tecla_talk", talk(TECLA), pal, AX, AY)

    pal = sheet.add_palette(INES.palette())
    sheet.add_frames("ines_cook", [figure(INES, arm_near=1.25, elbow_near=0.5 + s * 0.35, arm_far=0.9, carry="spoon", eyes=e)
                                   for s, e in ((0, "open"), (1, "open"), (0, "closed"), (-1, "open"))], pal, AX, AY)
    sheet.add_frames("ines_shout", [figure(INES, arm_near=2.4, elbow_near=0.4, arm_far=0.9, carry="spoon", mouth="open", eyes="angry", bob=b)
                                    for b in (0.0, -1.0)], pal, AX, AY)
    sheet.add_frames("ines_stand", idle(INES), pal, AX, AY)
    sheet.add_frames("ines_walk", walk(INES, n=4), pal, AX, AY)
    sheet.add_frames("ines_talk", talk(INES), pal, AX, AY)
    sheet.add_frames("ines_shock", shock(INES), pal, AX, AY)

    for look in CUSTOMERS + [PINUCCIO, CRITICO]:
        pal = sheet.add_palette(look.palette())
        for name, frames in customer_frames(look).items():
            sheet.add_frames(f"{look.pid}_{name}", frames, pal, AX, AY)
    for look in [PINUCCIO, CRITICO]:
        sheet.add_frames(f"{look.pid}_stand", idle(look), look.pid, AX, AY)
        sheet.add_frames(f"{look.pid}_talk", talk(look), look.pid, AX, AY)
        sheet.add_frames(f"{look.pid}_shock", shock(look), look.pid, AX, AY)
    for look in STORY_CAST:
        pal = sheet.add_palette(look.palette())
        sheet.add_frames(f"{look.pid}_stand", idle(look), pal, AX, AY)
        sheet.add_frames(f"{look.pid}_walk", walk(look, n=4), pal, AX, AY)
        sheet.add_frames(f"{look.pid}_talk", talk(look), pal, AX, AY)
        sheet.add_frames(f"{look.pid}_shock", shock(look), pal, AX, AY)

    path = f"{out_dir}/people.spr"
    sheet.write(path)
    return path
