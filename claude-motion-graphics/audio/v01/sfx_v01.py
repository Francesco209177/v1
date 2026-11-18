"""Video 01 sound design one-shots (numpy + scipy only, every generator seeded).

A few voices are copied from Video 02 (audio/v02/sfx_v02.py: warm kick, snap, typing tick,
selector / lock clicks, UI tone, air bed, dive riser) so that later edits to that video cannot
change this one. New for Video 01: the "send" accent, the granular token shatter, the dive into
the network, the token tick, the select / lock accent, the training data rush and the detuned
caveat ping with its gentle glitch. Everything is built on audio/dsp.py primitives and keeps its
energy out of the 1-4 kHz voice band wherever the sound allows it.
"""
from __future__ import annotations

from functools import lru_cache

import numpy as np

from dsp import (SR, TWO_PI, apply_fades, bp, hp, lp, mtof, pan_gains, s2n, sine, square, stereo_noise, sweep_filter,
                 tarr)


def _norm(x, peak: float = 1.0):
    m = float(np.max(np.abs(x)))
    return x * (peak / m) if m > 0 else x


def _modes(t, modes, rng):
    """Sum of exponentially damped sines [(freq, gain, tau), ...] with random phases."""
    y = np.zeros(len(t))
    for f, g, tau in modes:
        y += g * np.sin(TWO_PI * f * t + rng.random() * TWO_PI) * np.exp(-t / tau)
    return y


def _attack(t, tau: float = 0.0004):
    return 1.0 - np.exp(-t / tau)


def _pan_st(y, p: float):
    l, r = pan_gains(p)
    return np.stack([y * l, y * r], axis=1)


# ----------------------------------------------------------------------------
# drums (copied from v02)
# ----------------------------------------------------------------------------
@lru_cache(maxsize=None)
def kick_warm(kind: str = "warm"):
    """Round kick: little click, short snap, a touch of body (mono)."""
    rng = np.random.default_rng(611 if kind == "warm" else 612)
    if kind == "warm":
        dur, f_end, sweep, t_sw, snap_, tau, drive, click_g = 0.40, 50.0, 112.0, 0.030, 150.0, 0.15, 1.35, 0.06
    elif kind == "big":
        dur, f_end, sweep, t_sw, snap_, tau, drive, click_g = 0.48, 48.0, 140.0, 0.034, 210.0, 0.21, 1.7, 0.10
    else:
        raise ValueError(kind)
    n = s2n(dur)
    t = tarr(n)
    f = f_end + sweep * np.exp(-t / t_sw) + snap_ * np.exp(-t / 0.005)
    body = sine(f, n) * np.exp(-t / tau)
    body = np.tanh(drive * body) / np.tanh(drive)
    click = hp(rng.standard_normal(n), 4500.0, 2) * np.exp(-t / 0.0016) * click_g
    return apply_fades(body + click, 0.0, 70.0)


@lru_cache(maxsize=None)
def snap(variant: int = 0):
    """Backbeat 'snap' for under a voice: low body + air above 5 kHz, almost nothing at 1-4 kHz (stereo)."""
    rng = np.random.default_rng(700 + variant)
    n = s2n(0.26)
    t = tarr(n)
    env = np.zeros(n)
    for t0, g, tau in ((0.0, 0.7, 0.004), (0.009, 0.85, 0.004), (0.019, 1.0, 0.006)):
        m = t >= t0
        env[m] += g * np.exp(-(t[m] - t0) / tau)
    m = t >= 0.019
    env[m] += 0.45 * np.exp(-(t[m] - 0.019) / 0.06)
    air = hp(stereo_noise(rng, n, 0.7, 0.5), 5400.0, 2) * env[:, None]
    f = 190.0 + 70.0 * np.exp(-t / 0.008)
    body = sine(f, n) * np.exp(-t / 0.032)
    thump = lp(rng.standard_normal(n), 650.0, 2) * np.exp(-t / 0.018)
    y = 0.75 * air + (0.55 * body + 0.35 * thump)[:, None]
    return _norm(apply_fades(y, 0.0, 30.0))


