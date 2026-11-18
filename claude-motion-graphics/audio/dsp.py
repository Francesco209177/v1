"""DSP primitives for the procedural soundtrack (numpy + scipy only).

Conventions
-----------
* Sample rate 48 kHz, 120 BPM: one beat = 24 000 samples, a 16th = 6 000.
* Mono signals are 1-D arrays, stereo signals are (n, 2) arrays.
* Everything here is deterministic: random generators are always seeded.
"""
from __future__ import annotations

import numpy as np
from scipy import signal
from scipy.ndimage import minimum_filter1d, uniform_filter1d

SR = 48000
BPM = 120.0
BEAT_S = 60.0 / BPM
SPB = int(round(SR * BEAT_S))  # samples per beat = 24000
DURATION_S = 30.0
N = int(round(SR * DURATION_S))  # 1 440 000

TWO_PI = 2.0 * np.pi


# ----------------------------------------------------------------------------
# time / pitch helpers
# ----------------------------------------------------------------------------
def b2s(beat: float) -> int:
    """Beat position -> sample index."""
    return int(round(beat * SPB))


def s2n(seconds: float) -> int:
    """Seconds -> number of samples."""
    return int(round(seconds * SR))


def db2lin(d: float) -> float:
    return float(10.0 ** (d / 20.0))


def lin2db(x: float) -> float:
    return float(20.0 * np.log10(max(float(x), 1e-12)))


_NAMES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"]
_BASE = {"C": 0, "D": 2, "E": 4, "F": 5, "G": 7, "A": 9, "B": 11}


def n2m(name: str) -> int:
    """'A4' -> 69, 'C#5' -> 73, 'Bb3' -> 58."""
    pc = _BASE[name[0].upper()]
    i = 1
    while i < len(name) and name[i] in "#b":
        pc += 1 if name[i] == "#" else -1
        i += 1
    return 12 * (int(name[i:]) + 1) + pc


def m2n(midi: int) -> str:
    return f"{_NAMES[midi % 12]}{midi // 12 - 1}"


def mtof(midi: float) -> float:
    return float(440.0 * 2.0 ** ((midi - 69.0) / 12.0))


def tarr(n: int) -> np.ndarray:
    return np.arange(n, dtype=np.float64) / SR


# ----------------------------------------------------------------------------
# oscillators (band-limited)
# ----------------------------------------------------------------------------
def _phase(freq, n: int, phase0: float = 0.0):
    f = np.asarray(freq, dtype=np.float64)
    if f.ndim == 0:
        dt = np.full(n, float(f) / SR)
    else:
        dt = f[:n] / SR
    ph = phase0 + np.concatenate(([0.0], np.cumsum(dt[:-1])))
    return ph, dt


def sine(freq, n: int, phase0: float = 0.0) -> np.ndarray:
    ph, _ = _phase(freq, n, phase0)
    return np.sin(TWO_PI * ph)


def saw(freq, n: int, phase0: float = 0.0) -> np.ndarray:
    """PolyBLEP sawtooth, range -1..1. `freq` scalar or per-sample array."""
    ph, dt = _phase(freq, n, phase0)
    t = ph - np.floor(ph)
    y = 2.0 * t - 1.0
    m = t < dt
    x = t[m] / dt[m]
    y[m] -= x + x - x * x - 1.0
    m = t > 1.0 - dt
    x = (t[m] - 1.0) / dt[m]
    y[m] -= x * x + x + x + 1.0
    return y


def square(freq, n: int, phase0: float = 0.0, pw: float = 0.5) -> np.ndarray:
    """PolyBLEP pulse built from two saws."""
    return saw(freq, n, phase0) - saw(freq, n, phase0 + pw) + (2.0 * pw - 1.0)


# ----------------------------------------------------------------------------
# envelopes
# ----------------------------------------------------------------------------
def _ramp(n: int) -> np.ndarray:
    """Raised-cosine 0..1 ramp of n samples."""
    if n <= 0:
        return np.zeros(0)
    return 0.5 - 0.5 * np.cos(np.pi * (np.arange(n) + 0.5) / n)


