#!/usr/bin/env python3
"""Measure public/music.wav (you cannot listen, so measure).

    python3 audio/analyze.py [path.wav] [--score] [--png]

Prints: format and sample count, peak / true peak, integrated loudness, RMS and
short-term loudness per second, onset offset (ms) from every cue of the cue
sheet, typing-tick count, per-section loudness, spectral balance and stereo
correlation, DC offset, edge silence, the strongest unexpected transients and
narrow spectral peaks (harsh resonances) in the 2-5 kHz region.
--score  also prints the note / chord names per bar (arrangement.report()).
--png    also renders spectrogram + waveform PNGs into out/audio/ with ffmpeg.
"""
from __future__ import annotations

import os
import subprocess
import sys

import numpy as np
from scipy import signal
from scipy.io import wavfile

HERE = os.path.dirname(os.path.abspath(__file__))
if HERE not in sys.path:
    sys.path.insert(0, HERE)
from dsp import k_weight, lufs_integrated, true_peak  # noqa: E402

ROOT = os.path.dirname(HERE)
CUES = {"sparkFormed / impact 1": 2.5, "ideaStart / whoosh": 4.0, "promptToCode / Enter": 7.0,
        "creationStart / impact 3": 9.0, "drop / shot 1": 16.0, "shot 2": 17.5, "shot 3": 19.0,
        "shot 4": 20.5, "shot 5": 22.0, "outroStart / impact 4": 24.0, "lockup / final hit": 26.0}
SECTIONS = [("intro", 0.0, 2.5), ("impact1", 2.5, 4.0), ("scene2", 4.0, 9.0), ("scene3", 9.0, 14.0),
            ("build", 14.0, 16.0), ("drop", 16.0, 24.0), ("breakdown", 24.0, 26.0), ("final", 26.0, 29.0),
            ("fade", 29.0, 30.0)]
BANDS = [(0, 120), (120, 2000), (2000, 8000), (8000, 24000)]


def db(x):
    return 20.0 * np.log10(np.maximum(x, 1e-12))


def load(path):
    sr, d = wavfile.read(path)
    if d.dtype == np.int16:
        x = d.astype(np.float64) / 32768.0
    elif d.dtype == np.int32:
        x = d.astype(np.float64) / 2147483648.0
    else:
        x = d.astype(np.float64)
    if x.ndim == 1:
        x = x[:, None]
    return sr, d, x


def frame_energy(mono, sr, hop_ms=0.5, win_ms=3.0):
    hop = max(1, int(sr * hop_ms / 1000))
    win = max(1, int(sr * win_ms / 1000))
    c = np.concatenate(([0.0], np.cumsum(mono ** 2)))
    starts = np.arange(0, len(mono) - win, hop)
    return (c[starts + win] - c[starts]) / win, hop


def onset_strength(e, hop, sr, fut_ms=6.0, past_ms=30.0, gap_ms=2.0):
    """dB ratio between the energy just after t and the energy just before t."""
    f = max(1, int(fut_ms / 1000 * sr / hop))
    p = max(1, int(past_ms / 1000 * sr / hop))
    g = max(1, int(gap_ms / 1000 * sr / hop))
    c = np.concatenate(([0.0], np.cumsum(e)))
    n = len(e)
    idx = np.arange(n)
    a = np.clip(idx + f, 0, n)
    fut = (c[a] - c[idx]) / f
    p0 = np.clip(idx - g - p, 0, n)
    p1 = np.clip(idx - g, 0, n)
    past = (c[p1] - c[p0]) / np.maximum(p1 - p0, 1)
    return 10.0 * np.log10((fut + 1e-10) / (past + 1e-10))