# ----------------------------------------------------------------------------
# hook: typing + send
# ----------------------------------------------------------------------------
def typing_tick(rng, kind: str = "key"):
    """Soft keyboard tick, high-passed so it stays above the voice; 'space' / 'shift' are a little
    lower and rounder (mono)."""
    n = s2n(0.06)
    t = tarr(n)
    click = hp(rng.standard_normal(n), 3600.0, 2) * np.exp(-t / 0.0012)
    res = np.sin(TWO_PI * rng.uniform(4300.0, 5600.0) * t) * np.exp(-t / 0.003) * 0.35
    f_th, g_th, tau_th = rng.uniform(230.0, 320.0), 0.35, 0.009
    if kind == "space":
        f_th, g_th, tau_th = rng.uniform(170.0, 200.0), 0.6, 0.014
        click *= 0.8
    elif kind == "shift":
        f_th, g_th = rng.uniform(200.0, 240.0), 0.45
    thock = np.sin(TWO_PI * f_th * t) * np.exp(-t / tau_th) * g_th
    y = click + res + thock
    off = s2n(rng.uniform(0.012, 0.02))
    y[off:] += 0.25 * (click[: n - off] + res[: n - off])
    return apply_fades(lp(y, 9000.0, 2), 0.0, 15.0)


def send_accent(seed: int = 150):
    """The question is complete: a rounded 'enter' thock + crisp click + a tiny upward two-tone
    chirp B7 -> E8 and an airy 'fwip' rising above the voice band (stereo, peak 1)."""
    rng = np.random.default_rng(seed)
    n = s2n(0.5)
    t = tarr(n)
    click = hp(rng.standard_normal(n), 3000.0, 2) * np.exp(-t / 0.0009)
    thock = sine(150.0 + 70.0 * np.exp(-t / 0.006), n) * np.exp(-t / 0.026) * 1.1
    y = (0.75 * click + thock) * _attack(t, 0.00015)
    chirp = np.zeros(n)
    for t0, m, tau, g in ((0.012, 107, 0.03, 0.55), (0.062, 112, 0.07, 0.7)):    # B7, E8
        a = s2n(t0)
        tt = t[: n - a]
        f = mtof(m) * (1.0 - 0.06 * np.exp(-tt / 0.006))
        ph = np.cumsum(f) / SR
        chirp[a:] += g * np.sin(TWO_PI * ph) * _attack(tt, 0.0008) * np.exp(-tt / tau)
    w = stereo_noise(rng, n, 0.5, 0.7)
    u = np.clip(t / 0.16, 0.0, 1.0)
    fwip = sweep_filter(w, 4000.0 * (3.0 ** u), "bp", q=1.4, per_oct=5.0)
    fwip *= (np.sin(np.pi * u) ** 2 * (t < 0.16))[:, None] * 0.5
    st = np.stack([y, y], axis=1) + chirp[:, None] * np.array([0.85, 1.0]) + fwip
    return _norm(apply_fades(st, 0.0, 120.0))


# ----------------------------------------------------------------------------
# movement: dive riser (2.0 -> 3.0 s), dive into the network (7.5 s)
# ----------------------------------------------------------------------------
def dive_riser(dur: float, seed: int, f0: float = 300.0, f1: float = 7000.0, start_g: float = 0.45):
    """Rising whoosh with an audible start (4 ms attack), peaking at its last sample (stereo)."""
    rng = np.random.default_rng(seed)
    n = s2n(dur)
    u = (np.arange(n) + 0.5) / n
    w = stereo_noise(rng, n, 0.55, 0.65)
    fc = f0 * (f1 / f0) ** (u ** 1.3)
    y = sweep_filter(w, fc, "bp", q=1.3, per_oct=5.0)
    y += 0.25 * hp(w, 6500.0, 2) * (u ** 2)[:, None]
    env = (start_g + (1.0 - start_g) * u ** 2.2) * (1.0 - np.exp(-np.arange(n) / (SR * 0.004)))
    pan = np.linspace(-0.35, 0.35, n)
    y[:, 0] *= env * np.cos((pan + 1.0) * np.pi / 4.0) * 1.4142
    y[:, 1] *= env * np.sin((pan + 1.0) * np.pi / 4.0) * 1.4142
    return _norm(apply_fades(y, 0.0, 6.0))


