"""The score: key, harmony, patterns and every note / drum event, in beats.

120 BPM, one beat = 0.5 s, so beat b sounds at b/2 seconds (= frame 15*b at 30 fps).
Video cues (src/timeline.ts)          beat   time
  sparkFormed   (impact 1)              5     2.5 s
  ideaStart     (whoosh, light groove)  8     4.0 s
  typingStart..typingEnd                9-13  4.5-6.5 s
  promptToCode  ("Enter")              14     7.0 s
  creationStart (impact 3, full groove) 18    9.0 s
  buildStart                           28    14.0 s
  drop + shots  32, 35, 38, 41, 44           16.0, 17.5, 19.0, 20.5, 22.0 s
  outroStart    (impact 4, breakdown)  48    24.0 s
  lockup        (final hit, logo)      52    26.0 s
  fadeStart                            58    29.0 s

Running this file prints the note names per bar and validates them against the
scale and the chord of the moment.
"""
from __future__ import annotations

import numpy as np

from dsp import m2n, n2m

KEY = "A minor (natural / aeolian)"
SCALE = ("A", "B", "C", "D", "E", "F", "G")
SCALE_PCS = {n2m(s + "4") % 12 for s in SCALE}

CHORD_TONES = {"Am": ("A", "C", "E"), "F": ("F", "A", "C"), "C": ("C", "E", "G"), "G": ("G", "B", "D")}
# colour tones that are allowed to sit on top of each chord (9th, 6th/7th, 4th as passing note)
CHORD_COLOURS = {"Am": ("B", "G", "D"), "F": ("G", "E", "D"), "C": ("D", "A", "B"), "G": ("A", "E", "C")}

CUES_S = {"sparkFormed": 2.5, "ideaStart": 4.0, "promptToCode": 7.0, "creationStart": 9.0, "drop/shot1": 16.0,
          "shot2": 17.5, "shot3": 19.0, "shot4": 20.5, "shot5": 22.0, "outroStart": 24.0, "lockup": 26.0}
SHOT_BEATS = (32, 35, 38, 41, 44)
# the same cues in beats (frame / 15); synth.py places every sound-design event from these
CUE_BEATS = {"sparkFormed": 5, "ideaStart": 8, "typingStart": 9, "typingEnd": 13, "promptToCode": 14,
             "creationStart": 18, "buildStart": 28, "drop": 32, "outroStart": 48, "lockup": 52, "fadeStart": 58}

# (start beat, end beat, chord, bass note)   i - VI - III - VII in A minor
HARMONY = [
    (0, 8, "Am", "A1"),      # intro drone, impact 1 on beat 5
    (8, 12, "Am", "A1"),     # scene 2: light groove
    (12, 16, "F", "F1"),
    (16, 18, "G", "G1"),
    (18, 22, "Am", "A1"),    # scene 3: full groove
    (22, 26, "F", "F1"),
    (26, 28, "C", "C2"),
    (28, 32, "G", "G1"),     # build
    (32, 35, "Am", "A1"),    # drop: one chord per shot (3+3+3+3+4 beats)
    (35, 38, "F", "F1"),
    (38, 41, "C", "C2"),
    (41, 44, "G", "G1"),
    (44, 46, "Am", "A1"),
    (46, 48, "Am", "E1"),    # Am/E: bass starts the E-F-G-A walk-up into the final hit
    (48, 50, "F", "F1"),     # breakdown
    (50, 52, "G", "G1"),
    (52, 60, "Am", "A1"),    # final hit, tail
]

ARP_ROOT = {"Am": "A3", "F": "F3", "C": "C4", "G": "G3"}
ARP_ACCENT = (1.0, 0.52, 0.72, 0.9, 0.55, 0.7, 0.92, 0.55)  # 3+3+2 feel

# The signature four-note motif (audio logo): root - fifth - ninth - octave, in dotted 8ths.
MOTIF = ("A4", "E5", "B5", "A5")

