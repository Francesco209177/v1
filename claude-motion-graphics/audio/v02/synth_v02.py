#!/usr/bin/env python3
"""Procedural music bed for Video 02 ("Un'intelligenza artificiale senza Internet?")  ->  public/v02/music.wav

    cd <project root> && python3 audio/v02/synth_v02.py [--stems]

Reuses the first reel's engine (audio/dsp.py, audio/instruments.py, unchanged) plus the
v02 score (arrangement_v02.py) and sound design (sfx_v02.py). numpy + scipy only, no
samples, fully deterministic (every random generator is seeded): two runs produce a
bit-identical file.

This is a BED UNDER A NARRATOR: an external mixer ducks it ~8 dB under the voice. The
1-4 kHz band is kept clear (filtered pads / arps, hats above 7 kHz, a voice-pocket EQ on
the music stems and on the master); melodic material only in the voice gaps.

Signal flow
-----------
arrangement_v02.build()   every note / drum / FX event, in beats
      |
render_*()                one stereo stem per instrument + per-stem EQ, ping-pong delay, width
tape_dip()                1.0 s "power-down": varispeed pitch dip of the hook pad (~0.35 s)
sidechain                 kick-triggered ducking (sub, bass, pad, arp, hall return)
sends                     hall (2.4 s), room (0.6 s), big (4.0 s) convolution reverbs
      |
master                    HP 28 Hz, mono lows, voice-pocket dip, tanh glue, true-peak limiter,
                          loudness loop to -14 LUFS, fade to digital silence, TPDF dither, 16 bit
"""
from __future__ import annotations

import os
import sys
import time

sys.dont_write_bytecode = True
HERE = os.path.dirname(os.path.abspath(__file__))          # audio/v02
AUDIO = os.path.dirname(HERE)                               # audio (shared engine)
ROOT = os.path.dirname(AUDIO)
for _p in (AUDIO, HERE):
    if _p not in sys.path:
        sys.path.insert(0, _p)

import numpy as np  # noqa: E402
from scipy import signal  # noqa: E402
from scipy.io import wavfile  # noqa: E402
from scipy.ndimage import minimum_filter1d, uniform_filter1d  # noqa: E402

import arrangement_v02 as arr  # noqa: E402
import instruments as ins  # noqa: E402
import sfx_v02 as fx  # noqa: E402
from dsp import (BEAT_S, N, SR, apply_fades, automation, b2s, biquad, db2lin, hp, lin2db, lp,  # noqa: E402
                 lufs_integrated, lufs_window, make_ir, mtof, n2m, ping_pong, place, reverb, s2n, sidechain_env,
                 soft_sat, sweep_filter, tarr, to_stereo, true_peak, width)

OUT_WAV = os.path.join(ROOT, "public", "v02", "music.wav")

TARGET_LUFS = -14.0
TP_CEILING_DB = -1.9         # limiter ceiling on the 4x oversampled signal (spec: <= -1.5 dBTP after dither)
FADE_START_S = 29.0
SILENT_FROM_S = 29.94
CUE = arr.CUE_BEATS


def at(beat: float) -> int:
    return b2s(beat)


def sec(beats: float) -> float:
    return beats * BEAT_S


def stereo() -> np.ndarray:
    return np.zeros((N, 2))


# ----------------------------------------------------------------------------
# stems + mix table
# ----------------------------------------------------------------------------
class Stems:
    def __init__(self):
        self.audio: dict[str, np.ndarray] = {}
        self.cfg: dict[str, dict] = {}

    def new(self, name, gain_db=0.0, duck=0.0, sends=None, group="music"):
        self.audio[name] = stereo()
        self.cfg[name] = dict(gain=db2lin(gain_db), duck=duck, sends=sends or {}, group=group)


