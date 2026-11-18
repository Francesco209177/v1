#!/usr/bin/env python3
"""Procedural music bed for Video 01 ("Come funziona davvero ChatGPT?")  ->  public/v01/music.wav

    cd <project root> && python3 audio/v01/synth_v01.py [--stems]

Reuses the shared engine (audio/dsp.py, audio/instruments.py, unchanged) plus the v01 score
(arrangement_v01.py) and sound design (sfx_v01.py). numpy + scipy only, no samples, fully
deterministic (every random generator is seeded): two runs produce a bit-identical file.

This is a BED UNDER A NARRATOR: an external mixer ducks it ~8 dB under the voice. The 1-4 kHz
band is kept clear (filtered pads / arps, hats above 7 kHz, sound design mostly above 4 kHz, a
voice-pocket EQ on the music stems and on the master); melodic material only in the voice gaps.

Signal flow
-----------
arrangement_v01.build()   every note / drum / FX event, in beats
      |
render_*()                one stereo stem per instrument + per-stem EQ, ping-pong delay, width
sidechain                 kick-triggered ducking (sub, bass, pulse, pad, arp, hall return)
sends                     hall (2.6 s), room (0.6 s), big (4.2 s) convolution reverbs
pre-cue dips              short suck-backs so the hits after a riser / swell land on a clean transient
      |
master                    HP 28 Hz, mono lows, voice-pocket dip, tanh glue, true-peak limiter,
                          loudness loop to -14 LUFS, fade to digital silence, TPDF dither, 16 bit
"""
from __future__ import annotations

import os
import sys
import time

sys.dont_write_bytecode = True
HERE = os.path.dirname(os.path.abspath(__file__))          # audio/v01
AUDIO = os.path.dirname(HERE)                               # audio (shared engine)
ROOT = os.path.dirname(AUDIO)
for _p in (AUDIO, HERE):
    if _p not in sys.path:
        sys.path.insert(0, _p)

import numpy as np  # noqa: E402
from scipy import signal  # noqa: E402
from scipy.io import wavfile  # noqa: E402
from scipy.ndimage import minimum_filter1d, uniform_filter1d  # noqa: E402

import arrangement_v01 as arr  # noqa: E402
import instruments as ins  # noqa: E402
import sfx_v01 as fx  # noqa: E402
from dsp import (BEAT_S, N, SR, apply_fades, automation, b2s, biquad, db2lin, hp, lin2db, lp,  # noqa: E402
                 lufs_integrated, lufs_window, make_ir, mtof, n2m, ping_pong, place, reverb, s2n, sidechain_env,
                 soft_sat, sweep_filter, tarr, to_stereo, true_peak, width)

