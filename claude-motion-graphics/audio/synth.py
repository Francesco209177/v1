#!/usr/bin/env python3
"""Procedural soundtrack for the Claude Code reel  ->  public/music.wav

    cd <project root> && python3 audio/synth.py

numpy + scipy only, no samples. Fully deterministic (every random generator is
seeded), so running it twice produces a bit-identical file.

Signal flow
-----------
arrangement.build()   every note / drum / FX event of the score, in beats
      |
render_*()            one stereo stem per instrument (instruments.py voices)
      |               + per-stem EQ, tempo-synced ping-pong delay, width
sidechain             kick-triggered ducking (sub, bass, pad, chords, arp, hall return)
      |
sends                 hall (2.6 s), room (0.7 s), big (4.2 s) convolution reverbs
      |
build bus             everything except risers / roll / impacts is high-passed 14-16 s
suck-back             digital-silence gap 15.75 s -> 16.0 s (the drop lands in silence)
      |
master                HP 28 Hz, mono lows (side HP 140 Hz), gentle tilt EQ,
                      tanh saturation, true-peak look-ahead limiter,
                      loudness loop to -14 LUFS, fade to digital silence, TPDF dither, 16-bit WAV
"""
from __future__ import annotations

import os
import sys
import time

import numpy as np
from scipy.io import wavfile

HERE = os.path.dirname(os.path.abspath(__file__))
if HERE not in sys.path:
    sys.path.insert(0, HERE)

import arrangement as arr  # noqa: E402
import instruments as ins  # noqa: E402
from dsp import (BEAT_S, N, SR, apply_fades, automation, b2s, biquad, db2lin, duck_gaps, hp, lin2db,  # noqa: E402
                 lp, lufs_integrated, lufs_window, make_ir, mtof, n2m, ping_pong, place, reverb, s2n,
                 sidechain_env, soft_sat, sweep_filter, tarr, to_stereo, true_peak, width)
from scipy.ndimage import minimum_filter1d, uniform_filter1d, maximum_filter1d  # noqa: E402
from scipy import signal  # noqa: E402

ROOT = os.path.dirname(HERE)
OUT_WAV = os.path.join(ROOT, "public", "music.wav")

TARGET_LUFS = -14.0
TP_CEILING_DB = -1.25        # limiter ceiling on the 4x oversampled signal (spec: <= -1.0 dBTP)
FADE_START_S = 29.0          # CUES.fadeStart = frame 870
SILENT_FROM_S = 29.94        # from here on the file is exact digital silence
CUE = arr.CUE_BEATS


def at(beat: float) -> int:
    """Beat -> sample index."""
    return b2s(beat)


def sec(beats: float) -> float:
    return beats * BEAT_S


def stereo() -> np.ndarray:
    return np.zeros((N, 2))


# ----------------------------------------------------------------------------
# stems
# ----------------------------------------------------------------------------
class Stems:
    """Named stereo stems + their mix settings."""

    def __init__(self):
        self.audio: dict[str, np.ndarray] = {}
        self.cfg: dict[str, dict] = {}

    def new(self, name: str, gain_db: float = 0.0, duck: float = 0.0, sends=None, build_hp: bool = True,
            group: str = "music"):
        self.audio[name] = stereo()
        self.cfg[name] = dict(gain=db2lin(gain_db), duck=duck, sends=sends or {}, build_hp=build_hp, group=group)
        return self.audio[name]


