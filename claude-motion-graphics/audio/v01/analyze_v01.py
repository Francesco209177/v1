#!/usr/bin/env python3
"""Measure public/v01/music.wav (you cannot listen, so measure).

    python3 audio/v01/analyze_v01.py [path.wav] [--score] [--png] [--vo]

Prints: format / sample count, peak, true peak, integrated loudness, DC offset, edge silence,
per-second loudness, the onset offset (ms) of every cue (and of every 8th-note token tick
18-22 s and the typing run), how much each accent stands out from the neighbouring beats,
per-section loudness + spectral balance + stereo, the share of energy in the 1-4 kHz voice band
per section and inside / outside the voice-over windows, a click scan and narrow resonances
in 1.5-6 kHz.
--score  also prints the note / chord names per bar and the in-key check (arrangement_v01.report()).
--png    also renders spectrogram + waveform PNGs into out/audio/v01/ with ffmpeg.
--vo     also lays the temporary narration (public/v01/vo/*.wav, read only) at its timeline
         positions and reports the voice-to-music ratio in the 1-4 kHz band with the 8 dB duck.
"""
from __future__ import annotations

import os
import subprocess
import sys

sys.dont_write_bytecode = True
HERE = os.path.dirname(os.path.abspath(__file__))
AUDIO = os.path.dirname(HERE)
ROOT = os.path.dirname(AUDIO)
for _p in (AUDIO, HERE):
    if _p not in sys.path:
        sys.path.insert(0, _p)

import numpy as np  # noqa: E402
from scipy import signal  # noqa: E402
from scipy.io import wavfile  # noqa: E402
from scipy.ndimage import uniform_filter1d  # noqa: E402

from dsp import k_weight, lufs_integrated, true_peak  # noqa: E402

# (name, time s, hard): hard cues must pass |offset| <= 10 ms and rise >= 6 dB
CUES = [("typeStart / first key", 0.2, True), ("questionDone / send", 1.5, True), ("diveIn / whoosh start", 2.0, True),
        ("inside / soft impact", 3.0, True), ("split / shatter", 6.0, True), ("intoNet / dive", 7.5, True),
        ("groove / attention scene", 9.0, True), ("vectors / data blips", 10.0, True),
        ("attention / chord swell", 12.0, True), ("build / riser", 15.0, False), ("predict / impact", 16.0, True),
        ("pick / select-lock", 17.5, True), ("tokens / first tick", 18.0, True), ("loop / accent", 20.0, True),
        ("fill / roll", 22.5, True), ("training / big impact", 23.0, True), ("title / resolved hit", 26.0, True),
        ("caveat / detuned ping", 28.0, True)]
SECTIONS = [("hook", 0.0, 2.0), ("dive", 2.0, 3.0), ("inside", 3.0, 6.0), ("tokens", 6.0, 9.0),
            ("attention", 9.0, 15.0), ("build", 15.0, 16.0), ("predict", 16.0, 22.5), ("fill", 22.5, 23.0),
            ("training", 23.0, 26.0), ("title", 26.0, 28.0), ("caveat", 28.0, 29.0), ("fade", 29.0, 30.0)]
BANDS = [(0, 120), (120, 1000), (1000, 4000), (4000, 8000), (8000, 24000)]
VO = ((0.3, 2.42), (2.55, 4.2), (4.45, 8.0), (9.3, 14.3), (16.3, 20.4), (23.3, 25.4), (25.75, 29.2))
GAPS = ((2.42, 2.55), (4.2, 4.45), (8.0, 9.3), (14.3, 16.3), (20.4, 23.3), (25.4, 25.75))
VO_FILES = (("vo_01.wav", 0.3), ("vo_02.wav", 2.55), ("vo_03.wav", 4.45), ("vo_04.wav", 9.3), ("vo_05.wav", 16.3),
            ("vo_06.wav", 23.3), ("vo_07.wav", 25.75))


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


def band_shares(seg, sr):
    f, p = signal.welch(seg, fs=sr, nperseg=min(8192, len(seg)))
    tot = np.sum(p) + 1e-30
    return [np.sum(p[(f >= lo) & (f < hi)]) / tot * 100 for lo, hi in BANDS], f, p


