#!/usr/bin/env python3
"""Procedural music bed for Video 04 ("Phishing: come possono rubarti le credenziali?")  ->  public/v04/music.wav

    cd <project root> && python3 audio/v04/synth_v04.py [--stems]

Reuses the shared engine (audio/dsp.py, audio/instruments.py, unchanged) plus the v04 score
(arrangement_v04.py) and sound design (sfx_v04.py). numpy + scipy only, no samples, fully
deterministic (every random generator is seeded): two runs produce a bit-identical file.

A cinematic cybersecurity thriller under a narrator (an external mixer ducks it ~8 dB under the
voice): tense, dark and pulsing in C minor for the threat (0-16 s), confident and protective in Eb
major for the defence (17-29 s), resolving at the end. The 1-4 kHz band is kept clear (filtered
pads / pulses, hats and glitches above 4-7 kHz, a voice-pocket EQ on the music stems and on the
master); melodic hooks only in the voice gaps.

Signal flow
-----------
arrangement_v04.build()   every note / drum / FX event, in beats
      |
render_*()                one stereo stem per instrument + per-stem EQ, ping-pong delay, width
tape_stop()               16.0 s: the threat groove slows to a halt (~0.42 s varispeed + closing LP)
sidechain                 kick-triggered ducking (sub, bass, pulse, pad, arp, hall return)
sends                     hall (2.4 s), room (0.6 s), big (4.0 s) convolution reverbs
pre-cue dips              short suck-backs so the big hits land on a clean transient
      |
master                    HP 28 Hz, mono lows, voice-pocket dip, tanh glue, true-peak limiter,
                          loudness loop to -14 LUFS, fade to digital silence, TPDF dither, 16 bit
"""
from __future__ import annotations

import os
import sys
import time

sys.dont_write_bytecode = True
HERE = os.path.dirname(os.path.abspath(__file__))          # audio/v04
AUDIO = os.path.dirname(HERE)                               # audio (shared engine)
ROOT = os.path.dirname(AUDIO)
for _p in (AUDIO, HERE):
    if _p not in sys.path:
        sys.path.insert(0, _p)

import numpy as np  # noqa: E402
from scipy import signal  # noqa: E402
from scipy.io import wavfile  # noqa: E402
from scipy.ndimage import minimum_filter1d, uniform_filter1d  # noqa: E402

import arrangement_v04 as arr  # noqa: E402
import instruments as ins  # noqa: E402
import sfx_v04 as fx  # noqa: E402
from dsp import (BEAT_S, N, SR, apply_fades, automation, b2s, biquad, db2lin, hp, lin2db, lp,  # noqa: E402
                 lufs_integrated, lufs_window, make_ir, mtof, n2m, ping_pong, place, reverb, s2n, saw,
                 sidechain_env, soft_sat, sweep_filter, tarr, to_stereo, true_peak, width)

OUT_WAV = os.path.join(ROOT, "public", "v04", "music.wav")

