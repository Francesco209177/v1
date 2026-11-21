"""Validatore DuckyScript con le stesse regole del firmware (``polpo_core/src/polpo/ducky``).

Polpo Studio NON esegue gli script: li controlla e li copia sulla microSD; partono solo dal Polpo,
dopo la conferma sul suo schermo.
"""

from __future__ import annotations

from dataclasses import dataclass, field

MAX_BYTES = 32 * 1024
MAX_LINES = 2000
MAX_ACTIONS = 1200
MAX_DELAY_MS = 60_000
MAX_REPEAT = 500

MOD_LCTRL, MOD_LSHIFT, MOD_LALT, MOD_LGUI, MOD_RALT = 0x01, 0x02, 0x04, 0x08, 0x40
K_A, K_1, K_0, K_ENTER, K_ESC, K_BKSP, K_TAB, K_SPACE = 0x04, 0x1E, 0x27, 0x28, 0x29, 0x2A, 0x2B, 0x2C
K_MINUS, K_EQUAL, K_LBR, K_RBR, K_BSLASH, K_NONUS_HASH = 0x2D, 0x2E, 0x2F, 0x30, 0x31, 0x32
K_SEMI, K_QUOTE, K_GRAVE, K_COMMA, K_PERIOD, K_SLASH, K_CAPS, K_F1 = 0x33, 0x34, 0x35, 0x36, 0x37, 0x38, 0x39, 0x3A
K_PRTSC, K_SCROLL, K_PAUSE, K_INS, K_HOME, K_PGUP, K_DEL, K_END, K_PGDN = 0x46, 0x47, 0x48, 0x49, 0x4A, 0x4B, 0x4C, 0x4D, 0x4E
K_RIGHT, K_LEFT, K_DOWN, K_UP, K_NUM, K_NONUS_BSLASH, K_APP = 0x4F, 0x50, 0x51, 0x52, 0x53, 0x64, 0x65

NAMED_KEYS = {
    "ENTER": K_ENTER, "ESC": K_ESC, "ESCAPE": K_ESC, "TAB": K_TAB, "SPACE": K_SPACE, "BACKSPACE": K_BKSP,
    "DELETE": K_DEL, "DEL": K_DEL, "INSERT": K_INS, "HOME": K_HOME, "END": K_END, "PAGEUP": K_PGUP,
    "PAGEDOWN": K_PGDN, "UP": K_UP, "UPARROW": K_UP, "DOWN": K_DOWN, "DOWNARROW": K_DOWN, "LEFT": K_LEFT,
    "LEFTARROW": K_LEFT, "RIGHT": K_RIGHT, "RIGHTARROW": K_RIGHT, "CAPSLOCK": K_CAPS, "NUMLOCK": K_NUM,
    "SCROLLLOCK": K_SCROLL, "PRINTSCREEN": K_PRTSC, "PAUSE": K_PAUSE, "BREAK": K_PAUSE, "MENU": K_APP, "APP": K_APP,
}  # fmt: skip
MODIFIERS = {
    "CTRL": MOD_LCTRL, "CONTROL": MOD_LCTRL, "SHIFT": MOD_LSHIFT, "ALT": MOD_LALT,
    "ALTGR": MOD_RALT, "GUI": MOD_LGUI, "WINDOWS": MOD_LGUI, "COMMAND": MOD_LGUI,
}  # fmt: skip