OUT_WAV = os.path.join(ROOT, "public", "v01", "music.wav")

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
    "snap":     (-15.5, 0.00, {"room": 0.30, "hall": 0.08}, "drums"),
    "hats":     (-18.0, 0.00, {"room": 0.10}, "drums"),
    "shaker":   (-25.0, 0.00, {"room": 0.10}, "drums"),
    "roll":     (-17.0, 0.00, {"room": 0.25, "hall": 0.08}, "drums"),
    "crash":    (-21.5, 0.00, {"hall": 0.15}, "drums"),
    "sub":      (-15.0, 0.90, {}, "bass"),
    "bass":     (-11.5, 0.55, {}, "bass"),
    "pulse":    (-13.0, 0.35, {"hall": 0.12}, "bass"),
    "pad":      (-21.0, 0.35, {"hall": 0.30}, "music"),
    "air":      (-31.0, 0.00, {"hall": 0.20}, "music"),
    "breath":   (-24.0, 0.00, {"hall": 0.15}, "music"),
    "arp":      (-13.5, 0.30, {"hall": 0.25}, "music"),
    "lead":     (-14.0, 0.10, {"hall": 0.30}, "music"),
    "bell":     (-15.0, 0.00, {"hall": 0.25, "big": 0.08}, "music"),
    "ping":     (-14.0, 0.00, {"hall": 0.30, "big": 0.18}, "music"),
    "glitch":   (-24.0, 0.00, {"room": 0.25}, "fx"),
    "stab":     (-15.5, 0.00, {"hall": 0.25}, "music"),
    "stream":   (-20.0, 0.00, {"hall": 0.25}, "music"),
    "vector":   (-16.0, 0.00, {"hall": 0.20}, "fx"),
    "probs":    (-18.5, 0.00, {"hall": 0.25}, "fx"),
    "token":    (-19.0, 0.00, {"room": 0.15}, "fx"),
    "typing":   (-24.5, 0.00, {"room": 0.10}, "fx"),
    "send":     (-19.0, 0.00, {"hall": 0.30}, "fx"),
    "sparkle":  (-21.0, 0.00, {"hall": 0.40}, "fx"),
    "shatter":  (-15.0, 0.00, {"room": 0.20, "hall": 0.15}, "fx"),
    "rush":     (-17.0, 0.00, {"hall": 0.20}, "fx"),
    "whoosh":   (-13.0, 0.00, {"hall": 0.25}, "fx"),
    "boom":     (-9.5, 0.00, {}, "fx"),
    "impair":   (-19.0, 0.00, {"big": 0.55}, "fx"),
    "shimmer":  (-22.0, 0.00, {"big": 0.40}, "fx"),
    "riser":    (-14.0, 0.00, {"hall": 0.20}, "fx"),
    "swell":    (-9.0, 0.00, {}, "fx"),
    "downlift": (-23.0, 0.00, {"hall": 0.20}, "fx"),
    "mech":     (-13.0, 0.00, {"room": 0.18}, "fx"),
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
# bass + pulse
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

    # the mysterious pulse 3-9 s: dark 8ths whose low-pass opens with the scene
    pulse = np.zeros(N)
    for b, m, v, bright, off in ev["pulse"]:
        place(pulse, ins.bass_note(m, bright, not off), at(b), v)
    fc = automation([(0.0, 500.0), (3.0, 520.0), (6.0, 800.0), (7.5, 1000.0), (9.0, 1300.0), (30.0, 1300.0)], log=True)
    pulse = sweep_filter(pulse, fc, "lp", q=0.9, per_oct=4.0)
    pulse = hp(pulse, 70.0, 2)
    pst = to_stereo(pulse)
    pst = pst + 0.22 * ping_pong(pst, sec(0.75), fb=0.35, taps=4, lp_hz=1400.0, hp_hz=200.0)
    st.audio["pulse"] += width(pst, 1.1)


# ----------------------------------------------------------------------------
# harmony, arp, lead, bells
# ----------------------------------------------------------------------------
def pad_cutoff():
    base = automation([(0.0, 450), (1.4, 600), (1.95, 700), (2.9, 1100), (3.0, 2400), (3.6, 1150), (5.95, 1000),
                       (6.0, 1700), (6.6, 1100), (7.45, 1150), (7.5, 1800), (8.2, 1300), (8.95, 1450), (9.0, 1600),
                       (11.95, 1400), (12.0, 2500), (12.8, 1500), (14.9, 1500), (15.95, 2100), (16.0, 2500),
                       (16.7, 1550), (22.95, 1550), (23.0, 2800), (23.7, 1500), (25.95, 1600), (26.0, 3000),
                       (26.7, 1500), (27.95, 1350), (28.0, 1800), (28.6, 1250), (30.0, 800)], log=True)
    t = tarr(N)
    lfo = 2.0 ** (0.22 * np.sin(2 * np.pi * 0.11 * t) + 0.1 * np.sin(2 * np.pi * 0.29 * t + 1.3))
    return base * lfo