TARGET_LUFS = -14.0
TP_CEILING_DB = -1.9         # limiter ceiling on the 4x oversampled signal (spec: <= -1.5 dBTP after dither)
FADE_START_S = 29.0
SILENT_FROM_S = 29.94
CUE = arr.CUE_BEATS
TAPE_STOP_S = 16.0
TAPE_STOP_LEN = 0.42


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
    "snap":     (-17.0, 0.00, {"room": 0.30, "hall": 0.08}, "drums"),
    "hats":     (-18.0, 0.00, {"room": 0.10}, "drums"),
    "shaker":   (-25.0, 0.00, {"room": 0.10}, "drums"),
    "roll":     (-17.0, 0.00, {"room": 0.25, "hall": 0.08}, "drums"),
    "crash":    (-21.0, 0.00, {"hall": 0.15}, "drums"),
    "sub":      (-15.0, 0.90, {}, "bass"),
    "bass":     (-12.0, 0.55, {}, "bass"),
    "heart":    (-11.0, 0.00, {}, "bass"),
    "drone":    (-17.0, 0.00, {"hall": 0.20}, "music"),
    "pulse":    (-15.0, 0.45, {"hall": 0.15}, "music"),
    "hookpulse": (-18.0, 0.00, {"hall": 0.10}, "music"),
    "pad":      (-21.0, 0.35, {"hall": 0.30}, "music"),
    "alarm":    (-19.0, 0.00, {"hall": 0.30}, "music"),
    "breath":   (-22.0, 0.00, {}, "music"),
    "air":      (-31.0, 0.00, {"hall": 0.20}, "music"),
    "arp":      (-14.0, 0.30, {"hall": 0.25}, "music"),
    "lead":     (-14.0, 0.10, {"hall": 0.30}, "music"),
    "flourish": (-16.0, 0.00, {"hall": 0.35}, "music"),
    "bell":     (-15.0, 0.00, {"hall": 0.25, "big": 0.08}, "music"),
    "ping":     (-15.0, 0.00, {"hall": 0.30, "big": 0.15}, "music"),
    "stab":     (-15.0, 0.00, {"hall": 0.25}, "music"),
    "sting":    (-15.0, 0.00, {"hall": 0.25, "big": 0.10}, "music"),
    "tick":     (-24.0, 0.00, {"room": 0.15}, "fx"),
    "notif":    (-14.0, 0.00, {"hall": 0.20}, "fx"),
    "chime":    (-16.0, 0.00, {"hall": 0.30}, "fx"),
    "sparkle":  (-21.0, 0.00, {"hall": 0.40}, "fx"),
    "boom":     (-9.5, 0.00, {}, "fx"),
    "tap":      (-12.0, 0.00, {"room": 0.15}, "fx"),
    "glitch":   (-21.0, 0.00, {"room": 0.20}, "fx"),
    "impair":   (-19.0, 0.00, {"big": 0.55}, "fx"),
    "swoosh":   (-17.0, 0.00, {"hall": 0.25}, "fx"),
    "shimmer":  (-22.0, 0.00, {"big": 0.40}, "fx"),
    "bloom":    (-22.0, 0.00, {"big": 0.30}, "fx"),
    "riser":    (-14.0, 0.00, {"hall": 0.20}, "fx"),
    "swell":    (-10.0, 0.00, {}, "fx"),
    "downlift": (-21.0, 0.00, {"hall": 0.20}, "fx"),
    "shatter":  (-14.0, 0.00, {"room": 0.20, "hall": 0.15}, "fx"),
}
RETURNS_DB = {"hall": -7.0, "room": -10.0, "big": -6.0}
TAPE_STEMS = ("pad", "pulse", "bass", "sub", "hats")


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
SWING_S = 0.006


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
    st.audio["hats"] += hp(hats, 7000.0, 2)              # every tick / hat above ~7 kHz
    shk = stereo()
    for i, (b, v) in enumerate(ev["shaker"]):
        place(shk, ins.shaker(i % 4), swung(b), v, pan=0.35 if i % 2 else -0.35)
    st.audio["shaker"] += hp(shk, 7000.0, 2)

    roll = stereo()
    for i, (b, v, tight, semis) in enumerate(ev["roll"]):
        x = ins.pitched(ins.snare(i % 3, tight), 2.0 ** (semis / 12.0))
        place(roll, apply_fades(hp(x, 150.0, 2), 0.0, 10.0), at(b), v)
    st.audio["roll"] += voice_pocket(roll, -4.0)

    for b, size, v in ev["crash"]:
        place(st.audio["crash"], ins.crash(size), at(b), v)


# ----------------------------------------------------------------------------
# bass, heartbeat
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
    bass = lp(bass, 3000.0, 2)
    st.audio["bass"] += to_stereo(bass)

    heart = np.zeros(N)
    for b, v in ev["heart"]:
        place(heart, fx.heartbeat(240), at(b), v)
    st.audio["heart"] += to_stereo(heart)


# ----------------------------------------------------------------------------
# harmony: drone, pads, threat pulse, alarm
# ----------------------------------------------------------------------------
def pad_cutoff():
    base = automation([(0.0, 600), (1.95, 700), (2.0, 1500), (2.6, 950), (3.45, 900), (3.5, 1300), (4.2, 850),
                       (5.95, 800), (6.0, 1500), (6.6, 850), (8.0, 900), (8.95, 1000), (9.0, 1250), (9.6, 1000),
                       (14.9, 1000), (15.0, 750), (16.0, 650), (16.95, 900), (17.0, 2900), (17.8, 1800),
                       (23.4, 1800), (23.95, 2600), (24.0, 2900), (24.5, 1700), (24.95, 1700), (25.0, 2800),
                       (25.6, 1600), (27.9, 1600), (28.0, 1900), (30.0, 1000)], log=True)
    t = tarr(N)
    lfo = 2.0 ** (0.2 * np.sin(2 * np.pi * 0.11 * t) + 0.08 * np.sin(2 * np.pi * 0.29 * t + 1.3))
    return base * lfo