# Mix table: gain (dB), sidechain depth, reverb sends, whether the build high-pass applies.
MIX = {
    # name        gain   duck  sends                               build_hp group
    "kick":     (-5.0, 0.00, {}, True, "drums"),
    "clap":     (-15.0, 0.00, {"room": 0.30, "hall": 0.10}, True, "drums"),
    "hats":     (-23.5, 0.00, {"room": 0.10}, True, "drums"),
    "shaker":   (-27.0, 0.00, {"room": 0.10}, True, "drums"),
    "roll":     (-15.0, 0.00, {"room": 0.25, "hall": 0.08}, False, "drums"),
    "crash":    (-21.0, 0.00, {"hall": 0.15}, True, "drums"),
    "sub":      (-9.5, 0.92, {}, True, "bass"),
    "bass":     (-13.0, 0.55, {}, True, "bass"),
    "drone":    (-13.0, 0.00, {"hall": 0.35}, True, "music"),
    "pad":      (-21.0, 0.45, {"hall": 0.30}, True, "music"),
    "chords":   (-24.0, 0.65, {"hall": 0.15}, True, "music"),
    "stab":     (-17.0, 0.00, {"hall": 0.25}, True, "music"),
    "arp":      (-15.0, 0.28, {"hall": 0.22}, True, "music"),
    "lead":     (-13.5, 0.15, {"hall": 0.20}, True, "music"),
    "bell":     (-17.0, 0.10, {"hall": 0.45}, True, "music"),
    "logo":     (-11.5, 0.00, {"big": 0.30, "hall": 0.15}, False, "music"),
    "echo":     (-17.0, 0.00, {"hall": 0.40}, False, "music"),
    "stream":   (-19.0, 0.00, {"hall": 0.20}, True, "music"),
    "typing":   (-22.0, 0.00, {"room": 0.06}, True, "fx"),
    "sparkle":  (-21.0, 0.00, {"hall": 0.60}, True, "fx"),
    "boom":     (-6.5, 0.00, {}, False, "fx"),
    "air":      (-17.0, 0.00, {"big": 0.55}, False, "fx"),
    "shimmer":  (-19.0, 0.00, {"big": 0.60}, False, "fx"),
    "riser":    (-17.0, 0.00, {"hall": 0.20}, False, "fx"),
    "whoosh":   (-19.0, 0.00, {"hall": 0.25}, False, "fx"),
    "swell":    (-15.0, 0.00, {}, False, "fx"),
    "downlift": (-21.0, 0.00, {"hall": 0.20}, False, "fx"),
    "confirm":  (-17.0, 0.00, {"hall": 0.30}, False, "fx"),
}
RETURNS_DB = {"hall": -6.0, "room": -9.0, "big": -5.0}


def make_stems() -> Stems:
    st = Stems()
    for name, (g, d, sends, bhp, grp) in MIX.items():
        st.new(name, g, d, sends, bhp, grp)
    return st


# ----------------------------------------------------------------------------
# drums
# ----------------------------------------------------------------------------
SWING_S = 0.009   # the "e" and "a" 16ths of hats / shaker sit 9 ms late: a little garage shuffle


def swung(beat: float) -> int:
    frac = beat % 0.5
    return at(beat) + (s2n(SWING_S) if abs(frac - 0.25) < 1e-6 else 0)


def render_drums(ev, st: Stems):
    kick = np.zeros(N)
    for b, kind, v in ev["kick"]:
        place(kick, ins.kick(kind), at(b), v)
    st.audio["kick"] += to_stereo(kick)

    for i, (b, v) in enumerate(ev["clap"]):
        place(st.audio["clap"], ins.clap(i % 3), at(b), v)

    hats = st.audio["hats"]
    for i, (b, v) in enumerate(ev["hat_c"]):
        place(hats, ins.hat("closed", i % 4), swung(b), v, pan=0.22)
    for i, (b, v) in enumerate(ev["hat_o"]):
        place(hats, ins.hat("open", i % 2), at(b), v * 0.8, pan=-0.12)
    for i, (b, v) in enumerate(ev["shaker"]):
        place(st.audio["shaker"], ins.shaker(i % 4), swung(b), v, pan=0.35 if i % 2 else -0.35)

    for i, (b, v, tight) in enumerate(ev["snare"]):
        # rolls and fills rise in pitch towards their target (build: +7 semitones)
        if 28 <= b < 32:
            semis = 7.0 * (b - 28) / 4.0
        elif b < 18:
            semis = 2.0 * (b - 17)
        else:
            semis = 3.0 * (b - 47)
        x = ins.pitched(ins.snare(i % 3, tight), 2.0 ** (semis / 12.0))
        place(st.audio["roll"], apply_fades(x, 0.0, 10.0), at(b), v)

    for b, size, v in ev["crash"]:
        place(st.audio["crash"], ins.crash(size), at(b), v)