def apply_fades(x: np.ndarray, in_ms: float = 0.0, out_ms: float = 0.0) -> np.ndarray:
    """Return a copy of x with raised-cosine fade in / fade out."""
    y = np.array(x, dtype=np.float64, copy=True)
    n = len(y)
    ni = min(n, s2n(in_ms / 1000.0))
    no = min(n, s2n(out_ms / 1000.0))
    if ni > 0:
        r = _ramp(ni)
        y[:ni] = (y[:ni].T * r).T
    if no > 0:
        r = _ramp(no)[::-1]
        y[n - no:] = (y[n - no:].T * r).T
    return y


def adsr(n: int, a: float, d: float, s: float, r: float, gate_s: float) -> np.ndarray:
    """Linear-attack / exponential-decay ADSR with raised-cosine release."""
    t = tarr(n)
    env = np.minimum(t / max(a, 1e-5), 1.0)
    dec = s + (1.0 - s) * np.exp(-np.maximum(t - a, 0.0) / max(d, 1e-5))
    env = env * dec
    g = s2n(gate_s)
    rn = s2n(r)
    if g < n:
        rel = np.zeros(n - g)
        k = min(rn, n - g)
        rel[:k] = _ramp(k)[::-1]
        env[g:] *= rel
    return env


def automation(points, n: int = N, log: bool = False) -> np.ndarray:
    """Piecewise-linear automation curve from [(time_s, value), ...]."""
    ts = np.array([p[0] for p in points], dtype=np.float64)
    vs = np.array([p[1] for p in points], dtype=np.float64)
    t = tarr(n)
    if log:
        return np.exp(np.interp(t, ts, np.log(vs)))
    return np.interp(t, ts, vs)


# ----------------------------------------------------------------------------
# filters
# ----------------------------------------------------------------------------
_SOS_CACHE: dict = {}


def _butter(kind: str, fc, order: int):
    key = (kind, tuple(np.atleast_1d(fc).round(3)), order)
    sos = _SOS_CACHE.get(key)
    if sos is None:
        sos = signal.butter(order, fc, btype=kind, fs=SR, output="sos")
        _SOS_CACHE[key] = sos
    return sos


def lp(x, fc: float, order: int = 2):
    return signal.sosfilt(_butter("low", min(fc, SR * 0.48), order), x, axis=0)


def hp(x, fc: float, order: int = 2):
    return signal.sosfilt(_butter("high", fc, order), x, axis=0)


def bp(x, f1: float, f2: float, order: int = 2):
    return signal.sosfilt(_butter("band", [f1, min(f2, SR * 0.48)], order), x, axis=0)


def rbj(kind: str, f0: float, q: float = 0.7071, gain_db: float = 0.0):
    """RBJ cookbook biquads -> normalised (b, a)."""
    f0 = float(min(max(f0, 10.0), SR * 0.47))
    w0 = TWO_PI * f0 / SR
    cw, sw = np.cos(w0), np.sin(w0)
    alpha = sw / (2.0 * q)
    A = 10.0 ** (gain_db / 40.0)
    if kind == "lp":
        b = [(1 - cw) / 2, 1 - cw, (1 - cw) / 2]
        a = [1 + alpha, -2 * cw, 1 - alpha]
    elif kind == "hp":
        b = [(1 + cw) / 2, -(1 + cw), (1 + cw) / 2]
        a = [1 + alpha, -2 * cw, 1 - alpha]
    elif kind == "bp":
        b = [alpha, 0.0, -alpha]
        a = [1 + alpha, -2 * cw, 1 - alpha]
    elif kind == "peak":
        b = [1 + alpha * A, -2 * cw, 1 - alpha * A]
        a = [1 + alpha / A, -2 * cw, 1 - alpha / A]
    elif kind == "loshelf":
        sq = 2 * np.sqrt(A) * alpha
        b = [A * ((A + 1) - (A - 1) * cw + sq), 2 * A * ((A - 1) - (A + 1) * cw), A * ((A + 1) - (A - 1) * cw - sq)]
        a = [(A + 1) + (A - 1) * cw + sq, -2 * ((A - 1) + (A + 1) * cw), (A + 1) + (A - 1) * cw - sq]
    elif kind == "hishelf":
        sq = 2 * np.sqrt(A) * alpha
        b = [A * ((A + 1) + (A - 1) * cw + sq), -2 * A * ((A - 1) + (A + 1) * cw), A * ((A + 1) + (A - 1) * cw - sq)]
        a = [(A + 1) - (A - 1) * cw + sq, 2 * ((A - 1) - (A + 1) * cw), (A + 1) - (A - 1) * cw - sq]
    else:
        raise ValueError(kind)
    b = np.asarray(b, dtype=np.float64) / a[0]
    a = np.asarray(a, dtype=np.float64) / a[0]
    return b, a