MIX = {
    # name        gain   duck  sends                              group
    "kick":     (-9.0, 0.00, {}, "drums"),
    "snap":     (-15.0, 0.00, {"room": 0.30, "hall": 0.08}, "drums"),
    "hats":     (-17.5, 0.00, {"room": 0.10}, "drums"),
    "shaker":   (-24.0, 0.00, {"room": 0.10}, "drums"),
    "roll":     (-17.0, 0.00, {"room": 0.25, "hall": 0.08}, "drums"),
    "crash":    (-21.0, 0.00, {"hall": 0.15}, "drums"),
    "sub":      (-15.0, 0.90, {}, "bass"),
    "bass":     (-11.0, 0.55, {}, "bass"),
    "pad":      (-21.0, 0.35, {"hall": 0.30}, "music"),
    "air":      (-31.0, 0.00, {"hall": 0.20}, "music"),
    "arp":      (-13.0, 0.30, {"hall": 0.25}, "music"),
    "lead":     (-14.0, 0.10, {"hall": 0.30}, "music"),
    "bell":     (-15.0, 0.00, {"hall": 0.25, "big": 0.08}, "music"),
    "ping":     (-14.0, 0.00, {"hall": 0.30, "big": 0.15}, "music"),
    "stab":     (-15.0, 0.00, {"hall": 0.25}, "music"),
    "stream":   (-20.0, 0.00, {"hall": 0.25}, "music"),
    "tick":     (-23.0, 0.00, {"room": 0.15}, "fx"),
    "typing":   (-27.0, 0.00, {"room": 0.10}, "fx"),
    "sparkle":  (-21.0, 0.00, {"hall": 0.40}, "fx"),
    "boom":     (-9.5, 0.00, {}, "fx"),
    "impair":   (-19.0, 0.00, {"big": 0.55}, "fx"),
    "shimmer":  (-22.0, 0.00, {"big": 0.40}, "fx"),
    "riser":    (-14.0, 0.00, {"hall": 0.20}, "fx"),
    "swell":    (-9.0, 0.00, {}, "fx"),
    "downlift": (-23.0, 0.00, {"hall": 0.20}, "fx"),
    "mech":     (-12.0, 0.00, {"room": 0.18}, "fx"),
    "zap":      (-18.0, 0.00, {"room": 0.20}, "fx"),
    "ui":       (-16.0, 0.00, {"hall": 0.35}, "fx"),
}
RETURNS_DB = {"hall": -7.0, "room": -10.0, "big": -6.0}


def make_stems() -> Stems:
    st = Stems()
    for name, (g, d, sends, grp) in MIX.items():
        st.new(name, g, d, sends, grp)
    return st


def voice_pocket(x, depth_db: float = -4.0, f0: float = 2500.0, q: float = 0.7):
    """Broad dip where speech intelligibility lives (1-4 kHz)."""
    return biquad(x, "peak", f0, q, depth_db)


# ----------------------------------------------------------------------------
# drums
# ----------------------------------------------------------------------------
SWING_S = 0.007


def swung(beat: float) -> int:
    frac = beat % 0.5
    return at(beat) + (s2n(SWING_S) if abs(frac - 0.25) < 1e-6 else 0)


def render_drums(ev, st: Stems):
    kick = np.zeros(N)
    for b, kind, v in ev["kick"]:
        k = ins.kick("soft") if kind == "soft" else fx.kick_warm(kind)
        place(kick, k, at(b), v)
    kick = biquad(kick, "peak", 2600.0, 1.0, -4.0)
    st.audio["kick"] += to_stereo(kick)

    snp = stereo()
    for i, (b, v) in enumerate(ev["snap"]):
        place(snp, fx.snap(i % 3), at(b), v)
    st.audio["snap"] += snp

    hats = stereo()
    for i, (b, v) in enumerate(ev["hat_c"]):
        place(hats, ins.hat("closed", i % 4), swung(b), v, pan=0.22)
    for i, (b, v) in enumerate(ev["hat_o"]):
        place(hats, ins.hat("open", i % 2), at(b), v * 0.75, pan=-0.14)
    st.audio["hats"] += hp(hats, 6800.0, 2)              # keep every hat above ~7 kHz
    shk = stereo()
    for i, (b, v) in enumerate(ev["shaker"]):
        place(shk, ins.shaker(i % 4), swung(b), v, pan=0.35 if i % 2 else -0.35)
    st.audio["shaker"] += hp(shk, 7000.0, 2)

    roll = stereo()
    for i, (b, v, tight, semis) in enumerate(ev["roll"]):
        x = ins.pitched(ins.snare(i % 3, tight), 2.0 ** (semis / 12.0))
        place(roll, apply_fades(hp(x, 150.0, 2), 0.0, 10.0), at(b), v)
    st.audio["roll"] += voice_pocket(roll, -3.0)

    for b, size, v in ev["crash"]:
        place(st.audio["crash"], ins.crash(size), at(b), v)