def dive_down(seed: int = 750, dur: float = 0.9):
    """The tokens fly into the network: a sharp 'swish' that dives (band-pass falling 7 kHz -> 260 Hz,
    panning R -> L), a cluster of tiny falling zips (the tokens) and a sub drop (stereo, peak 1)."""
    rng = np.random.default_rng(seed)
    n = s2n(dur)
    t = tarr(n)
    u = t / dur
    w = stereo_noise(rng, n, 0.55, 0.65)
    fc = 7000.0 * (260.0 / 7000.0) ** (u ** 0.55)
    sw = sweep_filter(w, fc, "bp", q=1.5, per_oct=5.0)
    env = _attack(t, 0.0012) * (0.35 * np.exp(-t / 0.02) + 0.65 * np.exp(-t / 0.22))
    pan = np.linspace(0.5, -0.5, n)
    sw[:, 0] *= env * np.cos((pan + 1.0) * np.pi / 4.0) * 1.4142
    sw[:, 1] *= env * np.sin((pan + 1.0) * np.pi / 4.0) * 1.4142
    # the opening edge: a short high air burst right on the cue
    edge = hp(stereo_noise(rng, n, 0.6, 0.6), 4500.0, 2) * (_attack(t, 0.0003) * np.exp(-t / 0.012))[:, None]
    # tokens zipping past: short falling chirps above the voice band
    zips = np.zeros((n, 2))
    for k in range(11):
        a = s2n(0.004 + 0.026 * k + rng.uniform(0.0, 0.008))
        m = s2n(0.05)
        tt = tarr(m)
        f = rng.uniform(6500.0, 9000.0) * (0.55 ** (tt / 0.05))
        z = np.sin(TWO_PI * np.cumsum(f) / SR) * _attack(tt, 0.0005) * np.exp(-tt / 0.012)
        zz = _pan_st(z, rng.uniform(-0.9, 0.9)) * (0.6 - 0.035 * k)
        zips[a:a + m] += zz[: max(0, min(m, n - a))]
    f = 45.0 + 120.0 * np.exp(-t / 0.09)
    sub = sine(f, n) * _attack(t, 0.003) * np.exp(-t / 0.25)
    y = 1.0 * sw + 0.5 * edge + 0.55 * zips + 0.55 * sub[:, None]
    return _norm(apply_fades(y, 0.0, 120.0))