# ----------------------------------------------------------------------------
# bass
# ----------------------------------------------------------------------------
def render_bass(ev, st: Stems):
    sub = np.zeros(N)
    for b0, b1, m, lvl in ev["sub"]:
        place(sub, ins.sub_note(m, sec(b1 - b0)), at(b0), lvl)
    st.audio["sub"] += to_stereo(sub)

    bass = np.zeros(N)
    for b, m, v, bright, long in ev["bass"]:
        place(bass, ins.bass_note(m, bright, long), at(b), v)
    bass = biquad(bass, "peak", 2600.0, 1.0, -3.0)
    st.audio["bass"] += to_stereo(bass)


# ----------------------------------------------------------------------------
# harmony and melody
# ----------------------------------------------------------------------------
def pad_cutoff():
    """Pad low-pass trajectory: slow sections are dark, the impacts open it, plus a slow LFO."""
    base = automation([(0.0, 700), (2.45, 900), (2.5, 3400), (4.0, 1500), (7.0, 1300), (8.6, 1900), (9.0, 2400),
                       (14.0, 2300), (15.75, 5200), (16.0, 1800), (24.0, 480), (25.95, 4600), (26.0, 5600),
                       (27.6, 2300), (30.0, 900)], log=True)
    t = tarr(N)
    lfo = 2.0 ** (0.30 * np.sin(2 * np.pi * 0.13 * t) + 0.12 * np.sin(2 * np.pi * 0.31 * t + 1.3))
    return base * lfo


def render_harmony(ev, st: Stems):
    # intro drone: fades in from silence, filter slowly opens into the 2.5 s impact, then hands over
    for b0, b1, midis, lvl in ev["drone"]:
        d = ins.drone(midis, sec(b1 - b0), 7000)
        fc = automation([(0.0, 140.0), (2.45, 1150.0), (3.2, 800.0), (5.0, 450.0)], n=len(d), log=True)
        fc *= 2.0 ** (0.25 * np.sin(2 * np.pi * 0.21 * tarr(len(d))))
        d = sweep_filter(d, fc, "lp", q=1.1, per_oct=4.0)
        env = automation([(0.0, 0.0), (0.15, 0.0), (2.45, 1.0), (3.4, 0.85), (5.0, 0.0)], n=len(d))
        d *= (env ** 1.6)[:, None]
        place(st.audio["drone"], d, at(b0), lvl)

    pad = stereo()
    for i, (b0, b1, midis, lvl, attack) in enumerate(ev["pad"]):
        dur = sec(b1 - b0)
        rel = 0.25 if b0 >= 52 else 0.7
        for j, m in enumerate(midis):
            reg = 0.62 if m < 48 else (0.85 if m < 57 else 1.0)
            v = ins.pad_voice(m, dur, 1000 + 37 * i + j, attack=attack, release=rel)
            place(pad, v, at(b0), lvl * reg)
    pad = sweep_filter(pad, pad_cutoff(), "lp", q=0.75, per_oct=4.0)
    pad = hp(pad, 110.0, 2)
    st.audio["pad"] += width(pad, 1.3)

    chords = stereo()
    for i, (b0, b1, midis, lvl) in enumerate(ev["chords"]):
        for j, m in enumerate(midis):
            v = ins.supersaw(m, sec(b1 - b0) - 0.03, 2000 + 41 * i + j, voices=5, detune=14.0, spread=0.95,
                             attack=0.004, decay=0.4, sustain=0.55, release=0.12)
            place(chords, v, at(b0), lvl / np.sqrt(len(midis)))
    chords = lp(chords, 2700.0, 2)
    chords = biquad(chords, "peak", 3200.0, 0.8, -3.0)
    chords = hp(chords, 160.0, 2)
    st.audio["chords"] += width(chords, 1.35)

    stab = stereo()
    for i, (b, midis, lvl) in enumerate(ev["stab"]):
        place(stab, ins.chord_stab(midis, 3000 + 7 * i, dur=0.42, bright=0.75), at(b), lvl)
    stab = biquad(hp(stab, 180.0, 2), "peak", 3300.0, 0.9, -3.5)
    st.audio["stab"] += width(stab, 1.25)


