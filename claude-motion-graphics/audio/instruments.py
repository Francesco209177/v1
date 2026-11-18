"""Synthesised instruments and sound-design elements.

Every function returns a ready-to-place one-shot (mono 1-D or stereo (n, 2)),
already enveloped with short fades so nothing can click. One-shots that are
re-used many times (drums, plucks, bass notes) are cached.
"""
from __future__ import annotations

from functools import lru_cache

import numpy as np

from dsp import (SR, TWO_PI, adsr, apply_fades, biquad, bp, hp, lp, make_ir, mtof, pan_gains, reverb, s2n, saw,
                 sine, square, stereo_noise, sweep_filter, tarr)


def _norm(x, peak: float = 1.0):
    m = float(np.max(np.abs(x)))
    return x * (peak / m) if m > 0 else x


# ----------------------------------------------------------------------------
# drums
# ----------------------------------------------------------------------------
@lru_cache(maxsize=None)
def kick(kind: str = "full"):
    """Pitch-swept sine body + noise click. Kinds: full, big (drop accents), soft (scene 2 pulse)."""
    rng = np.random.default_rng(11)
    if kind == "full":
        dur, f_end, sweep, t_sw, snap, tau, drive, click_g = 0.44, 53.0, 135.0, 0.030, 240.0, 0.17, 1.5, 0.20
    elif kind == "big":
        dur, f_end, sweep, t_sw, snap, tau, drive, click_g = 0.47, 51.0, 150.0, 0.034, 300.0, 0.23, 1.9, 0.28
    elif kind == "soft":
        dur, f_end, sweep, t_sw, snap, tau, drive, click_g = 0.36, 50.0, 55.0, 0.035, 60.0, 0.11, 1.0, 0.0
    else:
        raise ValueError(kind)
    n = s2n(dur)
    t = tarr(n)
    f = f_end + sweep * np.exp(-t / t_sw) + snap * np.exp(-t / 0.0055)
    body = sine(f, n) * np.exp(-t / tau)
    body = np.tanh(drive * body) / np.tanh(drive)
    y = body + hp(rng.standard_normal(n), 2500.0, 2) * np.exp(-t / 0.0022) * click_g
    if kind == "soft":
        y = lp(y, 240.0, 2)
        y = y + lp(rng.standard_normal(n), 2800.0, 2) * np.exp(-t / 0.0016) * 0.07  # soft felt tick
    return apply_fades(y, 0.0, 70.0)


def boom(f_start: float = 110.0, f_end: float = 46.0, tau_p: float = 0.07, tau_a: float = 0.6, dur: float = 1.6,
         drive: float = 1.3, snap: float = 160.0):
    """Sub impact: long pitch-swept sine (mono)."""
    n = s2n(dur)
    t = tarr(n)
    f = f_end + (f_start - f_end) * np.exp(-t / tau_p) + snap * np.exp(-t / 0.006)
    y = np.tanh(drive * sine(f, n) * np.exp(-t / tau_a)) / np.tanh(drive)
    return apply_fades(y, 0.0, dur * 250.0)


@lru_cache(maxsize=None)
def clap(variant: int = 0):
    rng = np.random.default_rng(100 + variant)
    n = s2n(0.34)
    t = tarr(n)
    st = stereo_noise(rng, n, 0.75, 0.45)
    env = np.zeros(n)
    for t0, g, tau in ((0.0, 0.75, 0.0045), (0.0105, 0.85, 0.0045), (0.0215, 1.0, 0.006)):
        m = t >= t0
        env[m] += g * np.exp(-(t[m] - t0) / tau)
    m = t >= 0.0215
    env[m] += 0.5 * np.exp(-(t[m] - 0.0215) / 0.075)
    y = bp(st, 800.0, 2600.0, 2) + 0.22 * bp(st, 5200.0, 9000.0, 2)
    y = y * env[:, None]
    return _norm(apply_fades(y, 0.2, 30.0))