# ----------------------------------------------------------------------------
# 6.0 s SPLIT: the sentence shatters into tokens
# ----------------------------------------------------------------------------
def shatter(seed: int = 600, dur: float = 0.65):
    """Crisp 'shatter' of many tiny digital pieces: a glassy crack on the cue, then a decaying
    shower of grains (noise crackles, square 'bit' blips and sine tinks at 3-12 kHz, the 11 tokens),
    plus a small low pop for weight (stereo, peak 1)."""
    rng = np.random.default_rng(seed)
    n = s2n(dur)
    t = tarr(n)
    out = np.zeros((n, 2))
    # crack: very short broadband crack, mostly above 2 kHz, with a few high glassy modes
    crack = hp(rng.standard_normal(n), 2000.0, 2) * np.exp(-t / 0.0011)
    crack += _modes(t, ((5300.0, 0.35, 0.006), (7900.0, 0.3, 0.005), (10400.0, 0.25, 0.004),
                        (12800.0, 0.18, 0.003)), rng)
    crack *= _attack(t, 0.0001)
    out += np.stack([crack, np.roll(crack, 17)], axis=1) * 0.9
    pop = sine(240.0 + 160.0 * np.exp(-t / 0.004), n) * _attack(t, 0.0005) * np.exp(-t / 0.018)
    out += pop[:, None] * 0.55
    # grains: arrival density decays exponentially (most in the first 150 ms)
    n_gr = 90
    arr_t = np.sort(rng.exponential(0.11, n_gr)) + 0.002
    arr_t = arr_t[arr_t < dur - 0.03]
    for k, t0 in enumerate(arr_t):
        a = s2n(t0)
        kind = rng.random()
        g = 0.55 * np.exp(-t0 / 0.22) * rng.uniform(0.4, 1.0)
        if kind < 0.4:                         # crackle: 0.3-1.2 ms band-passed noise click
            m = s2n(rng.uniform(0.002, 0.006))
            tt = tarr(m)
            fc = rng.uniform(4000.0, 11000.0)
            z = bp(rng.standard_normal(m), fc * 0.7, min(fc * 1.4, 20000.0), 1) * np.exp(-tt / rng.uniform(0.0003,
                                                                                                        0.0012))
        elif kind < 0.7:                       # digital 'bit': tiny square blip, hard-ish edges
            m = s2n(rng.uniform(0.003, 0.008))
            tt = tarr(m)
            f = rng.uniform(2600.0, 6000.0)
            z = square(f, m, rng.random()) * apply_fades(np.ones(m), 0.25, 1.0) * 0.45
            z = hp(z, 3000.0, 2)
        else:                                  # glass tink: damped sine
            m = s2n(0.04)
            tt = tarr(m)
            f = rng.uniform(4200.0, 12000.0)
            z = np.sin(TWO_PI * f * tt) * _attack(tt, 0.0002) * np.exp(-tt / rng.uniform(0.003, 0.009))
        z = apply_fades(z, 0.0, 0.5)
        st = _pan_st(z, rng.uniform(-0.95, 0.95)) * g
        e = min(n, a + len(st))
        out[a:e] += st[: e - a]
    # the 11 tokens: pitched tinks (E minor, high) right after the crack
    tokens = (88, 95, 91, 100, 93, 98, 103, 96, 107, 100, 112)       # E6 B6 G6 E7 A6 D7 G7 C7 B7 E7 E8
    for k, m in enumerate(tokens):
        a = s2n(0.006 + 0.021 * k)
        L = s2n(0.12)
        tt = tarr(L)
        f = mtof(m + 12 if m < 100 else m)
        z = (np.sin(TWO_PI * f * tt) + 0.2 * np.sin(TWO_PI * 2.0 * f * tt)) * _attack(tt, 0.0003) * np.exp(-tt / 0.018)
        st = _pan_st(z, (-0.8, 0.8, -0.5, 0.5, -0.2, 0.2, -0.65, 0.65, -0.35, 0.35, 0.0)[k]) * (0.32 - 0.012 * k)
        e = min(n, a + L)
        out[a:e] += st[: e - a]
    return _norm(apply_fades(out, 0.0, 120.0))


# ----------------------------------------------------------------------------
# data: token ticks, pick / lock, training rush
# ----------------------------------------------------------------------------
@lru_cache(maxsize=None)
def token_tick(midi: int, accent: bool = False, seed: int = 0):
    """Soft 'token appended' tick: tiny air click + a high damped sine (4-8 kHz) + a faint low
    'tok' so it reads on phones; the accent version is longer and has an upper octave (mono)."""
    rng = np.random.default_rng(1800 + seed + (500 if accent else 0))
    n = s2n(0.16 if accent else 0.09)
    t = tarr(n)
    f = mtof(midi)
    click = hp(rng.standard_normal(n), 5000.0, 2) * np.exp(-t / 0.0006)
    pitch = np.sin(TWO_PI * f * t) * np.exp(-t / (0.03 if accent else 0.012))
    if accent:
        pitch += 0.45 * np.sin(TWO_PI * 1.5 * f * t) * np.exp(-t / 0.02)    # a fifth above
    tok = np.sin(TWO_PI * (520.0 + 300.0 * np.exp(-t / 0.002)) * t) * np.exp(-t / 0.006) * 0.25
    y = (0.6 * click + 0.8 * pitch + tok) * _attack(t, 0.0002)
    return _norm(apply_fades(y, 0.0, 20.0))