def render_harmony(ev, st: Stems):
    # low tension drone (C pedal), from the notification on
    dr = stereo()
    for t0, t1, midis in ev["drone"]:
        d = ins.drone(midis, t1 - t0 + 0.6, 4400)
        d = apply_fades(d, 700.0, 900.0)
        place(dr, d, s2n(t0), 1.0)
    t = tarr(N)
    fc = automation([(0.0, 220), (0.2, 220), (1.95, 520), (2.0, 700), (3.0, 420), (9.0, 380), (10.0, 300)], log=True)
    dr = sweep_filter(dr, fc, "lp", q=0.9, stages=2, per_oct=4.0)
    dr *= (0.85 + 0.15 * np.sin(2 * np.pi * 0.5 * t))[:, None]          # slow breathing
    st.audio["drone"] += width(hp(dr, 45.0, 2), 1.2)

    pad = stereo()
    for i, (b0, b1, midis, lvl, attack, release) in enumerate(ev["pad"]):
        dur = sec(b1 - b0)
        for j, m in enumerate(midis):
            reg = 0.7 if m < 48 else (0.88 if m < 57 else 1.0)
            v = ins.pad_voice(m, dur, 6400 + 37 * i + j, attack=attack, release=release, detune=8.0)
            place(pad, v, at(b0), lvl * reg / np.sqrt(len(midis) / 4.0))
    pad = sweep_filter(pad, pad_cutoff(), "lp", q=0.7, stages=2, per_oct=4.0)
    pad = hp(pad, 105.0, 2)
    pad = biquad(pad, "peak", 330.0, 0.8, -2.5)
    pad = voice_pocket(pad, -4.0)
    st.audio["pad"] += width(pad, 1.35)

    # textures: dark low breath under the trap (3.5-9 s), air above the voice in the defence / finale
    place(st.audio["breath"], fx.low_breath(5.9, 4500, fc=180.0), s2n(3.45), 1.0)
    place(st.audio["air"], fx.air_bed(7.2, 4501), s2n(17.0), 1.0)
    place(st.audio["air"], fx.air_bed(5.2, 4502), s2n(24.0), 0.8)


def render_hook_pulse(st: Stems):
    """0.2-2.0 s: the rising filtered pulse (the finger approaches the button): a C2/C3/G2 saw cluster
    gated on 16ths, its low-pass opening 160 Hz -> 1.5 kHz and its level rising ~14 dB."""
    t0, t1 = 0.2, 2.0
    a = s2n(t0)
    n = s2n(t1 - t0)
    t = tarr(n)
    u = t / (t1 - t0)
    rng = np.random.default_rng(4410)
    x = np.zeros((n, 2))
    for m, g, p in ((36, 1.0, 0.0), (48, 0.55, -0.4), (43, 0.45, 0.4)):
        for cents in (-6.0, 6.0):
            s = saw(mtof(m) * 2.0 ** (cents / 1200.0), n, rng.random())
            x += to_stereo(s * g, p * np.sign(cents))
    gate = np.zeros(n)
    tt = t + t0
    step = 0.125
    k0 = int(np.ceil(0.25 / step))
    for k in range(k0, int(t1 / step)):
        s0 = s2n(k * step) - a
        L = min(n - s0, s2n(step))
        if L <= 0:
            continue
        g = tarr(L)
        acc = 1.0 if k % 4 == 0 else (0.62 if k % 2 == 0 else 0.48)
        gate[s0:s0 + L] = np.maximum(gate[s0:s0 + L], acc * fx._attack(g, 0.003) * np.exp(-g / 0.045))
    x *= gate[:, None]
    fc = 160.0 * (1500.0 / 160.0) ** (u ** 1.5)
    x = sweep_filter(x, fc, "lp", q=1.6, per_oct=4.0)
    lvl = db2lin(-14.0) ** (1.0 - u)
    x *= lvl[:, None]
    x = apply_fades(x, 30.0, 12.0)
    x = voice_pocket(x, -5.0)
    place(st.audio["hookpulse"], x, a, 1.0)


def render_pulse(ev, st: Stems):
    pl = stereo()
    for b, m, v, bright in ev["pulse"]:
        place(pl, ins.pluck(m, bright, False), at(b), v)
    pl = hp(pl, 90.0, 2)
    pl = lp(pl, 2400.0, 2)
    pl = voice_pocket(pl, -6.0, 2400.0, 0.6)
    pl = pl + 0.22 * ping_pong(pl, sec(0.75), fb=0.3, taps=3, lp_hz=1800.0, hp_hz=250.0)
    st.audio["pulse"] += width(pl, 1.2)


