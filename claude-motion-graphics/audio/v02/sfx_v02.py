"""Video 02 sound design one-shots (numpy + scipy only, every generator seeded).

New voices that the first reel did not need: a warmer kick, a voice-friendly snap,
clock ticks, the RJ45 "clack", the electric zap, lock / selector clicks, the
wifi-off blip, the confirm chime, the question ping, an airy noise bed and a
varispeed (tape-stop) helper. Everything is built on audio/dsp.py primitives and
keeps its energy out of the 1-4 kHz voice band wherever the sound allows it.
"""
from __future__ import annotations

from functools import lru_cache

import numpy as np

from dsp import (SR, TWO_PI, apply_fades, bp, hp, lp, mtof, pan_gains, s2n, saw, sine, square, stereo_noise,
                 sweep_filter, tarr)


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


# ----------------------------------------------------------------------------
# drums
# ----------------------------------------------------------------------------
@lru_cache(maxsize=None)
def kick_warm(kind: str = "warm"):
    """Rounder kick than the first reel: less click, shorter snap, a touch more body (mono)."""
    rng = np.random.default_rng(611 if kind == "warm" else 612)
    if kind == "warm":
        dur, f_end, sweep, t_sw, snap, tau, drive, click_g = 0.40, 50.0, 112.0, 0.030, 150.0, 0.15, 1.35, 0.06
    elif kind == "big":
        dur, f_end, sweep, t_sw, snap, tau, drive, click_g = 0.48, 48.0, 140.0, 0.034, 210.0, 0.21, 1.7, 0.10
    else:
        raise ValueError(kind)
    n = s2n(dur)
    t = tarr(n)
    f = f_end + sweep * np.exp(-t / t_sw) + snap * np.exp(-t / 0.005)
    body = sine(f, n) * np.exp(-t / tau)
    body = np.tanh(drive * body) / np.tanh(drive)
    click = hp(rng.standard_normal(n), 4500.0, 2) * np.exp(-t / 0.0016) * click_g
    y = body + click
    return apply_fades(y, 0.0, 70.0)


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
# hook textures
# ----------------------------------------------------------------------------
@lru_cache(maxsize=None)
def clock_tick(kind: str = "tick", seed: int = 0):
    """Tiny, dry clock tick ('tick' brighter, 'tock' a little lower). Energy mostly above 4 kHz (mono)."""
    rng = np.random.default_rng(800 + seed + (0 if kind == "tick" else 50))
    n = s2n(0.05)
    t = tarr(n)
    f = 5900.0 if kind == "tick" else 4500.0
    click = hp(rng.standard_normal(n), 3800.0, 2) * np.exp(-t / 0.0006)
    res = _modes(t, ((f, 0.55, 0.004), (f * 1.47, 0.3, 0.0025), (f * 0.31, 0.12, 0.003)), rng)
    y = (click + res) * _attack(t, 0.0002)
    return apply_fades(_norm(y), 0.0, 10.0)


def typing_tick(rng):
    """Distant soft keyboard tick, high-passed so it stays above the voice (mono)."""
    n = s2n(0.06)
    t = tarr(n)
    click = hp(rng.standard_normal(n), 3600.0, 2) * np.exp(-t / 0.0012)
    res = np.sin(TWO_PI * rng.uniform(4300.0, 5600.0) * t) * np.exp(-t / 0.003) * 0.35
    thock = np.sin(TWO_PI * rng.uniform(230.0, 320.0) * t) * np.exp(-t / 0.009) * 0.35
    y = click + res + thock
    off = s2n(rng.uniform(0.012, 0.02))
    y[off:] += 0.25 * (click[: n - off] + res[: n - off])
    return apply_fades(lp(y, 9000.0, 2), 0.0, 15.0)


# ----------------------------------------------------------------------------
# cue one-shots
# ----------------------------------------------------------------------------
def plug_clack(seed: int = 900):
    """RJ45 pulled out: sharp plastic latch click + body resonances + a small weighty thump,
    then the latch springing back 14 ms later (stereo, peak 1)."""
    rng = np.random.default_rng(seed)
    n = s2n(0.18)
    t = tarr(n)
    imp = hp(rng.standard_normal(n), 700.0, 2) * np.exp(-t / 0.0009)
    modes = _modes(t, ((1480.0, 0.45, 0.005), (2390.0, 0.40, 0.0045), (3710.0, 0.32, 0.0035),
                       (5630.0, 0.28, 0.0028), (8100.0, 0.18, 0.002)), rng)
    thump = sine(140.0 + 110.0 * np.exp(-t / 0.004), n) * np.exp(-t / 0.02) * 0.85
    y = (imp + modes) * _attack(t, 0.00015) + thump * _attack(t, 0.0008)
    off = s2n(0.014)
    y[off:] += 0.42 * (imp[: n - off] + 0.7 * modes[: n - off])
    off2 = s2n(0.052)                                   # the cable swings: tiny rattle
    y[off2:] += 0.12 * imp[: n - off2]
    y = apply_fades(y, 0.0, 40.0)
    st = np.stack([y, y], axis=1)
    st[:, 0] += 0.15 * hp(np.roll(imp, 31), 2000.0, 1)   # a little width on the edge
    return _norm(st)