def biquad(x, kind: str, f0: float, q: float = 0.7071, gain_db: float = 0.0):
    b, a = rbj(kind, f0, q, gain_db)
    return signal.lfilter(b, a, x, axis=0)


def sweep_filter(x, fc, kind: str = "lp", q: float = 0.7071, stages: int = 1, per_oct: float = 6.0):
    """Time-varying filter: cross-fade between a bank of static biquads.

    `fc` is a per-sample cutoff trajectory (Hz). The signal is filtered by a
    log-spaced bank spanning min(fc)..max(fc) and the outputs are linearly
    interpolated along the trajectory. Cheap, click-free and fully vectorised.
    """
    x = np.asarray(x, dtype=np.float64)
    n = len(x)
    fc = np.clip(np.asarray(fc, dtype=np.float64)[:n], 20.0, SR * 0.46)
    fmin, fmax = float(fc.min()), float(fc.max())

    def run(sig, f):
        b, a = rbj(kind, f, q)
        for _ in range(stages):
            sig = signal.lfilter(b, a, sig, axis=0)
        return sig

    if fmax / fmin < 1.02:
        return run(x, np.sqrt(fmin * fmax))
    octs = np.log2(fmax / fmin)
    k = max(2, int(np.ceil(octs * per_oct)) + 1)
    freqs = np.geomspace(fmin, fmax, k)
    pos = np.log(fc / fmin) / np.log(fmax / fmin) * (k - 1)
    out = np.zeros_like(x)
    pre = 4096
    for i, f in enumerate(freqs):
        w = np.clip(1.0 - np.abs(pos - i), 0.0, 1.0)
        nz = np.flatnonzero(w)
        if nz.size == 0:
            continue
        a0 = max(0, int(nz[0]) - pre)
        a1 = int(nz[-1]) + 1
        y = run(x[a0:a1], f)
        ww = w[a0:a1]
        out[a0:a1] += y * (ww[:, None] if x.ndim == 2 else ww)
    return out


# ----------------------------------------------------------------------------
# stereo helpers
# ----------------------------------------------------------------------------
def pan_gains(p: float):
    """Constant-power pan, p in [-1 (L) .. +1 (R)]."""
    th = (float(np.clip(p, -1.0, 1.0)) + 1.0) * np.pi / 4.0
    return float(np.cos(th)), float(np.sin(th))


def to_stereo(x, pan: float = 0.0):
    if x.ndim == 2:
        return x
    l, r = pan_gains(pan)
    return np.stack([x * l, x * r], axis=1)


def width(x, w: float):
    """Mid/side width control (w=0 mono, 1 unchanged, >1 wider)."""
    m = 0.5 * (x[:, 0] + x[:, 1])
    s = 0.5 * (x[:, 0] - x[:, 1]) * w
    return np.stack([m + s, m - s], axis=1)


def stereo_noise(rng, n: int, common: float = 0.7, indiv: float = 0.5):
    c = rng.standard_normal(n)
    return np.stack([common * c + indiv * rng.standard_normal(n), common * c + indiv * rng.standard_normal(n)], axis=1)


def place(bus, sig, start: int, gain: float = 1.0, pan: float | None = None):
    """Mix `sig` into `bus` starting at sample `start` (bounds-safe)."""
    sig = np.asarray(sig)
    if start < 0:
        sig = sig[-start:]
        start = 0
    end = min(start + len(sig), len(bus))
    if end <= start:
        return
    seg = sig[: end - start]
    if bus.ndim == 2:
        if seg.ndim == 1:
            l, r = pan_gains(0.0 if pan is None else pan)
            bus[start:end, 0] += seg * (gain * l)
            bus[start:end, 1] += seg * (gain * r)
        else:
            if pan:
                # balance control on an already-stereo source
                gl = min(1.0, 1.0 - pan)
                gr = min(1.0, 1.0 + pan)
                bus[start:end, 0] += seg[:, 0] * (gain * gl)
                bus[start:end, 1] += seg[:, 1] * (gain * gr)
            else:
                bus[start:end] += seg * gain
    else:
        if seg.ndim == 2:
            seg = seg.mean(axis=1)
        bus[start:end] += seg * gain