def render_alarm(st: Stems):
    x = fx.alarm_pulse(2.0, 230)
    x = voice_pocket(x, -5.0, 2400.0, 0.6)
    place(st.audio["alarm"], x, at(CUE["tap"]), 1.0)


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
    for i, (b, d, m, v, style) in enumerate(sorted(ev["lead"])):
        if style == "threat":
            pl = ins.pluck(m, 3, True)
            bell = ins.fm_bell(mtof(m), dur=sec(d) + 0.9, ratio=1.0, index=0.9, idx_tau=0.08,
                               amp_tau=0.25 + 0.2 * sec(d))
            g_pl, g_bell = 0.8, 0.6
        else:
            pl = ins.pluck(m, 6, True)
            bell = ins.fm_bell(mtof(m), dur=sec(d) + 1.0, ratio=2.0, index=0.7, idx_tau=0.06,
                               amp_tau=0.3 + 0.2 * sec(d))
            g_pl, g_bell = 0.9, 0.45
        x = np.zeros((max(len(pl), len(bell)), 2))
        x[: len(pl)] += g_pl * pl
        x[: len(bell)] += g_bell * bell[:, None]
        place(lead, x, at(b), v, pan=(-0.15, 0.15)[i % 2])
    lead = hp(lead, 200.0, 2)
    lead = voice_pocket(lead, -2.5, 3000.0, 0.8)
    lead = lead + 0.3 * ping_pong(lead, sec(0.75), fb=0.4, taps=5, lp_hz=3000.0, hp_hz=400.0)
    st.audio["lead"] += width(lead, 1.15)

    fl = stereo()
    for b, m, v, pan in ev["flourish"]:
        pl = ins.pluck(m, 7, True)
        bell = ins.fm_bell(mtof(m), dur=1.2, ratio=2.0, index=0.8, idx_tau=0.05, amp_tau=0.35)
        x = np.zeros((max(len(pl), len(bell)), 2))
        x[: len(pl)] += 0.8 * pl
        x[: len(bell)] += 0.5 * bell[:, None]
        place(fl, x, at(b), v, pan=pan)
    fl = hp(fl, 250.0, 2)
    fl = fl + 0.25 * ping_pong(fl, sec(0.75), fb=0.35, taps=4, lp_hz=3500.0, hp_hz=500.0, first=1)
    st.audio["flourish"] += fl


def render_bells(ev, st: Stems):
    bell = stereo()
    for i, (b, d, m, v) in enumerate(ev["bell"]):
        if b == CUE["question"]:
            x = fx.question_ping(m, dur=sec(d))
            place(st.audio["ping"], x, at(b), v, pan=0.0)
            place(st.audio["sparkle"], ins.sparkle(mtof(m + 12), 0.25), at(b) + s2n(0.012), 0.3, pan=0.3)
        else:
            x = ins.fm_bell(mtof(m), dur=sec(d), ratio=2.0, index=1.0, idx_tau=0.06, amp_tau=0.28)
            place(bell, x, at(b), v, pan=(-0.3, 0.3, 0.0)[i % 3])
    bell = bell + 0.3 * ping_pong(bell, sec(0.75), fb=0.3, taps=3, lp_hz=3000.0, hp_hz=450.0, first=1)
    st.audio["bell"] += bell
    pg = st.audio["ping"]
    st.audio["ping"] = pg + 0.22 * ping_pong(pg, sec(0.75), fb=0.3, taps=3, lp_hz=2500.0, hp_hz=600.0, first=1)

    stab = stereo()
    for i, (b, midis, v, bright) in enumerate(ev["stab"]):
        place(stab, ins.chord_stab(midis, 3500 + 7 * i, dur=0.5, bright=bright), at(b), v)
    stab = hp(stab, 90.0, 2)
    stab = voice_pocket(stab, -5.0, 2600.0, 0.6)
    st.audio["stab"] += width(stab, 1.2)

    sting = stereo()
    for b, midis, v in ev["sting"]:
        place(sting, fx.reveal_sting(midis, 600), at(b), v)
    sting = hp(sting, 60.0, 2)
    sting = voice_pocket(sting, -5.0, 2400.0, 0.6)
    st.audio["sting"] += sting