def render_arp(ev, st: Stems):
    arp = stereo()
    for b, m, v, bright, long in ev["arp"]:
        place(arp, ins.pluck(m, bright, long), at(b), v)
    arp = biquad(hp(arp, 140.0, 2), "peak", 3600.0, 0.9, -2.5)
    arp = arp + 0.30 * ping_pong(arp, sec(0.75), fb=0.38, taps=6, lp_hz=3800.0, hp_hz=350.0)
    st.audio["arp"] += width(arp, 1.2)

    echo = stereo()
    for b, m, v, bright, long in ev["echo"]:
        place(echo, ins.pluck(m, bright, long), at(b), v)
    echo = echo + 0.45 * ping_pong(echo, sec(0.75), fb=0.5, taps=6, lp_hz=3500.0, hp_hz=400.0)
    st.audio["echo"] += echo


def render_lead(ev, st: Stems):
    lead = stereo()
    prev_end, prev_m = -1.0, None
    for i, (b, d, m, v) in enumerate(sorted(ev["lead"])):
        glide = prev_m if (prev_m is not None and abs(prev_end - b) < 1e-6 and b not in arr.SHOT_BEATS) else None
        x = ins.lead_voice(m, sec(d) - 0.01, 4000 + i, glide_from=glide)
        place(lead, x, at(b), v)
        prev_end, prev_m = b + d, m
    # tame the 2-5 kHz presence region and the fizz above it
    lead = hp(lead, 180.0, 2)
    lead = biquad(lead, "peak", 3100.0, 0.8, -4.5)
    lead = biquad(lead, "hishelf", 6500.0, 0.7, -5.0)
    lead = lead + 0.20 * ping_pong(lead, sec(0.75), fb=0.32, taps=5, lp_hz=3200.0, hp_hz=400.0)
    st.audio["lead"] += width(lead, 1.15)


def render_bells(ev, st: Stems):
    bell = stereo()
    for i, (b, d, m, v) in enumerate(ev["bell"]):
        x = ins.fm_bell(mtof(m), dur=sec(d) + 1.4, ratio=3.0, index=1.0, idx_tau=0.08, amp_tau=0.35 + 0.25 * sec(d))
        place(bell, x, at(b), v, pan=(-0.3, 0.3)[i % 2])
    bell = biquad(bell, "peak", 3400.0, 0.9, -3.0)
    bell = bell + 0.30 * ping_pong(bell, sec(0.75), fb=0.4, taps=6, lp_hz=3600.0, hp_hz=400.0, first=1)
    st.audio["bell"] += bell

    logo = stereo()
    for i, (b, d, m, v) in enumerate(ev["logo"]):
        place(logo, ins.logo_voice(m, sec(d) + 1.5, 5000 + i), at(b), v, pan=(-0.12, 0.12, -0.08, 0.0)[i])
    logo = biquad(logo, "peak", 3300.0, 0.9, -2.5)
    logo = logo + 0.28 * ping_pong(logo, sec(0.75), fb=0.42, taps=6, lp_hz=3400.0, hp_hz=350.0)
    st.audio["logo"] += logo