S, G = MOD_LSHIFT, MOD_RALT
_US = {
    "!": (S, K_1), "@": (S, K_1 + 1), "#": (S, K_1 + 2), "$": (S, K_1 + 3), "%": (S, K_1 + 4), "^": (S, K_1 + 5),
    "&": (S, K_1 + 6), "*": (S, K_1 + 7), "(": (S, K_1 + 8), ")": (S, K_0), "-": (0, K_MINUS), "_": (S, K_MINUS),
    "=": (0, K_EQUAL), "+": (S, K_EQUAL), "[": (0, K_LBR), "{": (S, K_LBR), "]": (0, K_RBR), "}": (S, K_RBR),
    "\\": (0, K_BSLASH), "|": (S, K_BSLASH), ";": (0, K_SEMI), ":": (S, K_SEMI), "'": (0, K_QUOTE), '"': (S, K_QUOTE),
    "`": (0, K_GRAVE), "~": (S, K_GRAVE), ",": (0, K_COMMA), "<": (S, K_COMMA), ".": (0, K_PERIOD), ">": (S, K_PERIOD),
    "/": (0, K_SLASH), "?": (S, K_SLASH),
}  # fmt: skip
_IT = {
    "!": (S, K_1), '"': (S, K_1 + 1), "£": (S, K_1 + 2), "$": (S, K_1 + 3), "%": (S, K_1 + 4), "&": (S, K_1 + 5),
    "/": (S, K_1 + 6), "(": (S, K_1 + 7), ")": (S, K_1 + 8), "=": (S, K_0), "'": (0, K_MINUS), "?": (S, K_MINUS),
    "ì": (0, K_EQUAL), "^": (S, K_EQUAL), "è": (0, K_LBR), "é": (S, K_LBR), "[": (G, K_LBR), "{": (G | S, K_LBR),
    "+": (0, K_RBR), "*": (S, K_RBR), "]": (G, K_RBR), "}": (G | S, K_RBR), "ò": (0, K_SEMI), "ç": (S, K_SEMI),
    "@": (G, K_SEMI), "à": (0, K_QUOTE), "°": (S, K_QUOTE), "#": (G, K_QUOTE), "ù": (0, K_NONUS_HASH),
    "§": (S, K_NONUS_HASH), "\\": (0, K_GRAVE), "|": (S, K_GRAVE), "<": (0, K_NONUS_BSLASH), ">": (S, K_NONUS_BSLASH),
    ",": (0, K_COMMA), ";": (S, K_COMMA), ".": (0, K_PERIOD), ":": (S, K_PERIOD), "-": (0, K_SLASH), "_": (S, K_SLASH),
    "€": (G, K_A + 4),
}  # fmt: skip
LAYOUTS = {"IT": _IT, "US": _US}


def layout_lookup(layout: str, ch: str) -> tuple[int, int] | None:
    o = ord(ch)
    if "a" <= ch <= "z":
        return 0, K_A + o - ord("a")
    if "A" <= ch <= "Z":
        return S, K_A + o - ord("A")
    if "1" <= ch <= "9":
        return 0, K_1 + o - ord("1")
    if ch == "0":
        return 0, K_0
    if ch == " ":
        return 0, K_SPACE
    if ch == "\n":
        return 0, K_ENTER
    if ch == "\t":
        return 0, K_TAB
    return LAYOUTS.get(layout, _US).get(ch)


@dataclass
class Action:
    type: str  # "text", "key", "delay"
    line: int
    text: str = ""
    modifiers: int = 0
    keycode: int = 0
    ms: int = 0


@dataclass
class Script:
    actions: list[Action] = field(default_factory=list)
    errors: list[tuple[int, str]] = field(default_factory=list)
    line_count: int = 0
    total_delay_ms: int = 0
    total_chars: int = 0

    @property
    def ok(self) -> bool:
        return not self.errors


def _u32(s: str) -> int | None:
    s = s.strip()
    return int(s) if s.isdigit() and len(s) <= 10 else None


def _combo_tokens(line: str) -> list[str]:
    out, cur = [], ""
    for c in line:
        if c in " \t" or (c == "-" and cur):
            if cur:
                out.append(cur)
            cur = ""
        else:
            cur += c
    if cur:
        out.append(cur)
    return out


