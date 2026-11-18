"""Video 01 score: key, harmony, patterns and every note / drum event, in beats.

"Come funziona davvero ChatGPT?"  120 BPM, 4/4, one beat = 0.5 s
(beat b sounds at b/2 seconds = frame 15*b at 30 fps), 15 bars of 2 s.

Cue sheet (src/v01/timeline.ts)                       beat   time
  typeStart    (soft keyboard typing 0.2-1.42 s)       0.4    0.2 s
  questionDone (small "send" accent)                   3      1.5 s
  diveIn       (rising whoosh into 3.0)                4      2.0 s
  inside       (soft impact + airy bloom, pulse)       6      3.0 s
  split        (granular shatter into tokens)         12      6.0 s
  intoNet      (dive whoosh into the network)         15      7.5 s
  groove       (attention scene: groove starts)       18      9.0 s
  vectors      (numeric data blips)                   20     10.0 s
  attention    (shimmering chord swell)               24     12.0 s
  build        (short riser 15-16 s)                  30     15.0 s
  predict      (impact + rising probability blips)    32     16.0 s
  pick         (select / lock accent)                 35     17.5 s
  tokens       (8th-note token ticks 18-22 s)         36     18.0 s
  loop         (token-loop accent)                    40     20.0 s
  fill         (small fill 22.5-23 s)                 45     22.5 s
  training     (big warm impact + data stream)        46     23.0 s
  title        ("NON PENSA. PREVEDE.": resolved hit)  52     26.0 s
  caveat       ("puo' sbagliare": detuned ping)       56     28.0 s
  fadeStart                                           58     29.0 s

Key: E minor (aeolian). The loop is i - VI - iv - v (Em - Cmaj7 - Am - Bm): darker than the
i - VI - III - VII of Video 02 (the minor v instead of the major VII), with the same #11 colour
on the VI chord. The answer section brightens to III - VII (G - D), the reveal walks
VI - VII - i (Cmaj9 - D - Em: the title lands on the tonic, fully resolved) and the caveat
leaves the piece open on Cmaj7#11.

The narrator speaks almost all the time, so the melodic material lives in the voice gaps
(8.0-9.3 s, 14.3-16.3 s, 20.4-23.3 s) and everything else is pads, filtered arps, bass and
drums kept out of the 1-4 kHz band.

Running this file prints the note names per bar and validates them against the scale and the
chord of the moment.
"""
from __future__ import annotations

import os
import sys

sys.dont_write_bytecode = True
_AUDIO = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if _AUDIO not in sys.path:
    sys.path.insert(0, _AUDIO)

import numpy as np  # noqa: E402

from dsp import n2m  # noqa: E402

KEY = "E minor (natural / aeolian)"
SCALE = ("E", "F#", "G", "A", "B", "C", "D")
SCALE_PCS = {n2m(s + "4") % 12 for s in SCALE}

CHORD_TONES = {"Em": ("E", "G", "B"), "Cmaj7": ("C", "E", "G", "B"), "Am": ("A", "C", "E"), "Bm": ("B", "D", "F#"),
               "G": ("G", "B", "D"), "D": ("D", "F#", "A")}
# colour tones allowed on top of each chord (9th, 11th, 6th/7th, #11)
CHORD_COLOURS = {"Em": ("F#", "D", "A"), "Cmaj7": ("D", "F#", "A"), "Am": ("B", "G", "D"), "Bm": ("A", "E"),
                 "G": ("A", "E", "F#"), "D": ("E", "G", "B", "C")}

CUE_BEATS = {"typeStart": 0.4, "questionDone": 3, "diveIn": 4, "inside": 6, "split": 12, "intoNet": 15, "groove": 18,
             "vectors": 20, "attention": 24, "build": 30, "predict": 32, "pick": 35, "tokens": 36, "loop": 40,
             "fill": 45, "training": 46, "title": 52, "caveat": 56, "fadeStart": 58}