# ----------------------------------------------------------------------------
# bass
# ----------------------------------------------------------------------------
def render_bass(ev, st: Stems):
    sub = np.zeros(N)
    for b0, b1, m, lvl in ev["sub"]:
        place(sub, ins.sub_note(m, sec(b1 - b0), attack=0.03, release=0.12), at(b0), lvl)
    st.audio["sub"] += to_stereo(sub)

    bass = np.zeros(N)
    for b, m, v, bright, long in ev["bass"]:
        place(bass, ins.bass_note(m, bright, long), at(b), v)
    bass = biquad(bass, "peak", 2400.0, 0.8, -5.0)
    bass = lp(bass, 3500.0, 2)
    st.audio["bass"] += to_stereo(bass)


# ----------------------------------------------------------------------------
# harmony, arp, lead, bells
# ----------------------------------------------------------------------------
def pad_cutoff():
    base = automation([(0.0, 800), (0.95, 950), (2.0, 1000), (2.95, 1150), (3.45, 2600), (3.5, 3000), (3.95, 1300),
                       (4.4, 1050), (6.95, 1100), (7.0, 1900), (7.7, 1500), (8.8, 1750), (9.0, 1500), (13.95, 1450),
                       (14.0, 2100), (15.0, 1550), (16.0, 1650), (16.95, 2500), (17.0, 2700), (17.7, 1650),
                       (23.4, 1650), (23.95, 2600), (24.0, 2800), (24.4, 1500), (24.95, 1500), (25.0, 2600),
                       (25.45, 1450), (28.4, 1450), (28.5, 1800), (30.0, 900)], log=True)
    t = tarr(N)
    lfo = 2.0 ** (0.22 * np.sin(2 * np.pi * 0.11 * t) + 0.1 * np.sin(2 * np.pi * 0.29 * t + 1.3))
    return base * lfo


def render_harmony(ev, st: Stems):
    pad = stereo()
    for i, (b0, b1, midis, lvl, attack, release) in enumerate(ev["pad"]):
        dur = sec(b1 - b0)
        for j, m in enumerate(midis):
            reg = 0.7 if m < 48 else (0.88 if m < 57 else 1.0)
            v = ins.pad_voice(m, dur, 6100 + 37 * i + j, attack=attack, release=release, detune=8.0)
            place(pad, v, at(b0), lvl * reg / np.sqrt(len(midis) / 4.0))
    pad = sweep_filter(pad, pad_cutoff(), "lp", q=0.7, stages=2, per_oct=4.0)
    pad = hp(pad, 105.0, 2)
    pad = biquad(pad, "peak", 330.0, 0.8, -2.5)
    pad = voice_pocket(pad, -4.0)
    st.audio["pad"] += width(pad, 1.35)

    # airy breath above the voice: inside the machine (3.5-9 s) and after the reveal
    air = stereo()
    a1 = fx.air_bed(6.2, 6300)
    place(air, a1, s2n(3.4), 1.0)
    a2 = fx.air_bed(5.6, 6301)
    place(air, a2, s2n(24.0), 0.8)
    st.audio["air"] += air


def render_arp(ev, st: Stems):
    arp = stereo()
    for b, m, v, bright, long in ev["arp"]:
        place(arp, ins.pluck(m, bright, long), at(b), v)
    arp = hp(arp, 150.0, 2)
    arp = voice_pocket(arp, -5.0, 2600.0, 0.6)
    arp = lp(arp, 5000.0, 2)
    arp = arp + 0.28 * ping_pong(arp, sec(0.75), fb=0.36, taps=5, lp_hz=2600.0, hp_hz=350.0)
    st.audio["arp"] += width(arp, 1.25)


def render_lead(ev, st: Stems):
    lead = stereo()
    for i, (b, d, m, v) in enumerate(sorted(ev["lead"])):
        pl = ins.pluck(m, 5, True)
        bell = ins.fm_bell(mtof(m), dur=sec(d) + 1.0, ratio=2.0, index=0.7, idx_tau=0.06, amp_tau=0.3 + 0.2 * sec(d))
        x = np.zeros((max(len(pl), len(bell)), 2))
        x[: len(pl)] += 0.9 * pl
        x[: len(bell)] += 0.45 * bell[:, None]
        place(lead, x, at(b), v, pan=(-0.15, 0.15)[i % 2])
    lead = hp(lead, 250.0, 2)
    lead = voice_pocket(lead, -2.5, 3000.0, 0.8)
    lead = lead + 0.32 * ping_pong(lead, sec(0.75), fb=0.42, taps=6, lp_hz=3200.0, hp_hz=400.0)
    st.audio["lead"] += width(lead, 1.15)