# Drop lead: the motif once per shot, adapted to the chord. Third notes climb B-C-D-E.
LEAD_PHRASES = [
    (32, ("A4", "E5", "B5", "A5")),             # Am
    (35, ("A4", "F5", "C6", "A5")),             # F
    (38, ("C5", "G5", "D6", "C6")),             # C
    (41, ("D5", "G5", "E6", "D6")),             # G
    (44, ("E5", "A5", "E6", "C6", "B5", "A5")),  # Am, 4 beats: motif + falling tail to the tonic
]

PAD_VOICINGS = {  # warm pad, scene 2 / 3 (smooth voice leading, top line B-A-G-G)
    "Am": ("A3", "C4", "E4", "B4"),
    "F": ("A3", "C4", "F4", "A4"),
    "C": ("G3", "C4", "E4", "G4"),
    "G": ("G3", "B3", "D4", "G4"),
}
DROP_VOICINGS = {  # supersaw chords under the lead (top line E-F-E-D-E)
    "Am": ("A3", "E4", "B4", "C5", "E5"),
    "F": ("A3", "F4", "A4", "C5", "F5"),
    "C": ("G3", "E4", "G4", "D5", "E5"),
    "G": ("G3", "D4", "G4", "B4", "D5"),
}


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
    third = 15 if chord == "Am" else 16
    return [r, r + 7, r + 14, r + 7, r + 12, r + 7, r + third, r + 7]