@lru_cache(maxsize=None)
def hat(kind: str = "closed", variant: int = 0):
    """Filtered noise + a little metallic square cluster, everything above ~7 kHz."""
    opened = kind == "open"
    rng = np.random.default_rng(200 + variant + (50 if opened else 0))
    n = s2n(0.42 if opened else 0.10)
    t = tarr(n)
    st = stereo_noise(rng, n, 0.8, 0.35)
    metal = np.zeros(n)
    for f in (3183.0, 4129.0, 5407.0, 6803.0, 8205.0, 9731.0):
        metal += square(f * (1.0 + 0.004 * rng.standard_normal()), n, rng.random())
    x = st * 0.8 + (metal / 6.0)[:, None] * 0.7
    y = lp(hp(x, 7400.0, 4), 15000.0, 2)
    tau = 0.105 if opened else (0.014 + 0.004 * variant)
    env = (1.0 - np.exp(-t / 0.0004)) * np.exp(-t / tau)
    return _norm(apply_fades(y * env[:, None], 0.0, 45.0 if opened else 15.0))


@lru_cache(maxsize=None)
def shaker(variant: int = 0):
    rng = np.random.default_rng(300 + variant)
    n = s2n(0.12)
    t = tarr(n)
    y = bp(stereo_noise(rng, n, 0.6, 0.6), 5600.0, 10500.0, 2)
    env = (1.0 - np.exp(-t / 0.0045)) * np.exp(-t / 0.021)
    return _norm(apply_fades(y * env[:, None], 0.0, 20.0))


@lru_cache(maxsize=None)
def snare(variant: int = 0, tight: bool = False):
    rng = np.random.default_rng(400 + variant)
    n = s2n(0.16 if tight else 0.24)
    t = tarr(n)
    f = 184.0 + 70.0 * np.exp(-t / 0.012)
    body = sine(f, n) * np.exp(-t / (0.04 if tight else 0.055))
    nz = hp(lp(stereo_noise(rng, n, 0.8, 0.35), 7500.0, 2), 1300.0, 2) * np.exp(-t / (0.05 if tight else 0.08))[:, None]
    y = 0.62 * body[:, None] + 0.55 * nz
    return _norm(apply_fades(y, 0.0, 25.0))


@lru_cache(maxsize=None)
def crash(size: str = "big"):
    big = size == "big"
    rng = np.random.default_rng(500 + (1 if big else 0))
    n = s2n(2.4 if big else 1.1)
    t = tarr(n)
    st = stereo_noise(rng, n, 0.55, 0.65)
    metal = np.zeros(n)
    for f in (4310.0, 5170.0, 6230.0, 7410.0, 8890.0, 10650.0):
        metal += sine(f * (1.0 + 0.002 * np.sin(TWO_PI * 5.0 * t + rng.random() * 6.28)), n, rng.random())
    x = st + 0.25 * (metal / 6.0)[:, None]
    y = lp(hp(x, 5200.0, 2), 13000.0, 2)
    env = 0.4 * np.exp(-t / 0.10) + 0.6 * np.exp(-t / (0.62 if big else 0.26))
    env *= 1.0 - np.exp(-t / 0.0008)
    return _norm(apply_fades(y * env[:, None], 0.0, 300.0 if big else 150.0))


# ----------------------------------------------------------------------------
# tonal one-shots
# ----------------------------------------------------------------------------
@lru_cache(maxsize=None)
def pluck(midi: int, bright_i: int = 6, long: bool = False):
    """Arp pluck: detuned saw + square through an enveloped resonant low-pass (stereo)."""
    bright = bright_i / 10.0
    f = mtof(midi)
    n = s2n(0.62 if long else 0.40)
    t = tarr(n)
    d = 2.0 ** (6.0 / 1200.0)
    sq = 0.4 * square(f, n, 0.37)
    x = np.stack([0.6 * saw(f * d, n, 0.11) + sq, 0.6 * saw(f / d, n, 0.53) + sq], axis=1)
    track = (f / 261.63) ** 0.35
    f_peak = (450.0 + 6200.0 * bright ** 1.5) * track
    f_base = (260.0 + 520.0 * bright) * track
    fc = f_base + (f_peak - f_base) * np.exp(-t / 0.055)
    y = sweep_filter(x, fc, "lp", q=1.25, per_oct=5.0)
    amp = (1.0 - np.exp(-t / 0.0012)) * np.exp(-t / (0.22 if long else 0.12))
    return apply_fades(y * amp[:, None], 0.0, 60.0) * 0.6


