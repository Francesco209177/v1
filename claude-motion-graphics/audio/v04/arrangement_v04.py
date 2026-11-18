"""Video 04 score: keys, harmony, patterns and every note / drum event, in beats.

"Phishing: come possono rubarti le credenziali?"  120 BPM, 4/4, one beat = 0.5 s
(beat b sounds at b/2 seconds = frame 15*b at 30 fps), 15 bars of 2 s.

Cue sheet (src/v04/timeline.ts V4_CUES)                    beat    time
  notification  (crisp ping + low drone starts)              0.4    0.2 s
  tension       (accelerating clock ticks + rising pulse)    0.4-4  0.2-2.0 s
  tap           (tap + distorted sub + stutter + alarm)      4      2.0 s
  message       (dark swoosh + impact, 3D window)            7      3.5 s
  reveal        (detuned sting + glitch)                    12      6.0 s
  how / step1   (tense groove starts)                       18      9.0 s
  step2..step4  (groove accents)                         21/24/27  10.5/12/13.5 s
  step5         (darker: sub drop + downlifter)             30     15.0 s
  suck          (tape-stop + suck-back riser)               32     16.0 s
  shield        (bright protective impact, Eb major)        34     17.0 s
  tip1..tip3    (confirm chimes)                         35/38/42  17.5/19/21 s
  build         (snare roll + riser)                        47     23.5 s
  destroy       (big impact + glass / digital shatter)      48     24.0 s
  title         (resolved hit + shimmer)                    50     25.0 s
  question      (small open ping)                           56     28.0 s
  fadeStart                                                 58     29.0 s

Two keys: the THREAT half (0-16 s) is C minor (aeolian; the harmonic-minor B natural is used only on
the G7 dominant that leads into the groove), the DEFEND half (16 s on) is its relative major, Eb major,
reached through Bb (V of Eb) under the suck-back riser.

The narrator speaks almost all the time, so the melodic hooks live in the voice gaps (7.13-9.3 s,
13.67-17.3 s, 22.8-24.6 s, 27.44-27.95 s); everything else is drones, filtered pads / pulses, bass and
drums kept out of the 1-4 kHz band.

Running this file prints the note names per bar and validates them against the key of the half,
and the chord of the moment.
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

KEY_THREAT = "C minor (aeolian; harmonic-minor B natural only on the G7 dominant)"
KEY_DEFEND = "Eb major (relative major)"
SCALE_THREAT = ("C", "D", "Eb", "F", "G", "Ab", "Bb")
SCALE_DEFEND = ("Eb", "F", "G", "Ab", "Bb", "C", "D")
DEFEND_FROM = 32.5                      # beat: the Bb (V of Eb) under the riser belongs to the new key


def _pcs(names):
    return {n2m(s + "4") % 12 for s in names}


CHORD_TONES = {"Cm": ("C", "Eb", "G"), "Ab": ("Ab", "C", "Eb"), "Fm": ("F", "Ab", "C"), "G7": ("G", "B", "D", "F"),
               "Bb": ("Bb", "D", "F"), "Eb": ("Eb", "G", "Bb")}
# colour tones allowed on top of each chord (9th, 6th/7th, 11th / sus4, b9 on the dominant)
CHORD_COLOURS = {"Cm": ("D", "Bb", "F"), "Ab": ("G", "Bb", "F"), "Fm": ("G", "Eb", "Bb", "D"),
                 "G7": ("Ab", "C"), "Bb": ("C", "Eb", "G", "Ab"), "Eb": ("F", "D", "C", "Ab")}

CUE_T = {"notification": 0.2, "tap": 2.0, "message": 3.5, "reveal": 6.0, "how": 9.0, "step2": 10.5, "step3": 12.0,
         "step4": 13.5, "step5": 15.0, "suck": 16.0, "shield": 17.0, "tip1": 17.5, "tip2": 19.0, "tip3": 21.0,
         "build": 23.5, "destroy": 24.0, "title": 25.0, "question": 28.0, "fadeStart": 29.0}
CUE_BEATS = {k: v * 2.0 for k, v in CUE_T.items()}
STEP_BEATS = (18, 21, 24, 27, 30)
TIP_BEATS = (35, 38, 42)

# voice-over windows (seconds, src/v04/timeline.ts V4_VO): the hooks stay out of them
VO = ((0.15, 2.89), (3.4, 7.13), (9.3, 13.67), (17.3, 18.62), (19.0, 20.35), (20.75, 22.8), (24.6, 27.44),
      (27.95, 29.84))
GAPS = ((2.89, 3.4), (7.13, 9.3), (13.67, 17.3), (18.62, 19.0), (20.35, 20.75), (22.8, 24.6), (27.44, 27.95))

# (start beat, end beat, chord, bass note)
HARMONY = [
    (0, 7, "Cm", "C2"),       # notification, finger approaches, tap -> red alarm
    (7, 12, "Ab", "Ab1"),     # the fake message appears (bVI, dark)
    (12, 16, "Fm", "F1"),     # reveal: the suspicious address (iv)
    (16, 18, "G7", "G1"),     # V (harmonic minor) pulls into the groove
    (18, 22, "Cm", "C2"),     # how it works: step 1 / 2
    (22, 26, "Ab", "Ab1"),    # step 3
    (26, 30, "Fm", "F1"),     # step 4
    (30, 32.5, "Cm", "C2"),   # step 5: data reaches the attacker (low, heavy); tape-stop at 16.0
    (32.5, 34, "Bb", "Bb1"),  # suck-back riser: V of Eb
    (34, 38, "Eb", "Eb2"),    # SHIELD: relative major  (tip 1)
    (38, 42, "Bb", "Bb1"),    # tip 2
    (42, 46, "Cm", "C2"),     # tip 3 (vi: I - V - vi - IV)
    (46, 48, "Ab", "Ab1"),    # build
    (48, 50, "Bb", "Bb1"),    # DESTROY on the dominant ...
    (50, 52, "Eb", "Eb2"),    # ... TITLE resolves to the tonic
    (52, 54, "Ab", "Ab1"),    # IV
    (54, 56, "Bb", "Bb1"),    # V
    (56, 60, "Eb", "Eb2"),    # I add9: the question stays open on the 9th, the piece resolves
]

PAD_VOICINGS = {
    "Cm_alarm": ("C3", "G3", "Eb4"),
    "Ab_dark": ("Ab2", "Eb3", "Ab3", "C4"),
    "Fm_dark": ("F2", "C3", "F3", "Ab3"),
    "G7": ("G2", "D3", "B3", "F4"),
    "Cm": ("C3", "G3", "C4", "Eb4"),
    "Ab": ("Ab2", "Eb3", "C4", "Eb4"),
    "Fm": ("F2", "C3", "Ab3", "C4"),
    "Cm_low": ("C3", "G3", "Eb4"),
    "Eb_add9": ("Eb3", "Bb3", "F4", "G4"),
    "Bb_add9": ("Bb2", "F3", "C4", "D4"),
    "Cm7": ("C3", "G3", "Bb3", "Eb4"),
    "Ab_add9": ("Ab2", "Eb3", "Bb3", "C4"),
    "Bb": ("Bb2", "F3", "Bb3", "D4"),
    "Eb": ("Eb3", "Bb3", "Eb4", "G4"),
    "Abmaj7": ("Ab2", "Eb3", "G3", "C4"),
    "Bb_end": ("Bb2", "F3", "D4", "F4"),
    "Eb_add9_end": ("Eb3", "Bb3", "F4", "G4", "Bb4"),
}

# threat pulse ostinato roots (16ths, 3+3+2 accents) and defend arp roots
PULSE_ROOT = {"Cm": "C3", "Ab": "Ab2", "Fm": "F2", "G7": "G2"}
ARP_ROOT = {"Eb": "Eb4", "Bb": "Bb3", "Cm": "C4", "Ab": "Ab3"}
ACCENT = (1.0, 0.55, 0.75, 0.9, 0.58, 0.72, 0.92, 0.6)   # 3+3+2 feel

# Hooks (voice gaps only).  Threat: the falling C - Ab - G cell (the semitone sigh G-Ab = menace);
# defend: its bright mirror, rising G - Bb - Eb.
LEAD_PHRASES = [
    # (start beat, style, [(offset, duration, note), ...])
    (14.5, "threat", [(0.0, 0.75, "C5"), (0.75, 0.75, "Ab4"), (1.5, 1.0, "G4"), (2.5, 0.5, "D5"),
                      (3.0, 0.5, "B4")]),                                                     # 7.25 s
    (28.0, "threat", [(0.0, 0.75, "C5"), (0.75, 0.75, "Ab4"), (1.5, 0.5, "G4")]),            # 14.0 s
    (45.75, "defend", [(0.0, 0.5, "G5"), (0.5, 0.5, "Bb5"), (1.0, 1.0, "Eb6")]),            # 22.875 s
    (55.0, "defend", [(0.0, 0.5, "G5"), (0.5, 0.4, "Bb5")]),                                  # 27.5 s pickup
]
FLOURISH = (34.0, ("Bb4", "Eb5", "G5", "Bb5", "Eb6"), 0.125)   # shield arpeggio, 17.0-17.25 s (gap)


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


def scale_at(beat: float):
    return SCALE_DEFEND if beat >= DEFEND_FROM else SCALE_THREAT


def in_vo(t: float) -> bool:
    return any(a <= t < b for a, b in VO)


def _third(ch: str) -> int:
    return 3 if ch in ("Cm", "Fm") else 4


def pulse_pattern(ch: str):
    r = n2m(PULSE_ROOT[ch])
    return [r, r + 12, r + 7, r, r + 12, r + 7, r + 12 + _third(ch), r + 12]


def arp_pattern(ch: str):
    r = n2m(ARP_ROOT[ch])
    return [r, r + 7, r + 12, r + 7, r + _third(ch), r + 7, r + 14, r + 12]


def build(seed: int = 2404):
    """Return every event of the piece. Velocities are lightly humanised (seeded)."""
    rng = np.random.default_rng(seed)

    def hum(v, amt=0.06):
        return float(v * (1.0 + rng.uniform(-amt, amt)))

    ev = {k: [] for k in ("kick", "snap", "hat_c", "hat_o", "shaker", "roll", "crash", "pad", "drone", "sub", "bass",
                          "pulse", "arp", "lead", "flourish", "bell", "tick", "stab", "heart", "sparkle")}

    # ------------------------------------------------------------------ hook 0.2-2.0 s
    # low tension drone from the notification on (C pedal under the threat harmony)
    ev["drone"].append((0.2, 9.0, [n2m(x) for x in ("C2", "G2", "C3")]))
    # clock ticks: 8ths from 0.5 s, 16ths from 1.5 s (the finger approaches), stop before the tap
    t, k = 0.5, 0
    while t < 1.96:
        u = (t - 0.5) / 1.5
        ev["tick"].append((t, "tick" if k % 2 == 0 else "tock", 0.42 + 0.45 * u, 0.2 if k % 2 == 0 else -0.2))
        t += 0.25 if t < 1.5 - 1e-9 else 0.125
        k += 1
    # after the tap: an 8th-note clock under the alarm and the message, muted on the cues
    t, k = 2.5, 0
    while t < 8.99:
        if all(abs(t - c) > 0.05 for c in (3.5, 6.0)):
            ev["tick"].append((t, "tick" if k % 2 == 0 else "tock", hum(0.5 if k % 2 == 0 else 0.36),
                               0.25 if k % 2 == 0 else -0.25))
        t += 0.25
        k += 1

    # heartbeat sub pulses (lub at the beat, dub a 16th later), 2.5-8.75 s, not on the cue beats
    for b in (5, 6, 8, 9, 10, 11, 13, 14, 15, 16, 17):
        g = 0.75 + 0.25 * (b - 5) / 12.0
        ev["heart"].append((b, hum(g, 0.03)))
        ev["heart"].append((b + 0.25, hum(0.55 * g, 0.03)))

    # ------------------------------------------------------------------ groove 9-16 s (HOW)
    for b in range(18, 32):
        accent = b in STEP_BEATS
        ev["kick"].append((b, "big" if accent else "muted", 1.0 if accent else hum(0.85, 0.03)))
        ev["hat_c"].append((b + 0.5, hum(0.62)))                           # off-beat ticks above 7 kHz
        if b >= 20:
            ev["hat_c"].append((b + 0.25, hum(0.22)))
            ev["hat_c"].append((b + 0.75, hum(0.28)))
        if b % 2 == 1 and b >= 21:
            ev["snap"].append((b, hum(0.5 if b not in STEP_BEATS else 0.7)))
    ev["hat_c"].append((32.0, 0.4))                                          # material for the tape-stop
    ev["crash"].append((18, "small", 0.55))
    ev["crash"].append((24, "small", 0.38))

    # 16-17 s: tape-stop at 16.0, then a snare roll rising into the shield
    roll = [33.0 + k / 4 for k in range(2)] + [33.5 + k / 8 for k in range(4)]
    for i, b in enumerate(roll):
        u = i / (len(roll) - 1)
        ev["roll"].append((b, 0.25 + 0.55 * u ** 1.3, True, 5.0 * u))

    # ------------------------------------------------------------------ defend 17-24 s (lighter, uplifting)
    for b in range(34, 47):
        if b % 2 == 0:
            ev["kick"].append((b, "big" if b in (34,) else "warm", 1.0 if b == 34 else hum(0.82, 0.03)))
        else:
            ev["kick"].append((b, "soft", hum(0.5, 0.04)))
            ev["snap"].append((b, hum(0.62)))
        ev["hat_o"].append((b + 0.5, hum(0.55)))
        ev["hat_c"].append((b + 0.25, hum(0.26)))
        ev["hat_c"].append((b + 0.75, hum(0.3)))
        for j, v in enumerate((0.4, 0.25, 0.65, 0.3)):
            ev["shaker"].append((b + j / 4, hum(v, 0.12)))
    ev["crash"].append((34, "small", 0.55))
    ev["kick"].append((47, "big", 0.85))                                      # 23.5 s: the build starts on a hit
    for b, v in ((47.0, 0.45), (47.25, 0.36), (47.5, 0.45), (47.625, 0.45), (47.75, 0.58), (47.875, 0.72)):
        ev["roll"].append((b, v, True, 3.0 * (b - 47.0)))

    # ------------------------------------------------------------------ finale 24-29 s
    ev["kick"].append((48, "big", 1.0))
    ev["crash"].append((48, "big", 0.8))
    ev["kick"].append((50, "big", 0.95))
    ev["crash"].append((50, "small", 0.6))
    for b in range(51, 56):
        ev["kick"].append((b, "soft", hum(0.62, 0.03)))
        ev["hat_c"].append((b + 0.5, hum(0.34)))
        ev["hat_c"].append((b + 0.75, hum(0.16)))
        for j, v in enumerate((0.26, 0.16, 0.42, 0.2)):
            ev["shaker"].append((b + j / 4, hum(v, 0.12)))

    # ------------------------------------------------------------------ harmony
    V = PAD_VOICINGS

    def pad(b0, b1, voicing, lvl=1.0, attack=0.3, release=0.7):
        ev["pad"].append((b0, b1, [n2m(x) for x in V[voicing]], lvl, attack, release))

    pad(4, 7, "Cm_alarm", 0.85, 0.02)            # the screen turns red
    pad(7, 12, "Ab_dark", 0.95, 0.03)            # the message window
    pad(12, 16, "Fm_dark", 1.0, 0.02)            # reveal
    pad(16, 18, "G7", 0.95, 0.25)
    for b0, b1, vc in ((18, 22, "Cm"), (22, 26, "Ab"), (26, 30, "Fm"), (30, 32, "Cm_low")):
        pad(b0, b1, vc, 0.8, 0.05)
    pad(34, 38, "Eb_add9", 1.0, 0.02)            # shield bloom
    pad(38, 42, "Bb_add9", 0.95, 0.15)
    pad(42, 46, "Cm7", 0.95, 0.15)
    pad(46, 48, "Ab_add9", 0.95, 0.15)
    pad(48, 50, "Bb", 1.0, 0.02)
    pad(50, 52, "Eb", 1.0, 0.02)
    pad(52, 54, "Abmaj7", 0.9, 0.2)
    pad(54, 56, "Bb_end", 0.85, 0.2)
    pad(56, 59.9, "Eb_add9_end", 0.85, 0.1, 0.3)

    for b0, b1, ch, bass in HARMONY:
        if b0 < 18 or b0 == 32.5:
            continue
        lvl = 1.0 if b0 < 48 else (0.95 if b0 < 52 else 0.6)
        end = b1
        if b1 == 32.5:
            end = 32.6                          # the tape-stop drags the sub down
        if b1 == 48:
            end = 47.5                          # the build breathes
        if b1 == 60:
            end = 59.6
        ev["sub"].append((b0, end, n2m(bass), lvl))

    # ------------------------------------------------------------------ threat pulse 3.5-16 s (16ths)
    s = 7.0
    while s < 32.5 - 1e-9:
        seg = segment_at(s)
        k = int(round((s - seg[0]) * 4)) % 8
        if not (abs(s - 12.0) < 1e-9):          # the reveal sting owns its downbeat
            u = (s - 7.0) / 25.0
            lv = (0.35 + 0.35 * u) if s < 18 else 0.72
            br = 1 if s < 12 else (2 if s < 26 else 3)
            m = pulse_pattern(seg[2])[k]
            ev["pulse"].append((s, m, hum(ACCENT[k] * lv), br))
        s += 0.25

    # ------------------------------------------------------------------ bass
    for b in range(18, 32):
        seg = segment_at(b)
        root = n2m(seg[3])
        for off, v in ((0.25, 0.6), (0.5, 1.0), (0.75, 0.72)):
            m = root + (0 if b >= 30 else 12)          # step 5: an octave down, darker
            ev["bass"].append((b + off, m, hum(v), 2 if b < 26 else 3, off == 0.5))
    for off in (0.0, 0.25):
        ev["bass"].append((32 + off, n2m("C2"), 0.8, 3, False))   # material for the tape-stop
    for b in range(34, 47):
        root = n2m(segment_at(b)[3]) + 12
        hits = [(0.5, 1.0, root), (0.75, 0.6, root + 12 if b % 2 else root)]
        if b % 2 == 1:
            hits.insert(0, (0.0, 0.55, root))
        for off, v, m in hits:
            ev["bass"].append((b + off, m, hum(v), 4, off == 0.5))
    for b in range(51, 56):
        m = n2m(segment_at(b + 0.5)[3]) + 12
        ev["bass"].append((b + 0.5, m, hum(0.6), 3, True))

    # ------------------------------------------------------------------ defend arp (Eb major, 16ths)
    def arp_run(b0, b1, level, bright, doubles=False):
        s = b0
        while s < b1 - 1e-9:
            seg = segment_at(s)
            k = int(round((s - max(seg[0], b0)) * 4)) % 8
            u = (s - b0) / max(b1 - b0, 1e-9)
            lv = level(u) if callable(level) else level
            br = bright(u) if callable(bright) else bright
            m = arp_pattern(seg[2])[k]
            ev["arp"].append((s, m, hum(ACCENT[k] * lv), int(round(br)), False))
            if doubles and k in (2, 6):
                ev["arp"].append((s, m + 12, hum(ACCENT[k] * lv * 0.35), int(round(br)), False))
            s += 0.25

    arp_run(34.5, 47, lambda u: 0.6 + 0.15 * u, lambda u: 3 + 1.5 * u, doubles=True)
    arp_run(50.5, 56, lambda u: 0.62 - 0.2 * u, 4, doubles=True)

    # ------------------------------------------------------------------ stabs
    stabs = ((18, ("C3", "G3", "C4", "Eb4"), 0.9, 0.35), (21, ("C3", "G3", "Eb4"), 0.75, 0.3),
             (24, ("Ab2", "Eb3", "C4"), 0.8, 0.32), (27, ("F2", "C3", "Ab3", "C4"), 0.85, 0.34),
             (30, ("C2", "G2", "C3", "Eb3"), 1.0, 0.25),
             (34, ("Eb3", "Bb3", "Eb4", "F4", "G4"), 1.0, 0.75), (48, ("Bb2", "F3", "Bb3", "D4", "F4"), 1.0, 0.85),
             (50, ("Eb3", "Bb3", "Eb4", "G4", "Bb4"), 0.95, 0.7))
    for b, notes, v, bright in stabs:
        ev["stab"].append((b, [n2m(x) for x in notes], v, bright))

    # ------------------------------------------------------------------ lead (voice gaps only) + flourish
    for b0, style, notes in LEAD_PHRASES:
        for i, (off, d, nm) in enumerate(notes):
            ev["lead"].append((b0 + off, d, n2m(nm), hum((1.0, 0.86, 0.94, 0.84, 0.9)[i % 5], 0.04), style))
    fb, fnotes, fstep = FLOURISH
    for i, nm in enumerate(fnotes):
        ev["flourish"].append((fb + i * fstep, n2m(nm), 0.55 + 0.1 * i, (-0.5, 0.5, -0.25, 0.25, 0.0)[i]))

    # bells: title chord (25.0 s); the question ping (28.0 s) is rendered by the sound design
    for i, nm in enumerate(("Eb4", "Bb4", "G5")):
        ev["bell"].append((50.0, 2.5, n2m(nm), (0.8, 0.7, 0.6)[i]))
    ev["bell"].append((56.0, 3.0, n2m("F6"), 1.0))             # the 9th of Eb: open, curious

    # sparkles: shield halo (above the voice) and title glitter
    for i, nm in enumerate(("Eb7", "G7", "Bb7", "D8", "F8")):
        ev["sparkle"].append((17.0 + 0.035 * i, n2m(nm), 0.55 - 0.06 * i, (-0.6, 0.6, -0.3, 0.3, 0.0)[i], 0.22))
    for i, nm in enumerate(("Eb7", "G7", "Bb7", "Eb8", "G8")):
        ev["sparkle"].append((25.0 + 0.03 * i, n2m(nm), 0.6 - 0.07 * i, (-0.6, 0.6, -0.3, 0.3, 0.0)[i], 0.25))
    t = 25.5
    while t < 27.9:                                            # sparse glints above the voice
        m = n2m(str(rng.choice(("Eb8", "G8", "Bb7", "F8", "D8"))))
        ch = chord_at(t * 2)
        if m % 12 in _pcs(CHORD_TONES[ch] + CHORD_COLOURS[ch]):
            ev["sparkle"].append((t, m, float(rng.uniform(0.15, 0.3)), float(rng.uniform(-0.9, 0.9)),
                                  float(rng.uniform(0.06, 0.12))))
        t += float(rng.exponential(0.4)) + 0.15
    return ev


# ----------------------------------------------------------------------------
# report / validation
# ----------------------------------------------------------------------------
_FLATS = ["C", "Db", "D", "Eb", "E", "F", "Gb", "G", "Ab", "A", "Bb", "B"]


def nn(m) -> str:
    """MIDI -> note name with flats (C minor / Eb major spelling)."""
    m = int(m)
    return f"{_FLATS[m % 12]}{m // 12 - 1}"


def _names(midis):
    return " ".join(nn(m) for m in midis)


def report(ev=None) -> bool:
    ev = ev or build()
    print(f"KEYS: 0-16 s {KEY_THREAT}: {' '.join(SCALE_THREAT)}")
    print(f"      16-30 s {KEY_DEFEND}: {' '.join(SCALE_DEFEND)}   tempo 120 BPM, 4/4, 15 bars of 2 s")
    print("PROGRESSION: " + " | ".join(f"{b0 / 2:g}s {ch}" for b0, b1, ch, _ in HARMONY))
    print("HOOKS (voice gaps only): threat C5 Ab4 G4 (7.25 s, 14.0 s)  /  defend G5 Bb5 Eb6 (22.9 s, 27.5 s)")

    melodic = {"pulse": 1, "arp": 1, "bass": 1, "lead": 2, "bell": 2, "flourish": 1}
    for bar in range(15):
        b0, b1 = bar * 4, bar * 4 + 4
        chords = [f"{ch}@{max(s0, b0) / 2:g}s" for s0, s1, ch, _ in HARMONY if s0 < b1 and s1 > b0]
        key = "Eb major" if b0 >= DEFEND_FROM - 0.5 else "C minor"
        print(f"\nBAR {bar + 1:2d}  beats {b0:2d}-{b1:2d}  t={b0 / 2:4.1f}-{b1 / 2:4.1f}s  [{key}]  chords: "
              f"{', '.join(chords)}")
        for name, mi in melodic.items():
            notes = sorted((e[0], e[mi]) for e in ev[name] if b0 <= e[0] < b1)
            if not notes:
                continue
            if name in ("arp", "pulse", "bass"):
                txt = _names([m for _, m in notes][:16]) + (" ..." if len(notes) > 16 else "")
            else:
                txt = "  ".join(f"{nn(m)}@{b / 2:g}s" for b, m in notes)
            print(f"   {name:8s} {txt}")
        sp = sorted((e[0] * 2, e[1]) for e in ev["sparkle"] if b0 <= e[0] * 2 < b1)
        if sp:
            print(f"   sparkle  {_names([m for _, m in sp][:16])}" + (" ..." if len(sp) > 16 else ""))
        for e in ev["drone"]:
            if b0 <= e[0] * 2 < b1:
                print(f"   drone    {e[0]:g}-{e[1]:g}s: {_names(e[2])}")
        for e in ev["pad"]:
            if b0 <= e[0] < b1:
                print(f"   pad      {e[0] / 2:g}-{e[1] / 2:g}s: {_names(e[2])}")
        for e in ev["stab"]:
            if b0 <= e[0] < b1:
                print(f"   stab     {e[0] / 2:g}s: {_names(e[1])}")
        subs = [f"{nn(e[2])}@{e[0] / 2:g}s" for e in ev["sub"] if b0 <= e[0] < b1]
        if subs:
            print(f"   sub      {'  '.join(subs)}")

    bad_scale, bad_chord, strong_total, strong_ct = [], [], 0, 0
    harm_minor_b = n2m("B4") % 12

    def check(name, b, m, chord_check=True):
        nonlocal strong_total, strong_ct
        ch = chord_at(b)
        sc = _pcs(scale_at(b))
        if m % 12 not in sc and not (m % 12 == harm_minor_b and ch == "G7"):
            bad_scale.append((name, b / 2, nn(m)))
        if chord_check and m % 12 not in _pcs(CHORD_TONES[ch] + CHORD_COLOURS[ch]):
            bad_chord.append((name, b / 2, nn(m), ch))
        if name in ("lead", "bell"):
            strong_total += 1
            strong_ct += m % 12 in _pcs(CHORD_TONES[ch])

    for name, mi in melodic.items():
        for e in ev[name]:
            check(name, e[0], int(e[mi]))
    for e in ev["sparkle"]:
        check("sparkle", e[0] * 2, int(e[1]))
    for e in ev["pad"]:
        for m in e[2]:
            check("pad", e[0], m)
    for e in ev["stab"]:
        for m in e[1]:
            check("stab", e[0], m)
    for e in ev["drone"]:                          # pedal point: scale only
        for m in e[2]:
            check("drone", e[0] * 2, m, chord_check=False)
    for e in ev["sub"]:
        seg = segment_at(e[0])
        if e[2] != n2m(seg[3]):
            bad_chord.append(("sub", e[0] / 2, nn(e[2]), seg[2]))
    lead_in_vo = [(round(e[0] / 2, 3), nn(e[2])) for e in ev["lead"] if in_vo(e[0] / 2)]
    lead_into_vo = [(round(e[0] / 2, 3), nn(e[2])) for e in ev["lead"] if in_vo((e[0] + e[1]) / 2 - 0.02)]
    print("\nVALIDATION")
    print(f"   notes outside the key of their half (C minor / Eb major): {len(bad_scale)} {bad_scale[:8]}")
    print(f"   notes that are neither chord tone nor allowed colour: {len(bad_chord)} {bad_chord[:8]}")
    print(f"   lead/bell notes that are plain chord tones: {strong_ct}/{strong_total}")
    print(f"   lead notes starting inside a voice-over window: {len(lead_in_vo)} {lead_in_vo}")
    print(f"   lead notes still held when a voice-over line starts: {len(lead_into_vo)} {lead_into_vo}")
    print(f"   event counts: { {k: len(v) for k, v in ev.items()} }")
    ok = not bad_scale and not bad_chord and not lead_in_vo
    print("   RESULT:", "OK" if ok else "CHECK")
    return ok


if __name__ == "__main__":
    report()