def main():
    args = [a for a in sys.argv[1:] if not a.startswith("--")]
    path = args[0] if args else os.path.join(ROOT, "public", "v01", "music.wav")
    sr, raw, x = load(path)
    n, ch = x.shape
    print(f"FILE {path}")
    ok_fmt = n == 1440000 and sr == 48000 and ch == 2 and raw.dtype == np.int16
    print(f"   {sr} Hz, {ch} ch, dtype {raw.dtype}, {n} samples = {n / sr:.6f} s  "
          f"({'OK' if ok_fmt else 'WRONG'} vs 1,440,000 @ 48 kHz stereo 16-bit)")
    peak = np.max(np.abs(x))
    tp = true_peak(x)
    print(f"   sample peak {db(peak):.2f} dBFS, true peak (4x) {db(tp):.2f} dBTP "
          f"({'OK' if db(tp) <= -1.5 else 'OVER'} vs -1.5), clipped samples "
          f"{int(np.sum(np.abs(raw.astype(np.int64)) >= 32767)) if raw.dtype == np.int16 else 'n/a'}")
    print(f"   integrated loudness {lufs_integrated(x):.2f} LUFS")
    print(f"   DC offset L {np.mean(x[:, 0]):+.2e}  R {np.mean(x[:, 1]):+.2e}")
    e10 = int(0.010 * sr)
    for lab, seg in (("first", x[:e10]), ("last ", x[-e10:])):
        mx = np.max(np.abs(seg))
        print(f"   {lab} 10 ms max |x| = {mx:.2e}  -> {'SILENT' if mx == 0 else 'NOT silent'}")
    nz = np.flatnonzero(np.max(np.abs(raw), axis=1))
    if nz.size:
        print(f"   first non-zero sample {nz[0]} ({nz[0] / sr * 1000:.1f} ms), last non-zero {nz[-1]} "
              f"({nz[-1] / sr:.3f} s), trailing digital silence {(n - 1 - nz[-1]) / sr * 1000:.0f} ms")

    kw = np.sum(k_weight(x) ** 2, axis=1)
    print("\nPER SECOND   RMS dBFS | momentary LUFS (400 ms ending at t+1)")
    row = []
    for s in range(int(n / sr)):
        seg = x[s * sr:(s + 1) * sr]
        m = kw[max(0, (s + 1) * sr - int(0.4 * sr)):(s + 1) * sr]
        row.append(f"{s:2d}s {db(np.sqrt(np.mean(seg ** 2))):6.1f}|{-0.691 + 10 * np.log10(max(np.mean(m), 1e-12)):6.1f}")
    for i in range(0, len(row), 5):
        print("   " + "   ".join(row[i:i + 5]))

    # ------------------------------------------------------------------ cues
    mono = x.mean(axis=1)
    hf = signal.sosfilt(signal.butter(2, 1500, "high", fs=sr, output="sos"), mono)
    eb, hop = frame_energy(mono, sr)
    eh, _ = frame_energy(hf, sr)
    sb = onset_strength(eb, hop, sr)
    sh = onset_strength(eh, hop, sr)
    stt = np.maximum(sb, sh)
    tt = np.arange(len(eb)) * hop / sr

    def lvl_after(t0, ms=25, e=eb):
        i = int(t0 * sr / hop)
        return 10 * np.log10(np.mean(e[i:i + int(ms / 1000 * sr / hop)]) + 1e-12)

    def best_onset(c, win=0.040):
        w = (tt >= c - win) & (tt <= c + win)
        i = np.flatnonzero(w)[np.argmax(stt[w])]
        return i, (tt[i] - c) * 1000

    print("\nCUE ALIGNMENT (strongest onset within +-40 ms; hard cues pass = |offset| <= 10 ms and rise >= 6 dB)")
    print(f"   {'cue':26s} {'time':>6s} {'offset':>8s} {'rise':>7s} {'(broad/HF)':>12s} {'level':>7s} {'HF lvl':>7s}"
          f"  vs beats +-1/2 (broad/HF)")
    allok = True
    for name, c, hard in CUES:
        i, off = best_onset(c)
        lvl = lvl_after(tt[i])
        hl = lvl_after(tt[i], e=eh)
        neigh, neigh_h = [], []
        for d in (-1.0, -0.5, 0.5, 1.0):
            tn = c + d
            if 0.2 < tn < 29.0:
                wn = (tt >= tn - 0.012) & (tt <= tn + 0.012)
                jn = np.flatnonzero(wn)[np.argmax(stt[wn])]
                neigh.append(lvl_after(tt[jn]))
                neigh_h.append(lvl_after(tt[jn], e=eh))
        prom = lvl - max(neigh) if neigh else float("nan")
        prom_h = hl - max(neigh_h) if neigh_h else float("nan")
        ok = abs(off) <= 10 and stt[i] >= 6
        if hard:
            allok &= ok
        tag = ("PASS" if ok else "FAIL") if hard else ("ok" if ok else "soft")
        print(f"   {name:26s} {c:6.2f} {off:+7.1f}ms {stt[i]:6.1f}dB ({sb[i]:5.1f}/{sh[i]:5.1f}) {lvl:6.1f}dB "
              f"{hl:6.1f}dB  {prom:+5.1f}/{prom_h:+5.1f} dB  {tag}")
    print(f"   all hard cues: {'PASS' if allok else 'FAIL'}")

    # token ticks (8ths 18-22 s) and the typing run (0.2-1.42 s), HF onsets only
    offs = []
    for k in range(16):
        c = 18.0 + 0.25 * k
        w = (tt >= c - 0.02) & (tt <= c + 0.02)
        j = np.flatnonzero(w)[np.argmax(sh[w])]
        offs.append(((tt[j] - c) * 1000, sh[j]))
    print("   token ticks 18.0-21.75 s (8ths, HF onset ms / rise dB): "
          + " ".join(f"{o:+.1f}/{r:.0f}" for o, r in offs))
    print(f"   token ticks: max |offset| {max(abs(o) for o, _ in offs):.1f} ms, min rise {min(r for _, r in offs):.1f} dB")
    ty = signal.find_peaks(sh[(tt >= 0.15) & (tt < 1.47)], height=6.0, distance=int(0.02 * sr / hop))[0]
    print(f"   typing run 0.15-1.47 s: {len(ty)} HF onsets >= 6 dB (43 keys typed)")

    def peaks(strength, thr, min_sep_ms=25):
        dist = max(1, int(min_sep_ms / 1000 * sr / hop))
        p, _ = signal.find_peaks(strength, height=thr, distance=dist)
        return p

    pb = peaks(stt, 9.0, 60)
    order = pb[np.argsort(-stt[pb])][:27]
    cues = np.array([c for _, c, _ in CUES])
    beats = np.arange(0, 120) * 0.25
    print("STRONGEST ONSETS (time s, rise dB, level; nearest cue / 16th):")
    out = []
    for i in sorted(order):
        d = (tt[i] - cues[np.argmin(np.abs(cues - tt[i]))]) * 1000
        db_ = (tt[i] - beats[np.argmin(np.abs(beats - tt[i]))]) * 1000
        out.append(f"{tt[i]:6.3f} {stt[i]:4.1f}dB {lvl_after(tt[i]):5.1f}dB"
                   + (f" cue{d:+.0f}ms" if abs(d) < 40 else (f" grid{db_:+.0f}ms" if abs(db_) < 40 else " offgrid")))
    for i in range(0, len(out), 3):
        print("   " + "   |   ".join(out[i:i + 3]))

    # --------------------------------------------------------- hit strength (title must be the strongest)
    hits = (("inside", 3.0), ("split", 6.0), ("intoNet", 7.5), ("groove", 9.0), ("attention", 12.0),
            ("predict", 16.0), ("pick", 17.5), ("loop", 20.0), ("training", 23.0), ("title", 26.0), ("caveat", 28.0))
    print("HIT STRENGTH (K-weighted loudness of the 0-300 ms / 0-1 s after the hit, LUFS-ish; peak dBFS):")
    row = []
    for name, c in hits:
        a_ = int(c * sr)
        l3 = -0.691 + 10 * np.log10(np.mean(kw[a_:a_ + int(0.3 * sr)]) + 1e-12)
        l10 = -0.691 + 10 * np.log10(np.mean(kw[a_:a_ + sr]) + 1e-12)
        row.append(f"{name} {l3:.1f}/{l10:.1f}/{db(np.max(np.abs(x[a_:a_ + int(0.3 * sr)]))):.1f}")
    for i in range(0, len(row), 4):
        print("   " + "   ".join(row[i:i + 4]))

    # --------------------------------------------------------- clicks
    nclick, where = 0, []
    for c in range(ch):
        d2 = np.abs(np.diff(x[:, c], 2))
        loc = uniform_filter1d(d2, 241, mode="nearest")
        bad = np.flatnonzero((d2 > 25 * loc) & (d2 > 0.01))
        nclick += len(bad)
        where += [b / sr for b in bad[:6]]
    print(f"\nCLICK SCAN (2nd difference > 25x its 5 ms mean and > -40 dBFS): {nclick} samples"
          + (f", at {', '.join(f'{w:.4f}s' for w in sorted(where)[:10])}" if nclick else ""))
    print("   (intended transients - send 1.5, shatter 6.0, select 17.5 - may legitimately show up here)")

    # --------------------------------------------------------- sections
    print("\nSECTIONS    LUFS(ungated) RMS dB    <120   120-1k  1-4k   4-8k   >8k    corr  S/M dB  1-4k vs 120-1k")
    for name, a, b in SECTIONS:
        seg = x[int(a * sr):int(b * sr)]
        lu = -0.691 + 10 * np.log10(max(np.mean(kw[int(a * sr):int(b * sr)]), 1e-12))
        rms = db(np.sqrt(np.mean(seg ** 2)))
        shares, f, p = band_shares(seg.mean(axis=1), sr)
        l, r = seg[:, 0], seg[:, 1]
        corr = np.sum(l * r) / np.sqrt(np.sum(l * l) * np.sum(r * r) + 1e-20)
        wdb = db(np.sqrt(np.mean((0.5 * (l - r)) ** 2))) - db(np.sqrt(np.mean((0.5 * (l + r)) ** 2)))
        rel = 10 * np.log10((shares[2] + 1e-9) / (shares[1] + 1e-9))
        print(f"   {name:10s} {lu:7.1f}      {rms:6.1f}  " + " ".join(f"{s:5.1f}%" for s in shares)
              + f"  {corr:5.2f}  {wdb:6.1f}    {rel:+6.1f} dB")
    l, r = x[:, 0], x[:, 1]
    print(f"   whole-file stereo correlation {np.sum(l * r) / np.sqrt(np.sum(l * l) * np.sum(r * r)):.3f}")
    lo = signal.sosfilt(signal.butter(4, 120, fs=sr, output="sos"), x, axis=0)
    print(f"   low end (<120 Hz) correlation "
          f"{np.sum(lo[:, 0] * lo[:, 1]) / np.sqrt(np.sum(lo[:, 0] ** 2) * np.sum(lo[:, 1] ** 2)):.3f}")

    # --------------------------------------------------------- voice band inside / outside the VO
    vo_mask = np.zeros(n, bool)
    for a, b in VO:
        vo_mask[int(a * sr):int(b * sr)] = True
    vo_mask[int(29.0 * sr):] = False
    bandsig = signal.sosfilt(signal.butter(4, [1000, 4000], "band", fs=sr, output="sos"), mono)
    tot_e = mono ** 2
    vb = bandsig ** 2
    inside = np.sum(vb[vo_mask]) / np.sum(tot_e[vo_mask]) * 100
    gaps = np.zeros(n, bool)
    for a, b in GAPS:
        gaps[int(a * sr):int(b * sr)] = True
    outside = np.sum(vb[gaps]) / max(np.sum(tot_e[gaps]), 1e-20) * 100
    lvl_in = db(np.sqrt(np.mean(vb[vo_mask])))
    lvl_out = db(np.sqrt(np.mean(vb[gaps])))
    print(f"\nVOICE BAND 1-4 kHz: share of energy while the narrator speaks {inside:.1f}% (level {lvl_in:.1f} dBFS), "
          f"in the gaps {outside:.1f}% ({lvl_out:.1f} dBFS)")
    print("   music 1-4 kHz RMS per voice-over line (dBFS, before the external -8 dB duck): " + "  ".join(
        f"{a:.2f}-{b:.2f}:{db(np.sqrt(np.mean(bandsig[int(a * sr):int(b * sr)] ** 2))):.1f}" for a, b in VO))
    print("   music 1-4 kHz RMS per gap: " + "  ".join(
        f"{a:.2f}-{b:.2f}:{db(np.sqrt(np.mean(bandsig[int(a * sr):int(b * sr)] ** 2))):.1f}" for a, b in GAPS))
    print("   share per voice-over line: " + "  ".join(
        f"{a:.1f}-{b:.1f}:{np.sum(vb[int(a * sr):int(b * sr)]) / np.sum(tot_e[int(a * sr):int(b * sr)]) * 100:.1f}%"
        for a, b in VO))
    # 250 ms windows: where is the voice band busiest while the narrator speaks?
    w = int(0.25 * sr)
    vals = []
    for a in range(0, n - w, w):
        if vo_mask[a:a + w].mean() > 0.9:
            vals.append((db(np.sqrt(np.mean(vb[a:a + w]))), a / sr))
    vals.sort(reverse=True)
    print("   busiest 250 ms windows under the voice (1-4 kHz dBFS @ s): "
          + "  ".join(f"{v:.1f}@{t:.2f}" for v, t in vals[:6]))

    # --------------------------------------------------------- harshness
    seg = x[16 * sr:22 * sr].mean(axis=1)
    f, p = signal.welch(seg, fs=sr, nperseg=16384)
    pdb = 10 * np.log10(p + 1e-20)
    sm = np.convolve(pdb, np.ones(31) / 31, mode="same")
    m = (f >= 1500) & (f <= 6000)
    exc = (pdb - sm)[m]
    j = np.argsort(-exc)[:5]
    print("\nHARSHNESS (predict 16-22 s): narrow peaks above the smoothed spectrum in 1.5-6 kHz: "
          + ", ".join(f"{f[m][k]:.0f}Hz +{exc[k]:.1f}dB" for k in sorted(j)))
    band = lambda lo_, hi_: 10 * np.log10(np.sum(p[(f >= lo_) & (f < hi_)]) + 1e-20)  # noqa: E731
    print(f"   band levels rel. to 200-800 Hz: 1-4 kHz {band(1000, 4000) - band(200, 800):+.1f} dB, "
          f"4-8 kHz {band(4000, 8000) - band(200, 800):+.1f} dB, 8-16 kHz {band(8000, 16000) - band(200, 800):+.1f} dB")

    if "--vo" in sys.argv:
        vo_check(x, sr, bandsig)

    if "--score" in sys.argv:
        import arrangement_v01
        print("\n" + "=" * 100)
        arrangement_v01.report()

    if "--png" in sys.argv:
        od = os.path.join(ROOT, "out", "audio", "v01")
        os.makedirs(od, exist_ok=True)
        jobs = [("showspectrumpic=s=1800x700:legend=1:scale=log:fscale=log", "spectrum.png"),
                ("showwavespic=s=1800x400:split_channels=1", "wave.png")]
        for a, b in ((0, 10), (10, 20), (20, 30)):
            jobs.append((f"atrim={a}:{b},showspectrumpic=s=1600x600:legend=1:scale=log:fscale=log",
                         f"spec_{a:02d}_{b:02d}.png"))
        for a, b in ((0, 5), (5, 10), (15, 20), (20, 25), (25, 30)):
            jobs.append((f"atrim={a}:{b},asetpts=N/SR/TB,showwavespic=s=1600x300:split_channels=0", f"wave_{a:02d}_{b:02d}.png"))
        for graph, name in jobs:
            subprocess.run(["nice", "-n", "10", "ffmpeg", "-hide_banner", "-loglevel", "error", "-y", "-i", path,
                            "-lavfi", graph, os.path.join(od, name)], check=True)
        print(f"\nPNG written to {od}")