@lru_cache(maxsize=None)
def bass_note(midi: int, bright_i: int = 5, long: bool = False):
    """Mid-bass pluck (mono): saw + square + sine through an enveloped low-pass, lightly saturated."""
    bright = bright_i / 10.0
    f = mtof(midi)
    n = s2n(0.30 if long else 0.20)
    t = tarr(n)
    x = 0.7 * saw(f, n, 0.0) + 0.45 * square(f, n, 0.25) + 0.5 * sine(f, n)
    f_base = 170.0 + 160.0 * bright
    f_peak = 380.0 + 1700.0 * bright
    fc = f_base + (f_peak - f_base) * np.exp(-t / 0.045)
    y = sweep_filter(x, fc, "lp", q=1.1, per_oct=5.0)
    amp = (1.0 - np.exp(-t / 0.002)) * np.exp(-t / (0.16 if long else 0.095))
    y = np.tanh(1.4 * y * amp)
    return apply_fades(y, 0.0, 40.0) * 0.7


def fm_bell(f: float, dur: float = 1.2, ratio: float = 3.0, index: float = 1.2, idx_tau: float = 0.09,
            amp_tau: float = 0.45, attack: float = 0.002):
    """Two-operator FM bell / glassy key (mono)."""
    n = s2n(dur)
    t = tarr(n)
    idx = index * (0.2 + 0.8 * np.exp(-t / idx_tau))
    y = np.sin(TWO_PI * f * t + idx * np.sin(TWO_PI * f * ratio * t))
    amp = (1.0 - np.exp(-t / attack)) * np.exp(-t / amp_tau)
    return apply_fades(y * amp, 0.0, dur * 300.0)


def sparkle(f: float, tau: float = 0.12):
    """High, short sine ping with a faint 3rd partial (mono)."""
    n = s2n(min(1.0, tau * 7.0))
    t = tarr(n)
    y = np.sin(TWO_PI * f * t) + 0.18 * np.sin(TWO_PI * 3.0 * f * t) * np.exp(-t / (tau * 0.3))
    amp = (1.0 - np.exp(-t / 0.0015)) * np.exp(-t / tau)
    return apply_fades(y * amp, 0.0, 40.0)


def supersaw(midi: float, dur: float, seed: int, voices: int = 7, detune: float = 16.0, spread: float = 0.9,
             attack: float = 0.004, decay: float = 0.12, sustain: float = 0.8, release: float = 0.09,
             octave_mix: float = 0.0, sub_mix: float = 0.0):
    """Detuned saw stack (stereo). Used for the lead, chord stabs and pads."""
    rng = np.random.default_rng(seed)
    n = s2n(dur + release)
    f = mtof(midi)
    out = np.zeros((n, 2))
    offs = np.linspace(-1.0, 1.0, voices) if voices > 1 else np.zeros(1)
    order = np.argsort(np.abs(offs), kind="stable")
    tot = 0.0
    for rank, v in enumerate(order):
        o = offs[v]
        cents = np.sign(o) * abs(o) ** 1.2 * detune + rng.uniform(-0.8, 0.8)
        g = 1.0 if rank == 0 else 0.78
        s = saw(f * 2.0 ** (cents / 1200.0), n, rng.random()) * g
        # alternate sides so the detune cloud is balanced left/right
        p = spread * abs(o) * (1.0 if rank % 2 else -1.0)
        l, r = pan_gains(p)
        out[:, 0] += s * l
        out[:, 1] += s * r
        tot += g * g
    if octave_mix > 0.0:
        for k, cents in enumerate((-9.0, 0.0, 9.0)):
            s = saw(2.0 * f * 2.0 ** (cents / 1200.0), n, rng.random()) * octave_mix
            l, r = pan_gains((k - 1) * 0.7 * spread)
            out[:, 0] += s * l
            out[:, 1] += s * r
            tot += octave_mix ** 2
    if sub_mix > 0.0:
        s = square(0.5 * f, n, rng.random()) * sub_mix * 0.7071
        out += s[:, None]
        tot += sub_mix ** 2
    out /= np.sqrt(tot)
    env = adsr(n, attack, decay, sustain, release, dur)
    return out * env[:, None]