def render_harmony(ev, st: Stems):
    pad = stereo()
    for i, (b0, b1, midis, lvl, attack, release) in enumerate(ev["pad"]):
        dur = sec(b1 - b0)
        for j, m in enumerate(midis):
            reg = 0.7 if m < 48 else (0.88 if m < 57 else 1.0)
            v = ins.pad_voice(m, dur, 7100 + 37 * i + j, attack=attack, release=release, detune=8.0)
            place(pad, v, at(b0), lvl * reg / np.sqrt(len(midis) / 4.0))
    pad = sweep_filter(pad, pad_cutoff(), "lp", q=0.7, stages=2, per_oct=4.0)
    pad = hp(pad, 90.0, 2)
    pad = biquad(pad, "peak", 330.0, 0.8, -2.5)
    pad = voice_pocket(pad, -4.0)
    st.audio["pad"] += width(pad, 1.35)

    # airy breath above the voice (inside the machine 2.9-9.2 s, after the training reveal) and a dark
    # low breath under the inside scene: the mystery
    air = stereo()
    place(air, fx.air_bed(6.4, 7300), s2n(2.9), 1.0)
    place(air, fx.air_bed(6.6, 7301), s2n(23.0), 0.8)
    st.audio["air"] += air
    br = stereo()
    place(br, fx.low_breath(6.4, 7302, fc=180.0), s2n(2.9), 1.0)
    place(br, fx.low_breath(4.0, 7303, fc=160.0), s2n(0.0), 0.55)
    st.audio["breath"] += br


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
        x = ins.fm_bell(mtof(m), dur=sec(d), ratio=2.0, index=1.0, idx_tau=0.06, amp_tau=0.28)
        place(bell, x, at(b), v, pan=(-0.3, 0.3, 0.0)[i % 3])
    bell = bell + 0.3 * ping_pong(bell, sec(0.75), fb=0.3, taps=3, lp_hz=3000.0, hp_hz=450.0, first=1)
    st.audio["bell"] += bell

    stab = stereo()
    for i, (b, midis, v, bright) in enumerate(ev["stab"]):
        place(stab, ins.chord_stab(midis, 4400 + 7 * i, dur=0.5, bright=bright), at(b), v)
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

    vec = stereo()
    for b, m, v, bright, pan in ev["vector"]:
        place(vec, ins.blip(mtof(m), bright, dur=0.06), at(b), v, pan=pan)
    vec = voice_pocket(vec, -3.0)
    vec = vec + 0.22 * ping_pong(vec, sec(0.375), fb=0.3, taps=3, lp_hz=9000.0, hp_hz=800.0)
    st.audio["vector"] += vec

    pr = stereo()
    for b, m, v, bright, pan in ev["probs"]:
        place(pr, ins.blip(mtof(m), bright, dur=0.075), at(b), v, pan=pan)
    pr = voice_pocket(pr, -2.0)
    pr = pr + 0.25 * ping_pong(pr, sec(0.25), fb=0.3, taps=3, lp_hz=9000.0, hp_hz=800.0)
    st.audio["probs"] += pr

    tk = stereo()
    for i, (b, m, v, accent, pan) in enumerate(ev["token"]):
        place(tk, fx.token_tick(m, accent, i % 3), at(b), v, pan=pan)
    st.audio["token"] += tk

    rng = np.random.default_rng(78)
    ty = stereo()
    for t, kind, v, pan in ev["typing"]:
        place(ty, fx.typing_tick(rng, kind), s2n(t), v, pan=pan)
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


def shimmer2(st: Stems, beat: float, low, high, dur: float, seed: int, attack: float, tau: float, gain: float = 1.0):
    """Shimmer bloom split around the voice band: chord partials below 1 kHz + glitter above 4 kHz."""
    nm = [n2m(x) for x in low]
    hi = [n2m(x) for x in high]
    place(st.audio["shimmer"], ins.shimmer(nm, dur, seed, attack=attack, tau=tau), at(beat), 0.8 * gain)
    place(st.audio["shimmer"], ins.shimmer(hi, dur, seed + 1, attack=attack * 0.5, tau=tau * 0.4), at(beat), 0.6 * gain)


def ends_at(x, beat: float) -> int:
    return at(beat) - len(x)