def main():
    args = [a for a in sys.argv[1:] if not a.startswith("--")]
    path = args[0] if args else os.path.join(ROOT, "public", "music.wav")
    sr, raw, x = load(path)
    n, ch = x.shape
    print(f"FILE {path}")
    print(f"   {sr} Hz, {ch} ch, dtype {raw.dtype}, {n} samples = {n / sr:.6f} s  "
          f"({'OK' if n == 1440000 and sr == 48000 and ch == 2 else 'WRONG'} vs 1,440,000 @ 48 kHz stereo)")
    peak = np.max(np.abs(x))
    tp = true_peak(x)
    print(f"   sample peak {db(peak):.2f} dBFS, true peak (4x) {db(tp):.2f} dBTP, "
          f"clipped samples {int(np.sum(np.abs(raw.astype(np.int64)) >= 32767)) if raw.dtype == np.int16 else 'n/a'}")
    print(f"   integrated loudness {lufs_integrated(x):.2f} LUFS")
    print(f"   DC offset L {np.mean(x[:, 0]):+.2e}  R {np.mean(x[:, 1]):+.2e}")
    e10 = int(0.010 * sr)
    print(f"   first 10 ms max |x| = {np.max(np.abs(x[:e10])):.2e}  -> {'SILENT' if np.max(np.abs(x[:e10])) == 0 else 'NOT silent'}")
    print(f"   last  10 ms max |x| = {np.max(np.abs(x[-e10:])):.2e}  -> {'SILENT' if np.max(np.abs(x[-e10:])) == 0 else 'NOT silent'}")
    nz = np.flatnonzero(np.max(np.abs(raw), axis=1))
    if nz.size:
        print(f"   first non-zero sample {nz[0]} ({nz[0] / sr * 1000:.1f} ms), last non-zero {nz[-1]} "
              f"({nz[-1] / sr:.3f} s), trailing digital silence {(n - 1 - nz[-1]) / sr * 1000:.0f} ms")

    # per-second RMS and short-term (3 s) loudness
    kw = np.sum(k_weight(x) ** 2, axis=1)
    print("\nPER SECOND   RMS dBFS | momentary LUFS (400 ms ending at t+1)")
    row = []
    for s in range(int(n / sr)):
        seg = x[s * sr:(s + 1) * sr]
        rms = db(np.sqrt(np.mean(seg ** 2)))
        m = kw[max(0, (s + 1) * sr - int(0.4 * sr)):(s + 1) * sr]
        mom = -0.691 + 10 * np.log10(max(np.mean(m), 1e-12))
        row.append(f"{s:2d}s {rms:6.1f}|{mom:6.1f}")
    for i in range(0, len(row), 5):
        print("   " + "   ".join(row[i:i + 5]))

    # onsets
    mono = x.mean(axis=1)
    hf = signal.sosfilt(signal.butter(2, 1500, "high", fs=sr, output="sos"), mono)
    eb, hop = frame_energy(mono, sr)
    eh, _ = frame_energy(hf, sr)
    sb = onset_strength(eb, hop, sr)
    sh = onset_strength(eh, hop, sr)
    st = np.maximum(sb, sh)
    tt = np.arange(len(eb)) * hop / sr
    print("\nCUE ALIGNMENT (strongest onset within +-40 ms; pass = |offset| <= 10 ms and rise >= 6 dB)")
    print(f"   {'cue':26s} {'time':>6s} {'offset':>8s} {'rise':>7s} {'(broad/HF)':>12s}  level after")
    allok = True
    for name, c in CUES.items():
        w = (tt >= c - 0.040) & (tt <= c + 0.040)
        i = np.flatnonzero(w)[np.argmax(st[w])]
        off = (tt[i] - c) * 1000
        lvl = 10 * np.log10(np.mean(eb[i:i + int(0.02 * sr / hop)]) + 1e-12)
        ok = abs(off) <= 10 and st[i] >= 6
        allok &= ok
        print(f"   {name:26s} {c:6.2f} {off:+7.1f}ms {st[i]:6.1f}dB ({sb[i]:5.1f}/{sh[i]:5.1f})  {lvl:6.1f} dB"
              f"  {'PASS' if ok else 'FAIL'}")
    print(f"   all cues: {'PASS' if allok else 'FAIL'}")

    # peak-pick onsets
    def peaks(strength, thr, min_sep_ms=25):
        dist = max(1, int(min_sep_ms / 1000 * sr / hop))
        p, _ = signal.find_peaks(strength, height=thr, distance=dist)
        return p
    pk = peaks(sh, 6.0, 20)
    ty = [tt[i] for i in pk if 4.45 <= tt[i] <= 6.6]
    print(f"\nTYPING 4.5-6.5 s: {len(ty)} HF onsets (first {ty[0] if ty else float('nan'):.3f} s, "
          f"last {ty[-1] if ty else float('nan'):.3f} s)")
    # strongest onsets of the piece, cue or not
    pb = peaks(st, 9.0, 60)
    order = pb[np.argsort(-st[pb])][:30]
    cues = np.array(list(CUES.values()))
    print("STRONGEST ONSETS (time s, rise dB, nearest cue):")
    out = []
    for i in sorted(order):
        d = (tt[i] - cues[np.argmin(np.abs(cues - tt[i]))]) * 1000
        lvl = 10 * np.log10(np.mean(eb[i:i + int(0.02 * sr / hop)]) + 1e-12)
        out.append(f"{tt[i]:6.3f} {st[i]:4.1f}dB {lvl:5.1f}dB" + (f" cue{d:+.0f}ms" if abs(d) < 40 else ""))
    for i in range(0, len(out), 3):
        print("   " + "   |   ".join(out[i:i + 3]))

    # clicks: sample-to-sample jumps far above the local high-passed level
    hh = signal.sosfilt(signal.butter(4, 9000, "high", fs=sr, output="sos"), mono)
    env = np.sqrt(signal.sosfiltfilt(signal.butter(2, 30, fs=sr, output="sos"), hh ** 2) + 1e-14)
    ratio = np.abs(hh) / (env + 1e-6)
    bad = np.flatnonzero((ratio > 12) & (np.abs(hh) > 0.01))
    print(f"\nCLICK SCAN (|HF| > 12x its local RMS and > -40 dBFS): {len(bad)} samples"
          + (f", e.g. at {', '.join(f'{b / sr:.3f}s' for b in bad[:8])}" if len(bad) else ""))

    # sections
    print("\nSECTIONS   LUFS(ungated)  RMS dB   <120Hz  120-2k  2k-8k   >8k   corr  width(S/M dB)")
    for name, a, b in SECTIONS:
        seg = x[int(a * sr):int(b * sr)]
        kws = kw[int(a * sr):int(b * sr)]
        lu = -0.691 + 10 * np.log10(max(np.mean(kws), 1e-12))
        rms = db(np.sqrt(np.mean(seg ** 2)))
        f, p = signal.welch(seg.mean(axis=1), fs=sr, nperseg=8192)
        tot = np.sum(p) + 1e-20
        shares = [np.sum(p[(f >= lo) & (f < hi)]) / tot * 100 for lo, hi in BANDS]
        l, r = seg[:, 0], seg[:, 1]
        corr = np.sum(l * r) / np.sqrt(np.sum(l * l) * np.sum(r * r) + 1e-20)
        mid, side = 0.5 * (l + r), 0.5 * (l - r)
        wdb = db(np.sqrt(np.mean(side ** 2))) - db(np.sqrt(np.mean(mid ** 2)))
        print(f"   {name:10s} {lu:7.1f}      {rms:6.1f}   " + "  ".join(f"{s:5.1f}%" for s in shares)
              + f"  {corr:5.2f}  {wdb:6.1f}")
    l, r = x[:, 0], x[:, 1]
    print(f"   whole-file stereo correlation {np.sum(l * r) / np.sqrt(np.sum(l * l) * np.sum(r * r)):.3f}")
    lo = signal.sosfilt(signal.butter(4, 120, fs=sr, output="sos"), x, axis=0)
    print(f"   low end (<120 Hz) correlation {np.sum(lo[:, 0] * lo[:, 1]) / np.sqrt(np.sum(lo[:, 0] ** 2) * np.sum(lo[:, 1] ** 2)):.3f}")

    # harshness: narrow peaks in 2-5 kHz of the long-term spectrum, drop section
    seg = x[16 * sr:24 * sr].mean(axis=1)
    f, p = signal.welch(seg, fs=sr, nperseg=16384)
    pdb = 10 * np.log10(p + 1e-20)
    sm = np.convolve(pdb, np.ones(31) / 31, mode="same")
    m = (f >= 1500) & (f <= 6000)
    exc = (pdb - sm)[m]
    j = np.argsort(-exc)[:5]
    print("\nHARSHNESS (drop 16-24 s): narrow peaks above the smoothed spectrum in 1.5-6 kHz: "
          + ", ".join(f"{f[m][k]:.0f}Hz +{exc[k]:.1f}dB" for k in sorted(j)))
    band = lambda lo_, hi_: 10 * np.log10(np.sum(p[(f >= lo_) & (f < hi_)]) + 1e-20)
    print(f"   band levels rel. to 200-800 Hz: 2-5 kHz {band(2000, 5000) - band(200, 800):+.1f} dB, "
          f"5-10 kHz {band(5000, 10000) - band(200, 800):+.1f} dB")

    if "--score" in sys.argv:
        import arrangement
        print("\n" + "=" * 100)
        arrangement.report()

    if "--png" in sys.argv:
        od = os.path.join(ROOT, "out", "audio")
        os.makedirs(od, exist_ok=True)
        jobs = [["-lavfi", "showspectrumpic=s=1800x700:legend=1:scale=log", os.path.join(od, "spectrum.png")],
                ["-lavfi", "showwavespic=s=1800x400:split_channels=1", os.path.join(od, "wave.png")]]
        for j in jobs:
            subprocess.run(["ffmpeg", "-hide_banner", "-loglevel", "error", "-y", "-i", path] + j, check=True)
        print(f"\nPNG written to {od}")


if __name__ == "__main__":
    main()