def render_textures(ev, st: Stems):
    tk = stereo()
    for i, (t, kind, v, pan) in enumerate(ev["tick"]):
        place(tk, fx.clock_tick(kind, i % 3), s2n(t), v, pan=pan)
    st.audio["tick"] += hp(tk, 3500.0, 2)

    sp = stereo()
    for t, m, v, pan, tau in ev["sparkle"]:
        place(sp, ins.sparkle(mtof(m), tau), s2n(t), v, pan=pan)
    st.audio["sparkle"] += voice_pocket(sp, -2.0)


# ----------------------------------------------------------------------------
# sound design on the cue sheet
# ----------------------------------------------------------------------------
def impact(st: Stems, beat: float, boom_kw: dict, boom_gain: float, air_gain: float, air_tau: float = 0.2,
           seed: int = 0, thud_gain: float = 0.5, air_lo: float = 1200.0):
    s = at(beat)
    place(st.audio["boom"], ins.boom(**boom_kw), s, boom_gain)
    place(st.audio["boom"], ins.thud(seed + 1, fc=600.0), s, thud_gain)
    place(st.audio["impair"], ins.noise_burst(max(0.6, air_tau * 6), seed + 2, air_lo, 10000.0, air_tau), s, air_gain)


def ends_at(x, beat: float) -> int:
    return at(beat) - len(x)