def vo_check(x, sr, music_band):
    """Simulated narration: voice 1-4 kHz level vs the (ducked) music 1-4 kHz level per line."""
    vdir = os.path.join(ROOT, "public", "v01", "vo")
    n = len(x)
    voice = np.zeros(n)
    for fn, t0 in VO_FILES:
        p = os.path.join(vdir, fn)
        if not os.path.exists(p):
            print(f"\nVO CHECK: {p} missing, skipped")
            return
        vsr, d = wavfile.read(p)
        v = d.astype(np.float64)
        v = v / (32768.0 if d.dtype == np.int16 else (2147483648.0 if d.dtype == np.int32 else 1.0))
        if v.ndim == 2:
            v = v.mean(axis=1)
        if vsr != sr:
            v = signal.resample_poly(v, sr, vsr)
        e = np.abs(v)
        idx = np.flatnonzero(e > e.max() * 10 ** (-45 / 20))
        v = v[max(0, idx[0] - int(0.015 * sr)): idx[-1] + int(0.015 * sr)]
        a = int(t0 * sr)
        m = min(len(v), n - a)
        voice[a:a + m] += v[:m]
    # scale the voice so that voice alone sits ~-16 LUFS-ish (speech level a mixer would use)
    vl = lufs_integrated(np.stack([voice, voice], axis=1))
    voice *= 10 ** ((-16.0 - vl) / 20)
    vband = signal.sosfilt(signal.butter(4, [1000, 4000], "band", fs=sr, output="sos"), voice)
    duck = 10 ** (-8 / 20)
    print("\nVO CHECK (temporary narration placed at the timeline, voice at -16 LUFS, music at -14 LUFS ducked 8 dB)")
    rows = []
    for (fn, t0), (a, b) in zip(VO_FILES, VO):
        sa, sb_ = int(a * sr), int(b * sr)
        vrms = np.sqrt(np.mean(vband[sa:sb_] ** 2))
        mrms = np.sqrt(np.mean(music_band[sa:sb_] ** 2)) * duck
        rows.append(f"{a:.2f}-{b:.2f}: {db(vrms) - db(mrms):+.1f} dB")
    print("   voice-to-music ratio in 1-4 kHz per line: " + "  ".join(rows))


if __name__ == "__main__":
    main()