# ----------------------------------------------------------------------------
# space: reverb (noise-IR convolution) and tempo-synced delay
# ----------------------------------------------------------------------------
def make_ir(rt60: float = 2.5, seed: int = 1, predelay_ms: float = 18.0, lo: float = 220.0, hi: float = 8000.0,
            hf_ratio: float = 0.45, lf_ratio: float = 1.0, onset_ms: float = 8.0, length_s: float | None = None):
    """Stereo reverb impulse: exponentially decaying filtered noise.

    Three bands decay at different rates (highs die faster, like air/soft
    walls). Left and right use independent noise for a wide, diffuse tail.
    """
    rng = np.random.default_rng(seed)
    n = s2n(length_s if length_s else rt60 * 1.2)
    t = tarr(n)
    ir = np.zeros((n, 2))
    for ch in range(2):
        w = rng.standard_normal(n)
        low = lp(w, 450.0, 2)
        high = hp(w, 3200.0, 2)
        mid = w - low - high
        y = (low * np.exp(-6.908 * t / (rt60 * lf_ratio))
             + mid * np.exp(-6.908 * t / rt60)
             + high * np.exp(-6.908 * t / (rt60 * hf_ratio)))
        y = hp(lp(y, hi, 2), lo, 2)
        ir[:, ch] = y
    ir = apply_fades(ir, onset_ms, 60.0)
    ir /= np.sqrt(np.sum(ir ** 2, axis=0, keepdims=True))
    pd = s2n(predelay_ms / 1000.0)
    if pd:
        ir = np.concatenate([np.zeros((pd, 2)), ir], axis=0)
    return ir


def reverb(x, ir, n_out: int | None = None):
    """Convolve stereo (or mono) x with a stereo IR; output length n_out."""
    x = to_stereo(x)
    n_out = n_out or len(x)
    out = np.zeros((n_out, 2))
    for ch in range(2):
        y = signal.fftconvolve(x[:, ch], ir[:, ch], mode="full")
        m = min(n_out, len(y))
        out[:m, ch] = y[:m]
    return out


def ping_pong(x, time_s: float, fb: float = 0.45, taps: int = 7, lp_hz: float = 4500.0, hp_hz: float = 300.0,
              cross: float = 0.15, first: int = 0):
    """Tempo-synced ping-pong delay (wet signal only), same length as x."""
    mono = x.mean(axis=1) if x.ndim == 2 else x
    n = len(mono)
    d = s2n(time_s)
    out = np.zeros((n, 2))
    cur = mono
    for k in range(1, taps + 1):
        cur = hp(lp(cur, lp_hz, 1), hp_hz, 1) * fb
        off = k * d
        if off >= n:
            break
        ch = (first + k - 1) % 2
        seg = cur[: n - off]
        out[off:, ch] += seg * (1.0 - cross)
        out[off:, 1 - ch] += seg * cross
    return out / max(fb, 1e-6) * fb  # first repeat already scaled by fb


# ----------------------------------------------------------------------------
# dynamics
# ----------------------------------------------------------------------------
def sidechain_env(n: int, hits, depth: float = 0.8, pre_ms: float = 6.0, hold_ms: float = 25.0,
                  rel_ms: float = 260.0, shape: float = 1.5) -> np.ndarray:
    """Kick-triggered ducking envelope (1 = open, 1-depth = fully ducked)."""
    env = np.ones(n)
    pre = s2n(pre_ms / 1000.0)
    hold = s2n(hold_ms / 1000.0)
    rel = s2n(rel_ms / 1000.0)
    down = 1.0 - depth * _ramp(pre)
    u = (np.arange(rel) + 0.5) / rel
    up = 1.0 - depth * (1.0 - (0.5 - 0.5 * np.cos(np.pi * u))) ** shape
    seg = np.concatenate([down, np.full(hold, 1.0 - depth), up])
    for h in hits:
        a = int(h) - pre
        b = a + len(seg)
        sa = 0
        if a < 0:
            sa = -a
            a = 0
        b = min(b, n)
        if b <= a:
            continue
        env[a:b] = np.minimum(env[a:b], seg[sa: sa + (b - a)])
    return env