def light_sweep(seed: int = 2200, dur: float = 0.467, midis=(110, 114, 117)):
    """Light blade over the finished answer (frames 660-674): a soft airy 'shine' rising 3.5 -> 11 kHz and
    travelling L -> R, with a small edge on its first sample and three glints (D8 F#8 A8) as it passes the
    tokens; peak ~0.2 s in (stereo, peak 1)."""
    rng = np.random.default_rng(seed)
    tail = 0.3
    n = s2n(dur + tail)
    t = tarr(n)
    u = np.clip(t / dur, 0.0, 1.0)
    w = stereo_noise(rng, n, 0.5, 0.7)
    sh = sweep_filter(w, 3500.0 * (11000.0 / 3500.0) ** u, "bp", q=1.6, per_oct=5.0)
    bell = np.sin(np.pi * np.clip(t / (dur + 0.05), 0.0, 1.0)) ** 2
    env = _attack(t, 0.003) * (0.35 * np.exp(-t / 0.03) + 0.65 * bell)
    pan = -0.7 + 1.4 * u
    sh[:, 0] *= env * np.cos((pan + 1.0) * np.pi / 4.0) * 1.4142
    sh[:, 1] *= env * np.sin((pan + 1.0) * np.pi / 4.0) * 1.4142
    out = sh
    for k, (t0, m) in enumerate(zip((0.07, 0.2, 0.33), midis)):
        a = s2n(t0)
        L = s2n(0.25)
        tt = tarr(L)
        f = mtof(m)
        z = (np.sin(TWO_PI * f * tt) + 0.15 * np.sin(TWO_PI * 2.0 * f * tt)) * _attack(tt, 0.001) * np.exp(-tt / 0.06)
        out[a:a + L] += _pan_st(z, (-0.5, 0.0, 0.5)[k]) * 0.35
    return _norm(apply_fades(out, 0.0, tail * 900.0))


def select_lock(seed: int = 1750):
    """'Pick': the most probable token is chosen - a crisp detent click, a bolt 'clunk' 26 ms later
    and a short bright confirm tone (E7 + octave) (stereo, peak 1)."""
    rng = np.random.default_rng(seed)
    n = s2n(0.5)
    t = tarr(n)
    c1 = hp(rng.standard_normal(n), 2200.0, 2) * np.exp(-t / 0.0006)
    c1 += _modes(t, ((4630.0, 0.3, 0.007), (7420.0, 0.3, 0.005), (9800.0, 0.2, 0.004)), rng)
    c1 *= _attack(t, 0.00012)
    c2 = hp(rng.standard_normal(n), 300.0, 2) * np.exp(-t / 0.0012) * 0.55
    c2 += _modes(t, ((780.0, 0.4, 0.018), (5200.0, 0.12, 0.006)), rng)
    c2 += sine(170.0 + 90.0 * np.exp(-t / 0.005), n) * np.exp(-t / 0.035) * 0.9
    y = c1.copy()
    off = s2n(0.026)
    y[off:] += 0.8 * c2[: n - off]
    a = s2n(0.004)
    tt = t[: n - a]
    f = mtof(100)                                                           # E7
    ton = np.sin(TWO_PI * f * tt) + 0.35 * np.sin(TWO_PI * 2.0 * f * tt + 0.3) * np.exp(-tt / 0.05)
    ton *= _attack(tt, 0.0008) * (0.7 * np.exp(-tt / 0.06) + 0.3 * np.exp(-tt / 0.25))
    y[a:] += 0.36 * ton
    st = np.stack([y, y], axis=1)
    return _norm(apply_fades(st, 0.0, 120.0))