def render_bells(ev, st: Stems):
    bell = stereo()
    for i, (b, d, m, v) in enumerate(ev["bell"]):
        if b == CUE["question"]:
            x = fx.ping(m, dur=sec(d))
            place(st.audio["ping"], x, at(b), v, pan=0.0)
            # faint octave glint on top, a hair later: the "?" sparkle
            place(st.audio["sparkle"], ins.sparkle(mtof(m + 12), 0.25), at(b) + s2n(0.012), 0.35, pan=0.3)
        else:
            x = ins.fm_bell(mtof(m), dur=sec(d), ratio=2.0, index=1.0, idx_tau=0.06, amp_tau=0.28)
            place(bell, x, at(b), v, pan=(-0.3, 0.3, 0.0)[i % 3])
    bell = bell + 0.3 * ping_pong(bell, sec(0.75), fb=0.3, taps=3, lp_hz=3000.0, hp_hz=450.0, first=1)
    st.audio["bell"] += bell
    pg = st.audio["ping"]
    st.audio["ping"] = pg + 0.22 * ping_pong(pg, sec(0.75), fb=0.3, taps=3, lp_hz=2500.0, hp_hz=600.0, first=1)

    stab = stereo()
    for i, (b, midis, v, bright) in enumerate(ev["stab"]):
        place(stab, ins.chord_stab(midis, 3400 + 7 * i, dur=0.5, bright=bright), at(b), v)
    stab = hp(stab, 90.0, 2)
    stab = voice_pocket(stab, -5.0, 2600.0, 0.6)
    st.audio["stab"] += width(stab, 1.2)


def render_textures(ev, st: Stems):
    stream = stereo()
    for b, m, v, bright, pan in ev["stream"]:
        place(stream, ins.blip(mtof(m), bright, dur=0.07), at(b), v, pan=pan)
    stream = voice_pocket(stream, -4.0)
    stream = stream + 0.25 * ping_pong(stream, sec(0.375), fb=0.32, taps=4, lp_hz=9000.0, hp_hz=500.0)
    st.audio["stream"] += stream

    tk = stereo()
    for i, (t, kind, v, pan) in enumerate(ev["tick"]):
        place(tk, fx.clock_tick(kind, i % 3), s2n(t), v, pan=pan)
    st.audio["tick"] += tk

    rng = np.random.default_rng(77)
    ty = stereo()
    for t, v, pan in ev["typing"]:
        place(ty, fx.typing_tick(rng), s2n(t), v, pan=pan)
    st.audio["typing"] += ty

    sp = stereo()
    for t, m, v, pan, tau in ev["sparkle"]:
        place(sp, ins.sparkle(mtof(m), tau), s2n(t), v, pan=pan)
    st.audio["sparkle"] += voice_pocket(sp, -2.0)


# ----------------------------------------------------------------------------
# sound design on the cue sheet
# ----------------------------------------------------------------------------
def impact(st: Stems, beat: float, boom_kw: dict, boom_gain: float, air_gain: float, air_tau: float = 0.2,
           seed: int = 0, thud_gain: float = 0.5):
    s = at(beat)
    place(st.audio["boom"], ins.boom(**boom_kw), s, boom_gain)
    place(st.audio["boom"], ins.thud(seed + 1, fc=600.0), s, thud_gain)
    place(st.audio["impair"], ins.noise_burst(max(0.6, air_tau * 6), seed + 2, 1200.0, 10000.0, air_tau), s, air_gain)


def ends_at(x, beat: float) -> int:
    return at(beat) - len(x)