class _Parser:
    def __init__(self, layout: str, out: Script) -> None:
        self.layout, self.out = layout, out
        self.no = 0
        self.default_delay = 0
        self.last = (0, 0)
        self.overflow = False

    def error(self, msg: str) -> None:
        self.out.errors.append((self.no, msg))

    def room(self) -> bool:
        if len(self.out.actions) >= MAX_ACTIONS:
            if not self.overflow:
                self.error("script troppo lungo (max 1200 azioni)")
            self.overflow = True
            return False
        return True

    def push(self, a: Action) -> None:
        if not self.room():
            return
        if a.type == "delay":
            self.out.total_delay_ms += a.ms
        if a.type == "text":
            self.out.total_chars += len(a.text)
        self.out.actions.append(a)

    def line(self, no: int, raw: str) -> None:
        self.no = no
        ln = raw.strip()
        if not ln:
            return
        parts = ln.split(None, 1)
        cmd = parts[0].upper() if parts[0].isascii() else parts[0]
        arg = ln[len(parts[0]) + 1 :] if len(parts) > 1 else ""
        if cmd in ("REM", "//"):
            return
        if cmd in ("DEFAULT_DELAY", "DEFAULTDELAY"):
            v = _u32(arg)
            if v is None or v > 10_000:
                return self.error("DEFAULT_DELAY richiede un numero 0-10000")
            self.default_delay = v
            return
        if cmd == "REPEAT":
            n = _u32(arg)
            if n is None or not 1 <= n <= MAX_REPEAT:
                return self.error("REPEAT richiede un numero 1-500")
            b, e = self.last
            if b == e:
                return self.error("REPEAT senza un comando precedente")
            for _ in range(n):
                for i in range(b, e):
                    if not self.room():
                        return
                    a = self.out.actions[i]
                    self.push(Action(a.type, no, a.text, a.modifiers, a.keycode, a.ms))
            return
        begin = len(self.out.actions)
        if cmd == "DELAY":
            v = _u32(arg)
            if v is None or v > MAX_DELAY_MS:
                return self.error("DELAY richiede un numero 0-60000")
            self.push(Action("delay", no, ms=v))
        elif cmd in ("STRING", "STRINGLN"):
            if not self.text(arg):
                return
            if cmd == "STRINGLN":
                self.push(Action("key", no, keycode=K_ENTER))
        elif not self.combo(ln):
            return
        if self.default_delay and cmd != "DELAY":
            self.push(Action("delay", no, ms=self.default_delay))
        self.last = (begin, len(self.out.actions))

    def text(self, s: str) -> bool:
        for ch in s:
            if layout_lookup(self.layout, ch) is None:
                self.error(f"carattere '{ch}' non digitabile con layout {self.layout}")
                return False
        self.push(Action("text", self.no, text=s))
        return True

    def combo(self, ln: str) -> bool:
        toks = _combo_tokens(ln)
        mods = code = 0
        for i, tok in enumerate(toks):
            up = tok.upper() if tok.isascii() else tok
            if up in MODIFIERS:
                mods |= MODIFIERS[up]
                continue
            if i + 1 != len(toks) or code:
                self.error(f"comando sconosciuto: {tok}")
                return False
            if up in NAMED_KEYS:
                code = NAMED_KEYS[up]
                continue
            if len(up) >= 2 and up[0] == "F" and up[1:].isdigit() and 1 <= int(up[1:]) <= 12:
                code = K_F1 + int(up[1:]) - 1
                continue
            if len(tok) == 1:
                ch = tok.lower() if "A" <= tok <= "Z" else tok
                ks = layout_lookup(self.layout, ch)
                if ks:
                    mods |= ks[0]
                    code = ks[1]
                    continue
            self.error(f"comando sconosciuto: {tok}")
            return False
        if not toks:
            return False
        self.push(Action("key", self.no, modifiers=mods, keycode=code))
        return True


def parse(source: str, layout: str = "IT") -> Script:
    out = Script()
    if len(source.encode("utf-8")) > MAX_BYTES:
        out.errors.append((0, "file troppo grande (max 32 KB)"))
        return out
    p = _Parser(layout if layout in LAYOUTS else "US", out)
    lines = source.split("\n")
    if lines and lines[-1] == "":
        lines.pop()
    for no, ln in enumerate(lines, start=1):
        if no > MAX_LINES:
            out.errors.append((no, "troppe righe (max 2000)"))
            break
        p.line(no, ln)
    out.line_count = min(len(lines), MAX_LINES + 1)
    return out


def estimate_seconds(s: Script, ms_per_char: int = 12) -> float:
    return (s.total_delay_ms + s.total_chars * ms_per_char + sum(1 for a in s.actions if a.type == "key") * 20) / 1000