def render_fx(st: Stems):
    nm = lambda names: [n2m(x) for x in names]  # noqa: E731

    # 0.2 s NOTIFICATION: crisp ping (the drone starts in render_harmony)
    place(st.audio["notif"], fx.notif_ping(40), s2n(arr.CUE_T["notification"]), 1.0)
    place(st.audio["boom"], ins.thud(41, fc=380.0, tau=0.02), s2n(arr.CUE_T["notification"]), 0.25)

    # 2.0 s TAP -> RED ALARM: glass tap + distorted sub impact + crushed stutter (+ the alarm swell)
    s = at(CUE["tap"])
    tap = fx.tap_click(200)
    place(st.audio["tap"], tap, s, 1.0)
    di = fx.dist_impact(210)
    place(st.audio["boom"], di, s, 0.95)
    place(st.audio["impair"], ins.noise_burst(0.5, 211, 2500.0, 12000.0, 0.035), s, 0.8)
    src = np.zeros((s2n(0.05), 2))
    src += tap[: len(src)] * 0.8
    src += fx.glitch_blip(103, 212, 0.05) * 0.7
    stt = fx.stutter(src, grain_s=0.02, pattern=(0.0, 0.0, 1.0, 0.0, 0.7, 0.55, 0.0, 0.45, 0.32, 0.22),
                     step_s=0.03125, hold=6, bits=5, hp_hz=3800.0)
    place(st.audio["glitch"], stt, s, 1.0)
    place(st.audio["downlift"], ins.downlifter(1.4, 213, f0=6000.0, f1=500.0), s, 0.5)

    # 3.5 s MESSAGE: short dark reverse swell into a low impact + 3D swoosh
    sw = ins.reverse_swell(0.4, 349, midis=nm(("Ab3", "Eb4")), noise_gain=0.6, tone_gain=0.7, hp_hz=300.0,
                           lp_hz=4500.0)
    place(st.audio["swell"], sw, ends_at(sw, CUE["message"]) - s2n(0.018), 0.35)
    impact(st, CUE["message"], dict(f_start=95.0, f_end=38.0, tau_p=0.06, tau_a=0.6, dur=2.0, drive=1.6,
                                    snap=120.0), 0.75, 0.45, 0.12, seed=350, thud_gain=0.6, air_lo=2500.0)
    place(st.audio["swoosh"], fx.swoosh_in(351), at(CUE["message"]), 1.0)

    # 6.0 s REVEAL: the detuned sting is in the score; here: a crushed stutter of it + a digital 'zoom'
    s = at(CUE["reveal"])
    sting = fx.reveal_sting(nm(("F2", "C3", "Ab3", "G4", "Ab4")), 600)
    stt = fx.stutter(sting, grain_s=0.022, pattern=(0.0, 0.0, 0.9, 0.0, 0.7, 0.0, 0.55, 0.45, 0.35, 0.25, 0.15),
                     step_s=0.03125, hold=7, bits=5, hp_hz=3500.0)
    place(st.audio["glitch"], stt, s, 1.0)
    zoom = fx.stutter(fx.glitch_blip(108, 601, 0.03), grain_s=0.016, pattern=(1.0, 0.8, 0.7, 0.6, 0.5, 0.4),
                      step_s=0.015625, hold=3, bits=0, hp_hz=5000.0, pitch=(1.0, 1.12, 1.26, 1.41, 1.59, 1.78))
    place(st.audio["glitch"], zoom, s + s2n(0.006), 0.8, pan=0.2)
    place(st.audio["boom"], ins.boom(110.0, 43.6, 0.04, 0.35, 1.2, 1.5, 150.0), s, 0.6)
    place(st.audio["impair"], ins.noise_burst(0.4, 602, 4000.0, 12000.0, 0.02), s, 0.7)

    # 8.5-9.0 s: reverse cymbal into the groove (voice gap)
    rc = ins.reverse_swell(0.5, 802, noise_gain=1.0, tone_gain=0.0, hp_hz=3000.0, lp_hz=11000.0)
    place(st.audio["swell"], rc, ends_at(rc, CUE["how"]) - s2n(0.015), 0.22)

    # 9.0 s HOW / step 1: groove impact + downlifter; steps 2-4: lighter accents with a crushed data blip
    impact(st, CUE["how"], dict(f_start=115.0, f_end=46.0, tau_p=0.05, tau_a=0.45, dur=1.6, drive=1.3,
                                snap=150.0), 0.6, 0.6, 0.12, seed=900, air_lo=2500.0)
    place(st.audio["downlift"], ins.downlifter(2.0, 901, f0=8000.0, f1=400.0), at(CUE["how"]), 0.7)
    for i, b in enumerate(arr.STEP_BEATS):
        blip = fx.glitch_blip(100 + 2 * i, 910 + i, 0.04)
        pat = ((1.0, 0.0, 0.6, 0.4), (1.0, 0.5, 0.0, 0.45, 0.3), (1.0, 0.0, 0.7, 0.0, 0.5, 0.35),
               (1.0, 0.6, 0.45, 0.0, 0.4, 0.3, 0.2), (1.0,))[i]
        place(st.audio["glitch"], fx.stutter(blip, 0.018, pat, 0.03125, hold=4, bits=6, hp_hz=4500.0), at(b),
              0.55 + 0.08 * i, pan=(-0.3, 0.3, -0.15, 0.15, 0.0)[i])
        if 0 < i < 4:
            impact(st, b, dict(f_start=105.0, f_end=48.0, tau_p=0.04, tau_a=0.25, dur=0.9, drive=1.25, snap=140.0),
                   0.32 + 0.04 * i, 0.4, 0.05, seed=920 + 10 * i, thud_gain=0.3, air_lo=3000.0)

    # 15.0 s STEP 5 (data reaches the attacker): darker and heavier - distorted boom, sub drop, downlifter
    s = at(CUE["step5"])
    place(st.audio["boom"], fx.dist_impact(1500, dur=2.0, f_start=120.0, f_end=36.0, tau_p=0.06, tau_a=0.55,
                                           drive=2.2, hold=10, bits=6), s, 0.8)
    place(st.audio["boom"], fx.sub_drop(1.0, mtof(n2m("C2")), mtof(n2m("C1")), 0.45), s + s2n(0.05), 0.45)
    place(st.audio["downlift"], ins.downlifter(1.0, 1501, f0=7000.0, f1=150.0, tau=0.5), s, 1.0)
    place(st.audio["impair"], ins.noise_burst(0.5, 1502, 1500.0, 6000.0, 0.05), s, 0.5)
    stt = fx.stutter(fx.dist_impact(1503, dur=0.2), grain_s=0.03,
                     pattern=(0.0, 0.0, 0.0, 0.0, 0.8, 0.0, 0.6, 0.0, 0.45, 0.3), step_s=0.03125, hold=12, bits=4,
                     hp_hz=300.0, lp_hz=1200.0)
    place(st.audio["glitch"], stt, s, 1.2)

    # 16.0-17.0 s: tape-stop (tape_stop()) then the suck-back: reverse swell + noise riser + tonal riser on Bb
    dur = 0.72
    nr = apply_fades(ins.noise_riser(dur, 1600, f0=400.0, f1=8000.0, curve=1.8, q=1.4, air=0.3), 40.0, 15.0)
    place(st.audio["riser"], nr, at(CUE["shield"]) - len(nr) - s2n(0.05), 0.9)
    tr = apply_fades(ins.tone_riser(dur, 1601, m0=n2m("Bb3"), m1=n2m("Bb5"), curve=1.5), 40.0, 15.0)
    tr = lp(tr, 1800.0, 2)
    place(st.audio["riser"], tr, at(CUE["shield"]) - len(tr) - s2n(0.05), 0.4)
    sw = ins.reverse_swell(0.7, 1602, midis=nm(("Bb4", "F5", "D6")), noise_gain=0.7, tone_gain=1.0, hp_hz=350.0,
                           lp_hz=9000.0, rt_scale=1.0)
    place(st.audio["swell"], sw, ends_at(sw, CUE["shield"]) - s2n(0.05), 0.55)

    # 17.0 s SHIELD: bright, protective, resolving (pad bloom, stab, flourish, sparkles in the score)
    impact(st, CUE["shield"], dict(f_start=105.0, f_end=38.9, tau_p=0.07, tau_a=0.7, dur=2.4, drive=1.2,
                                   snap=120.0), 0.75, 0.5, 0.22, seed=1700, thud_gain=0.5, air_lo=3000.0)
    place(st.audio["shimmer"], ins.shimmer(nm(("Eb6", "G6", "Bb6", "D7", "F7")), 3.0, 1701, attack=0.01, tau=1.0),
          at(CUE["shield"]), 1.0)
    place(st.audio["bloom"], fx.shield_bloom(1702), at(CUE["shield"]), 1.0)

    # 17.5 / 19.0 / 21.0 s TIPS: clean confirm chimes rising Eb6 -> F6 -> G6, with a little low body
    for i, (b, (m1, m2)) in enumerate(zip(arr.TIP_BEATS, (("Bb5", "Eb6"), ("Bb5", "F6"), ("C6", "G6")))):
        place(st.audio["chime"], fx.confirm_chime(n2m(m1), n2m(m2), 1750 + i), at(b), 1.0)
        place(st.audio["boom"], ins.boom(120.0, 52.0, 0.03, 0.12, 0.6, 1.1, 120.0), at(b), 0.28)
        place(st.audio["impair"], ins.noise_burst(0.3, 1760 + i, 5000.0, 12000.0, 0.025), at(b), 0.35)

    # 23.5-24.0 s BUILD: noise riser + reverse swell on Bb (the roll is in the score)
    dur = 0.46
    nr = apply_fades(ins.noise_riser(dur, 2350, f0=600.0, f1=9000.0, curve=1.6, q=1.3, air=0.35), 30.0, 12.0)
    place(st.audio["riser"], nr, at(CUE["destroy"]) - len(nr) - s2n(0.04), 0.9)
    sw = ins.reverse_swell(0.5, 2351, midis=nm(("Bb5", "D6", "F6")), noise_gain=0.8, tone_gain=1.0, hp_hz=350.0,
                           lp_hz=9000.0, rt_scale=1.0)
    place(st.audio["swell"], sw, ends_at(sw, CUE["destroy"]) - s2n(0.04), 0.55)

    # 24.0 s DESTROY: big impact + glass / digital shatter + crushed stutter + downlifter
    s = at(CUE["destroy"])
    impact(st, CUE["destroy"], dict(f_start=140.0, f_end=41.0, tau_p=0.06, tau_a=0.75, dur=2.4, drive=1.6,
                                    snap=170.0), 0.95, 0.75, 0.25, seed=2400, thud_gain=0.75)
    sh = fx.shatter(2401, dur=1.2, tokens=nm(("Bb6", "F7", "D7", "Bb7", "F7", "D8", "Bb7", "F8", "D7", "Bb8")))
    place(st.audio["shatter"], sh, s, 1.0)
    stt = fx.stutter(sh, grain_s=0.02, pattern=(0.0, 0.0, 0.0, 0.0, 0.7, 0.0, 0.5, 0.0, 0.4, 0.3, 0.2),
                     step_s=0.03125, hold=5, bits=5, hp_hz=4000.0)
    place(st.audio["glitch"], stt, s, 0.8)
    place(st.audio["downlift"], ins.downlifter(1.6, 2402, f0=8000.0, f1=300.0), s, 0.7)

    # 25.0 s TITLE: strong resolved hit on Eb + shimmer (bell chord, stab, glitter in the score)
    s = at(CUE["title"])
    impact(st, CUE["title"], dict(f_start=120.0, f_end=38.9, tau_p=0.06, tau_a=0.8, dur=2.6, drive=1.3,
                                  snap=150.0), 0.8, 0.7, 0.14, seed=2500, thud_gain=0.55, air_lo=3500.0)
    place(st.audio["shimmer"], ins.shimmer(nm(("Eb7", "G7", "Bb7", "Eb8", "G8")), 2.4, 2501, attack=0.008, tau=0.6),
          s, 0.9)

    # 28.0 s QUESTION: the ping is in the score (bells); a breath of air under it
    place(st.audio["impair"], ins.noise_burst(0.9, 2800, 5000.0, 12000.0, 0.2), at(CUE["question"]), 0.22)