def render_textures(ev, st: Stems):
    stream = stereo()
    for b, m, v, bright, pan in ev["stream"]:
        place(stream, ins.blip(mtof(m), bright), at(b), v, pan=pan)
    stream = biquad(stream, "peak", 3500.0, 1.0, -3.0)
    stream = stream + 0.22 * ping_pong(stream, sec(0.375), fb=0.3, taps=4, lp_hz=4500.0, hp_hz=500.0)
    st.audio["stream"] += stream

    rng = np.random.default_rng(77)
    typing = stereo()
    for t, kind, v, pan in ev["typing"]:
        place(typing, ins.key_tick(rng, kind), s2n(t), v, pan=pan)
    typing = biquad(typing, "peak", 3000.0, 1.0, -3.0)
    st.audio["typing"] += typing

    sp = stereo()
    for t, m, v, pan, tau in ev["sparkle"]:
        place(sp, ins.sparkle(mtof(m), tau), s2n(t), v, pan=pan)
    st.audio["sparkle"] += sp


# ----------------------------------------------------------------------------
# sound design on the cue sheet
# ----------------------------------------------------------------------------
def impact(st: Stems, beat: float, boom_kw: dict, boom_gain: float, air_gain: float, air_tau: float = 0.2,
           seed: int = 0, thud_gain: float = 0.5):
    """Layered hit: pitch-swept sub boom + low-mid thud + noise 'air' sent to the big reverb."""
    s = at(beat)
    place(st.audio["boom"], ins.boom(**boom_kw), s, boom_gain)
    place(st.audio["boom"], ins.thud(seed + 1), s, thud_gain)
    place(st.audio["air"], ins.noise_burst(max(0.6, air_tau * 6), seed + 2, 900.0, 9000.0, air_tau), s, air_gain)


def ends_at(x, beat: float) -> int:
    return at(beat) - len(x)