def chord_stab(midis, seed: int, dur: float = 0.55, bright: float = 1.0):
    """Short supersaw chord with a plucked low-pass envelope (stereo)."""
    n = s2n(dur + 0.12)
    out = np.zeros((n, 2))
    for i, m in enumerate(midis):
        out += supersaw(m, dur, seed + 31 * i, voices=5, detune=14.0, attack=0.002, decay=0.25, sustain=0.35,
                        release=0.12)[:n]
    out /= np.sqrt(len(midis))
    t = tarr(n)
    fc = 700.0 + (5200.0 * bright) * np.exp(-t / 0.16)
    return apply_fades(sweep_filter(out, fc, "lp", q=0.9, per_oct=4.0), 0.0, 60.0)


def blip(f: float, bright: float = 0.3, dur: float = 0.085):
    """Data-stream 'bubble': sine with an upward chirp, harmonics grow with `bright` (mono)."""
    n = s2n(dur)
    t = tarr(n)
    fr = f * (1.0 - 0.32 * np.exp(-t / 0.007))
    ph = np.cumsum(fr) / SR
    y = np.sin(TWO_PI * ph)
    y += bright * 0.45 * np.sin(TWO_PI * 2.0 * ph) + bright * 0.30 * np.sin(TWO_PI * 3.0 * ph)
    y += bright * bright * 0.2 * np.sin(TWO_PI * 5.0 * ph)
    amp = (1.0 - np.exp(-t / 0.001)) * np.exp(-t / (0.022 + 0.012 * bright))
    return apply_fades(y * amp, 0.0, 12.0) / (1.0 + bright)


def key_tick(rng, kind: str = "key"):
    """Soft, dry keyboard tick: tiny noise click + damped resonances (mono)."""
    n = s2n(0.075)
    t = tarr(n)
    f_res = rng.uniform(1900.0, 3300.0)
    f_thock = rng.uniform(250.0, 400.0)
    g_thock, g_click, tau_thock = 0.55, 0.9, 0.011
    if kind == "space":
        f_thock, g_thock, g_click, tau_thock = rng.uniform(170.0, 220.0), 0.95, 0.7, 0.016
    elif kind == "enter":
        f_thock, g_thock, g_click, tau_thock = 150.0, 1.25, 1.0, 0.022
        f_res = 2100.0
    click = bp(rng.standard_normal(n), 1500.0, 5200.0, 1) * np.exp(-t / 0.0022) * g_click
    res = np.sin(TWO_PI * f_res * t) * np.exp(-t / 0.0035) * 0.30
    thock = np.sin(TWO_PI * f_thock * t) * np.exp(-t / tau_thock) * g_thock
    y = click + res + thock
    # key bottoming out / release: a second, smaller click a few ms later
    off = s2n(rng.uniform(0.014, 0.024))
    y[off:] += 0.28 * (click[: n - off] + 0.6 * res[: n - off])
    return apply_fades(lp(y, 6200.0, 2), 0.0, 20.0)


def confirm_blip():
    """'Enter' confirmation: two quick ascending tones (E6 -> A6), stereo-neutral mono."""
    n = s2n(0.42)
    t = tarr(n)
    y = np.zeros(n)
    for t0, f, tau, g in ((0.0, mtof(88), 0.045, 0.8), (0.068, mtof(93), 0.11, 1.0)):
        m = t >= t0
        tt = t[m] - t0
        tone = np.sin(TWO_PI * f * tt) + 0.22 * np.sin(TWO_PI * 2.0 * f * tt) + 0.08 * np.sin(TWO_PI * 3.0 * f * tt)
        y[m] += g * tone * (1.0 - np.exp(-tt / 0.0012)) * np.exp(-tt / tau)
    return apply_fades(y, 0.0, 80.0)


# ----------------------------------------------------------------------------
# FX
# ----------------------------------------------------------------------------
def noise_riser(dur: float, seed: int, f0: float = 350.0, f1: float = 9000.0, curve: float = 2.0, q: float = 1.4,
                air: float = 0.25):
    """Band-pass swept noise rising in pitch and level (stereo)."""
    rng = np.random.default_rng(seed)
    n = s2n(dur)
    u = (np.arange(n) + 0.5) / n
    w = stereo_noise(rng, n, 0.5, 0.7)
    fc = f0 * (f1 / f0) ** (u ** 1.15)
    y = sweep_filter(w, fc, "bp", q=q, per_oct=5.0)
    y += air * hp(w, 7000.0, 2) * (u ** 3)[:, None]
    return y * (u ** curve)[:, None]