# voice-over windows (seconds, src/v01/timeline.ts V1_VO): the melody stays out of them
VO = ((0.3, 2.42), (2.55, 4.2), (4.45, 8.0), (9.3, 14.3), (16.3, 20.4), (23.3, 25.4), (25.75, 29.2))
GAPS = ((0.0, 0.3), (2.42, 2.55), (4.2, 4.45), (8.0, 9.3), (14.3, 16.3), (20.4, 23.3), (25.4, 25.75))

# (start beat, end beat, chord, bass note)
HARMONY = [
    (0, 6, "Em", "E2"),         # hook: dark screen, the question is typed
    (6, 10, "Em", "E2"),        # inside: Em9 bloom, mysterious pulse
    (10, 12, "Cmaj7", "C2"),    # (#11 colour)
    (12, 15, "Am", "A1"),       # split into tokens (Am9)
    (15, 18, "Bm", "B1"),       # into the network: the minor v, dark
    (18, 24, "Em", "E2"),       # attention scene: groove, vectors at beat 20
    (24, 28, "Cmaj7", "C2"),    # attention links light up
    (28, 30, "Am", "A1"),
    (30, 32, "Bm", "B1"),       # build
    (32, 35, "Em", "E2"),       # predict
    (35, 40, "Cmaj7", "C2"),    # pick
    (40, 44, "G", "G1"),        # loop: the answer grows (III, first major colour)
    (44, 46, "D", "D2"),        # VII ... fill
    (46, 50, "Cmaj7", "C2"),    # training: warm Cmaj9 (VI)
    (50, 52, "D", "D2"),        # VII ...
    (52, 56, "Em", "E2"),       # ... -> i: the title lands on the tonic
    (56, 60, "Cmaj7", "C2"),    # caveat: Cmaj7#11, left open
]

PAD_VOICINGS = {
    "hook": ("E2", "B2", "G3", "B3"),
    "Em9": ("E3", "B3", "F#4", "G4"),          # add9 with the F#-G rub: curious
    "Cmaj7#11": ("C3", "G3", "B3", "E4", "F#4"),
    "Am9": ("A2", "E3", "B3", "C4"),
    "Bm7": ("B2", "F#3", "A3", "D4"),
    "Em": ("E3", "B3", "E4", "G4"),
    "Cmaj7": ("C3", "G3", "B3", "E4"),
    "Am": ("A2", "E3", "A3", "C4"),
    "Bm": ("B2", "F#3", "B3", "D4"),
    "Gadd9": ("G2", "D3", "A3", "B3"),
    "D": ("D3", "A3", "D4", "F#4"),
    "Cmaj9": ("C3", "G3", "B3", "D4", "E4"),   # training: warm, open
    "Dadd9": ("D3", "A3", "E4", "F#4"),
    "Em_title": ("E2", "B2", "G3", "B3", "F#4", "G4"),
    "Cmaj7#11_out": ("C3", "G3", "B3", "E4", "F#4"),
}

ARP_ROOT = {"Em": "E4", "Cmaj7": "C4", "Am": "A3", "Bm": "B3", "G": "G3", "D": "D4"}
ARP_ACCENT = (1.0, 0.55, 0.75, 0.9, 0.58, 0.72, 0.92, 0.6)   # 3+3+2 feel
MINOR = ("Em", "Am", "Bm")

# Melodic motif: rising 5 - b7 - 9 (B - D - F#), the v02 question motif's cousin, only in voice gaps.
LEAD_PHRASES = [
    # (start beat, [(offset, duration, note), ...])
    (16.5, [(0.0, 0.5, "B5"), (0.5, 0.5, "D6"), (1.0, 1.5, "F#6")]),                          # 8.25 s: question
    (29.0, [(0.0, 0.75, "E6"), (0.75, 0.75, "G6"), (1.5, 1.0, "F#6")]),                       # 14.5 s: thinking
    (41.0, [(0.0, 0.5, "D6"), (0.5, 0.5, "E6"), (1.0, 1.0, "G6"), (2.0, 0.75, "F#6"),
            (2.75, 1.25, "D6")]),                                                              # 20.5 s: the answer
]


QUESTION = "Come fa ChatGPT a sapere tutte queste cose?"     # src/v01/timeline.ts V1_QUESTION