def build(seed: int = 2026):
    """Return every event of the piece. Velocities are lightly humanised (seeded)."""
    rng = np.random.default_rng(seed)

    def hum(v, amt=0.07):
        return float(v * (1.0 + rng.uniform(-amt, amt)))

    ev = {k: [] for k in ("kick", "clap", "hat_c", "hat_o", "shaker", "snare", "crash", "pad", "chords", "stab",
                          "arp", "bass", "sub", "lead", "bell", "logo", "echo", "stream", "typing", "sparkle",
                          "drone")}

    # ------------------------------------------------------------------ drums
    for b in range(8, 18):                                   # scene 2: soft pulse
        ev["kick"].append((b, "soft", hum(0.95 if b % 2 == 0 else 0.8, 0.04)))
    for b in range(14, 17):                                  # hats wake up after "Enter"
        ev["hat_c"].append((b + 0.5, hum(0.42)))
    for s in (16.25, 16.5, 16.75):
        ev["hat_c"].append((s, hum(0.36 if s != 16.5 else 0.5)))
    for b, v in ((17.0, 0.42), (17.25, 0.48), (17.5, 0.6), (17.625, 0.52), (17.75, 0.74), (17.875, 0.88)):
        ev["snare"].append((b, v, True))                     # short fill into 9.0 s

    for b in range(18, 28):                                  # scene 3: full groove
        ev["kick"].append((b, "big" if b == 18 else "full", 1.0))
        if b % 2 == 1:
            ev["clap"].append((b, hum(0.95)))
        ev["hat_o"].append((b + 0.5, hum(0.85)))
        if b >= 20:
            ev["hat_c"].append((b + 0.25, hum(0.4)))
            ev["hat_c"].append((b + 0.75, hum(0.34)))
        if b >= 22:                                          # +shaker after 2 bars
            for k, v in enumerate((0.5, 0.3, 0.8, 0.36)):
                ev["shaker"].append((b + k / 4, hum(v, 0.12)))
        if b >= 26:                                          # +8th hats in the pre-build bar
            ev["hat_c"].append((b, hum(0.5)))
    ev["crash"].append((18, "big", 0.9))
    ev["snare"].append((27.5, 0.4, True))
    ev["snare"].append((27.75, 0.55, True))

    for b in range(28, 32):                                  # build
        ev["kick"].append((b, "full", 1.0))
        if b < 30:
            ev["hat_o"].append((b + 0.5, hum(0.8)))
        for k, v in enumerate((0.5, 0.3, 0.8, 0.36)):
            if b + k / 4 < 31.5:
                ev["shaker"].append((b + k / 4, hum(v, 0.12)))
    roll = [28, 28.5, 29, 29.5] + [30 + k / 4 for k in range(4)] + [31 + k / 8 for k in range(4)]
    for i, b in enumerate(roll):                             # 8ths -> 16ths -> 32nds, crescendo
        ev["snare"].append((b, 0.34 + 0.66 * (i / (len(roll) - 1)) ** 1.3, b >= 30))

    for b in range(32, 48):                                  # drop
        shot = b in SHOT_BEATS
        ev["kick"].append((b, "big" if shot else "full", 1.0))
        if b % 2 == 1:
            ev["clap"].append((b, hum(1.0)))
        ev["hat_o"].append((b + 0.5, hum(0.9)))
        ev["hat_c"].append((b, hum(0.3)))
        ev["hat_c"].append((b + 0.25, hum(0.42)))
        ev["hat_c"].append((b + 0.75, hum(0.36)))
        for k, v in enumerate((0.5, 0.32, 0.85, 0.4)):
            ev["shaker"].append((b + k / 4, hum(v, 0.12)))
    ev["crash"] += [(32, "big", 1.0), (35, "small", 0.72), (38, "small", 0.72), (41, "small", 0.76), (44, "big", 0.8)]
    for b, v in ((47.25, 0.5), (47.5, 0.62), (47.625, 0.56), (47.75, 0.78), (47.875, 0.92)):
        ev["snare"].append((b, v, True))                     # fill into 24.0 s
    ev["crash"].append((48, "big", 0.62))
    ev["kick"].append((48, "big", 1.0))                      # impact 4 (24.0 s)
    ev["kick"].append((52, "big", 0.9))                      # final hit (26.0 s)

    # ------------------------------------------------------------- harmony
    for b0, b1, ch, bass in HARMONY:
        if 8 <= b0 < 32:
            end = 31.5 if b1 == 32 else b1
            ev["pad"].append((b0, end, [n2m(x) for x in PAD_VOICINGS[ch]], 1.0, 0.35 if b0 > 8 else 0.9))
            ev["sub"].append((b0, min(end, 17.9) if b0 == 16 else end, n2m(bass), 0.55 if b0 < 18 else 1.0))
        elif 32 <= b0 < 48:
            ev["sub"].append((b0, b1, n2m(bass), 1.0))
    for b0, b1, ch in ((32, 35, "Am"), (35, 38, "F"), (38, 41, "C"), (41, 44, "G"), (44, 48, "Am")):
        v = [n2m(x) for x in DROP_VOICINGS[ch]]
        ev["chords"].append((b0, b1, v, 1.0))
        ev["stab"].append((b0, v, 1.0))
    # intro drone: open fifth (no third yet, dark and ambiguous) fading in from silence
    ev["drone"].append((0, 10, [n2m(x) for x in ("A1", "A2", "E3", "A3")], 1.0))
    # impact chord (2.5 s, the third arrives: A minor add9), breakdown and final chord
    ev["pad"].append((5, 8.2, [n2m(x) for x in ("A2", "E3", "A3", "C4", "E4", "B4")], 1.0, 0.012))
    ev["pad"].append((48, 50, [n2m(x) for x in ("F3", "C4", "E4", "A4")], 1.0, 0.25))
    ev["pad"].append((50, 51.95, [n2m(x) for x in ("G3", "D4", "G4", "B4")], 1.0, 0.12))
    ev["pad"].append((52, 59.7, [n2m(x) for x in ("A2", "A3", "E4", "B4", "C5", "E5")], 1.0, 0.008))

    # ----------------------------------------------------------------- arp
    def arp_run(b0, b1, level, bright, octave=0, restart=True, doubles=False):
        seg_start = None
        cur = None
        s = b0
        while s < b1 - 1e-9:
            seg = segment_at(s)
            if seg[2] != cur or (restart and seg[0] != seg_start):
                cur, seg_start = seg[2], seg[0]
            k = int(round((s - max(seg_start, b0)) * 4)) % 8
            u = (s - b0) / max(b1 - b0, 1e-9)
            lv = level(u) if callable(level) else level
            br = bright(u) if callable(bright) else bright
            oc = octave(s) if callable(octave) else octave
            m = arp_pattern(cur)[k] + oc
            ev["arp"].append((s, m, hum(ARP_ACCENT[k] * lv), int(round(br)), False))
            if doubles and k in (2, 6):
                ev["arp"].append((s, m + 12, hum(ARP_ACCENT[k] * lv * 0.5), int(round(br)), False))
            s += 0.25

    arp_run(8, 14, lambda u: 0.34 + 0.16 * u, lambda u: 2 + 2 * u)           # introduced quietly
    arp_run(14, 17.75, lambda u: 0.5 + 0.2 * u, lambda u: 4 + 2.5 * u)
    arp_run(18, 26, 1.0, 8)                                                   # fully open
    arp_run(26, 28, 1.0, 8, doubles=True)
    arp_run(28, 31.5, lambda u: 1.0 + 0.1 * u, lambda u: 8 + 2 * u,
            octave=lambda s: 0 if s < 30 else (12 if s < 31 else 24), doubles=True)
    arp_run(32, 48, 0.62, 7, octave=12)                                       # sparkle layer under the lead
    # breakdown: upper-structure arpeggio (Fmaj9 -> Gadd9), rising in level and brightness
    bd = {"F": ("A4", "C5", "E5", "C5", "G5", "C5", "E5", "C5"), "G": ("B4", "D5", "G5", "D5", "A5", "D5", "G5", "D5")}
    s = 48.0
    while s < 51.75 - 1e-9:
        u = (s - 48.0) / 4.0
        k = int(round((s - (48 if s < 50 else 50)) * 4)) % 8
        ev["arp"].append((s, n2m(bd[chord_at(s)][k]), hum(ARP_ACCENT[k] * (0.4 + 0.5 * u)), int(round(3 + 5 * u)), False))
        s += 0.25

    # ---------------------------------------------------------------- bass
    for b in range(18, 48):
        if 28 <= b < 32 and b + 0.75 >= 31.5:
            hits = [(0.25, 0.72)]
        else:
            hits = [(0.25, 0.72), (0.5, 1.0), (0.75, 0.82)]
        drop = b >= 32
        for off, v in hits:
            seg = segment_at(b + off)
            m = n2m(seg[3]) + 12
            if off == 0.75 and b % 2 == 1:
                m += 12                                      # octave bounce before beats 1 and 3
            ev["bass"].append((b + off, m, hum(v), 6 if drop else 4, off == 0.5))

    # ---------------------------------------------------------------- lead
    for b0, notes in LEAD_PHRASES:
        vel = (1.0, 0.88, 0.96, 0.9, 0.84, 0.9)
        for i, nm in enumerate(notes):
            if i < 4:
                ev["lead"].append((b0 + 0.75 * i, 0.75, n2m(nm), hum(vel[i], 0.04)))
            else:                                            # two 8th notes closing the last phrase
                ev["lead"].append((b0 + 3.0 + 0.5 * (i - 4), 0.5, n2m(nm), hum(vel[i], 0.04)))

    # -------------------------------------------- bells: foreshadow, counter melody
    for i, nm in enumerate(MOTIF[:3]):                       # intro: first three motif notes (question)
        ev["bell"].append((5 + 0.75 * i, 2.0, n2m(nm) + 12, (0.8, 0.62, 0.55)[i]))
    for b, d, nm in ((22.0, 1.5, "E5"), (23.5, 0.5, "G5"), (24.0, 1.5, "A5"), (25.5, 0.5, "G5"),
                     (26.0, 1.0, "E5"), (27.0, 0.5, "D5"), (27.5, 0.5, "E5"), (28.0, 2.0, "D5")):
        ev["bell"].append((b, d, n2m(nm), hum(0.9 if d > 0.5 else 0.7)))

    # ---------------------------------------- final hit: the full motif (answer) + echoes
    for i, nm in enumerate(MOTIF):
        ev["logo"].append((52 + 0.75 * i, 3.0, n2m(nm), (1.0, 0.86, 0.9, 0.96)[i]))
    for i, nm in enumerate(MOTIF):
        ev["echo"].append((55 + 0.75 * i, n2m(nm) + 12, (0.5, 0.42, 0.36, 0.3)[i], 5, True))

    # ------------------------------------------------- data stream (7.0-9.0 s)
    pool_f = [n2m(x) for x in ("F4", "G4", "A4", "C5", "F5", "G5", "A5", "C6", "F6")]
    pool_g = [n2m(x) for x in ("G4", "A4", "B4", "D5", "G5", "A5", "B5", "D6", "G6", "A6", "B6", "D7")]
    zig = (0, 2, 1, 3)
    for k in range(2, 32):
        b = 14 + k / 8
        u = k / 31
        if k < 16:
            m = pool_f[k // 4 + zig[k % 4]]
        else:
            m = pool_g[min(len(pool_g) - 1, (k - 16) // 4 + 3 + zig[k % 4] + (2 if k >= 28 else 0))]
        ev["stream"].append((b, m, hum(0.3 + 0.7 * u ** 1.2, 0.1), 0.08 + 0.92 * u ** 1.4,
                             (0.3 + 0.5 * u) * (1 if k % 2 else -1)))

    # ------------------------------------------------- typing ticks (4.5-6.5 s)
    slot = 0
    first = True
    while slot < 32:
        word = int(rng.integers(3, 7))
        for _ in range(word):
            if slot >= 32:
                break
            if first or rng.random() < 0.86:
                t = 4.5 + slot * 0.0625 + (0.0 if first else rng.uniform(-0.006, 0.006))
                ev["typing"].append((t, "key", float(rng.uniform(0.5, 1.0)), float(rng.uniform(-0.45, 0.45))))
                first = False
            slot += 1
        if slot < 32:
            t = 4.5 + slot * 0.0625 + rng.uniform(-0.005, 0.005)
            ev["typing"].append((t, "space", float(rng.uniform(0.8, 1.0)), float(rng.uniform(-0.15, 0.15))))
            slot += 1
        if rng.random() < 0.45:
            slot += 1

    # ------------------------------------- intro sparkles: denser and narrower towards 2.5 s
    penta = [n2m(x) for x in ("A5", "C6", "D6", "E6", "G6", "A6", "C7", "D7", "E7", "G7", "A7")]
    t = 0.22
    while t < 2.44:
        u = t / 2.5
        m = int(rng.choice(penta))
        if u > 0.8:                                          # converge on the tonic chord
            m = int(rng.choice([n2m(x) for x in ("A6", "E6", "B6", "E7", "A7")]))
        ev["sparkle"].append((t, m, float((0.3 + 0.55 * u) * rng.uniform(0.75, 1.1)),
                              float(rng.choice([-1, 1]) * rng.uniform(0.25, 1.0) * (1.0 - 0.75 * u)),
                              float(rng.uniform(0.07, 0.16))))
        rate = 1.6 + 15.0 * u ** 2
        t += float(rng.exponential(1.0 / rate)) * 0.8 + 0.035
    for i, nm in enumerate(("A6", "E7", "B6", "E6", "A7", "C7")):   # bloom on impact 1
        ev["sparkle"].append((2.5 + 0.045 * i, n2m(nm), 0.7 - 0.07 * i, (-0.6, 0.6, -0.3, 0.3, -0.8, 0.8)[i], 0.22))
    return ev


# ----------------------------------------------------------------------------
# report / validation
# ----------------------------------------------------------------------------
def _names(midis):
    return " ".join(m2n(int(m)) for m in midis)


def report(ev=None) -> bool:
    ev = ev or build()
    ok = True
    print(f"KEY: {KEY}   scale: {' '.join(SCALE)}   tempo 120 BPM, 4/4, 15 bars of 2 s")
    print("PROGRESSION: " + " | ".join(f"{b0}-{b1}:{ch}/{bs[:-1]}" if not bs.startswith(ch[0]) else f"{b0}-{b1}:{ch}"
                                       for b0, b1, ch, bs in HARMONY))
    print(f"MOTIF (audio logo): {' '.join(MOTIF)}  in dotted 8ths")

    melodic = {"arp": 1, "bass": 1, "lead": 2, "bell": 2, "logo": 2, "echo": 1, "stream": 1}
    for bar in range(15):
        b0, b1 = bar * 4, bar * 4 + 4
        chords = []
        for s0, s1, ch, bs in HARMONY:
            if s0 < b1 and s1 > b0:
                chords.append(f"{ch}/{bs[:-1]}@{max(s0, b0)}" if not bs.startswith(ch[0]) else f"{ch}@{max(s0, b0)}")
        print(f"\nBAR {bar + 1:2d}  beats {b0:2d}-{b1:2d}  t={b0 / 2:4.1f}-{b1 / 2:4.1f}s  chords: {', '.join(chords)}")
        for name, mi in melodic.items():
            notes = sorted((e[0], e[mi]) for e in ev[name] if b0 <= e[0] < b1)
            if not notes:
                continue
            if name in ("arp", "stream", "bass"):
                txt = _names([m for _, m in notes][:16]) + (" ..." if len(notes) > 16 else "")
            else:
                txt = "  ".join(f"{m2n(m)}@{b:g}" for b, m in notes)
            print(f"   {name:6s} {txt}")
        for name in ("pad", "chords"):
            for e in ev[name]:
                if b0 <= e[0] < b1:
                    print(f"   {name:6s} {e[0]:g}-{e[1]:g}: {_names(e[2])}")
        subs = [f"{m2n(e[2])}@{e[0]:g}" for e in ev["sub"] if b0 <= e[0] < b1]
        if subs:
            print(f"   sub    {'  '.join(subs)}")

    # validation: every pitch in the scale; every pitch a chord tone or an allowed colour of its chord
    bad_scale, bad_chord, strong_total, strong_ct = [], [], 0, 0
    for name, mi in melodic.items():
        for e in ev[name]:
            b, m = e[0], int(e[mi])
            if m % 12 not in SCALE_PCS:
                bad_scale.append((name, b, m2n(m)))
            ch = chord_at(b)
            tones = {n2m(x + "4") % 12 for x in CHORD_TONES[ch]}
            cols = {n2m(x + "4") % 12 for x in CHORD_COLOURS[ch]}
            if m % 12 not in tones | cols:
                bad_chord.append((name, b, m2n(m), ch))
            if name in ("lead", "logo", "bell"):
                strong_total += 1
                strong_ct += m % 12 in tones
    for name in ("drone", "pad", "chords"):
        for e in ev[name]:
            ch = chord_at(e[0])
            allowed = {n2m(x + "4") % 12 for x in CHORD_TONES[ch] + CHORD_COLOURS[ch]}
            for m in e[2]:
                if m % 12 not in SCALE_PCS:
                    bad_scale.append((name, e[0], m2n(m)))
                if m % 12 not in allowed:
                    bad_chord.append((name, e[0], m2n(m), ch))
    for e in ev["sub"]:
        seg = segment_at(e[0])
        if e[2] != n2m(seg[3]):
            bad_chord.append(("sub", e[0], m2n(e[2]), seg[2]))
    for e in ev["sparkle"]:
        if e[1] % 12 not in SCALE_PCS:
            bad_scale.append(("sparkle", e[0], m2n(e[1])))
    print("\nVALIDATION")
    print(f"   notes outside {KEY}: {len(bad_scale)} {bad_scale[:8]}")
    print(f"   notes that are neither chord tone nor allowed colour: {len(bad_chord)} {bad_chord[:8]}")
    print(f"   lead/bell/logo notes that are plain chord tones: {strong_ct}/{strong_total}")
    counts = {k: len(v) for k, v in ev.items()}
    print(f"   event counts: {counts}")
    ok = not bad_scale and not bad_chord
    print("   RESULT:", "OK" if ok else "CHECK")
    return ok


if __name__ == "__main__":
    report()
