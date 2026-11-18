#!/usr/bin/env python3
"""Measure public/v04/music.wav (you cannot listen, so measure).

    python3 audio/v04/analyze_v04.py [path.wav] [--score] [--png] [--vo]

Prints: format / sample count, peak, true peak, integrated loudness, DC offset, edge silence,
per-second loudness, the onset offset (ms) of every cue and how much each accent stands out from
the neighbouring beats, the 16.0 s tape-stop (pitch dive + level), per-section loudness + spectral
balance + stereo, the share of energy in the 1-4 kHz voice band inside / outside the voice-over
windows (final narration), a click scan and narrow resonances in 1.5-6 kHz.
--score  also prints the note / chord names per bar and the in-key check (arrangement_v04.report()).
--png    also renders spectrogram + waveform PNGs into out/audio/v04/ with ffmpeg.
--vo     also places the (scratch) narration clips of public/v04/vo at the final voice windows and
         reports the voice-to-music ratio in 1-4 kHz with the music ducked 8 dB.
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

import arrangement_v04 as arr  # noqa: E402
from dsp import k_weight, lufs_integrated, true_peak  # noqa: E402

# (name, time s, hard): hard cues must pass |offset| <= 10 ms and rise >= 6 dB
CUES = [("notification / ping", 0.2, True), ("tap / red alarm", 2.0, True), ("message / swoosh+impact", 3.5, True),
        ("reveal / sting", 6.0, True), ("how / step 1", 9.0, True), ("step 2", 10.5, True), ("step 3", 12.0, True),
        ("step 4", 13.5, True), ("step 5 / dark drop", 15.0, True), ("suck / tape-stop", 16.0, False),
        ("shield / bright hit", 17.0, True), ("tip 1 / confirm", 17.5, True), ("tip 2 / confirm", 19.0, True),
        ("tip 3 / confirm", 21.0, True), ("build / roll", 23.5, False), ("destroy / shatter", 24.0, True),
        ("title / resolved hit", 25.0, True), ("question / ping", 28.0, True)]
SECTIONS = [("hook", 0.0, 2.0), ("alarm", 2.0, 3.5), ("trap", 3.5, 9.0), ("how", 9.0, 16.0), ("suck", 16.0, 17.0),
            ("defend", 17.0, 24.0), ("finale", 24.0, 28.0), ("question", 28.0, 29.0), ("fade", 29.0, 30.0)]
BANDS = [(0, 120), (120, 1000), (1000, 4000), (4000, 8000), (8000, 24000)]
VO = arr.VO
GAPS = arr.GAPS
VO_FILES = ("vo_01", "vo_02", "vo_03", "vo_04a", "vo_04b", "vo_04c", "vo_05", "vo_06")


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
    path = args[0] if args else os.path.join(ROOT, "public", "v04", "music.wav")
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
    print(f"   integrated loudness {lufs_integrated(x):.2f} LUFS (target -14)")
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

    print("\nCUE ALIGNMENT (strongest onset within +-40 ms; hard cues pass = |offset| <= 10 ms and rise >= 6 dB)")
    print(f"   {'cue':26s} {'time':>6s} {'offset':>8s} {'rise':>7s} {'(broad/HF)':>12s} {'level':>7s} {'HF lvl':>7s}"
          f"  vs beats +-1/2 (broad/HF)")
    allok = True
    table = []
    for name, c, hard in CUES:
        w = (tt >= c - 0.040) & (tt <= c + 0.040)
        i = np.flatnonzero(w)[np.argmax(stt[w])]
        off = (tt[i] - c) * 1000
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
        table.append((name, c, off, stt[i], tag))
        print(f"   {name:26s} {c:6.2f} {off:+7.1f}ms {stt[i]:6.1f}dB ({sb[i]:5.1f}/{sh[i]:5.1f}) {lvl:6.1f}dB "
              f"{hl:6.1f}dB  {prom:+5.1f}/{prom_h:+5.1f} dB  {tag}")
    print(f"   all hard cues: {'PASS' if allok else 'FAIL'}")
    hits = {name: lvl_after(c) for name, c, _ in CUES}
    print("   accent ranking (25 ms level after the cue): " + ", ".join(
        f"{k.split(' /')[0]} {v:.1f}" for k, v in sorted(hits.items(), key=lambda kv: -kv[1])[:8]))

    def peaks(strength, thr, min_sep_ms=25):
        dist = max(1, int(min_sep_ms / 1000 * sr / hop))
        p, _ = signal.find_peaks(strength, height=thr, distance=dist)
        return p

    pb = peaks(stt, 9.0, 60)
    order = pb[np.argsort(-stt[pb])][:27]
    cues = np.array([c for _, c, _ in CUES])
    beats = np.arange(0, 60) * 0.5
    print("STRONGEST ONSETS (time s, rise dB, level; nearest cue / beat):")
    out = []
    for i in sorted(order):
        d = (tt[i] - cues[np.argmin(np.abs(cues - tt[i]))]) * 1000
        db_ = (tt[i] - beats[np.argmin(np.abs(beats - tt[i]))]) * 1000
        out.append(f"{tt[i]:6.3f} {stt[i]:4.1f}dB {lvl_after(tt[i]):5.1f}dB"
                   + (f" cue{d:+.0f}ms" if abs(d) < 40 else (f" beat{db_:+.0f}ms" if abs(db_) < 40 else " offgrid")))
    for i in range(0, len(out), 3):
        print("   " + "   |   ".join(out[i:i + 3]))

    # --------------------------------------------------------- 16.0 s tape-stop: pitch dive of the groove
    print("\nTAPE-STOP (16.0 s): pitch shift of the groove (log-spectrum correlation vs 15.80-15.88 s), "
          "level, centroid")
    grid = 80.0 * 2.0 ** (np.arange(0, 12 * 4.0, 0.125) / 12.0)          # 80 Hz .. ~1.3 kHz, 1/8 semitone

    def logspec(t0, win=0.08):
        a_ = int(t0 * sr)
        k_ = int(win * sr)
        seg_ = mono[a_:a_ + k_] * np.hanning(k_)
        sp = np.abs(np.fft.rfft(seg_, 1 << 16))
        fr = np.fft.rfftfreq(1 << 16, 1 / sr)
        ls = 20 * np.log10(np.interp(grid, fr, sp) + 1e-9)
        cen = np.sum(fr * sp ** 2) / (np.sum(sp ** 2) + 1e-20)
        return np.maximum(ls - ls.max() + 45.0, 0.0), db(np.sqrt(np.mean(seg_ ** 2))), cen

    ref, _, _ = logspec(15.80)
    line = []
    for t0 in np.arange(15.85, 16.56, 0.05):
        cur, lv, cen = logspec(t0)
        best, bs = -1e9, 0.0
        for sh_ in np.arange(-26 * 8, 2 * 8 + 1):
            if sh_ < 0:
                c_ = np.dot(cur[:sh_], ref[-sh_:])
            elif sh_ > 0:
                c_ = np.dot(cur[sh_:], ref[:-sh_])
            else:
                c_ = np.dot(cur, ref)
            c_ /= len(cur) - abs(sh_)
            if c_ > best:
                best, bs = c_, sh_ / 8.0
        line.append(f"{t0:5.2f}s {bs:+5.1f}st {lv:5.1f}dB {cen:5.0f}Hz")
    for i in range(0, len(line), 4):
        print("   " + "   ".join(line[i:i + 4]))

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
    print("   (intended transients - notification 0.2, tap 2.0, tips, shatter 24.0 - may legitimately show up)")
    # discontinuities of the waveform itself (a step that no source would make)
    jumps = np.flatnonzero(np.max(np.abs(np.diff(x, axis=0)), axis=1) > 0.35)
    print(f"   sample-to-sample jumps > 0.35: {len(jumps)}" + (f" at {', '.join(f'{j / sr:.4f}' for j in jumps[:8])}"
                                                            if len(jumps) else ""))

    # --------------------------------------------------------- sections
    print("\nSECTIONS   LUFS(ungated) RMS dB    <120   120-1k  1-4k   4-8k   >8k    corr  S/M dB  centroid")
    for name, a, b in SECTIONS:
        seg = x[int(a * sr):int(b * sr)]
        lu = -0.691 + 10 * np.log10(max(np.mean(kw[int(a * sr):int(b * sr)]), 1e-12))
        rms = db(np.sqrt(np.mean(seg ** 2)))
        shares, f, p = band_shares(seg.mean(axis=1), sr)
        l, r = seg[:, 0], seg[:, 1]
        corr = np.sum(l * r) / np.sqrt(np.sum(l * l) * np.sum(r * r) + 1e-20)
        wdb = db(np.sqrt(np.mean((0.5 * (l - r)) ** 2))) - db(np.sqrt(np.mean((0.5 * (l + r)) ** 2)))
        cen = np.sum(f * p) / (np.sum(p) + 1e-30)
        print(f"   {name:9s} {lu:7.1f}      {rms:6.1f}  " + " ".join(f"{s:5.1f}%" for s in shares)
              + f"  {corr:5.2f}  {wdb:6.1f}   {cen:6.0f} Hz")
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
    print(f"\nVOICE BAND 1-4 kHz (final narration windows): share of the music's energy while the narrator speaks "
          f"{inside:.1f}% (level {lvl_in:.1f} dBFS), in the gaps {outside:.1f}% ({lvl_out:.1f} dBFS)")
    print("   music 1-4 kHz RMS per voice-over line (dBFS, before the external -8 dB duck): " + "  ".join(
        f"{a:.2f}-{b:.2f}:{db(np.sqrt(np.mean(bandsig[int(a * sr):int(b * sr)] ** 2))):.1f}" for a, b in VO))
    print("   music 1-4 kHz RMS per gap: " + "  ".join(
        f"{a:.2f}-{b:.2f}:{db(np.sqrt(np.mean(bandsig[int(a * sr):int(b * sr)] ** 2))):.1f}" for a, b in GAPS))
    print("   share per voice-over line: " + "  ".join(
        f"{a:.1f}-{b:.1f}:{np.sum(vb[int(a * sr):int(b * sr)]) / np.sum(tot_e[int(a * sr):int(b * sr)]) * 100:.1f}%"
        for a, b in VO))
    # sustained (not transient) 1-4 kHz level under the voice: median of 50 ms RMS frames
    fr = int(0.05 * sr)
    med = []
    for a, b in VO:
        seg = bandsig[int(a * sr):int(min(b, 29.0) * sr)]
        k = len(seg) // fr
        if k:
            rms_fr = np.sqrt(np.mean(seg[:k * fr].reshape(k, fr) ** 2, axis=1))
            med.append(f"{a:.1f}:{db(np.median(rms_fr)):.1f}/{db(np.percentile(rms_fr, 95)):.1f}")
    print("   1-4 kHz 50 ms frames per line, median/95th pct dBFS: " + "  ".join(med))

    # --------------------------------------------------------- harshness
    for lab, a, b in (("threat groove 9-16 s", 9, 16), ("defend 17-24 s", 17, 24)):
        seg = x[a * sr:b * sr].mean(axis=1)
        f, p = signal.welch(seg, fs=sr, nperseg=16384)
        pdb = 10 * np.log10(p + 1e-20)
        sm = np.convolve(pdb, np.ones(31) / 31, mode="same")
        m = (f >= 1500) & (f <= 6000)
        exc = (pdb - sm)[m]
        j = np.argsort(-exc)[:5]
        band = lambda lo_, hi_: 10 * np.log10(np.sum(p[(f >= lo_) & (f < hi_)]) + 1e-20)  # noqa: E731
        print(f"\nHARSHNESS ({lab}): narrow peaks above the smoothed spectrum in 1.5-6 kHz: "
              + ", ".join(f"{f[m][k]:.0f}Hz +{exc[k]:.1f}dB" for k in sorted(j)))
        print(f"   band levels rel. to 200-800 Hz: 1-4 kHz {band(1000, 4000) - band(200, 800):+.1f} dB, "
              f"4-8 kHz {band(4000, 8000) - band(200, 800):+.1f} dB, 8-16 kHz {band(8000, 16000) - band(200, 800):+.1f} dB")

    if "--vo" in sys.argv:
        vo_check(x, sr, bandsig)

    if "--score" in sys.argv:
        print("\n" + "=" * 100)
        arr.report()

    if "--png" in sys.argv:
        od = os.path.join(ROOT, "out", "audio", "v04")
        os.makedirs(od, exist_ok=True)
        jobs = [("showspectrumpic=s=1800x700:legend=1:scale=log:fscale=log", "spectrum.png"),
                ("showwavespic=s=1800x400:split_channels=1", "wave.png")]
        for a, b in ((0, 10), (10, 20), (20, 30)):
            jobs.append((f"atrim={a}:{b},showspectrumpic=s=1600x600:legend=1:scale=log:fscale=log",
                         f"spec_{a:02d}_{b:02d}.png"))
        for a, b in ((0, 5), (5, 10), (10, 15), (15, 20), (20, 25), (25, 30)):
            jobs.append((f"atrim={a}:{b},asetpts=N/SR/TB,showwavespic=s=1600x300:split_channels=0",
                         f"wave_{a:02d}_{b:02d}.png"))
        for graph, name in jobs:
            subprocess.run(["nice", "-n", "10", "ffmpeg", "-hide_banner", "-loglevel", "error", "-y", "-i", path,
                            "-lavfi", graph, os.path.join(od, name)], check=True)
        print(f"\nPNG written to {od}")


def vo_check(x, sr, music_band):
    """Stand-in narration: the scratch clips of public/v04/vo placed at the final windows' starts,
    voice at -16 LUFS, music at its own level ducked 8 dB; voice-to-music ratio in 1-4 kHz per line."""
    vdir = os.path.join(ROOT, "public", "v04", "vo")
    n = len(x)
    voice = np.zeros(n)
    for fn, (t0, _) in zip(VO_FILES, VO):
        p = os.path.join(vdir, fn + ".wav")
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
    vl = lufs_integrated(np.stack([voice, voice], axis=1))
    voice *= 10 ** ((-16.0 - vl) / 20)
    vband = signal.sosfilt(signal.butter(4, [1000, 4000], "band", fs=sr, output="sos"), voice)
    duck = 10 ** (-8 / 20)
    print("\nVO CHECK (scratch narration clips placed at the FINAL windows; voice -16 LUFS, music ducked 8 dB)")
    rows = []
    for a, b in VO:
        sa, sb_ = int(a * sr), int(b * sr)
        vrms = np.sqrt(np.mean(vband[sa:sb_] ** 2))
        mrms = np.sqrt(np.mean(music_band[sa:sb_] ** 2)) * duck
        rows.append(f"{a:.2f}-{b:.2f}: {db(vrms) - db(mrms):+.1f} dB")
    print("   voice-to-music ratio in 1-4 kHz per line: " + "  ".join(rows))


if __name__ == "__main__":
    main()