def _hash(i: int, j: int = 0) -> float:
    """Exact port of src/lib/math.ts hash() (32-bit Math.imul arithmetic)."""
    m = 0xFFFFFFFF
    h = ((i * 374761393) + (j * 668265263)) & m
    h = ((h ^ (h >> 13)) * 1274126177) & m
    return (h ^ (h >> 16)) / 4294967296.0


def char_frames():
    """Frame (fractional) at which each character of the question appears: a port of CHAR_AT in
    src/v01/scenes/hook/timing.ts (typing from frame 6 = typeStart to frame 45 = questionDone)."""
    t0, t1 = 6, 45
    w = []
    for i, ch in enumerate(QUESTION):
        if i == 0:
            w.append(0.0)
            continue
        v = 0.62 + 0.8 * _hash(i, 41)
        if QUESTION[i - 1] == " ":
            v += 0.55
        if ch == " ":
            v *= 0.7
        if QUESTION[i - 1] == ch:
            v *= 0.8
        if ch == "?":
            v += 1.4
        w.append(v)
    tot = sum(w)
    acc, out = 0.0, []
    for v in w:
        acc += v
        out.append(t0 + (t1 - t0) * acc / tot)
    return out


def chord_at(beat: float) -> str:
    for b0, b1, ch, _ in HARMONY:
        if b0 <= beat < b1:
            return ch
    return HARMONY[-1][2]


def segment_at(beat: float):
    for seg in HARMONY:
        if seg[0] <= beat < seg[1]:
            return seg
    return HARMONY[-1]


def arp_pattern(chord: str):
    r = n2m(ARP_ROOT[chord])
    third = 15 if chord in MINOR else 16
    ninth = 10 if chord == "Bm" else 14          # C# is not in E minor: Bm takes its 7th (A) instead
    return [r, r + 7, r + 12, r + 7, r + third, r + 7, r + ninth, r + 12]


def in_vo(t: float) -> bool:
    return any(a <= t < b for a, b in VO)


def chord_pcs(ch: str, colours: bool = True):
    names = CHORD_TONES[ch] + (CHORD_COLOURS[ch] if colours else ())
    return {n2m(x + "4") % 12 for x in names}