def render_fx(st: Stems):
    am_hi = [n2m(x) for x in ("A5", "E6", "B6", "C7", "E7")]

    # 0-2.5 s: subtle rising tension
    r = apply_fades(ins.noise_riser(2.15, 11, f0=500.0, f1=6500.0, curve=2.6, q=1.6, air=0.12), 30.0, 6.0)
    place(st.audio["riser"], r, ends_at(r, CUE["sparkFormed"]) - s2n(0.012), 0.45)

    # 2.5 s IMPACT 1: soft but clear boom + shimmer bloom on A minor add9
    impact(st, CUE["sparkFormed"], dict(f_start=95.0, f_end=45.0, tau_p=0.06, tau_a=0.8, dur=2.6, drive=1.1,
                                        snap=110.0), 0.62, 0.55, 0.22, seed=20, thud_gain=0.55)
    place(st.audio["shimmer"], ins.shimmer(am_hi, 5.0, 21, attack=0.03, tau=1.7), at(CUE["sparkFormed"]), 1.0)

    # 2.5-4.0 s: gentle whoosh peaking on 4.0 s (scene 2)
    w = ins.whoosh(1.15, 0.8, 30, f_lo=350.0, f_hi=4200.0)
    place(st.audio["whoosh"], w, at(CUE["ideaStart"]) - s2n(1.15), 0.9)

    # 7.0 s IMPACT 2 ("Enter"): rising confirm blip + small sub hit + enter key
    s = at(CUE["promptToCode"])
    place(st.audio["confirm"], ins.confirm_blip(), s, 0.9)
    place(st.audio["boom"], ins.boom(140.0, 58.0, 0.03, 0.16, 0.7, 1.2, 140.0), s, 0.42)
    place(st.audio["air"], ins.noise_burst(0.4, 40, 2000.0, 9000.0, 0.035), s, 0.6)
    place(st.audio["typing"], ins.key_tick(np.random.default_rng(41), "enter"), s, 1.0)
    # 8.5-9.0 s: short reverse cymbal on top of the snare fill
    rc = ins.reverse_swell(0.5, 42, noise_gain=1.0, tone_gain=0.0, hp_hz=2500.0, lp_hz=11000.0)
    place(st.audio["swell"], rc, ends_at(rc, CUE["creationStart"]), 0.22)

    # 9.0 s IMPACT 3 (full groove) + downlifter
    impact(st, CUE["creationStart"], dict(f_start=120.0, f_end=47.0, tau_p=0.05, tau_a=0.5, dur=1.8, drive=1.4,
                                          snap=170.0), 0.68, 0.75, 0.18, seed=50)
    place(st.audio["downlift"], ins.downlifter(2.2, 51), at(CUE["creationStart"]), 0.8)

    # 14-16 s BUILD: noise riser + rising saw layer (the low end is filtered out in master_bus)
    b0, b_gap = CUE["buildStart"], CUE["drop"] - 0.5
    dur = sec(b_gap - b0)
    nr = apply_fades(ins.noise_riser(dur, 60, f0=300.0, f1=9500.0, curve=2.0, q=1.5, air=0.3), 50.0, 8.0)
    place(st.audio["riser"], nr, at(b0), 1.0)
    tr = apply_fades(ins.tone_riser(dur, 61, m0=57.0, m1=81.0, curve=1.8), 50.0, 8.0)
    place(st.audio["riser"], tr, at(b0), 0.35)

    # 16 s THE DROP: biggest hit
    impact(st, CUE["drop"], dict(f_start=150.0, f_end=46.0, tau_p=0.055, tau_a=0.6, dur=2.0, drive=1.6, snap=210.0),
           0.8, 0.9, 0.22, seed=70)
    place(st.audio["downlift"], ins.downlifter(2.8, 71), at(CUE["drop"]), 1.0)
    # shot accents 17.5 / 19.0 / 20.5 / 22.0 s: sub hit + air (crash, stab and big kick are in the score)
    for i, b in enumerate(arr.SHOT_BEATS[1:]):
        impact(st, b, dict(f_start=125.0, f_end=50.0, tau_p=0.04, tau_a=0.22, dur=0.8, drive=1.3, snap=170.0),
               0.42, 0.45, 0.07, seed=80 + 10 * i, thud_gain=0.35)

    # 23.5-24 s: reverse cymbal into scene 5
    rc = ins.reverse_swell(0.55, 90, noise_gain=1.0, tone_gain=0.0, hp_hz=2500.0, lp_hz=11000.0)
    place(st.audio["swell"], rc, ends_at(rc, CUE["outroStart"]), 0.3)

    # 24 s IMPACT 4 + downlifter, then the 24-26 s REVERSE SWELL into the final hit
    impact(st, CUE["outroStart"], dict(f_start=110.0, f_end=45.0, tau_p=0.06, tau_a=0.65, dur=2.0, drive=1.3,
                                       snap=150.0), 0.66, 0.7, 0.2, seed=100)
    place(st.audio["downlift"], ins.downlifter(1.6, 101, f0=7000.0, f1=300.0), at(CUE["outroStart"]), 0.7)
    sw = ins.reverse_swell(2.0, 102, midis=[n2m(x) for x in ("A4", "C5", "E5", "B5", "E6")], noise_gain=0.8,
                           tone_gain=1.0, hp_hz=350.0, lp_hz=9000.0, rt_scale=1.0)
    place(st.audio["swell"], sw, ends_at(sw, CUE["lockup"]) - s2n(0.008), 1.0)

    # 26 s FINAL HIT: sub boom, bright shimmer chord on the tonic, crash, long lush tail (logo motif in score)
    impact(st, CUE["lockup"], dict(f_start=140.0, f_end=44.0, tau_p=0.07, tau_a=1.0, dur=3.6, drive=1.5,
                                   snap=190.0), 0.85, 1.0, 0.35, seed=110, thud_gain=0.6)
    place(st.audio["shimmer"], ins.shimmer(am_hi + [n2m("A7")], 4.0, 111, attack=0.01, tau=1.6),
          at(CUE["lockup"]), 1.25)
    place(st.audio["crash"], ins.crash("big"), at(CUE["lockup"]), 0.7)