def render_fx(st: Stems):
    nm = lambda names: [n2m(x) for x in names]  # noqa: E731

    # 0.9 s: the finger presses the RJ45 latch (tiny)
    place(st.audio["mech"], fx.selector_click(899) * 0.12, s2n(0.9), 1.0)

    # 1.0 s UNPLUG: clack + zap + dying hum (+ the tape dip of the bed in tape_dip())
    s = at(CUE["unplug"])
    place(st.audio["mech"], fx.plug_clack(), s, 1.4)
    place(st.audio["zap"], fx.zap(), s + s2n(0.004), 1.6)
    place(st.audio["boom"], fx.power_down(0.45), s + s2n(0.006), 0.42)
    place(st.audio["impair"], ins.noise_burst(0.35, 905, 3000.0, 11000.0, 0.025), s, 0.5)

    # 3.0-3.5 s DIVE IN: soft "push" accent on 3.0, rising whoosh ending on 3.5 + reverse bloom of the Dm add9
    s = at(CUE["diveIn"])
    place(st.audio["boom"], ins.thud(3001, fc=450.0, tau=0.03), s, 0.5)
    place(st.audio["boom"], ins.boom(80.0, 50.0, 0.04, 0.12, 0.5, 1.0, 60.0), s, 0.35)
    place(st.audio["impair"], ins.noise_burst(0.3, 3002, 2500.0, 11000.0, 0.018), s, 0.9)
    r = fx.dive_riser(0.5, 301)
    place(st.audio["riser"], r, ends_at(r, CUE["inside"]) - s2n(0.012), 1.0)
    sw = ins.reverse_swell(0.5, 302, midis=nm(("D5", "A5", "E6")), noise_gain=0.5, tone_gain=1.0, hp_hz=400.0,
                           lp_hz=8000.0)
    place(st.audio["swell"], sw, ends_at(sw, CUE["inside"]) - s2n(0.016), 0.45)

    # 3.5 s INSIDE: soft impact + bloom (the neural network lights up; sparkles in the score)
    impact(st, CUE["inside"], dict(f_start=92.0, f_end=44.0, tau_p=0.06, tau_a=0.7, dur=2.4, drive=1.1, snap=100.0),
           0.55, 0.6, 0.2, seed=310, thud_gain=0.45)
    place(st.audio["shimmer"], ins.shimmer(nm(("D6", "A6", "E7", "F6", "A7")), 2.0, 311, attack=0.02, tau=0.45),
          at(CUE["inside"]), 1.0)

    # 7.0 s MODEL LOADED: clean confirm chime C6 -> F6 (on the first F major chord)
    s = at(CUE["modelLoaded"])
    place(st.audio["ui"], fx.chime(nm(("C6", "F6")), gaps_s=0.085, dur=1.5), s, 0.8)
    place(st.audio["boom"], ins.boom(125.0, 56.0, 0.03, 0.13, 0.6, 1.1, 110.0), s, 0.3)
    place(st.audio["impair"], ins.noise_burst(0.4, 701, 3000.0, 10000.0, 0.03), s, 0.4)

    # 8.5-9.0 s: reverse cymbal into the groove (voice gap)
    rc = ins.reverse_swell(0.5, 802, noise_gain=1.0, tone_gain=0.0, hp_hz=3000.0, lp_hz=11000.0)
    place(st.audio["swell"], rc, ends_at(rc, CUE["howStart"]) - s2n(0.015), 0.22)

    # 9.0 s HOW IT WORKS: groove impact + downlifter
    impact(st, CUE["howStart"], dict(f_start=115.0, f_end=46.0, tau_p=0.05, tau_a=0.45, dur=1.6, drive=1.3,
                                     snap=150.0), 0.6, 0.7, 0.16, seed=900)
    place(st.audio["downlift"], ins.downlifter(2.0, 901, f0=8000.0, f1=400.0), at(CUE["howStart"]), 0.8)

    # 14.0 s ANSWER: sparkle cascade (score) + shimmer bloom on F add9 + a small hit
    s = at(CUE["answer"])
    place(st.audio["shimmer"], ins.shimmer(nm(("F6", "A6", "C7", "G7", "E7")), 3.5, 1401, attack=0.01, tau=1.2), s, 1.0)
    place(st.audio["ui"], fx.chime(nm(("A6",)), dur=1.2, seed=1402), s, 0.45)
    place(st.audio["impair"], ins.noise_burst(0.5, 1403, 4000.0, 12000.0, 0.05), s, 0.6)

    # 16-17 s BUILD: noise riser + rising tone (filtered), ending just before 17.0
    dur = 1.0 - 0.06
    nr = apply_fades(ins.noise_riser(dur, 1600, f0=400.0, f1=8000.0, curve=1.6, q=1.4, air=0.3), 40.0, 15.0)
    place(st.audio["riser"], nr, at(CUE["privacy"]) - len(nr) - s2n(0.045), 0.9)
    tr = apply_fades(ins.tone_riser(dur, 1601, m0=n2m("C4"), m1=n2m("C6"), curve=1.4), 40.0, 15.0)
    tr = lp(tr, 1800.0, 2)
    place(st.audio["riser"], tr, at(CUE["privacy"]) - len(tr) - s2n(0.045), 0.45)

    # 17.0 s PRIVACY: lock click + impact
    s = at(CUE["privacy"])
    place(st.audio["mech"], fx.lock_click(), s, 1.0)
    impact(st, CUE["privacy"], dict(f_start=120.0, f_end=48.0, tau_p=0.045, tau_a=0.3, dur=1.0, drive=1.3,
                                    snap=160.0), 0.5, 0.6, 0.08, seed=1700, thud_gain=0.35)

    # 19.5 s OFFLINE: wifi-off blip (A6 -> D6) + light hit
    s = at(CUE["offline"])
    place(st.audio["ui"], fx.wifi_off(), s, 1.0, pan=0.1)
    impact(st, CUE["offline"], dict(f_start=110.0, f_end=50.0, tau_p=0.04, tau_a=0.22, dur=0.8, drive=1.2,
                                    snap=150.0), 0.38, 0.45, 0.06, seed=1950, thud_gain=0.3)

    # 22.0 s CONTROL: selector click + light hit
    s = at(CUE["control"])
    place(st.audio["mech"], fx.selector_click(), s, 1.35)
    impact(st, CUE["control"], dict(f_start=115.0, f_end=50.0, tau_p=0.04, tau_a=0.24, dur=0.8, drive=1.2,
                                    snap=150.0), 0.4, 0.5, 0.06, seed=2200, thud_gain=0.3)

    # 23.5-24.0 s FILL: reverse swell (tonal C add9 + noise) into the reveal
    sw = ins.reverse_swell(0.5, 2350, midis=nm(("C5", "G5", "D6", "E6")), noise_gain=0.8, tone_gain=1.0,
                           hp_hz=350.0, lp_hz=9000.0, rt_scale=1.0)
    place(st.audio["swell"], sw, ends_at(sw, CUE["reveal"]) - s2n(0.018), 0.7)

    # 24.0 s REVEAL: warm resolving impact on F (pad bloom in the score) + soft downlifter
    impact(st, CUE["reveal"], dict(f_start=100.0, f_end=43.6, tau_p=0.07, tau_a=0.8, dur=2.6, drive=1.25,
                                   snap=120.0), 0.8, 0.6, 0.28, seed=2400, thud_gain=0.6)
    place(st.audio["downlift"], ins.downlifter(1.6, 2401, f0=6000.0, f1=300.0), at(CUE["reveal"]), 0.6)
    place(st.audio["shimmer"], ins.shimmer(nm(("F5", "C6", "E6", "A6")), 1.5, 2402, attack=0.03, tau=0.3),
          at(CUE["reveal"]), 0.6)

    # 25.0 s TITLE: bright hit / shimmer (bell chord + sparkles in the score)
    s = at(CUE["title"])
    place(st.audio["shimmer"], ins.shimmer(nm(("C7", "F7", "A7", "C8", "F8")), 2.0, 2501, attack=0.008, tau=0.5),
          s, 0.9)
    place(st.audio["impair"], ins.noise_burst(0.8, 2502, 4500.0, 14000.0, 0.12), s, 0.9)
    place(st.audio["boom"], ins.boom(130.0, 52.0, 0.04, 0.3, 1.0, 1.2, 150.0), s, 0.38)

    # 28.5 s QUESTION: the ping is in the score (bells); a breath of air under it
    place(st.audio["impair"], ins.noise_burst(0.9, 2850, 5000.0, 12000.0, 0.2), at(CUE["question"]), 0.25)