def build(seed: int = 2401):
    """Return every event of the piece. Velocities are lightly humanised (seeded)."""
    rng = np.random.default_rng(seed)

    def hum(v, amt=0.07):
        return float(v * (1.0 + rng.uniform(-amt, amt)))

    ev = {k: [] for k in ("kick", "snap", "hat_c", "hat_o", "shaker", "roll", "crash", "pad", "sub", "bass", "pulse",
                          "arp", "lead", "bell", "stream", "vector", "probs", "token", "typing", "sparkle", "stab")}

    # ------------------------------------------------------------------ drums
    # 3.0-6.0 s: mysterious pulse (felt kick in half time), 6.0-9.0 s every beat, hats wake up at 7.5 s
    for b in (6, 8, 10):
        ev["kick"].append((b, "soft", hum(0.5 + 0.03 * (b - 6), 0.03)))
    for b in range(12, 18):
        ev["kick"].append((b, "soft", hum(0.6 + 0.025 * (b - 12), 0.03)))
    for b in range(15, 17):
        ev["hat_c"].append((b + 0.5, hum(0.24 + 0.04 * (b - 15))))
    for s, v in ((17.25, 0.28), (17.5, 0.4), (17.75, 0.48)):
        ev["hat_c"].append((s, v))

    # 9.0-15.0 s: attention groove (soft four-on-the-floor, off-beat open hats above 7 kHz)
    for b in range(18, 32):
        ev["kick"].append((b, "big" if b in (18, 24) else "warm", 1.0 if b == 18 else (0.9 if b == 24 else
                                                                                       hum(0.86, 0.03))))
        if b < 31:
            ev["hat_o"].append((b + 0.5, hum(0.7)))
        if 22 <= b < 30:
            ev["hat_c"].append((b + 0.25, hum(0.32)))
            ev["hat_c"].append((b + 0.75, hum(0.28)))
        if b >= 23 and b % 2 == 1 and b < 30:
            ev["snap"].append((b, hum(0.6)))
    ev["crash"] += [(18, "big", 0.55), (24, "small", 0.45)]
    # 15-16 s build: 16th -> 32nd roll, crescendo, rising in pitch (inside the 14.3-16.3 s voice gap)
    roll = [30 + k / 4 for k in range(6)] + [31.5 + k / 8 for k in range(4)]
    for i, b in enumerate(roll):
        u = i / (len(roll) - 1)
        ev["roll"].append((b, 0.25 + 0.6 * u ** 1.3, True, 7.0 * u))

    # 16-22.5 s: predict / pick / loop (snaps on 2 and 4; the open hats give way to the token ticks at 18 s)
    for b in range(32, 46):
        accent = b in (32, 35, 40)
        if b < 45:
            ev["kick"].append((b, "big" if accent else "warm", 1.0 if accent else hum(0.9, 0.03)))
        else:
            ev["kick"].append((b, "big", 0.95))            # 22.5 s: the fill starts on a solid hit
        if b < 36:
            ev["hat_o"].append((b + 0.5, hum(0.76)))
        if b < 44:
            ev["hat_c"].append((b + 0.25, hum(0.34)))
            ev["hat_c"].append((b + 0.75, hum(0.3)))
        elif b == 44:
            ev["hat_c"].append((b + 0.25, hum(0.26)))       # 44.75 left empty: the fill hit lands clean
        if 36 <= b < 44:
            for k, v in ((1, 0.28), (3, 0.34)):             # e / a only: the 8ths belong to the token ticks
                ev["shaker"].append((b + k / 4, hum(v, 0.12)))
        if (b % 2 == 1 and b < 45) or b == 45:
            ev["snap"].append((b, hum(0.78) if b < 45 else 0.85))
    ev["crash"] += [(32, "big", 0.62), (35, "small", 0.5), (40, "small", 0.55)]
    for b, v in ((45.0, 0.6), (45.25, 0.34), (45.5, 0.46), (45.625, 0.44), (45.75, 0.58), (45.875, 0.7)):
        ev["roll"].append((b, v, True, 3.0 * (b - 45.0)))

    # 23-26 s: training: big hit, then drums lighter (half-time felt kick, 8th hats)
    ev["kick"].append((46, "big", 1.0))
    for b in (48, 50):
        ev["kick"].append((b, "soft", hum(0.62, 0.03)))
    for b in range(47, 52):
        ev["hat_c"].append((b + 0.5, hum(0.24 + 0.02 * (b - 47))))
    ev["crash"].append((46, "big", 0.7))

    # 26-28 s: the title lands, a light pattern under the line; drums drop out on the caveat (28 s)
    ev["kick"].append((52, "big", 1.0))
    for b in range(53, 56):
        ev["kick"].append((b, "warm", hum(0.72, 0.03)))
    for b in range(52, 56):
        ev["hat_o"].append((b + 0.5, hum(0.5)))
        ev["hat_c"].append((b + 0.25, hum(0.18)))
        ev["hat_c"].append((b + 0.75, hum(0.16)))
    ev["crash"].append((52, "big", 0.8))

    # ------------------------------------------------------------- harmony
    V = PAD_VOICINGS

    def pad(b0, b1, voicing, lvl=1.0, attack=0.3, release=0.7):
        ev["pad"].append((b0, b1, [n2m(x) for x in V[voicing]], lvl, attack, release))

    pad(0, 6, "hook", 1.15, 0.8)
    pad(6, 10, "Em9", 1.0, 0.02)                    # bloom on the inside impact
    pad(10, 12, "Cmaj7#11", 1.0, 0.3)
    pad(12, 15, "Am9", 1.0, 0.05)                   # re-attacked on the split
    pad(15, 18, "Bm7", 1.0, 0.05)                   # ... and on the dive into the network
    pad(18, 24, "Em", 0.85, 0.25)
    pad(24, 28, "Cmaj7#11", 1.0, 0.02)              # the attention links light up
    pad(28, 30, "Am", 0.85, 0.25)
    pad(30, 32, "Bm", 0.9, 0.3)
    pad(32, 35, "Em", 0.95, 0.05)
    pad(35, 40, "Cmaj7", 0.95, 0.05)
    pad(40, 44, "Gadd9", 0.95, 0.05)
    pad(44, 46, "Dadd9", 0.9, 0.2)
    pad(46, 50, "Cmaj9", 1.05, 0.02)                # warm bloom on the training reveal
    pad(50, 52, "D", 0.95, 0.3)
    pad(52, 56, "Em_title", 1.05, 0.02)             # resolved: tonic, full voicing
    pad(56, 59.9, "Cmaj7#11_out", 0.8, 0.1, 0.3)

    for b0, b1, ch, bass in HARMONY:
        if b0 < 6:
            continue
        lvl = 0.45 if b0 < 12 else (0.6 if b0 < 18 else (1.0 if b0 < 56 else 0.55))
        end = b1
        if b1 == 46:
            end = 45.5                              # the fill breathes
        if b1 == 60:
            end = 59.6
        ev["sub"].append((b0, end, n2m(bass), lvl))

    # ---------------------------------------------------------------- pulse (3-9 s)
    # dark 8th-note pulse on the bass root (octave up on the off-beats), opening slowly
    s = 6.0
    while s < 18.0 - 1e-9:
        seg = segment_at(s)
        u = (s - 6.0) / 12.0
        off = abs(s - round(s)) > 1e-9
        m = n2m(seg[3]) + (24 if off else 12)
        ev["pulse"].append((s, m, hum((0.55 if off else 0.9) * (0.55 + 0.45 * u)), 1 + int(u * 2.2), off))
        s += 0.5

    # ----------------------------------------------------------------- arp
    def arp_run(b0, b1, level, bright, doubles=False):
        s = b0
        while s < b1 - 1e-9:
            seg = segment_at(s)
            k = int(round((s - max(seg[0], b0)) * 4)) % 8
            u = (s - b0) / max(b1 - b0, 1e-9)
            lv = level(u) if callable(level) else level
            br = bright(u) if callable(bright) else bright
            m = arp_pattern(seg[2])[k]
            ev["arp"].append((s, m, hum(ARP_ACCENT[k] * lv), int(round(br)), False))
            if doubles and k in (2, 6):
                ev["arp"].append((s, m + 12, hum(ARP_ACCENT[k] * lv * 0.4), int(round(br)), False))
            s += 0.25

    arp_run(12, 18, lambda u: 0.2 + 0.14 * u, lambda u: 1 + 1 * u)          # tokens: barely there
    arp_run(18, 30, lambda u: 0.55 + 0.1 * u, lambda u: 2 + 1.4 * u)
    arp_run(30, 32, lambda u: 0.68 + 0.25 * u, lambda u: 3 + 2 * u, doubles=True)
    arp_run(32, 45, 0.76, 4, doubles=True)
    arp_run(46, 52, lambda u: 0.5 + 0.12 * u, lambda u: 3 + 1 * u)
    arp_run(52, 56, 0.66, 4, doubles=True)
    arp_run(56, 58.5, lambda u: 0.42 * (1 - 0.6 * u), 3)

    # ---------------------------------------------------------------- bass
    for b in range(18, 45):
        if b in (30, 31):
            hits = [(0.5, 0.9)] if b == 30 else [(0.5, 0.8)]
        else:
            hits = [(0.25, 0.6), (0.5, 1.0), (0.75, 0.72)] if b != 44 else [(0.25, 0.6), (0.5, 1.0)]
        for off, v in hits:
            seg = segment_at(b + off)
            m = n2m(seg[3]) + 12
            if off == 0.75 and b % 2 == 1 and b >= 32:
                m += 12                                  # octave bounce in the predict section
            ev["bass"].append((b + off, m, hum(v), 4 if b >= 32 else 3, off == 0.5))
    for b in range(46, 56):                              # lighter 8th off-beats after the training hit
        m = n2m(segment_at(b + 0.5)[3]) + 12
        ev["bass"].append((b + 0.5, m, hum(0.6 if b < 52 else 0.68), 3, True))

    # chord stabs on predict, loop, training and title
    stabs = ((24, ("C3", "G3", "B3", "E4", "F#4"), 0.7, 0.35), (32, ("E3", "B3", "E4", "G4", "B4"), 0.95, 0.45),
             (40, ("G2", "D3", "B3", "D4", "G4"), 0.85, 0.45), (46, ("C3", "G3", "B3", "E4", "G4"), 1.0, 0.3),
             (52, ("E3", "B3", "E4", "G4", "B4", "F#5"), 1.0, 0.45))
    for b, notes, v, bright in stabs:
        ev["stab"].append((b, [n2m(x) for x in notes], v, bright))

    # ---------------------------------------------------------------- lead (voice gaps only)
    for b0, notes in LEAD_PHRASES:
        for i, (off, d, nm) in enumerate(notes):
            ev["lead"].append((b0 + off, d, n2m(nm), hum((1.0, 0.86, 0.94, 0.84, 0.9)[i % 5], 0.04)))

    # bells: the warm body of the title hit, under the voice band (the caveat ping lives in sfx_v01)
    for i, nm in enumerate(("E4", "B4", "G5")):
        ev["bell"].append((52.0, 2.5, n2m(nm), (0.8, 0.7, 0.6)[i]))

    # ------------------------------------------------- data blips 9.0-16.0 s (sparse, never on the kick)
    lows = {"Em": ("E5", "G5", "B5"), "Cmaj7": ("E5", "G5", "C6"), "Am": ("E5", "A5", "C6"), "Bm": ("D5", "F#5", "B5")}
    highs = {"Em": ("E8", "B7", "G8"), "Cmaj7": ("C8", "E8", "G7"), "Am": ("A7", "C8", "E8"), "Bm": ("B7", "D8", "F#8")}
    for k in range(18 * 4, 32 * 4):
        b = k / 4
        u = (b - 18) / 14
        t = b / 2
        if 20 <= b < 21.5:
            continue                                  # the vectors burst owns 10.0-10.75 s
        p = 0.14 + 0.2 * u + (0.25 if not in_vo(t) else 0.0)
        if rng.random() > p or abs(b - round(b)) < 1e-9:
            continue
        ch = chord_at(b)
        if rng.random() < 0.6:
            m = n2m(str(rng.choice(highs[ch])))
            ev["stream"].append((b, m, hum(0.32 + 0.22 * u, 0.15), 0.0, float(rng.uniform(-0.8, 0.8))))
        else:
            m = n2m(str(rng.choice(lows[ch])))
            ev["stream"].append((b, m, hum(0.4 + 0.25 * u, 0.15), 0.12, float(rng.uniform(-0.6, 0.6))))

    # 10.0 s VECTORS: a token becomes a list of numbers - a quick 32nd-note burst of blips
    vec = ("E8", "B7", "G8", "E8", "F#8", "B8", "D8", "G8", "B7", "E9", "G8", "D8")
    for i, nm in enumerate(vec):
        b = 20.0 + i * 0.125
        ev["vector"].append((b, n2m(nm), (1.0 if i == 0 else hum(0.72 - 0.035 * i, 0.1)),
                             0.25 if i % 3 == 0 else 0.05, (-0.6, 0.5, -0.2, 0.7, -0.75, 0.25, 0.6, -0.4, 0.0, 0.8,
                                                            -0.8, 0.3)[i]))

    # 16.0 s PREDICT: probability bars rise - a rising arpeggio of blips (Em9), 32nd notes
    probs = ("E6", "G6", "B6", "D7", "E7", "F#7", "G7", "B7", "D8", "E8", "F#8", "G8")
    for i, nm in enumerate(probs):
        ev["probs"].append((32.0 + i * 0.125, n2m(nm), 1.0 if i == 0 else 0.92 - 0.035 * i, 0.08 + 0.03 * i,
                            -0.6 + 1.2 * i / (len(probs) - 1)))

    # 18-22 s: the answer grows one token at a time - an 8th-note tick per token, accent at 20.0 s
    tick_notes = {"Cmaj7": ("E8", "G8", "B8", "G8"), "G": ("D8", "G8", "B8", "F#8")}
    for i in range(16):
        b = 36.0 + 0.5 * i
        ch = chord_at(b)
        m = n2m(tick_notes[ch][i % 4])
        accent = b == CUE_BEATS["loop"]
        v = 1.0 if accent else hum(0.55 + 0.012 * i + (0.08 if i % 2 == 0 else 0.0), 0.06)
        ev["token"].append((b, m, v, accent, (-0.35, 0.35)[i % 2] * (0.4 + 0.6 * (i % 4 > 1))))

    # ------------------------------------------------- typing (hook): one tick per frame on which characters
    # appear (src/v01/scenes/hook/timing.ts CHAR_AT, mirrored below); the final "?" is the send accent at 1.5 s
    prev_frame = None
    for i, (ch, fr) in enumerate(zip(QUESTION, char_frames())):
        if ch == "?":
            continue
        frame = int(np.ceil(fr - 1e-6))
        if frame == prev_frame:
            continue                                  # two characters on the same frame: one keystroke sound
        prev_frame = frame
        kind = "space" if ch == " " else ("shift" if ch.isupper() else "key")
        v = float(rng.uniform(0.45, 0.8)) if i else 0.95
        ev["typing"].append((frame / 30.0, kind, v, float(rng.uniform(-0.45, 0.45))))

    # ------------------------------------------------- sparkles
    bloom = ("E8", "B8", "G8", "F#8", "D8", "E9", "G8", "B8")          # inside: the space lights up (3.0 s)
    for i, nm in enumerate(bloom):
        ev["sparkle"].append((3.0 + 0.04 * i, n2m(nm), 0.62 - 0.05 * i, (-0.7, 0.7, -0.4, 0.4, -0.9, 0.9, -0.2, 0.2)[i],
                              0.2))
    t = 3.6
    while t < 5.9:                                   # sparse glints, high above the voice
        m = n2m(str(rng.choice(("E8", "F#8", "G8", "B8", "B7")))) if in_vo(t) else n2m(
            str(rng.choice(("E7", "G7", "B7", "F#7", "D8"))))
        if m % 12 in chord_pcs(chord_at(t * 2)):
            ev["sparkle"].append((t, m, float(rng.uniform(0.18, 0.32)), float(rng.uniform(-0.9, 0.9)),
                                  float(rng.uniform(0.06, 0.12))))
        t += float(rng.exponential(0.45)) + 0.14
    attention = ("E8", "G8", "B8", "F#8", "E9", "B8")                 # 12.0 s: the attention links light up
    for i, nm in enumerate(attention):
        ev["sparkle"].append((12.0 + 0.045 * i, n2m(nm), 0.62 - 0.07 * i, (-0.5, 0.5, -0.25, 0.25, -0.7, 0.7)[i], 0.2))
    title = ("D8", "E8", "G8", "B8", "E9", "G9")                      # 26.0 s: title glitter, above the voice
    for i, nm in enumerate(title):
        ev["sparkle"].append((26.0 + 0.03 * i, n2m(nm), 0.66 - 0.06 * i, (-0.6, 0.6, -0.3, 0.3, -0.8, 0.8)[i], 0.25))
    return ev