# ----------------------------------------------------------------------------
# mix
# ----------------------------------------------------------------------------
def kick_ducking(ev):
    """Unit ducking curve (1 open .. 0 fully ducked): full/big kicks duck fully, soft kicks half."""
    hard = [at(b) for b, kind, _ in ev["kick"] if kind != "soft"]
    soft = [at(b) for b, kind, _ in ev["kick"] if kind == "soft"]
    hard_env = sidechain_env(N, hard, depth=1.0, pre_ms=4.0, hold_ms=22.0, rel_ms=230.0, shape=1.6)
    soft_env = sidechain_env(N, soft, depth=1.0, pre_ms=4.0, hold_ms=20.0, rel_ms=260.0, shape=1.4)
    return np.minimum(hard_env, 1.0 - 0.5 * (1.0 - soft_env))


def build_highpass_curve():
    """Build: the low end drains away 14.0 -> 15.75 s, comes back in full on the drop."""
    t = tarr(N)
    t0, t1 = sec(CUE["buildStart"]), sec(CUE["drop"] - 0.5)
    u = np.clip((t - t0) / (t1 - t0), 0.0, 1.0)
    fc = 20.0 * (420.0 / 20.0) ** (u ** 1.6)
    fc[t >= sec(CUE["drop"]) - 0.12] = 20.0       # inside the silent gap: snap back
    return fc


def mix_down(st: Stems, ev):
    duck = kick_ducking(ev)
    sends = {k: stereo() for k in RETURNS_DB}
    main, exempt = stereo(), stereo()
    for name, x in st.audio.items():
        c = st.cfg[name]
        y = x * c["gain"]
        if c["duck"] > 0:
            y = y * (1.0 - c["duck"] * (1.0 - duck))[:, None]
        for k, g in c["sends"].items():
            sends[k] += y * g
        if c["build_hp"]:
            main += y
        else:
            exempt += y
    irs = {"hall": make_ir(2.6, seed=3, predelay_ms=24.0, lo=260.0, hi=6500.0, hf_ratio=0.42),
           "room": make_ir(0.7, seed=5, predelay_ms=7.0, lo=300.0, hi=8000.0, hf_ratio=0.5),
           "big": make_ir(4.2, seed=9, predelay_ms=32.0, lo=200.0, hi=6000.0, hf_ratio=0.45)}
    hall = reverb(sends["hall"], irs["hall"]) * db2lin(RETURNS_DB["hall"])
    hall *= (1.0 - 0.3 * (1.0 - duck))[:, None]              # the tail breathes with the kick
    room = reverb(sends["room"], irs["room"]) * db2lin(RETURNS_DB["room"])
    big = reverb(sends["big"], irs["big"]) * db2lin(RETURNS_DB["big"])
    main += hall + room
    exempt += big
    main = sweep_filter(main, build_highpass_curve(), "hp", q=0.75, per_oct=5.0)
    mix = main + exempt
    # suck-back: the last 8th before the drop is silent, the drop lands in a vacuum
    gap = duck_gaps(N, [(sec(CUE["drop"] - 0.5), sec(CUE["drop"]), 18.0, 4.0)])
    return mix * gap[:, None]


# ----------------------------------------------------------------------------
# master
# ----------------------------------------------------------------------------
def tp_limiter(x, ceiling_db: float, lookahead_ms: float = 2.5, release_ms: float = 90.0, os: int = 4):
    """Look-ahead limiter driven by the 4x oversampled (true) peak of the signal."""
    up = signal.resample_poly(x, os, 1, axis=0)
    pk = np.max(np.abs(up), axis=1)
    pk = pk[: len(x) * os].reshape(len(x), os).max(axis=1)
    pk = np.maximum(pk, np.max(np.abs(x), axis=1))
    ceil = db2lin(ceiling_db)
    g = np.minimum(1.0, ceil / np.maximum(pk, 1e-9))
    half = s2n(lookahead_ms / 1000.0)
    size = 2 * half + 1
    gs = uniform_filter1d(minimum_filter1d(g, size=size, mode="nearest"), size=size, mode="nearest")
    gs = np.minimum(gs, g)
    k = 1.0 - float(np.exp(-1.0 / (release_ms / 1000.0 * SR)))
    out = np.empty_like(gs)
    r = 1.0
    for i, v in enumerate(gs.tolist()):
        r += (1.0 - r) * k
        if v < r:
            r = v
        out[i] = r
    return x * out[:, None], out