# ----------------------------------------------------------------------------
# 16.0 s tape-stop of the threat groove
# ----------------------------------------------------------------------------
def tape_curve():
    a = s2n(TAPE_STOP_S)
    n = s2n(TAPE_STOP_LEN)
    u = tarr(n) / TAPE_STOP_LEN
    rate = np.maximum(1.0 - u, 0.0) ** 1.4
    gain = np.cos(0.5 * np.pi * u) ** 0.8
    return a, n, u, rate, gain


def tape_stop(st: Stems, names=TAPE_STEMS):
    """The threat groove grinds to a halt: playback rate 1 -> 0 over 0.42 s (pitch dives ~2 octaves),
    a closing low-pass (12 kHz -> 250 Hz) and a fade; the stems stay silent until the shield."""
    a, n, u, rate, gain = tape_curve()
    fc = 12000.0 * (250.0 / 12000.0) ** (u ** 0.7)
    pre = 2048
    end = at(CUE["shield"]) - s2n(0.002)
    lag = 0.0
    for name in names:
        x = st.audio[name]
        y, lag = fx.varispeed(x, a, n, rate)
        y = np.concatenate([x[a - pre:a], y], axis=0)
        fcp = np.concatenate([np.full(pre, fc[0]), fc])
        y = sweep_filter(y, fcp, "lp", q=0.75, per_oct=5.0)[pre:]
        x[a:a + n] = y * gain[:, None]
        x[a + n:end] = 0.0
        if name == "pulse":
            x[a + n:] = 0.0
    return lag