def zap(seed: int = 910, dur: float = 0.24):
    """Short electric zap: falling buzz with mains-like modulation + crackle (stereo)."""
    rng = np.random.default_rng(seed)
    n = s2n(dur)
    t = tarr(n)
    f = 92.0 * (1.0 + 1.4 * np.exp(-t / 0.025)) * (1.0 + 0.01 * rng.standard_normal(n).cumsum() / np.sqrt(n))
    buzz = 0.7 * saw(f, n, 0.1) + 0.4 * square(f * 1.5, n, 0.3, 0.3)
    buzz = bp(buzz, 220.0, 2600.0, 1) * (0.65 + 0.35 * np.sin(TWO_PI * 100.0 * t))
    p = 0.012 * np.exp(-t / 0.06) + 0.0006
    sparks = (rng.random(n) < p) * rng.uniform(-1.0, 1.0, n)
    k = np.exp(-np.arange(s2n(0.0015)) / (SR * 0.0003))
    crackle = lp(hp(np.convolve(sparks, k)[:n], 2800.0, 2), 6500.0, 2)
    env = _attack(t, 0.0008) * np.exp(-t / 0.055)
    y = (0.6 * buzz + 1.3 * crackle) * env
    st = np.stack([y, np.roll(y, 23)], axis=1)
    return _norm(apply_fades(st, 0.0, 50.0))


def power_down(dur: float = 0.42):
    """Low hum dying away: sine sweeping 110 -> 38 Hz with a decaying level (mono)."""
    n = s2n(dur)
    t = tarr(n)
    u = t / dur
    f = 38.0 + 72.0 * (1.0 - u) ** 2.2
    y = sine(f, n) + 0.25 * sine(2.0 * f, n, 0.2)
    env = _attack(t, 0.004) * (1.0 - u) ** 1.4
    return apply_fades(y * env, 0.0, 60.0)


def lock_click(seed: int = 920):
    """Padlock / secure lock: bright shackle snap, then the bolt 'clunk' 28 ms later (stereo)."""
    rng = np.random.default_rng(seed)
    n = s2n(0.28)
    t = tarr(n)
    c1 = hp(rng.standard_normal(n), 2200.0, 2) * np.exp(-t / 0.0006)
    c1 += _modes(t, ((2950.0, 0.28, 0.010), (4630.0, 0.32, 0.008), (7420.0, 0.30, 0.006), (9800.0, 0.2, 0.004)), rng)
    c1 *= _attack(t, 0.00012)
    c2 = hp(rng.standard_normal(n), 300.0, 2) * np.exp(-t / 0.0012) * 0.7
    c2 += _modes(t, ((780.0, 0.5, 0.022), (1290.0, 0.3, 0.012), (5200.0, 0.12, 0.006)), rng)
    c2 += sine(190.0 + 90.0 * np.exp(-t / 0.005), n) * np.exp(-t / 0.035) * 0.9
    y = c1.copy()
    off = s2n(0.028)
    y[off:] += 0.85 * c2[: n - off]
    y = apply_fades(y, 0.0, 60.0)
    st = np.stack([y, y], axis=1)
    return _norm(st)


def selector_click(seed: int = 930):
    """Rotary selector detent: crisp click with a small metallic ring and a settle click (stereo)."""
    rng = np.random.default_rng(seed)
    n = s2n(0.14)
    t = tarr(n)
    c = hp(rng.standard_normal(n), 1800.0, 2) * np.exp(-t / 0.0005)
    c += _modes(t, ((6200.0, 0.35, 0.004), (8900.0, 0.25, 0.003), (3300.0, 0.12, 0.003)), rng)
    c *= _attack(t, 0.0001)
    body = sine(420.0 + 200.0 * np.exp(-t / 0.002), n) * np.exp(-t / 0.009) * 0.5
    y = c + body
    off = s2n(0.036)
    y[off:] += 0.33 * c[: n - off]
    y = apply_fades(y, 0.0, 30.0)
    st = np.stack([y, y], axis=1)
    return _norm(st)


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


def wifi_off():
    """'Disconnected' blip: two descending tones A6 -> D6, the second sagging a little (mono)."""
    n = s2n(0.45)
    y = np.zeros(n)
    for t0, m, d, tau, g, gl in ((0.0, 93, 0.09, 0.03, 0.85, 0.0), (0.075, 86, 0.36, 0.09, 1.0, -1.0)):
        x = tone(mtof(m), d, tau, gl, h2=0.18, h3=0.05)
        a = s2n(t0)
        y[a:a + len(x)] += g * x
    return apply_fades(y, 0.0, 60.0)