# ----------------------------------------------------------------------------
# 1.0 s power-down: varispeed dip of the bed
# ----------------------------------------------------------------------------
def dip_curve():
    """(start sample, length, time axis, 0..1 shape) of the 1.0 s brown-out."""
    a = s2n(arr.CUE_BEATS["unplug"] * BEAT_S)
    n = s2n(0.64)
    tt = tarr(n)
    fall, hold, rise = 0.13, 0.04, 0.16
    shape = np.zeros(n)
    m = tt < fall
    shape[m] = 0.5 - 0.5 * np.cos(np.pi * tt[m] / fall)
    m = (tt >= fall) & (tt < fall + hold)
    shape[m] = 1.0
    m = (tt >= fall + hold) & (tt < fall + hold + rise)
    shape[m] = 0.5 + 0.5 * np.cos(np.pi * (tt[m] - fall - hold) / rise)
    return a, n, tt, shape


def tape_dip(st: Stems, names=("pad",)):
    """Brown-out on the unplug: the bed's playback rate sags to -6.5 semitones and recovers
    (~0.33 s), darkening and dipping in level; then it cross-fades back onto the grid."""
    a, n, tt, shape = dip_curve()
    rmin = 2.0 ** (-6.5 / 12.0)
    rate = 1.0 - (1.0 - rmin) * shape
    gain = db2lin(-7.0) ** shape
    fc = 14000.0 * (450.0 / 14000.0) ** (shape ** 0.8)
    xf = np.clip((tt - 0.38) / 0.24, 0.0, 1.0)
    xf = 0.5 - 0.5 * np.cos(np.pi * xf)
    xin = np.clip(tt / 0.008, 0.0, 1.0)                  # 8 ms entry cross-fade
    pre = 2048
    for name in names:
        x = st.audio[name]
        y, lag = fx.varispeed(x, a, n, rate)
        y = np.concatenate([x[a - pre:a], y], axis=0)
        fcp = np.concatenate([np.full(pre, fc[0]), fc])
        y = sweep_filter(y, fcp, "lp", q=0.75, per_oct=5.0)[pre:]
        y *= gain[:, None]
        orig = x[a:a + n].copy()
        w = (xin * (1.0 - xf))[:, None]
        x[a:a + n] = y * w + orig * (1.0 - w)
    return lag