def master_bus(mix):
    y = hp(mix, 28.0, 4)
    # mono below ~140 Hz: kick, sub and bass stay dead centre whatever the reverbs do
    m = 0.5 * (y[:, 0] + y[:, 1])
    s = hp(0.5 * (y[:, 0] - y[:, 1]), 140.0, 2)
    y = np.stack([m + s, m - s], axis=1)
    # gentle tilt: a hair of warmth, a soft dip in the presence region, smooth top
    y = biquad(y, "loshelf", 90.0, 0.7, 1.0)
    y = biquad(y, "peak", 3400.0, 0.7, -1.5)
    y = biquad(y, "hishelf", 11000.0, 0.7, -1.0)
    # glue: normalise to a fixed level, then a gentle tanh saturation
    y *= db2lin(-17.0 - lufs_integrated(y))
    y = soft_sat(y, 1.25)
    # fades: digital silence at both ends
    t = tarr(N)
    env = np.clip((t - 0.012) / 0.10, 0.0, 1.0)
    env = env * env * (3 - 2 * env)
    u = np.clip((t - FADE_START_S) / (SILENT_FROM_S - FADE_START_S), 0.0, 1.0)
    env *= (0.5 + 0.5 * np.cos(np.pi * u)) ** 1.5
    env[t >= SILENT_FROM_S] = 0.0
    y *= env[:, None]
    # loudness loop through the true-peak limiter
    g = 1.0
    out, gr = y, np.ones(N)
    for _ in range(6):
        out, gr = tp_limiter(y * g, TP_CEILING_DB)
        err = TARGET_LUFS - lufs_integrated(out)
        if abs(err) < 0.03:
            break
        g *= db2lin(err)
    out *= env[:, None] > 0
    return out, gr, env


def to_int16(x, env, seed: int = 1234):
    """TPDF dither (only where the music is not digitally silent) and 16-bit quantisation."""
    rng = np.random.default_rng(seed)
    d = (rng.random(x.shape) - rng.random(x.shape)) * (env > 0)[:, None]
    q = np.round(x * 32767.0 + d)
    return np.clip(q, -32768, 32767).astype(np.int16)


def render(verbose: bool = True):
    t0 = time.time()
    ev = arr.build()
    st = make_stems()
    render_drums(ev, st)
    render_bass(ev, st)
    render_harmony(ev, st)
    render_arp(ev, st)
    render_lead(ev, st)
    render_bells(ev, st)
    render_textures(ev, st)
    render_fx(st)
    if verbose:
        print(f"stems rendered in {time.time() - t0:.1f} s")
    mix = mix_down(st, ev)
    out, gr, env = master_bus(mix)
    if verbose:
        print(f"mixed + mastered in {time.time() - t0:.1f} s")
    return out, gr, env, st


def main():
    out, gr, env, _ = render()
    pcm = to_int16(out, env)
    os.makedirs(os.path.dirname(OUT_WAV), exist_ok=True)
    wavfile.write(OUT_WAV, SR, pcm)
    f = pcm.astype(np.float64) / 32768.0
    print(f"wrote {OUT_WAV}: {len(pcm)} samples x {pcm.shape[1]} ch @ {SR} Hz, 16-bit")
    print(f"integrated {lufs_integrated(f):.2f} LUFS, true peak {lin2db(true_peak(f)):.2f} dBTP, "
          f"max limiter gain reduction {lin2db(gr.min()):.1f} dB")
    for name, a, b in (("intro", 0, 2.5), ("impact1", 2.5, 4), ("scene2", 4, 9), ("scene3", 9, 14),
                       ("build", 14, 16), ("drop", 16, 24), ("breakdown", 24, 26), ("final", 26, 29),
                       ("fade", 29, 30)):
        print(f"   {name:10s} {a:5.1f}-{b:4.1f} s  {lufs_window(f, a, b):6.1f} LUFS (ungated)")


if __name__ == "__main__":
    main()