# ----------------------------------------------------------------------------
# mix
# ----------------------------------------------------------------------------
def kick_ducking(ev):
    hard = [at(b) for b, kind, _ in ev["kick"] if kind not in ("soft",)]
    soft = [at(b) for b, kind, _ in ev["kick"] if kind == "soft"]
    hard_env = sidechain_env(N, hard, depth=1.0, pre_ms=4.0, hold_ms=20.0, rel_ms=230.0, shape=1.6)
    soft_env = sidechain_env(N, soft, depth=1.0, pre_ms=4.0, hold_ms=20.0, rel_ms=260.0, shape=1.4)
    return np.minimum(hard_env, 1.0 - 0.45 * (1.0 - soft_env))


PRE_DIPS = (("tap", -10.0, 0.045), ("message", -6.0, 0.03), ("how", -5.0, 0.03), ("shield", -12.0, 0.06),
            ("destroy", -10.0, 0.04), ("title", -5.0, 0.03))


def pre_cue_dips():
    """Short suck-backs right before the hits, so they land on a clean transient: (cue, depth dB, length s).
    The level comes back in 1.5 ms exactly on the cue."""
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
    a, n_, u, _, _ = tape_curve()                       # the hall tail dips with the tape-stop too
    hall[a:a + n_] *= (db2lin(-6.0) ** u)[:, None]
    hall[a + n_:at(CUE["shield"]) - s2n(0.3)] *= db2lin(-6.0)
    room = reverb(sends["room"], irs["room"]) * db2lin(RETURNS_DB["room"])
    big = reverb(sends["big"], irs["big"]) * db2lin(RETURNS_DB["big"])
    wet = voice_pocket(hall + room + big, -3.0)
    return (mix + wet) * pre_cue_dips()[:, None]


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


def to_int16(x, env, seed: int = 2404):
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
    render_hook_pulse(st)
    render_pulse(ev, st)
    render_alarm(st)
    render_arp(ev, st)
    render_lead(ev, st)
    render_bells(ev, st)
    render_textures(ev, st)
    render_fx(st)
    lag = tape_stop(st)
    if verbose:
        print(f"stems rendered in {time.time() - t0:.1f} s (tape-stop read lag {lag / SR * 1000:.0f} ms)")
    mix = mix_down(st, ev)
    out, gr, env = master_bus(mix)
    if verbose:
        print(f"mixed + mastered in {time.time() - t0:.1f} s")
    return out, gr, env, st


SECS = [("hook", 0, 2), ("alarm", 2, 3.5), ("trap", 3.5, 9), ("how", 9, 16), ("suck", 16, 17), ("defend", 17, 24),
        ("finale", 24, 28), ("quest", 28, 29)]


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