# ----------------------------------------------------------------------------
# mix
# ----------------------------------------------------------------------------
def kick_ducking(ev):
    hard = [at(b) for b, kind, _ in ev["kick"] if kind != "soft"]
    soft = [at(b) for b, kind, _ in ev["kick"] if kind == "soft"]
    hard_env = sidechain_env(N, hard, depth=1.0, pre_ms=4.0, hold_ms=20.0, rel_ms=230.0, shape=1.6)
    soft_env = sidechain_env(N, soft, depth=1.0, pre_ms=4.0, hold_ms=20.0, rel_ms=260.0, shape=1.4)
    return np.minimum(hard_env, 1.0 - 0.45 * (1.0 - soft_env))


def mix_down(st: Stems, ev):
    duck = kick_ducking(ev)
    sends = {k: stereo() for k in RETURNS_DB}
    mix = stereo()
    for name, x in st.audio.items():
        c = st.cfg[name]
        y = x * c["gain"]
        if c["duck"] > 0:
            y = y * (1.0 - c["duck"] * (1.0 - duck))[:, None]
        for k, g in c["sends"].items():
            sends[k] += y * g
        mix += y
    irs = {"hall": make_ir(2.4, seed=13, predelay_ms=22.0, lo=260.0, hi=6000.0, hf_ratio=0.42),
           "room": make_ir(0.6, seed=15, predelay_ms=6.0, lo=300.0, hi=8000.0, hf_ratio=0.5),
           "big": make_ir(4.0, seed=19, predelay_ms=30.0, lo=220.0, hi=6500.0, hf_ratio=0.45)}
    hall = reverb(sends["hall"], irs["hall"]) * db2lin(RETURNS_DB["hall"])
    hall *= (1.0 - 0.3 * (1.0 - duck))[:, None]
    a, n_, _, shape = dip_curve()                      # the pad's tail dips with the brown-out too
    hall[a:a + n_] *= (db2lin(-6.0) ** shape)[:, None]
    room = reverb(sends["room"], irs["room"]) * db2lin(RETURNS_DB["room"])
    big = reverb(sends["big"], irs["big"]) * db2lin(RETURNS_DB["big"])
    wet = voice_pocket(hall + room + big, -3.0)
    return (mix + wet) * pre_cue_dips()[:, None]


def pre_cue_dips():
    """Short suck-backs right before the hits that follow a riser / swell, so they land on a clean
    transient: (cue beat, depth dB, length s). The level comes back in 1.5 ms exactly on the cue."""
    env = np.ones(N)
    for beat, depth_db, length in ((CUE["privacy"], -10.0, 0.05), (CUE["reveal"], -8.0, 0.035)):
        c = at(beat)
        a = c - s2n(length)
        k = s2n(0.02)
        g = db2lin(depth_db)
        seg = np.full(c - a, g)
        seg[:k] = 1.0 - (1.0 - g) * (0.5 - 0.5 * np.cos(np.pi * (np.arange(k) + 0.5) / k))
        env[a:c] = np.minimum(env[a:c], seg)
        r = s2n(0.0015)
        env[c:c + r] = np.minimum(env[c:c + r], g + (1.0 - g) * (np.arange(r) + 0.5) / r)
    return env