def tone_riser(dur: float, seed: int, m0: float = 57.0, m1: float = 81.0, curve: float = 1.6):
    """Rising pitched layer for the build: three detuned saws gliding up (stereo)."""
    rng = np.random.default_rng(seed)
    n = s2n(dur)
    u = (np.arange(n) + 0.5) / n
    midi = m0 + (m1 - m0) * u ** 1.8
    f = 440.0 * 2.0 ** ((midi - 69.0) / 12.0)
    out = np.zeros((n, 2))
    for cents, p in ((-11.0, -0.8), (0.0, 0.0), (11.0, 0.8)):
        s = saw(f * 2.0 ** (cents / 1200.0), n, rng.random())
        l, r = pan_gains(p)
        out[:, 0] += s * l
        out[:, 1] += s * r
    out = lp(out, 3600.0, 2) / np.sqrt(3.0)
    return out * (u ** curve)[:, None]


def downlifter(dur: float, seed: int, f0: float = 9000.0, f1: float = 220.0, tau: float | None = None):
    """Noise falling in pitch and level after an impact (stereo)."""
    rng = np.random.default_rng(seed)
    n = s2n(dur)
    u = (np.arange(n) + 0.5) / n
    w = stereo_noise(rng, n, 0.5, 0.7)
    fc = f0 * (f1 / f0) ** (u ** 0.6)
    y = sweep_filter(w, fc, "lp", q=1.1, per_oct=4.0)
    env = np.exp(-u * dur / (tau or dur * 0.3))
    return apply_fades(y * env[:, None], 1.0, dur * 300.0)


def whoosh(dur_in: float, dur_out: float, seed: int, f_lo: float = 400.0, f_hi: float = 5200.0):
    """Soft pass-by whoosh peaking at dur_in seconds (stereo, pans L->R)."""
    rng = np.random.default_rng(seed)
    n_in, n_out = s2n(dur_in), s2n(dur_out)
    n = n_in + n_out
    w = stereo_noise(rng, n, 0.6, 0.6)
    u = np.concatenate([np.linspace(0.0, 1.0, n_in, endpoint=False), np.linspace(1.0, 0.0, n_out)])
    fc = f_lo * (f_hi / f_lo) ** (u ** 1.3)
    y = sweep_filter(w, fc, "bp", q=1.2, per_oct=5.0)
    env = np.concatenate([np.linspace(0.0, 1.0, n_in, endpoint=False) ** 2.6, np.linspace(1.0, 0.0, n_out) ** 2.2])
    pan = np.linspace(-0.6, 0.6, n)
    gl = np.cos((pan + 1.0) * np.pi / 4.0) * 1.4142
    gr = np.sin((pan + 1.0) * np.pi / 4.0) * 1.4142
    y[:, 0] *= gl * env
    y[:, 1] *= gr * env
    return apply_fades(y, 5.0, 30.0)


def reverse_swell(dur: float, seed: int, midis=(), noise_gain: float = 1.0, tone_gain: float = 0.6,
                  hp_hz: float = 500.0, lp_hz: float = 9000.0, rt_scale: float = 1.1):
    """Reverse reverb / reverse cymbal: a burst is reverberated, the tail is reversed so it
    grows into its last sample (stereo, peak-normalised)."""
    rng = np.random.default_rng(seed)
    n = s2n(dur)
    nb = s2n(0.09)
    t = tarr(nb)
    src = np.zeros((n, 2))
    src[:nb] += noise_gain * hp(stereo_noise(rng, nb, 0.5, 0.7), hp_hz, 2) * np.exp(-t / 0.03)[:, None]
    for m in midis:
        tone = np.zeros(nb)
        for h, g in ((1.0, 1.0), (2.0, 0.5), (3.0, 0.25)):
            tone += g * np.sin(TWO_PI * mtof(m) * h * t + rng.random() * 6.28)
        src[:nb] += tone_gain * (tone * np.exp(-t / 0.04))[:, None] / max(1, len(midis)) ** 0.5
    ir = make_ir(rt60=dur * rt_scale, seed=seed + 7, predelay_ms=0.0, lo=hp_hz * 0.6, hi=lp_hz, hf_ratio=0.6,
                 onset_ms=2.0, length_s=dur)
    wet = reverb(src, ir, n)[::-1].copy()
    return _norm(apply_fades(wet, dur * 250.0, 4.0))