# ----------------------------------------------------------------------------
# report / validation
# ----------------------------------------------------------------------------
_SHARPS = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"]


def nn(m) -> str:
    """MIDI -> note name with sharps (E minor spelling)."""
    m = int(m)
    return f"{_SHARPS[m % 12]}{m // 12 - 1}"


def _names(midis):
    return " ".join(nn(m) for m in midis)


def report(ev=None) -> bool:
    ev = ev or build()
    print(f"KEY: {KEY}   scale: {' '.join(SCALE)}   tempo 120 BPM, 4/4, 15 bars of 2 s")
    print("PROGRESSION: " + " | ".join(f"{b0}-{b1}:{ch}" for b0, b1, ch, _ in HARMONY))
    print("MOTIF (voice gaps only): B5 D6 F#6 (question, 8.25 s) / E6 G6 F#6 (14.5 s) / D6 E6 G6 F#6 D6 (answer, 20.5 s)")

    melodic = {"arp": 1, "bass": 1, "pulse": 1, "lead": 2, "bell": 2, "stream": 1, "vector": 1, "probs": 1,
               "token": 1}
    for bar in range(15):
        b0, b1 = bar * 4, bar * 4 + 4
        chords = [f"{ch}@{max(s0, b0):g}" for s0, s1, ch, _ in HARMONY if s0 < b1 and s1 > b0]
        print(f"\nBAR {bar + 1:2d}  beats {b0:2d}-{b1:2d}  t={b0 / 2:4.1f}-{b1 / 2:4.1f}s  chords: {', '.join(chords)}")
        for name, mi in melodic.items():
            notes = sorted((e[0], e[mi]) for e in ev[name] if b0 <= e[0] < b1)
            if not notes:
                continue
            if name in ("arp", "stream", "bass", "pulse", "vector", "probs", "token"):
                txt = _names([m for _, m in notes][:16]) + (" ..." if len(notes) > 16 else "")
            else:
                txt = "  ".join(f"{nn(m)}@{b:g}" for b, m in notes)
            print(f"   {name:6s} {txt}")
        sp = sorted((e[0] * 2, e[1]) for e in ev["sparkle"] if b0 <= e[0] * 2 < b1)
        if sp:
            print(f"   sparkl {_names([m for _, m in sp][:16])}" + (" ..." if len(sp) > 16 else ""))
        for e in ev["pad"]:
            if b0 <= e[0] < b1:
                print(f"   pad    {e[0]:g}-{e[1]:g}: {_names(e[2])}")
        for e in ev["stab"]:
            if b0 <= e[0] < b1:
                print(f"   stab   {e[0]:g}: {_names(e[1])}")
        subs = [f"{nn(e[2])}@{e[0]:g}" for e in ev["sub"] if b0 <= e[0] < b1]
        if subs:
            print(f"   sub    {'  '.join(subs)}")

    bad_scale, bad_chord, strong_total, strong_ct = [], [], 0, 0
    for name, mi in melodic.items():
        for e in ev[name]:
            b, m = e[0], int(e[mi])
            if m % 12 not in SCALE_PCS:
                bad_scale.append((name, b, nn(m)))
            ch = chord_at(b)
            if m % 12 not in chord_pcs(ch):
                bad_chord.append((name, b, nn(m), ch))
            if name in ("lead", "bell"):
                strong_total += 1
                strong_ct += m % 12 in chord_pcs(ch, colours=False)
    for e in ev["sparkle"]:
        b, m = e[0] * 2, int(e[1])
        if m % 12 not in SCALE_PCS:
            bad_scale.append(("sparkle", b, nn(m)))
        if m % 12 not in chord_pcs(chord_at(b)):
            bad_chord.append(("sparkle", b, nn(m), chord_at(b)))
    for e in ev["pad"] + [(st[0], None, st[1]) for st in ev["stab"]]:
        ch = chord_at(e[0])
        for m in e[2]:
            if m % 12 not in SCALE_PCS:
                bad_scale.append(("pad", e[0], nn(m)))
            if m % 12 not in chord_pcs(ch):
                bad_chord.append(("pad", e[0], nn(m), ch))
    for e in ev["sub"]:
        seg = segment_at(e[0])
        if e[2] != n2m(seg[3]):
            bad_chord.append(("sub", e[0], nn(e[2]), seg[2]))
    lead_in_vo = [(round(e[0] / 2, 3), nn(e[2])) for e in ev["lead"] if in_vo(e[0] / 2)]
    print("\nVALIDATION")
    print(f"   notes outside {KEY}: {len(bad_scale)} {bad_scale[:8]}")
    print(f"   notes that are neither chord tone nor allowed colour: {len(bad_chord)} {bad_chord[:8]}")
    print(f"   lead/bell notes that are plain chord tones: {strong_ct}/{strong_total}")
    print(f"   lead notes starting inside a voice-over window: {len(lead_in_vo)} {lead_in_vo}")
    print(f"   event counts: { {k: len(v) for k, v in ev.items()} }")
    ok = not bad_scale and not bad_chord and not lead_in_vo
    print("   RESULT:", "OK" if ok else "CHECK")
    return ok


if __name__ == "__main__":
    report()