# ----------------------------------------------------------------------------
# master (adapted from audio/synth.py)
# ----------------------------------------------------------------------------
def tp_limiter(x, ceiling_db: float, lookahead_ms: float = 2.5, release_ms: float = 90.0, os_: int = 4):
    """Look-ahead limiter driven by the 4x oversampled (true) peak of the signal."""
    up = signal.resample_poly(x, os_, 1, axis=0)
    pk = np.max(np.abs(up), axis=1)
    pk = pk[: len(x) * os_].reshape(len(x), os_).max(axis=1)
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
    m = 0.5 * (y[:, 0] + y[:, 1])
    s = hp(0.5 * (y[:, 0] - y[:, 1]), 140.0, 2)
    y = np.stack([m + s, m - s], axis=1)
    y = biquad(y, "loshelf", 110.0, 0.7, 1.0)
    y = voice_pocket(y, -2.0, 2500.0, 0.6)
    y = biquad(y, "hishelf", 9500.0, 0.7, 1.0)
    y *= db2lin(-17.0 - lufs_integrated(y))
    y = soft_sat(y, 1.2)
    t = tarr(N)
    env = np.clip((t - 0.012) / 0.08, 0.0, 1.0)
    env = env * env * (3 - 2 * env)
    u = np.clip((t - FADE_START_S) / (SILENT_FROM_S - FADE_START_S), 0.0, 1.0)
    env *= (0.5 + 0.5 * np.cos(np.pi * u)) ** 1.5
    env[t >= SILENT_FROM_S] = 0.0
    y *= env[:, None]
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


def to_int16(x, env, seed: int = 2402):
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
    lag = tape_dip(st)
    if verbose:
        print(f"stems rendered in {time.time() - t0:.1f} s (tape dip lag {lag / SR * 1000:.0f} ms before the "
              f"cross-fade back)")
    mix = mix_down(st, ev)
    out, gr, env = master_bus(mix)
    if verbose:
        print(f"mixed + mastered in {time.time() - t0:.1f} s")
    return out, gr, env, st


SECS = [("hook", 0, 1), ("unplug", 1, 3), ("dive", 3, 3.5), ("inside", 3.5, 9), ("how", 9, 16), ("build", 16, 17),
        ("benef", 17, 24), ("reveal", 24, 28.5), ("quest", 28.5, 29)]


def stem_report(st: Stems):
    print(f"{'stem':9s}" + "".join(f"{n:>8s}" for n, _, _ in SECS) + "  1-4k%")
    from dsp import k_weight
    for name, x in st.audio.items():
        y = x * st.cfg[name]["gain"]
        kw = np.sum(k_weight(y) ** 2, axis=1)
        vals = [-0.691 + 10.0 * np.log10(max(np.mean(kw[s2n(a):s2n(b)]), 1e-12)) for _, a, b in SECS]
        f, p = signal.welch(y.mean(axis=1), fs=SR, nperseg=4096)
        share = np.sum(p[(f >= 1000) & (f < 4000)]) / (np.sum(p) + 1e-30) * 100
        print(f"{name:9s}" + "".join(f"{v:8.1f}" if v > -60 else f"{'':8s}" for v in vals) + f"  {share:5.1f}")


def main():
    out, gr, env, st = render()
    if "--stems" in sys.argv:
        stem_report(st)
    pcm = to_int16(out, env)
    os.makedirs(os.path.dirname(OUT_WAV), exist_ok=True)
    wavfile.write(OUT_WAV, SR, pcm)
    f = pcm.astype(np.float64) / 32768.0
    print(f"wrote {OUT_WAV}: {len(pcm)} samples x {pcm.shape[1]} ch @ {SR} Hz, 16-bit")
    print(f"integrated {lufs_integrated(f):.2f} LUFS, true peak {lin2db(true_peak(f)):.2f} dBTP, "
          f"max limiter gain reduction {lin2db(gr.min()):.1f} dB")
    for name, a, b in SECS + [("fade", 29, 30)]:
        print(f"   {name:8s} {a:5.1f}-{b:4.1f} s  {lufs_window(f, a, b):6.1f} LUFS (ungated)")


if __name__ == "__main__":
    main()