def shimmer(midis, dur: float, seed: int, attack: float = 0.25, tau: float = 1.6):
    """Shimmer bloom: high sine partials of the chord with slow random tremolo (stereo, pre-reverb)."""
    rng = np.random.default_rng(seed)
    n = s2n(dur)
    t = tarr(n)
    out = np.zeros((n, 2))
    for m in midis:
        f = mtof(m)
        for cents in (-5.0, 6.0):
            ff = f * 2.0 ** (cents / 1200.0)
            trem = 0.6 + 0.4 * np.sin(TWO_PI * rng.uniform(2.5, 6.5) * t + rng.random() * 6.28)
            s = np.sin(TWO_PI * ff * t + rng.random() * 6.28) * trem
            l, r = pan_gains(rng.uniform(-0.9, 0.9))
            out[:, 0] += s * l
            out[:, 1] += s * r
    out /= np.sqrt(2.0 * len(midis))
    env = (1.0 - np.exp(-t / attack)) * np.exp(-t / tau)
    return apply_fades(out * env[:, None], 2.0, dur * 250.0)


def noise_burst(dur: float, seed: int, lo: float = 1500.0, hi: float = 9000.0, tau: float = 0.12):
    """Impact 'air' layer (stereo)."""
    rng = np.random.default_rng(seed)
    n = s2n(dur)
    t = tarr(n)
    y = bp(stereo_noise(rng, n, 0.5, 0.7), lo, hi, 1)
    return apply_fades(y * ((1.0 - np.exp(-t / 0.0008)) * np.exp(-t / tau))[:, None], 0.0, dur * 300.0)


def thud(seed: int, fc: float = 700.0, tau: float = 0.035):
    """Low-mid noise thump that gives sub impacts a body on small speakers (mono)."""
    rng = np.random.default_rng(seed)
    n = s2n(0.25)
    t = tarr(n)
    y = lp(rng.standard_normal(n), fc, 2) * np.exp(-t / tau)
    return apply_fades(y, 0.0, 60.0)


# ----------------------------------------------------------------------------
# sustained voices (pad, drone, sub, lead, audio logo)
# ----------------------------------------------------------------------------
def pad_voice(midi: int, dur: float, seed: int, attack: float = 0.4, release: float = 0.7, detune: float = 9.0):
    """Warm pad note: three slowly drifting detuned saws spread L/C/R (stereo, unfiltered:
    the pad bus is low-passed as a whole with a moving cutoff)."""
    rng = np.random.default_rng(seed)
    f = mtof(midi)
    n = s2n(dur + release)
    t = tarr(n)
    out = np.zeros((n, 2))
    for cents, p in ((-detune, -0.75), (0.0, 0.0), (detune, 0.75)):
        drift = 1.0 + 0.0011 * np.sin(TWO_PI * rng.uniform(0.13, 0.37) * t + rng.random() * 6.28)
        s = saw(f * 2.0 ** (cents / 1200.0) * drift, n, rng.random())
        l, r = pan_gains(p)
        out[:, 0] += s * l
        out[:, 1] += s * r
    out /= np.sqrt(3.0)
    # smooth (raised-cosine) attack, flat sustain, raised-cosine release
    env = np.ones(n)
    na = min(n, max(1, s2n(attack)))
    env[:na] = 0.5 - 0.5 * np.cos(np.pi * (np.arange(na) + 0.5) / na)
    g = min(n, s2n(dur))
    nr = n - g
    if nr > 0:
        env[g:] *= 0.5 + 0.5 * np.cos(np.pi * (np.arange(nr) + 0.5) / nr)
    return out * env[:, None]


def sub_note(midi: int, dur: float, attack: float = 0.012, release: float = 0.05, h2: float = 0.12):
    """Sub bass: sine + a touch of 2nd harmonic (so it reads on small speakers), mono."""
    f = mtof(midi)
    n = s2n(dur + release)
    t = tarr(n)
    y = np.sin(TWO_PI * f * t) + h2 * np.sin(2.0 * TWO_PI * f * t + 0.3)
    env = np.ones(n)
    na = s2n(attack)
    env[:na] = 0.5 - 0.5 * np.cos(np.pi * (np.arange(na) + 0.5) / na)
    g = min(n, s2n(dur))
    nr = n - g
    if nr > 0:
        env[g:] *= 0.5 + 0.5 * np.cos(np.pi * (np.arange(nr) + 0.5) / nr)
    return y * env / (1.0 + h2)