def render_fx(st: Stems):
    nm = lambda names: [n2m(x) for x in names]  # noqa: E731

    # 1.5 s QUESTION DONE: the "send" accent
    s = at(CUE["questionDone"])
    place(st.audio["send"], fx.send_accent(), s, 1.0, pan=0.05)
    place(st.audio["impair"], ins.noise_burst(0.3, 1501, 4000.0, 11000.0, 0.02), s, 0.35)

    # 2.0-3.0 s DIVE IN: soft "push" on 2.0, rising whoosh ending on 3.0 + reverse bloom of the Em9
    s = at(CUE["diveIn"])
    place(st.audio["boom"], ins.thud(2001, fc=450.0, tau=0.03), s, 0.45)
    place(st.audio["boom"], ins.boom(80.0, 50.0, 0.04, 0.12, 0.5, 1.0, 60.0), s, 0.3)
    place(st.audio["impair"], ins.noise_burst(0.3, 2002, 2500.0, 11000.0, 0.018), s, 0.85)
    r = fx.dive_riser(1.0 - 0.012, 201, f0=250.0, f1=7500.0, start_g=0.4)
    place(st.audio["riser"], voice_pocket(r, -6.0, 2300.0, 0.6), s, 0.95)
    sw = ins.reverse_swell(0.6, 202, midis=nm(("E5", "B5", "F#6")), noise_gain=0.5, tone_gain=1.0, hp_hz=400.0,
                           lp_hz=8000.0)
    place(st.audio["swell"], sw, ends_at(sw, CUE["inside"]) - s2n(0.016), 0.42)

    # 3.0 s INSIDE: soft impact + airy bloom (pad bloom, sparkles, air + low breath in the score)
    impact(st, CUE["inside"], dict(f_start=92.0, f_end=41.2, tau_p=0.06, tau_a=0.7, dur=2.4, drive=1.1, snap=100.0),
           0.55, 0.6, 0.22, seed=300, thud_gain=0.45)
    shimmer2(st, CUE["inside"], ("E5", "B5"), ("E8", "F#8", "G8", "B8"), 2.4, 301, attack=0.02, tau=0.55)

    # 6.0 s SPLIT: the sentence shatters into tokens
    s = at(CUE["split"])
    place(st.audio["shatter"], fx.shatter(), s, 1.0)
    place(st.audio["boom"], ins.boom(120.0, 55.0, 0.03, 0.12, 0.6, 1.1, 120.0), s, 0.3)
    place(st.audio["impair"], ins.noise_burst(0.4, 601, 5000.0, 13000.0, 0.03), s, 0.4)

    # 7.5 s INTO THE NETWORK: dive whoosh
    s = at(CUE["intoNet"])
    place(st.audio["whoosh"], fx.dive_down(), s, 1.0)

    # 8.5-9.0 s: reverse cymbal into the groove
    rc = ins.reverse_swell(0.5, 802, noise_gain=1.0, tone_gain=0.0, hp_hz=3000.0, lp_hz=11000.0)
    place(st.audio["swell"], rc, ends_at(rc, CUE["groove"]) - s2n(0.015), 0.2)

    # 9.0 s ATTENTION SCENE: groove impact + downlifter
    impact(st, CUE["groove"], dict(f_start=115.0, f_end=46.0, tau_p=0.05, tau_a=0.45, dur=1.6, drive=1.3,
                                   snap=150.0), 0.55, 0.6, 0.16, seed=900)
    place(st.audio["downlift"], ins.downlifter(2.0, 901, f0=8000.0, f1=400.0), at(CUE["groove"]), 0.8)

    # 10.0 s VECTORS: the blip burst is in the score; a short bright data "spray" marks the downbeat
    place(st.audio["impair"], ins.noise_burst(0.3, 1001, 6000.0, 14000.0, 0.015), at(CUE["vectors"]), 0.55)

    # 11.5-12.0 s + 12.0 s ATTENTION: shimmering chord swell on Cmaj7#11
    sw = ins.reverse_swell(0.5, 1150, midis=nm(("B5", "E6", "F#6", "G6")), noise_gain=0.6, tone_gain=1.0,
                           hp_hz=600.0, lp_hz=10000.0)
    place(st.audio["swell"], sw, ends_at(sw, CUE["attention"]) - s2n(0.015), 0.3)
    s = at(CUE["attention"])
    shimmer2(st, CUE["attention"], ("E5", "G5"), ("F#8", "G8", "B8", "E9"), 3.0, 1201, attack=0.01, tau=1.0, gain=1.1)
    place(st.audio["impair"], ins.noise_burst(0.5, 1202, 4500.0, 12000.0, 0.05), s, 0.5)

    # 15-16 s BUILD: noise riser + rising tone (filtered), ending just before 16.0
    dur = 1.0 - 0.06
    nr = apply_fades(ins.noise_riser(dur, 1500, f0=400.0, f1=8000.0, curve=1.6, q=1.4, air=0.3), 40.0, 15.0)
    place(st.audio["riser"], nr, at(CUE["predict"]) - len(nr) - s2n(0.045), 0.9)
    tr = apply_fades(ins.tone_riser(dur, 1501, m0=n2m("B3"), m1=n2m("B5"), curve=1.4), 40.0, 15.0)
    tr = lp(tr, 1800.0, 2)
    place(st.audio["riser"], tr, at(CUE["predict"]) - len(tr) - s2n(0.045), 0.42)

    # 16.0 s PREDICT: impact (the rising probability blips are in the score)
    impact(st, CUE["predict"], dict(f_start=120.0, f_end=41.2, tau_p=0.05, tau_a=0.5, dur=1.6, drive=1.3,
                                    snap=160.0), 0.62, 0.65, 0.12, seed=1600, thud_gain=0.4)
    place(st.audio["downlift"], ins.downlifter(1.4, 1601, f0=7000.0, f1=500.0), at(CUE["predict"]), 0.55)

    # 17.5 s PICK: select / lock accent + light hit
    s = at(CUE["pick"])
    place(st.audio["mech"], fx.select_lock(), s, 1.0)
    impact(st, CUE["pick"], dict(f_start=115.0, f_end=50.0, tau_p=0.04, tau_a=0.22, dur=0.8, drive=1.2,
                                 snap=150.0), 0.36, 0.45, 0.06, seed=1750, thud_gain=0.3)

    # 20.0 s LOOP: the accented token tick is in the score; a small hit + an upward "append" blip
    s = at(CUE["loop"])
    impact(st, CUE["loop"], dict(f_start=110.0, f_end=49.0, tau_p=0.04, tau_a=0.24, dur=0.8, drive=1.2,
                                 snap=150.0), 0.36, 0.45, 0.06, seed=2000, thud_gain=0.3)
    place(st.audio["mech"], fx.tone(mtof(n2m("D8")), 0.25, 0.05, glide_semis=5.0, h2=0.1, h3=0.0), s + s2n(0.03),
          0.22, pan=0.2)

    # 22.5-23.0 s FILL: reverse swell (tonal D add9 + noise) into the training reveal
    sw = ins.reverse_swell(0.5, 2250, midis=nm(("D5", "A5", "E6", "F#6")), noise_gain=0.8, tone_gain=1.0,
                           hp_hz=350.0, lp_hz=9000.0, rt_scale=1.0)
    place(st.audio["swell"], sw, ends_at(sw, CUE["training"]) - s2n(0.018), 0.62)

    # 23.0 s TRAINING / REVEAL: big warm impact on Cmaj9 + the dense data stream fading under the voice
    s = at(CUE["training"])
    impact(st, CUE["training"], dict(f_start=100.0, f_end=49.0, tau_p=0.07, tau_a=0.8, dur=2.6, drive=1.25,
                                     snap=120.0), 0.78, 0.6, 0.28, seed=2300, thud_gain=0.6)
    place(st.audio["downlift"], ins.downlifter(1.8, 2301, f0=6000.0, f1=300.0), s, 0.6)
    shimmer2(st, CUE["training"], ("C5", "G5"), ("C8", "E8", "G8", "D8"), 1.8, 2302, attack=0.03, tau=0.35, gain=0.6)
    place(st.audio["rush"], fx.data_rush(3.6, 2303, midis=nm(("C8", "E8", "G8", "B8", "D8", "G7", "B7"))), s, 1.0)

    # 25.5-26.0 s: reverse swell (D chord + noise) into the title
    sw = ins.reverse_swell(0.5, 2550, midis=nm(("D5", "A5", "D6", "F#6")), noise_gain=0.7, tone_gain=0.9,
                           hp_hz=400.0, lp_hz=10000.0, rt_scale=1.0)
    place(st.audio["swell"], sw, ends_at(sw, CUE["title"]) - s2n(0.018), 0.5)

    # 26.0 s TITLE "NON PENSA. PREVEDE.": the strongest, resolved hit on the tonic + shimmer
    s = at(CUE["title"])
    impact(st, CUE["title"], dict(f_start=105.0, f_end=41.2, tau_p=0.07, tau_a=0.9, dur=2.8, drive=1.35,
                                  snap=140.0), 0.92, 0.75, 0.3, seed=2600, thud_gain=0.7)
    shimmer2(st, CUE["title"], ("E5", "G5", "B4"), ("E8", "G8", "B8", "F#8", "E9"), 2.2, 2601, attack=0.008, tau=0.6)
    place(st.audio["impair"], ins.noise_burst(0.8, 2602, 4500.0, 14000.0, 0.12), s, 0.8)
    place(st.audio["downlift"], ins.downlifter(1.8, 2603, f0=7000.0, f1=300.0), s, 0.55)

    # 28.0 s CAVEAT "puo' sbagliare": detuned, sagging F#6 ping (the #11 of C) + a gentle glitch
    s = at(CUE["caveat"])
    pg = fx.caveat_ping(n2m("F#5"), 2.2)
    pg = voice_pocket(pg, -4.0, 2600.0, 0.7)
    pg = pg + 0.22 * ping_pong(pg, sec(0.75), fb=0.3, taps=3, lp_hz=2000.0, hp_hz=500.0, first=1)
    place(st.audio["ping"], pg, s, 1.0)
    place(st.audio["glitch"], fx.glitch(fx.caveat_ping(n2m("F#8"), 0.3, 2811), hp_hz=4200.0), s, 1.0)
    place(st.audio["sparkle"], ins.sparkle(mtof(n2m("F#8")), 0.22), s + s2n(0.012), 0.35, pan=0.3)
    place(st.audio["impair"], ins.noise_burst(0.9, 2801, 5000.0, 12000.0, 0.15), s, 0.25)


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
    irs = {"hall": make_ir(2.6, seed=23, predelay_ms=22.0, lo=260.0, hi=6000.0, hf_ratio=0.42),
           "room": make_ir(0.6, seed=25, predelay_ms=6.0, lo=300.0, hi=8000.0, hf_ratio=0.5),
           "big": make_ir(4.2, seed=29, predelay_ms=30.0, lo=220.0, hi=6500.0, hf_ratio=0.45)}
    hall = reverb(sends["hall"], irs["hall"]) * db2lin(RETURNS_DB["hall"])
    hall *= (1.0 - 0.3 * (1.0 - duck))[:, None]
    room = reverb(sends["room"], irs["room"]) * db2lin(RETURNS_DB["room"])
    big = reverb(sends["big"], irs["big"]) * db2lin(RETURNS_DB["big"])
    wet = voice_pocket(hall + room + big, -3.0)
    return (mix + wet) * pre_cue_dips()[:, None]


