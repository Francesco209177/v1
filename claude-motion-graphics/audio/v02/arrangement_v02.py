"""Video 02 score: key, harmony, patterns and every note / drum event, in beats.

"Un'intelligenza artificiale senza Internet?"  120 BPM, 4/4, one beat = 0.5 s
(beat b sounds at b/2 seconds = frame 15*b at 30 fps), 15 bars of 2 s.

Cue sheet (src/v02/timeline.ts)       beat   time
  unplug      (RJ45 clack + zap + tape dip)   2     1.0 s
  diveIn      (rising whoosh starts)          6     3.0 s
  inside      (soft impact + bloom, pulse)    7     3.5 s
  modelLoaded (confirm chime)                14     7.0 s
  howStart    (groove starts)                18     9.0 s
  answer      (sparkle chime)                28    14.0 s
  build       (short riser)                  32    16.0 s
  privacy     (lock click accent)            34    17.0 s
  offline     (wifi-off blip accent)         39    19.5 s
  control     (selector click accent)        44    22.0 s
  fill        (reverse swell)                47    23.5 s
  reveal      (warm resolving impact)        48    24.0 s
  title       (bright hit / shimmer)         50    25.0 s
  question    (open-ended ping)              57    28.5 s
  fadeStart                                  58    29.0 s

The narrator speaks almost all the time, so the melodic material lives in the
voice gaps (7.3-9.4 s, 14.0-17.05 s, 21.4-22.15 s, 23.2-24.35 s) and everything
else is pads, filtered arps, bass and drums kept out of the 1-4 kHz band.

Running this file prints the note names per bar and validates them against the
scale and the chord of the moment.
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

KEY = "D minor (natural / aeolian)"
SCALE = ("D", "E", "F", "G", "A", "Bb", "C")
SCALE_PCS = {n2m(s + "4") % 12 for s in SCALE}

CHORD_TONES = {"Dm": ("D", "F", "A"), "Bbmaj7": ("Bb", "D", "F", "A"), "F": ("F", "A", "C"), "C": ("C", "E", "G")}
# colour tones allowed on top of each chord (9th, 6th/7th, #11, sus4)
CHORD_COLOURS = {"Dm": ("E", "C", "G"), "Bbmaj7": ("C", "E", "G"), "F": ("G", "E", "D"), "C": ("D", "F", "A")}

CUE_BEATS = {"unplug": 2, "diveIn": 6, "inside": 7, "modelLoaded": 14, "howStart": 18, "answer": 28, "build": 32,
             "privacy": 34, "offline": 39, "control": 44, "fill": 47, "reveal": 48, "title": 50, "question": 57,
             "fadeStart": 58}
ACCENT_BEATS = (34, 39, 44)            # privacy / offline / control

# voice-over windows (seconds): the melody stays out of them
VO = ((0.1, 3.5), (3.9, 7.3), (9.4, 14.0), (17.05, 19.5), (19.65, 21.4), (22.15, 23.2), (24.35, 28.45),
      (28.55, 29.8))

# (start beat, end beat, chord, bass note)      i - VI - III - VII loop, VII -> III resolution at the reveal
HARMONY = [
    (0, 4, "Dm", "D2"),        # hook: laptop, AI chat
    (4, 7, "Bbmaj7", "Bb1"),   # cable out at beat 2, dive at beat 6
    (7, 12, "Dm", "D2"),       # inside: neural network lights up (Dm add9)
    (12, 14, "Bbmaj7", "Bb1"),  # (#11 colour: mysterious)
    (14, 16, "F", "F1"),       # model loaded: first major chord
    (16, 18, "C", "C2"),
    (18, 22, "Dm", "D2"),      # how it works: groove
    (22, 26, "Bbmaj7", "Bb1"),
    (26, 30, "F", "F1"),       # answer at beat 28
    (30, 34, "C", "C2"),       # build 32-34
    (34, 39, "Dm", "D2"),      # privacy
    (39, 44, "Bbmaj7", "Bb1"),  # offline
    (44, 48, "C", "C2"),       # control + fill: VII ...
    (48, 52, "F", "F1"),       # ... -> III: the reveal resolves to the relative major (warm)
    (52, 57, "C", "C2"),       # title / tagline: I - V ...
    (57, 60, "Bbmaj7", "Bb1"),  # ... - IV(#11): the question stays open
]

PAD_VOICINGS = {
    "hook_Dm": ("D3", "A3", "F4"),
    "hook_Bb": ("Bb2", "A3", "D4", "F4"),
    "Dm9": ("D3", "A3", "E4", "F4"),           # add9 with the E-F rub: curious
    "Bbmaj7#11": ("Bb2", "F3", "A3", "D4", "E4"),
    "Fadd9": ("F3", "A3", "C4", "G4"),
    "Cadd9": ("C3", "G3", "D4", "E4"),
    "Dm": ("D3", "A3", "D4", "F4"),
    "Bbmaj7": ("Bb2", "F3", "A3", "D4"),
    "F": ("F3", "A3", "C4", "G4"),
    "C": ("C3", "G3", "C4", "E4"),
    "Fmaj7": ("F3", "C4", "E4", "A4"),         # reveal: warm, open
    "C_out": ("C3", "G3", "E4", "G4"),
}

ARP_ROOT = {"Dm": "D4", "Bbmaj7": "Bb3", "F": "F3", "C": "C4"}
ARP_ACCENT = (1.0, 0.55, 0.75, 0.9, 0.58, 0.72, 0.92, 0.6)   # 3+3+2 feel

# Melodic motif (dotted 8ths): rising A - C - (D|E), heard only in voice gaps.
LEAD_PHRASES = [
    # (start beat, [(offset, duration, note), ...])
    (15.0, [(0.0, 0.75, "A5"), (0.75, 0.75, "C6"), (1.5, 1.5, "D6")]),                       # 7.5 s: question
    (28.5, [(0.0, 0.75, "A5"), (0.75, 0.75, "C6"), (1.5, 0.75, "E6"), (2.25, 0.75, "D6"),
            (3.0, 1.0, "C6")]),                                                               # 14.25 s: answer
    (43.0, [(0.0, 0.5, "F5"), (0.5, 0.5, "A5")]),                                            # 21.5 s: pickup
]


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
    third = 15 if chord == "Dm" else 16
    return [r, r + 7, r + 12, r + 7, r + third, r + 7, r + 14, r + 12]


def in_vo(t: float) -> bool:
    return any(a <= t < b for a, b in VO)


def build(seed: int = 2402):
    """Return every event of the piece. Velocities are lightly humanised (seeded)."""
    rng = np.random.default_rng(seed)

    def hum(v, amt=0.07):
        return float(v * (1.0 + rng.uniform(-amt, amt)))

    ev = {k: [] for k in ("kick", "snap", "hat_c", "hat_o", "shaker", "roll", "crash", "pad", "sub", "bass", "arp",
                          "lead", "bell", "stream", "tick", "typing", "sparkle", "stab")}

    # ------------------------------------------------------------------ drums
    # 3.5-9.0 s: light pulse (soft felt kick on every beat), closed hats wake up at 6.0 s
    for b in range(7, 18):
        ev["kick"].append((b, "soft", hum(0.55 + 0.03 * (b - 7), 0.03)))
    for b in range(12, 17):
        ev["hat_c"].append((b + 0.5, hum(0.26 + 0.03 * (b - 12))))
    for s, v in ((17.25, 0.3), (17.5, 0.42), (17.75, 0.5)):
        ev["hat_c"].append((s, v))

    # 9.0-16.0 s: groove (warm four-on-the-floor, off-beat open hats)
    for b in range(18, 34):
        ev["kick"].append((b, "big" if b == 18 else "warm", 1.0 if b == 18 else hum(0.9, 0.03)))
        if b < 33:
            ev["hat_o"].append((b + 0.5, hum(0.72)))
        if b >= 22 and b < 32:
            ev["hat_c"].append((b + 0.25, hum(0.34)))
            ev["hat_c"].append((b + 0.75, hum(0.3)))
        if b >= 23 and b % 2 == 1 and b < 32:
            ev["snap"].append((b, hum(0.62)))
    ev["crash"].append((18, "big", 0.62))
    # 16-17 s build: 16th -> 32nd roll, crescendo, rising in pitch
    roll = [32 + k / 4 for k in range(6)] + [33.5 + k / 8 for k in range(4)]
    for i, b in enumerate(roll):
        u = i / (len(roll) - 1)
        ev["roll"].append((b, 0.3 + 0.6 * u ** 1.3, True, 6.0 * u))

    # 17-24 s: the three benefits, slightly fuller (16th hats, shaker, snaps on 2 and 4)
    for b in range(34, 48):
        if b < 47:
            accent = b in ACCENT_BEATS
            ev["kick"].append((b, "big" if accent else "warm", 1.0 if accent else hum(0.92, 0.03)))
        else:
            ev["kick"].append((b, "big", 0.9))           # 23.5 s: the fill starts on a solid hit
        if b < 47:
            ev["hat_o"].append((b + 0.5, hum(0.8)))
            ev["hat_c"].append((b, hum(0.22)))
            ev["hat_c"].append((b + 0.25, hum(0.38)))
            ev["hat_c"].append((b + 0.75, hum(0.32)))
            for k, v in enumerate((0.45, 0.28, 0.75, 0.34)):
                ev["shaker"].append((b + k / 4, hum(v, 0.12)))
        if b % 2 == 1 and b < 47:
            ev["snap"].append((b, hum(0.8)))
    ev["crash"] += [(34, "small", 0.72), (39, "small", 0.6), (44, "small", 0.62)]
    for b, v in ((47.0, 0.55), (47.25, 0.4), (47.5, 0.5), (47.625, 0.46), (47.75, 0.62), (47.875, 0.74)):
        ev["roll"].append((b, v, True, 3.0 * (b - 47.0)))

    # 24-28.5 s: drums out after the reveal hit, a light pattern returns on the title
    ev["kick"].append((48, "big", 0.95))
    for b in range(50, 57):
        ev["kick"].append((b, "warm" if b == 50 else "soft", 0.85 if b == 50 else hum(0.72, 0.03)))
        ev["hat_c"].append((b + 0.5, hum(0.3)))
        if b >= 52:
            ev["hat_c"].append((b + 0.25, hum(0.18)))
            ev["hat_c"].append((b + 0.75, hum(0.16)))
    ev["crash"].append((50, "small", 0.5))

    # ------------------------------------------------------------- harmony
    V = PAD_VOICINGS

    def pad(b0, b1, voicing, lvl=1.0, attack=0.3, release=0.7):
        ev["pad"].append((b0, b1, [n2m(x) for x in V[voicing]], lvl, attack, release))

    pad(0, 4, "hook_Dm", 1.0, 0.45)
    pad(4, 7, "hook_Bb", 1.0, 0.35)
    pad(7, 12, "Dm9", 1.0, 0.02)                    # bloom on the impact
    pad(12, 14, "Bbmaj7#11", 1.0, 0.3)
    pad(14, 16, "Fadd9", 1.0, 0.15)
    pad(16, 18, "Cadd9", 1.0, 0.3)
    for b0, b1, vc in ((18, 22, "Dm"), (22, 26, "Bbmaj7"), (26, 30, "F"), (30, 34, "C")):
        pad(b0, b1, vc, 0.85, 0.25)
    for b0, b1, vc in ((34, 39, "Dm"), (39, 44, "Bbmaj7"), (44, 48, "C")):
        pad(b0, b1, vc, 0.95, 0.05)                 # re-attacked on each benefit accent
    pad(48, 52, "Fmaj7", 1.0, 0.02)                 # warm bloom on the reveal
    pad(52, 57, "C_out", 0.9, 0.3)
    pad(57, 59.9, "Bbmaj7#11", 0.75, 0.12, 0.3)

    for b0, b1, ch, bass in HARMONY:
        if b0 < 7:
            continue
        lvl = 0.5 if b0 < 18 else (1.0 if b0 < 48 else (0.85 if b0 < 57 else 0.5))
        end = b1
        if b1 == 48:
            end = 47.5                              # the fill breathes
        if b1 == 60:
            end = 59.6
        ev["sub"].append((b0, end, n2m(bass), lvl))

    # ----------------------------------------------------------------- arp
    def arp_run(b0, b1, level, bright, octave=0, doubles=False):
        s = b0
        while s < b1 - 1e-9:
            seg = segment_at(s)
            k = int(round((s - max(seg[0], b0)) * 4)) % 8
            u = (s - b0) / max(b1 - b0, 1e-9)
            lv = level(u) if callable(level) else level
            br = bright(u) if callable(bright) else bright
            m = arp_pattern(seg[2])[k] + octave
            ev["arp"].append((s, m, hum(ARP_ACCENT[k] * lv), int(round(br)), False))
            if doubles and k in (2, 6):
                ev["arp"].append((s, m + 12, hum(ARP_ACCENT[k] * lv * 0.4), int(round(br)), False))
            s += 0.25

    arp_run(10, 14, lambda u: 0.22 + 0.12 * u, lambda u: 1 + 1 * u)          # mysterious, barely there
    arp_run(14, 18, lambda u: 0.36 + 0.14 * u, lambda u: 2 + 1 * u)
    arp_run(18, 32, lambda u: 0.62 + 0.08 * u, lambda u: 3 + 1 * u)
    arp_run(32, 34, lambda u: 0.72 + 0.25 * u, lambda u: 4 + 2 * u, doubles=True)
    arp_run(34, 47, 0.8, 4, doubles=True)
    arp_run(48, 57, lambda u: 0.6 + 0.2 * u, lambda u: 4 + 1.4 * u, doubles=True)   # pad + arp after the reveal

    # ---------------------------------------------------------------- bass
    for b in range(18, 47):
        if b in (32, 33):
            hits = [(0.5, 0.9)] if b == 32 else [(0.5, 0.8)]
        else:
            hits = [(0.25, 0.62), (0.5, 1.0), (0.75, 0.74)]
        for off, v in hits:
            seg = segment_at(b + off)
            m = n2m(seg[3]) + 12
            if off == 0.75 and b % 2 == 1 and b >= 34:
                m += 12                                  # octave bounce in the fuller section
            ev["bass"].append((b + off, m, hum(v), 4 if b >= 34 else 3, off == 0.5))
    for b in range(50, 57):                              # light 8th off-beats under the tagline
        m = n2m(segment_at(b + 0.5)[3]) + 12
        ev["bass"].append((b + 0.5, m, hum(0.62), 3, True))

    # warm chord stabs: the accents of the three benefits, the reveal and the title
    stabs = ((34, ("D3", "A3", "D4", "F4", "A4"), 1.0, 0.45), (39, ("Bb2", "F3", "A3", "D4", "F4"), 0.9, 0.45),
             (44, ("C3", "G3", "C4", "E4", "G4"), 0.95, 0.45), (48, ("F2", "C3", "A3", "E4", "A4"), 1.0, 0.3),
             (50, ("F3", "C4", "F4", "A4", "C5"), 0.8, 0.6))
    for b, notes, v, bright in stabs:
        ev["stab"].append((b, [n2m(x) for x in notes], v, bright))

    # ---------------------------------------------------------------- lead (voice gaps only)
    for b0, notes in LEAD_PHRASES:
        for i, (off, d, nm) in enumerate(notes):
            ev["lead"].append((b0 + off, d, n2m(nm), hum((1.0, 0.86, 0.94, 0.84, 0.9)[i % 5], 0.04)))

    # bells: title chord (25.0 s) and the final question ping (28.5 s)
    for i, nm in enumerate(("F4", "C5", "A5")):        # warm body of the title hit, under the voice band
        ev["bell"].append((50 + 0.0, 2.5, n2m(nm), (0.8, 0.7, 0.6)[i]))
    ev["bell"].append((57, 3.0, n2m("E6"), 1.25))         # E over Bbmaj7 = #11: unresolved, curious

    # ------------------------------------------------- data blips 9.0-16.0 s
    lows = {"Dm": ("D5", "F5", "A5"), "Bbmaj7": ("D5", "F5", "Bb5"), "F": ("F5", "A5", "C6"), "C": ("E5", "G5", "C6")}
    highs = {"Dm": ("D8", "A7", "F8"), "Bbmaj7": ("D8", "F8", "A7"), "F": ("C8", "F8", "A7"), "C": ("C8", "E8", "G7")}
    for k in range(18 * 4, 32 * 4):
        b = k / 4
        u = (b - 18) / 14
        t = b / 2
        p = 0.18 + 0.22 * u + (0.25 if not in_vo(t) else 0.0)
        if rng.random() > p or abs(b - round(b)) < 1e-9:
            continue                                  # never on the kick
        ch = chord_at(b)
        if rng.random() < 0.55:
            m = n2m(str(rng.choice(highs[ch])))
            ev["stream"].append((b, m, hum(0.35 + 0.25 * u, 0.15), 0.0, float(rng.uniform(-0.8, 0.8))))
        else:
            m = n2m(str(rng.choice(lows[ch])))
            ev["stream"].append((b, m, hum(0.45 + 0.3 * u, 0.15), 0.12, float(rng.uniform(-0.6, 0.6))))

    # ------------------------------------------------- clock ticks + typing (hook)
    b = 0.5
    while b < 7.0 - 1e-9:
        if not (2.0 <= b < 3.0):                     # the clock stops when the cable is pulled
            t = b / 2
            fade = 1.0 if t < 3.0 else max(0.0, 1.0 - (t - 3.0) / 0.5) ** 1.5 + 0.0
            if t < 3.5:
                ev["tick"].append((t, "tick" if int(round(b * 2)) % 2 == 0 else "tock",
                                   (0.8 if t < 1.0 else 0.7) * fade + 0.0, 0.18 if int(round(b * 2)) % 2 else -0.18))
        b += 0.5
    for t0, t1, dens in ((0.22, 0.92, 9.0), (1.62, 2.85, 5.0)):
        t = t0
        while t < t1:
            ev["typing"].append((t, float(rng.uniform(0.45, 0.9)), float(rng.uniform(-0.5, 0.5))))
            t += float(rng.exponential(1.0 / dens)) + 0.045

    # ------------------------------------------------- sparkles
    neural = ("D7", "A7", "F7", "E7", "A6", "D8", "F7", "A7")          # the network lights up (3.5 s, in a gap)
    for i, nm in enumerate(neural):
        ev["sparkle"].append((3.5 + 0.038 * i, n2m(nm), 0.75 - 0.06 * i, (-0.7, 0.7, -0.4, 0.4, -0.9, 0.9, -0.2, 0.2)[i],
                              0.2))
    t = 3.95
    while t < 8.9:                                   # sparse glints, high above the voice
        m = n2m(str(rng.choice(("D8", "E8", "F8", "A8", "A7")))) if in_vo(t) else n2m(
            str(rng.choice(("D7", "F7", "A7", "C8", "E7"))))
        ch = chord_at(t * 2)
        allowed = {n2m(x + "4") % 12 for x in CHORD_TONES[ch] + CHORD_COLOURS[ch]}
        if m % 12 in allowed:
            ev["sparkle"].append((t, m, float(rng.uniform(0.2, 0.38)), float(rng.uniform(-0.9, 0.9)),
                                  float(rng.uniform(0.06, 0.12))))
        t += float(rng.exponential(0.42)) + 0.12
    answer = ("F6", "A6", "C7", "E7", "G7", "C8")                     # answer generated (14.0 s)
    for i, nm in enumerate(answer):
        ev["sparkle"].append((14.0 + 0.042 * i, n2m(nm), 0.85 - 0.08 * i, (-0.5, 0.5, -0.25, 0.25, -0.7, 0.7)[i], 0.22))
    title = ("F7", "A7", "C8", "F8", "A8")                            # title glitter (25.0 s), above the voice
    for i, nm in enumerate(title):
        ev["sparkle"].append((25.0 + 0.03 * i, n2m(nm), 0.6 - 0.07 * i, (-0.6, 0.6, -0.3, 0.3, 0.0)[i], 0.25))
    return ev


# ----------------------------------------------------------------------------
# report / validation
# ----------------------------------------------------------------------------
_FLATS = ["C", "Db", "D", "Eb", "E", "F", "Gb", "G", "Ab", "A", "Bb", "B"]


def nn(m) -> str:
    """MIDI -> note name with flats (D minor spelling)."""
    m = int(m)
    return f"{_FLATS[m % 12]}{m // 12 - 1}"


def _names(midis):
    return " ".join(nn(m) for m in midis)


def report(ev=None) -> bool:
    ev = ev or build()
    print(f"KEY: {KEY}   scale: {' '.join(SCALE)}   tempo 120 BPM, 4/4, 15 bars of 2 s")
    print("PROGRESSION: " + " | ".join(f"{b0}-{b1}:{ch}" for b0, b1, ch, _ in HARMONY))
    print("MOTIF (voice gaps only): A5 C6 D6 (question, 7.5 s) / A5 C6 E6 D6 C6 (answer, 14.25 s)")

    melodic = {"arp": 1, "bass": 1, "lead": 2, "bell": 2, "stream": 1}
    for bar in range(15):
        b0, b1 = bar * 4, bar * 4 + 4
        chords = [f"{ch}@{max(s0, b0):g}" for s0, s1, ch, _ in HARMONY if s0 < b1 and s1 > b0]
        print(f"\nBAR {bar + 1:2d}  beats {b0:2d}-{b1:2d}  t={b0 / 2:4.1f}-{b1 / 2:4.1f}s  chords: {', '.join(chords)}")
        for name, mi in melodic.items():
            notes = sorted((e[0], e[mi]) for e in ev[name] if b0 <= e[0] < b1)
            if not notes:
                continue
            if name in ("arp", "stream", "bass"):
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
    checks = dict(melodic)
    for name, mi in checks.items():
        for e in ev[name]:
            b, m = e[0], int(e[mi])
            if m % 12 not in SCALE_PCS:
                bad_scale.append((name, b, nn(m)))
            ch = chord_at(b)
            tones = {n2m(x + "4") % 12 for x in CHORD_TONES[ch]}
            cols = {n2m(x + "4") % 12 for x in CHORD_COLOURS[ch]}
            if m % 12 not in tones | cols:
                bad_chord.append((name, b, nn(m), ch))
            if name in ("lead", "bell"):
                strong_total += 1
                strong_ct += m % 12 in tones
    for e in ev["sparkle"]:
        b, m = e[0] * 2, int(e[1])
        if m % 12 not in SCALE_PCS:
            bad_scale.append(("sparkle", b, nn(m)))
        ch = chord_at(b)
        if m % 12 not in {n2m(x + "4") % 12 for x in CHORD_TONES[ch] + CHORD_COLOURS[ch]}:
            bad_chord.append(("sparkle", b, nn(m), ch))
    for e in ev["pad"] + [(st[0], None, st[1]) for st in ev["stab"]]:
        ch = chord_at(e[0])
        allowed = {n2m(x + "4") % 12 for x in CHORD_TONES[ch] + CHORD_COLOURS[ch]}
        for m in e[2]:
            if m % 12 not in SCALE_PCS:
                bad_scale.append(("pad", e[0], nn(m)))
            if m % 12 not in allowed:
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
