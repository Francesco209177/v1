"""Video 04 sound design one-shots (numpy + scipy only, every generator seeded).

"Phishing: come possono rubarti le credenziali?" - a cybersecurity thriller bed.

Copied (so later edits to the other videos cannot change this one):
  from audio/v02/sfx_v02.py  warm kick, snap, clock tick, UI tone, question ping, air bed, varispeed
  from audio/v01/sfx_v01.py  dive riser, glitch stutter (generalised here), granular shatter, low breath
New for Video 04: notification ping, glass tap, distorted sub impact, bit-crusher / stutter, the
pulsing two-tone alarm swell, heartbeat sub pulse, dark 3D swoosh, the detuned reveal sting, sub drop,
confirm chime for the three tips, the shield bloom and a bigger, Eb-major glass shatter.

Everything is built on audio/dsp.py primitives and keeps its energy out of the 1-4 kHz voice band
wherever the sound allows it.
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


def _pan_st(y, p: float):
    l, r = pan_gains(p)
    return np.stack([y * l, y * r], axis=1)


# ----------------------------------------------------------------------------
# drums (kick + snap copied from v02)
# ----------------------------------------------------------------------------
@lru_cache(maxsize=None)
def kick_warm(kind: str = "warm"):
    """Round kick: little click, short snap, a touch of body (mono). 'muted' = the dark, felt
    four-on-the-floor of the threat groove (low-passed, almost no click)."""
    rng = np.random.default_rng({"warm": 611, "big": 612, "muted": 613}[kind])
    if kind == "warm":
        dur, f_end, sweep, t_sw, snap_, tau, drive, click_g = 0.40, 50.0, 112.0, 0.030, 150.0, 0.15, 1.35, 0.06
    elif kind == "big":
        dur, f_end, sweep, t_sw, snap_, tau, drive, click_g = 0.48, 48.0, 140.0, 0.034, 210.0, 0.21, 1.7, 0.10
    elif kind == "muted":
        dur, f_end, sweep, t_sw, snap_, tau, drive, click_g = 0.34, 49.0, 95.0, 0.028, 110.0, 0.12, 1.25, 0.0
    else:
        raise ValueError(kind)
    n = s2n(dur)
    t = tarr(n)
    f = f_end + sweep * np.exp(-t / t_sw) + snap_ * np.exp(-t / 0.005)
    body = sine(f, n) * np.exp(-t / tau)
    body = np.tanh(drive * body) / np.tanh(drive)
    click = hp(rng.standard_normal(n), 4500.0, 2) * np.exp(-t / 0.0016) * click_g
    y = body + click
    if kind == "muted":
        y = lp(y, 420.0, 2) + lp(rng.standard_normal(n), 1800.0, 2) * np.exp(-t / 0.0012) * 0.05
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


# ----------------------------------------------------------------------------
# digital glitch tools
# ----------------------------------------------------------------------------
def bitcrush(x, hold: int = 4, bits: int = 0):
    """Sample-and-hold decimation (every `hold` samples) + optional quantisation to `bits` bits."""
    x = np.asarray(x, dtype=np.float64)
    idx = (np.arange(len(x)) // max(1, hold)) * max(1, hold)
    y = x[idx]
    if bits:
        q = float(2 ** (bits - 1))
        y = np.round(y * q) / q
    return y


def stutter(src, grain_s: float = 0.018, pattern=(1.0, 0.0, 0.62, 0.0, 0.42, 0.3), step_s: float = 0.03125,
            hold: int = 5, bits: int = 0, hp_hz: float = 1800.0, lp_hz: float | None = None, pitch=None):
    """Controlled digital stutter: the first grain of `src` (stereo) is crushed (sample-and-hold +
    optional bit reduction), band-limited and repeated on a fixed grid (default 1/64 note at 120 BPM).
    `pattern` = gain per step (0 skips), `pitch` = optional resampling ratio per step (stereo)."""
    src = np.asarray(src, dtype=np.float64)
    if src.ndim == 1:
        src = np.stack([src, src], axis=1)
    g = s2n(grain_s)
    grain = bitcrush(src[:g], hold, bits)
    grain = hp(grain, hp_hz, 2)
    if lp_hz:
        grain = lp(grain, lp_hz, 2)
    grain = apply_fades(grain, 0.3, 3.0)
    step = s2n(step_s)
    n = step * len(pattern) + 2 * g
    out = np.zeros((n, 2))
    for k, gain in enumerate(pattern):
        if gain <= 0.0:
            continue
        gr = grain
        if pitch is not None and pitch[k] != 1.0:
            m = max(4, int(len(grain) / pitch[k]))
            pos = np.linspace(0.0, len(grain) - 1.0, m)
            gr = np.stack([np.interp(pos, np.arange(len(grain)), grain[:, c]) for c in range(2)], axis=1)
            gr = apply_fades(gr, 0.3, 3.0)
        a = k * step
        sgn = 1.0 if k % 2 == 0 else 0.85
        out[a:a + len(gr)] += gr * gain * sgn
    return out


def glitch_blip(midi: int, seed: int, dur: float = 0.03):
    """Tiny digital 'data' blip used as stutter material: square + noise, very high (stereo)."""
    rng = np.random.default_rng(seed)
    n = s2n(dur)
    t = tarr(n)
    f = mtof(midi)
    y = 0.6 * square(f, n, rng.random(), 0.3) + 0.4 * hp(rng.standard_normal(n), 4000.0, 2)
    y *= _attack(t, 0.0002) * np.exp(-t / 0.012)
    return np.stack([y, np.roll(y, 9)], axis=1)


# ----------------------------------------------------------------------------
# 0.2 s NOTIFICATION, 2.0 s TAP / RED ALARM
# ----------------------------------------------------------------------------
def notif_ping(seed: int = 40):
    """Original phone-notification-like ping: a crisp glass tick and two quick glassy FM tones
    rising a fifth (Eb6 -> Bb6, 55 ms apart), the second ringing a little (stereo, peak 1)."""
    rng = np.random.default_rng(seed)
    n = s2n(0.95)
    t = tarr(n)
    tick = hp(rng.standard_normal(n), 5500.0, 2) * np.exp(-t / 0.0005) * _attack(t, 0.0001)
    out = np.zeros((n, 2))
    out += np.stack([tick, np.roll(tick, 7)], axis=1) * 0.55
    for t0, m, tau1, tau2, g, p in ((0.0, 87, 0.035, 0.09, 0.75, -0.12), (0.055, 94, 0.07, 0.38, 1.0, 0.12)):
        a = s2n(t0)
        k = n - a
        tt = tarr(k)
        f = mtof(m)
        idx = 0.9 * (0.1 + 0.9 * np.exp(-tt / 0.02))
        y = np.sin(TWO_PI * f * tt + idx * np.sin(TWO_PI * 2.0 * f * tt))
        y += 0.10 * np.sin(TWO_PI * 2.0 * f * tt + 0.7) * np.exp(-tt / 0.05)
        y *= _attack(tt, 0.0004) * (0.6 * np.exp(-tt / tau1) + 0.4 * np.exp(-tt / tau2)) * g
        out[a:] += _pan_st(y, p)
    return _norm(apply_fades(out, 0.0, 200.0))


def tap_click(seed: int = 200):
    """Finger tapping a glass screen: a dry, very short 'tk' (bright edge + small low body) (stereo)."""
    rng = np.random.default_rng(seed)
    n = s2n(0.08)
    t = tarr(n)
    edge = hp(rng.standard_normal(n), 2500.0, 2) * np.exp(-t / 0.0006)
    edge += _modes(t, ((4700.0, 0.25, 0.003), (7300.0, 0.2, 0.002)), rng)
    body = sine(260.0 + 180.0 * np.exp(-t / 0.002), n) * np.exp(-t / 0.011)
    thump = lp(rng.standard_normal(n), 500.0, 2) * np.exp(-t / 0.008)
    y = (0.9 * edge + 0.7 * body + 0.5 * thump) * _attack(t, 0.0001)
    return _norm(apply_fades(np.stack([y, np.roll(y, 5)], axis=1), 0.0, 25.0))


def dist_impact(seed: int = 210, dur: float = 1.4, f_start: float = 150.0, f_end: float = 41.0, tau_p: float = 0.045,
                tau_a: float = 0.38, drive: float = 3.2, hold: int = 9, bits: int = 7):
    """Distorted sub impact: pitch-swept sine driven hard into tanh (odd harmonics up to ~1 kHz so it
    reads on phones) plus a bit-crushed copy for a gritty digital edge; low-passed under the voice (mono)."""
    rng = np.random.default_rng(seed)
    n = s2n(dur)
    t = tarr(n)
    f = f_end + (f_start - f_end) * np.exp(-t / tau_p) + 240.0 * np.exp(-t / 0.005)
    body = sine(f, n) * np.exp(-t / tau_a)
    dist = np.tanh(drive * body) / np.tanh(drive)
    crushed = bp(bitcrush(dist, hold, bits), 180.0, 2600.0, 1) * np.exp(-t / 0.07)
    snap_ = hp(rng.standard_normal(n), 1500.0, 2) * np.exp(-t / 0.0015) * 0.35
    y = lp(dist, 1100.0, 2) + 0.28 * crushed + snap_
    return apply_fades(y, 0.0, dur * 300.0)


def alarm_pulse(dur: float = 2.2, seed: int = 230, a=(67, 72), b=(68, 72), step_s: float = 0.25,
                peak_s: float = 0.45, lp_hz: float = 1500.0):
    """The red-alert swell, tasteful rather than a siren: two dyads (G4+C5 / Ab4+C5, a semitone rub)
    alternate on 8th notes, each pulse plucked (5 ms attack, ~0.12 s decay) from soft detuned saws,
    low-passed at ~1.5 kHz. The whole thing swells in to `peak_s` and fades away (stereo)."""
    rng = np.random.default_rng(seed)
    n = s2n(dur)
    t = tarr(n)

    def dyad(midis):
        out = np.zeros((n, 2))
        for i, m in enumerate(midis):
            for cents, p in ((-7.0, -0.6), (7.0, 0.6)):
                s = saw(mtof(m) * 2.0 ** (cents / 1200.0), n, rng.random())
                out += _pan_st(s, p * (1.0 if i == 0 else -1.0))
        return out / np.sqrt(2.0 * len(midis))

    xa, xb = dyad(a), dyad(b)
    step = s2n(step_s)
    ga, gb = np.zeros(n), np.zeros(n)
    k = 0
    while k * step < n:
        s0 = k * step
        m = min(n, s0 + step)
        tt = tarr(m - s0)
        env = _attack(tt, 0.005) * np.exp(-tt / 0.12)
        env *= np.clip((step / SR - tt) / 0.01, 0.0, 1.0)            # closes before the next pulse
        (ga if k % 2 == 0 else gb)[s0:m] = env
        k += 1
    y = xa * ga[:, None] + xb * gb[:, None]
    fc = lp_hz * (0.45 + 0.55 * np.exp(-((t - peak_s) / 0.6) ** 2))
    y = sweep_filter(y, fc, "lp", q=0.9, per_oct=4.0)
    swell = np.where(t < peak_s, (t / peak_s) ** 1.6, np.exp(-(t - peak_s) / (dur * 0.38)))
    return apply_fades(y * swell[:, None], 2.0, 250.0)


def heartbeat(seed: int = 240, strength: float = 1.0):
    """Sub 'lub': short pitch-dropping sine (78 -> 47 Hz) + a soft low thump (mono)."""
    rng = np.random.default_rng(seed)
    n = s2n(0.32)
    t = tarr(n)
    f = 47.0 + 31.0 * np.exp(-t / 0.035)
    y = sine(f, n) * np.exp(-t / 0.085) * _attack(t, 0.003)
    y += 0.25 * sine(2.0 * f, n, 0.2) * np.exp(-t / 0.05) * _attack(t, 0.003)
    y += lp(rng.standard_normal(n), 220.0, 2) * np.exp(-t / 0.02) * 0.6
    return apply_fades(np.tanh(1.3 * y * strength) / np.tanh(1.3), 0.0, 60.0)


# ----------------------------------------------------------------------------
# 3.5 s MESSAGE, 6.0 s REVEAL
# ----------------------------------------------------------------------------
def swoosh_in(seed: int = 350, dur: float = 0.9, f0: float = 3800.0, f1: float = 260.0):
    """The fake message window swings in in 3D: a dark swoosh that starts on the cue (3 ms attack)
    and falls (band-pass 3.8 kHz -> 260 Hz), panning L -> R (stereo, peak 1)."""
    rng = np.random.default_rng(seed)
    n = s2n(dur)
    t = tarr(n)
    u = t / dur
    w = stereo_noise(rng, n, 0.55, 0.65)
    fc = f0 * (f1 / f0) ** (u ** 0.6)
    y = sweep_filter(w, fc, "bp", q=1.4, per_oct=5.0)
    env = _attack(t, 0.003) * (0.3 * np.exp(-t / 0.03) + 0.7 * np.exp(-t / 0.28))
    pan = np.linspace(-0.55, 0.55, n)
    y[:, 0] *= env * np.cos((pan + 1.0) * np.pi / 4.0) * 1.4142
    y[:, 1] *= env * np.sin((pan + 1.0) * np.pi / 4.0) * 1.4142
    return _norm(apply_fades(y, 0.0, 150.0))


def reveal_sting(midis, seed: int = 600, dur: float = 1.3, detune: float = 26.0, sag: float = -45.0):
    """'The address is fake': a sour, detuned stab. Every note is three saws (0 / +-26 cents) whose
    pitch sags ~45 cents after the attack, through a fast closing low-pass (3.6 kHz -> 600 Hz), with a
    sine sub under the lowest note and a crisp digital edge on the attack (stereo, peak 1)."""
    rng = np.random.default_rng(seed)
    n = s2n(dur)
    t = tarr(n)
    bend = sag * (1.0 - np.exp(-np.maximum(t - 0.05, 0.0) / 0.25))
    out = np.zeros((n, 2))
    for i, m in enumerate(midis):
        for j, (c, p) in enumerate(((0.0, 0.0), (detune, 0.7), (-detune, -0.7))):
            f = mtof(m) * 2.0 ** ((bend * (1.0 + 0.3 * j) + c + rng.uniform(-2, 2)) / 1200.0)
            s = saw(f, n, rng.random())
            out += _pan_st(s, p * (1 if i % 2 else -1))
    out /= np.sqrt(3.0 * len(midis))
    fc = 600.0 + 3000.0 * np.exp(-t / 0.07)
    out = sweep_filter(out, fc, "lp", q=1.1, per_oct=4.0)
    amp = _attack(t, 0.0015) * (0.55 * np.exp(-t / 0.08) + 0.45 * np.exp(-t / 0.42))
    out *= amp[:, None]
    m0 = min(midis)
    sub = sine(mtof(m0) * 2.0 ** (bend / 1200.0), n) * _attack(t, 0.004) * np.exp(-t / 0.3)
    out += 0.5 * sub[:, None]
    edge = hp(stereo_noise(rng, n, 0.6, 0.6), 5000.0, 2) * (_attack(t, 0.0002) * np.exp(-t / 0.004))[:, None]
    out += 0.35 * edge
    return _norm(apply_fades(out, 0.0, dur * 300.0))


def sub_drop(dur: float = 1.5, f0: float = 65.4, f1: float = 32.7, tau: float = 0.5):
    """Sub drop: sine gliding down an octave (exponential), with a faint 2nd harmonic (mono)."""
    n = s2n(dur)
    t = tarr(n)
    u = t / dur
    f = f0 * (f1 / f0) ** (u ** 0.7)
    ph = np.cumsum(f) / SR
    y = np.sin(TWO_PI * ph) + 0.18 * np.sin(2 * TWO_PI * ph + 0.3)
    env = _attack(t, 0.006) * np.exp(-t / tau)
    return apply_fades(y * env, 0.0, dur * 250.0)


# ----------------------------------------------------------------------------
# risers / sweeps (dive_riser copied from v01, low_breath + air_bed copied)
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
    """Dark, slowly breathing low noise, below the voice band (stereo)."""
    rng = np.random.default_rng(seed)
    n = s2n(dur)
    t = tarr(n)
    w = stereo_noise(rng, n, 0.4, 0.8)
    y = bp(w, fc * 0.5, fc * 1.6, 2)
    lfo = 0.55 + 0.45 * np.sin(TWO_PI * rate * t + rng.random() * 6.28)
    return apply_fades(y * lfo[:, None], 600.0, 600.0)


# ----------------------------------------------------------------------------
# DEFEND: confirm chime, shield bloom
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


def confirm_chime(m1: int, m2: int, seed: int = 1750, gap_s: float = 0.065, dur: float = 1.1):
    """'Check!': a soft air tick, a short glassy note and, 65 ms later, a higher ringing note with an
    octave halo - clean, friendly, not a phone sound (stereo, peak 1)."""
    rng = np.random.default_rng(seed)
    n = s2n(dur + gap_s)
    t = tarr(n)
    out = np.zeros((n, 2))
    tick = hp(rng.standard_normal(n), 6000.0, 2) * np.exp(-t / 0.0007) * _attack(t, 0.0001)
    out += np.stack([tick, np.roll(tick, 11)], axis=1) * 0.45
    for k, (m, tau1, tau2, g, p) in enumerate(((m1, 0.03, 0.08, 0.7, -0.15), (m2, 0.06, 0.32, 1.0, 0.15))):
        a = s2n(k * gap_s)
        L = n - a
        tt = tarr(L)
        f = mtof(m)
        idx = 0.7 * (0.15 + 0.85 * np.exp(-tt / 0.03))
        y = np.sin(TWO_PI * f * tt + idx * np.sin(TWO_PI * 2.0 * f * tt + rng.random()))
        if k == 1:
            y += 0.22 * np.sin(TWO_PI * 2.0 * f * tt + rng.random()) * np.exp(-tt / 0.2)
        y *= _attack(tt, 0.0008) * (0.6 * np.exp(-tt / tau1) + 0.4 * np.exp(-tt / tau2)) * g
        out[a:] += _pan_st(y, p)
    body = sine(180.0 + 120.0 * np.exp(-t / 0.003), n) * np.exp(-t / 0.018) * _attack(t, 0.0005)
    out += 0.4 * body[:, None]
    return _norm(apply_fades(out, 0.0, 250.0))


def shield_bloom(seed: int = 1700, dur: float = 1.6, f0: float = 600.0, f1: float = 9000.0):
    """The shield forms: an airy band-pass sweep rising 0.6 -> 9 kHz in ~0.35 s from a sharp start,
    then hanging and fading (stereo, peak 1)."""
    rng = np.random.default_rng(seed)
    n = s2n(dur)
    t = tarr(n)
    w = stereo_noise(rng, n, 0.4, 0.8)
    u = np.clip(t / 0.35, 0.0, 1.0)
    fc = f0 * (f1 / f0) ** (u ** 0.8)
    y = sweep_filter(w, fc, "bp", q=1.0, per_oct=4.0)
    env = _attack(t, 0.002) * (0.35 * np.exp(-t / 0.02) + 0.65 * np.exp(-t / 0.5))
    return _norm(apply_fades(y * env[:, None], 0.0, dur * 300.0))


# ----------------------------------------------------------------------------
# 24.0 s DESTROY: glass / digital shatter (adapted from v01)
# ----------------------------------------------------------------------------
def shatter(seed: int = 2400, dur: float = 1.1, tokens=(), n_grains: int = 140):
    """The shield breaks the fake message: a glassy crack on the cue with a low body, then a decaying
    shower of grains (noise crackles, bit-crushed square 'bits', glass tinks at 4-12 kHz) and a run of
    pitched tinks on `tokens` (MIDI), plus a low pop for weight (stereo, peak 1)."""
    rng = np.random.default_rng(seed)
    n = s2n(dur)
    t = tarr(n)
    out = np.zeros((n, 2))
    crack = hp(rng.standard_normal(n), 1800.0, 2) * np.exp(-t / 0.0014)
    crack += _modes(t, ((4300.0, 0.3, 0.008), (5900.0, 0.35, 0.007), (7900.0, 0.3, 0.006), (10400.0, 0.25, 0.005),
                        (12800.0, 0.18, 0.004)), rng)
    crack *= _attack(t, 0.0001)
    out += np.stack([crack, np.roll(crack, 17)], axis=1) * 0.9
    pop = sine(200.0 + 170.0 * np.exp(-t / 0.004), n) * _attack(t, 0.0005) * np.exp(-t / 0.03)
    out += pop[:, None] * 0.6
    arr_t = np.sort(rng.exponential(0.16, n_grains)) + 0.002
    arr_t = arr_t[arr_t < dur - 0.04]
    for t0 in arr_t:
        a = s2n(t0)
        kind = rng.random()
        g = 0.55 * np.exp(-t0 / 0.3) * rng.uniform(0.4, 1.0)
        if kind < 0.4:
            m = s2n(rng.uniform(0.002, 0.006))
            tt = tarr(m)
            fc = rng.uniform(4500.0, 11000.0)
            z = bp(rng.standard_normal(m), fc * 0.7, min(fc * 1.4, 20000.0), 1) * np.exp(
                -tt / rng.uniform(0.0003, 0.0012))
        elif kind < 0.65:
            m = s2n(rng.uniform(0.003, 0.009))
            f = rng.uniform(3000.0, 7000.0)
            z = bitcrush(square(f, m, rng.random()), int(rng.integers(2, 6)), 4) * apply_fades(np.ones(m), 0.25, 1.0)
            z = hp(z * 0.4, 3500.0, 2)
        else:
            m = s2n(0.05)
            tt = tarr(m)
            f = rng.uniform(4500.0, 12500.0)
            z = np.sin(TWO_PI * f * tt) * _attack(tt, 0.0002) * np.exp(-tt / rng.uniform(0.004, 0.012))
        z = apply_fades(z, 0.0, 0.5)
        st = _pan_st(z, rng.uniform(-0.95, 0.95)) * g
        e = min(n, a + len(st))
        out[a:e] += st[: e - a]
    for k, m in enumerate(tokens):
        a = s2n(0.008 + 0.024 * k)
        L = s2n(0.16)
        tt = tarr(L)
        f = mtof(m)
        z = (np.sin(TWO_PI * f * tt) + 0.2 * np.sin(TWO_PI * 2.0 * f * tt)) * _attack(tt, 0.0003) * np.exp(-tt / 0.03)
        st = _pan_st(z, (-0.8, 0.8, -0.5, 0.5, -0.2, 0.2, -0.65, 0.65, -0.35, 0.35, 0.0)[k % 11]) * (0.34 - 0.015 * k)
        e = min(n, a + L)
        out[a:e] += st[: e - a]
    return _norm(apply_fades(out, 0.0, 200.0))


# ----------------------------------------------------------------------------
# 28.0 s QUESTION (ping copied from v02, with a small curious upward lift)
# ----------------------------------------------------------------------------
def question_ping(midi: int, dur: float = 2.2, lift_cents: float = 18.0):
    """The final question: one glassy ping (harmonic FM, faint octave halo) whose pitch lifts a few
    cents as it rings, like a raised eyebrow (mono)."""
    f = mtof(midi)
    n = s2n(dur)
    t = tarr(n)
    fr = f * 2.0 ** (lift_cents * (1.0 - np.exp(-t / 0.35)) / 1200.0)
    ph = np.cumsum(fr) / SR
    idx = 1.1 * (0.15 + 0.85 * np.exp(-t / 0.035))
    y = np.sin(TWO_PI * ph + idx * np.sin(TWO_PI * 2.0 * ph))
    y += 0.18 * np.sin(TWO_PI * 2.0 * ph + 0.4) * np.exp(-t / 0.25)
    env = _attack(t, 0.0008) * (0.68 * np.exp(-t / 0.09) + 0.32 * np.exp(-t / 0.42))
    return apply_fades(y * env, 0.0, 300.0)


# ----------------------------------------------------------------------------
# varispeed (tape-stop), copied from v02
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