def chime(midis, gaps_s=0.085, dur: float = 1.6, seed: int = 940):
    """Clean confirm chime: harmonic FM bell notes in quick succession (stereo)."""
    rng = np.random.default_rng(seed)
    n = s2n(dur + gaps_s * len(midis))
    out = np.zeros((n, 2))
    for i, m in enumerate(midis):
        f = mtof(m)
        k = s2n(dur)
        t = tarr(k)
        idx = 0.8 * (0.25 + 0.75 * np.exp(-t / 0.05))
        x = np.sin(TWO_PI * f * t + idx * np.sin(TWO_PI * 2.0 * f * t))
        x += 0.12 * np.sin(TWO_PI * 2.0 * f * t + rng.random())
        x *= _attack(t, 0.0012) * (0.65 * np.exp(-t / 0.18) + 0.35 * np.exp(-t / 0.7))
        x = apply_fades(x, 0.0, 200.0)
        a = s2n(i * gaps_s)
        l, r = pan_gains((-0.25, 0.25, 0.0)[i % 3])
        out[a:a + k, 0] += x * l * (1.0 if i == len(midis) - 1 else 0.8)
        out[a:a + k, 1] += x * r * (1.0 if i == len(midis) - 1 else 0.8)
    return out


def ping(midi: int, dur: float = 2.2):
    """The final question: one glassy ping (harmonic FM, faint octave halo), slightly open (mono)."""
    f = mtof(midi)
    n = s2n(dur)
    t = tarr(n)
    idx = 1.1 * (0.15 + 0.85 * np.exp(-t / 0.035))
    y = np.sin(TWO_PI * f * t + idx * np.sin(TWO_PI * 2.0 * f * t))
    y += 0.18 * np.sin(TWO_PI * 2.0 * f * t + 0.4) * np.exp(-t / 0.25)
    env = _attack(t, 0.0008) * (0.68 * np.exp(-t / 0.09) + 0.32 * np.exp(-t / 0.42))
    return apply_fades(y * env, 0.0, 300.0)


def air_bed(dur: float, seed: int, lo: float = 6500.0, hi: float = 14000.0, rate: float = 0.23):
    """Airy, breathing noise texture above the voice band (stereo)."""
    rng = np.random.default_rng(seed)
    n = s2n(dur)
    t = tarr(n)
    w = stereo_noise(rng, n, 0.3, 0.9)
    y = lp(hp(w, lo, 2), hi, 2)
    lfo = 0.6 + 0.4 * np.sin(TWO_PI * rate * t + rng.random() * 6.28) * np.sin(TWO_PI * rate * 0.37 * t + 1.0)
    return apply_fades(y * lfo[:, None], 300.0, 400.0)


def dive_riser(dur: float, seed: int, f0: float = 300.0, f1: float = 7000.0):
    """Short rising whoosh with an audible start (4 ms attack at -9 dB), peaking at its last sample (stereo)."""
    rng = np.random.default_rng(seed)
    n = s2n(dur)
    u = (np.arange(n) + 0.5) / n
    w = stereo_noise(rng, n, 0.55, 0.65)
    fc = f0 * (f1 / f0) ** (u ** 1.3)
    y = sweep_filter(w, fc, "bp", q=1.3, per_oct=5.0)
    y += 0.25 * hp(w, 6500.0, 2) * (u ** 2)[:, None]
    env = (0.45 + 0.55 * u ** 2.2) * (1.0 - np.exp(-np.arange(n) / (SR * 0.004)))
    pan = np.linspace(-0.35, 0.35, n)
    y[:, 0] *= env * np.cos((pan + 1.0) * np.pi / 4.0) * 1.4142
    y[:, 1] *= env * np.sin((pan + 1.0) * np.pi / 4.0) * 1.4142
    return _norm(apply_fades(y, 0.0, 6.0))


# ----------------------------------------------------------------------------
# varispeed (tape-stop style pitch dip)
# ----------------------------------------------------------------------------
def varispeed(x, start: int, n: int, rate):
    """Read x (stereo) from sample `start` with a per-output-sample playback `rate` (length n).
    Returns the warped segment and the final read lag in samples."""
    pos = start + np.concatenate(([0.0], np.cumsum(rate[: n - 1])))
    idx = np.arange(len(x))
    lo = int(np.floor(pos[0])) - 2
    hi = min(len(x), int(np.ceil(pos[-1])) + 3)
    seg_idx = idx[lo:hi]
    y = np.stack([np.interp(pos, seg_idx, x[lo:hi, c]) for c in range(x.shape[1])], axis=1)
    lag = (start + n) - (pos[-1] + rate[n - 1])
    return y, float(lag)