PRE_DIPS = (("inside", -8.0, 0.04), ("predict", -10.0, 0.05), ("fill", -6.0, 0.03), ("training", -8.0, 0.035),
            ("title", -9.0, 0.035))


def pre_cue_dips():
    """Short suck-backs right before the hits that follow a riser / swell, so they land on a clean
    transient: (cue, depth dB, length s). The level comes back in 1.5 ms exactly on the cue."""
    env = np.ones(N)
    for cue, depth_db, length in PRE_DIPS:
        c = at(CUE[cue])
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
# master (adapted from audio/v02/synth_v02.py)
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


def to_int16(x, env, seed: int = 2401):
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


SECS = [("hook", 0, 2), ("dive", 2, 3), ("inside", 3, 6), ("tokens", 6, 9), ("attn", 9, 15), ("build", 15, 16),
        ("predict", 16, 23), ("train", 23, 26), ("title", 26, 28), ("caveat", 28, 29)]


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
    print("   limiter gain reduction around the hits (dB, 0-300 ms): " + "  ".join(
        f"{c}@{CUE[c] / 2:g}s {lin2db(gr[at(CUE[c]):at(CUE[c]) + s2n(0.3)].min()):.1f}"
        for c in ("inside", "groove", "attention", "predict", "pick", "loop", "training", "title", "caveat")))
    for name, a, b in SECS + [("fade", 29, 30)]:
        print(f"   {name:8s} {a:5.1f}-{b:4.1f} s  {lufs_window(f, a, b):6.1f} LUFS (ungated)")


if __name__ == "__main__":
    main()