def lead_voice(midi: int, dur: float, seed: int, glide_from: float | None = None, vib_cents: float = 11.0):
    """Drop lead: 7-voice supersaw + octave layer + soft square sub, delayed vibrato and a short
    glide into the note. Low-passed with a plucky envelope so it never gets fizzy (stereo)."""
    rng = np.random.default_rng(seed)
    rel = 0.14
    n = s2n(dur + rel)
    t = tarr(n)
    vib = vib_cents * (1.0 - np.exp(-np.maximum(t - 0.13, 0.0) / 0.12)) * np.sin(TWO_PI * 5.3 * t + rng.random())
    pitch = np.full(n, float(midi))
    if glide_from is not None:
        pitch += (glide_from - midi) * np.exp(-t / 0.018)
    f = 440.0 * 2.0 ** ((pitch - 69.0) / 12.0) * 2.0 ** (vib / 1200.0)
    out = np.zeros((n, 2))
    offs = np.linspace(-1.0, 1.0, 7)
    tot = 0.0
    for k, o in enumerate(offs):
        cents = np.sign(o) * abs(o) ** 1.25 * 17.0 + rng.uniform(-0.7, 0.7)
        g = 1.0 if k == 3 else 0.72
        s = saw(f * 2.0 ** (cents / 1200.0), n, rng.random()) * g
        l, r = pan_gains(0.85 * o * (1 if k % 2 else -1))
        out[:, 0] += s * l
        out[:, 1] += s * r
        tot += g * g
    for k, cents in enumerate((-7.0, 7.0)):
        s = saw(2.0 * f * 2.0 ** (cents / 1200.0), n, rng.random()) * 0.32
        l, r = pan_gains(-0.6 if k == 0 else 0.6)
        out[:, 0] += s * l
        out[:, 1] += s * r
        tot += 0.32 ** 2
    sub = square(0.5 * f, n, rng.random()) * 0.42
    out += sub[:, None] * 0.7071
    tot += 0.42 ** 2
    out /= np.sqrt(tot)
    track = (mtof(midi) / 440.0) ** 0.3
    fc = (1700.0 + 3300.0 * np.exp(-t / 0.075)) * track
    out = sweep_filter(out, fc, "lp", q=0.85, per_oct=3.0)
    env = adsr(n, 0.005, 0.22, 0.72, rel, dur)
    return out * env[:, None]


def logo_voice(midi: int, dur: float, seed: int):
    """Audio-logo note: glassy FM bell + a long bright pluck + a soft octave sine halo (stereo)."""
    f = mtof(midi)
    bell = fm_bell(f, dur=dur, ratio=2.0, index=1.5, idx_tau=0.12, amp_tau=dur * 0.33)
    halo = fm_bell(2.0 * f, dur=dur, ratio=1.0, index=0.3, idx_tau=0.3, amp_tau=dur * 0.22, attack=0.01)
    pl = pluck(midi, 7, True)
    n = max(len(bell), len(pl))
    out = np.zeros((n, 2))
    out[: len(bell)] += 0.62 * bell[:, None]
    out[: len(halo), 0] += 0.22 * halo
    out[: len(halo), 1] += 0.18 * halo
    out[: len(pl)] += 0.85 * pl
    return out


def drone(midis, dur: float, seed: int):
    """Dark evolving intro drone: detuned pad voices with slow beating (stereo, unfiltered)."""
    n = s2n(dur)
    out = np.zeros((n, 2))
    for i, m in enumerate(midis):
        v = pad_voice(m, dur - 0.5, seed + 13 * i, attack=0.5, release=0.5, detune=13.0)
        out[: len(v)] += v[:n]
    return out / np.sqrt(len(midis))


def pitched(x, ratio: float):
    """Resample a one-shot to change its pitch (and length) by `ratio` (linear interpolation)."""
    n = len(x)
    m = max(2, int(n / ratio))
    pos = np.arange(m) * ratio
    pos = pos[pos <= n - 1]
    if x.ndim == 1:
        return np.interp(pos, np.arange(n), x)
    return np.stack([np.interp(pos, np.arange(n), x[:, c]) for c in range(x.shape[1])], axis=1)