def duck_gaps(n: int, gaps) -> np.ndarray:
    """Global mute envelope. gaps = [(t_start_s, t_end_s, fade_in_ms, fade_out_ms)]:
    fully silent between t_start+fade and t_end-fade."""
    env = np.ones(n)
    for (t0, t1, f_in, f_out) in gaps:
        a = s2n(t0)
        b = s2n(t1)
        fi = s2n(f_in / 1000.0)
        fo = s2n(f_out / 1000.0)
        seg = np.zeros(b - a)
        seg[:fi] = _ramp(fi)[::-1]
        if fo:
            seg[len(seg) - fo:] = _ramp(fo)
        env[a:b] = np.minimum(env[a:b], seg)
    return env


def soft_sat(x, drive: float = 1.0):
    """Gentle tanh saturation, unity gain for small signals."""
    return np.tanh(x * drive) / drive


def limiter(x, ceiling: float = 0.85, lookahead_ms: float = 3.0, release_ms: float = 80.0):
    """Look-ahead brick-wall limiter (zero latency in the output).

    gain <= ceiling/|x| is guaranteed sample by sample: the required gain is
    min-filtered over the look-ahead window, smoothed with a moving average of
    the same span (attack) and then recovered with an exponential release.
    """
    peak = np.max(np.abs(x), axis=1)
    g = np.minimum(1.0, ceiling / np.maximum(peak, 1e-9))
    half = s2n(lookahead_ms / 1000.0)
    size = 2 * half + 1
    gmin = minimum_filter1d(g, size=size, mode="nearest")
    gs = uniform_filter1d(gmin, size=size, mode="nearest")
    gs = np.minimum(gs, g)  # numerical safety
    k = 1.0 - float(np.exp(-1.0 / (release_ms / 1000.0 * SR)))
    out = gs.tolist()
    r = 1.0
    for i, v in enumerate(out):
        r = r + (1.0 - r) * k
        if v < r:
            r = v
        out[i] = r
    gain = np.asarray(out)
    return x * gain[:, None], gain


# ----------------------------------------------------------------------------
# metering (ITU-R BS.1770-4)
# ----------------------------------------------------------------------------
_K_B1 = [1.53512485958697, -2.69169618940638, 1.19839281085285]
_K_A1 = [1.0, -1.69065929318241, 0.73248077421585]
_K_B2 = [1.0, -2.0, 1.0]
_K_A2 = [1.0, -1.99004745483398, 0.99007225036621]


def k_weight(x):
    y = signal.lfilter(_K_B1, _K_A1, x, axis=0)
    return signal.lfilter(_K_B2, _K_A2, y, axis=0)


def lufs_integrated(x) -> float:
    y = k_weight(to_stereo(x))
    blk, hop = s2n(0.4), s2n(0.1)
    p = np.sum(y ** 2, axis=1)
    c = np.concatenate(([0.0], np.cumsum(p)))
    starts = np.arange(0, len(p) - blk + 1, hop)
    z = (c[starts + blk] - c[starts]) / blk
    l = -0.691 + 10.0 * np.log10(np.maximum(z, 1e-12))
    keep = l > -70.0
    if not np.any(keep):
        return -120.0
    rel = -0.691 + 10.0 * np.log10(np.mean(z[keep])) - 10.0
    keep2 = keep & (l > rel)
    return float(-0.691 + 10.0 * np.log10(np.mean(z[keep2])))


def lufs_window(x, t0: float, t1: float) -> float:
    """Ungated K-weighted loudness of a time window (for section reports)."""
    y = k_weight(to_stereo(x))
    seg = y[s2n(t0): s2n(t1)]
    return float(-0.691 + 10.0 * np.log10(max(np.mean(np.sum(seg ** 2, axis=1)), 1e-12)))


def true_peak(x, os: int = 4) -> float:
    y = signal.resample_poly(x, os, 1, axis=0)
    return float(np.max(np.abs(y)))