def data_rush(dur: float = 3.6, seed: int = 2300, midis=()):
    """'Enormous amounts of text': a dense data stream - Poisson crackle (hundreds of tiny clicks per
    second, 5-14 kHz), gated 'packet' noise and a rain of fast high blips on the chord - starting
    dense on the cue and thinning out under the voice (stereo, peak 1)."""
    rng = np.random.default_rng(seed)
    n = s2n(dur)
    t = tarr(n)
    dens = 420.0 * np.exp(-t / 0.9) + 50.0
    # crackle
    p = dens / SR
    hits = rng.random(n) < p
    amp = np.where(hits, rng.uniform(0.3, 1.0, n) * np.sign(rng.standard_normal(n)), 0.0)
    k = np.exp(-np.arange(s2n(0.002)) / (SR * 0.00035))
    cr = np.stack([np.convolve(amp * (rng.random(n) < 0.6), k)[:n], np.convolve(amp * (rng.random(n) < 0.6),
                                                                                 k)[:n]], axis=1)
    cr = lp(hp(cr, 5000.0, 2), 14000.0, 2)
    # packets: band-passed noise gated in 32nd / 64th notes, random levels
    w = stereo_noise(rng, n, 0.4, 0.8)
    pk = bp(w, 5500.0, 12000.0, 2)
    step = s2n(0.03125)
    gates = np.repeat(rng.random(n // step + 1) ** 2.0, step)[:n]
    gates = np.convolve(gates, np.ones(96) / 96, mode="same")       # 2 ms edges
    pk *= gates[:, None]
    # blips: 64th-note rain on chord tones, 2 octaves above the voice band
    bl = np.zeros((n, 2))
    pool = [m for m in midis] or [96, 100, 103, 107]
    s = 0.0
    while s < dur - 0.08:
        if rng.random() < 0.9 * np.exp(-s / 1.1) + 0.12:
            m = int(rng.choice(pool))
            L = s2n(0.05)
            tt = tarr(L)
            f = mtof(m)
            z = np.sin(TWO_PI * f * tt * (1.0 + 0.04 * np.exp(-tt / 0.004))) * _attack(tt, 0.0006) * np.exp(-tt / 0.01)
            a = s2n(s)
            e = min(n, a + L)
            bl[a:e] += _pan_st(z, rng.uniform(-0.95, 0.95))[: e - a] * rng.uniform(0.25, 0.7)
        s += 0.015625 + rng.uniform(0.0, 0.01)
    env = _attack(t, 0.002) * (0.25 + 0.75 * np.exp(-t / 0.7))
    y = (0.8 * cr + 0.55 * pk + 0.45 * bl) * env[:, None]
    return _norm(apply_fades(y, 0.0, dur * 350.0))


# ----------------------------------------------------------------------------
# UI tones, caveat
# ----------------------------------------------------------------------------
def tone(f: float, dur: float, tau: float, glide_semis: float = 0.0, h2: float = 0.22, h3: float = 0.06,
         attack: float = 0.0015):
    """Clean UI tone (sine + light harmonics), optional pitch glide over its length (mono)."""
    n = s2n(dur)
    t = tarr(n)
    fr = f * 2.0 ** (glide_semis * (t / dur) ** 1.5 / 12.0)
    ph = np.cumsum(fr) / SR
    y = np.sin(TWO_PI * ph) + h2 * np.sin(2 * TWO_PI * ph) + h3 * np.sin(3 * TWO_PI * ph)
    env = _attack(t, attack) * np.exp(-t / tau)
    return apply_fades(y * env, 0.0, min(40.0, dur * 300.0))


def caveat_ping(midi: int, dur: float = 2.0, seed: int = 2800):
    """'Puo' sbagliare': a glassy FM ping that is slightly unsure of itself - its pitch sags ~35 cents
    and a slow vibrato fades in, with a second, detuned partial (+9 cents) that beats gently (stereo)."""
    rng = np.random.default_rng(seed)
    n = s2n(dur)
    t = tarr(n)
    f0 = mtof(midi)
    sag = -35.0 * (1.0 - np.exp(-np.maximum(t - 0.12, 0.0) / 0.5))
    vib = 9.0 * (1.0 - np.exp(-np.maximum(t - 0.25, 0.0) / 0.35)) * np.sin(TWO_PI * 4.6 * t)
    out = np.zeros((n, 2))
    for cents, p, g in ((0.0, -0.25, 1.0), (9.0, 0.3, 0.55)):
        f = f0 * 2.0 ** ((sag + vib + cents) / 1200.0)
        ph = np.cumsum(f) / SR
        idx = 1.0 * (0.15 + 0.85 * np.exp(-t / 0.035))
        y = np.sin(TWO_PI * ph + idx * np.sin(TWO_PI * 2.0 * ph + rng.random()))
        y += 0.16 * np.sin(TWO_PI * 2.0 * ph + 0.4) * np.exp(-t / 0.25)
        y *= _attack(t, 0.0008) * (0.65 * np.exp(-t / 0.09) + 0.35 * np.exp(-t / 0.5)) * g
        out += _pan_st(y, p)
    return _norm(apply_fades(out, 0.0, dur * 300.0))


def glitch(src, grain_s: float = 0.016, repeats=(1.0, 0.0, 0.62, 0.0, 0.4, 0.28), step_s: float = 0.03125,
           crush: int = 5, hp_hz: float = 1800.0):
    """Gentle digital glitch: the first grain of `src` (stereo) is sample-and-hold crushed, high-passed
    and stuttered on a 64th-note grid (gains `repeats`; 0 = skipped step) (stereo)."""
    g = s2n(grain_s)
    grain = np.array(src[:g], dtype=np.float64)
    idx = (np.arange(g) // crush) * crush
    grain = grain[idx]
    grain = hp(grain, hp_hz, 2)
    grain = apply_fades(grain, 0.3, 3.0)
    step = s2n(step_s)
    n = step * len(repeats) + g
    out = np.zeros((n, 2))
    for k, gain in enumerate(repeats):
        if gain <= 0.0:
            continue
        a = k * step
        out[a:a + g] += grain * gain * (1.0 if k % 2 == 0 else 0.85)
    return out


def air_bed(dur: float, seed: int, lo: float = 6500.0, hi: float = 14000.0, rate: float = 0.23):
    """Airy, breathing noise texture above the voice band (stereo)."""
    rng = np.random.default_rng(seed)
    n = s2n(dur)
    t = tarr(n)
    w = stereo_noise(rng, n, 0.3, 0.9)
    y = lp(hp(w, lo, 2), hi, 2)
    lfo = 0.6 + 0.4 * np.sin(TWO_PI * rate * t + rng.random() * 6.28) * np.sin(TWO_PI * rate * 0.37 * t + 1.0)
    return apply_fades(y * lfo[:, None], 300.0, 400.0)


def low_breath(dur: float, seed: int, fc: float = 220.0, rate: float = 0.17):
    """Dark, slowly breathing low noise (the inside of the machine), below the voice band (stereo)."""
    rng = np.random.default_rng(seed)
    n = s2n(dur)
    t = tarr(n)
    w = stereo_noise(rng, n, 0.4, 0.8)
    y = bp(w, fc * 0.5, fc * 1.6, 2)
    lfo = 0.55 + 0.45 * np.sin(TWO_PI * rate * t + rng.random() * 6.28)
    return apply_fades(y * lfo[:, None], 600.0, 600.0)
