"""
Mix finale: base musicale + voce narrante + effetti sonori (ElevenLabs) -> public/music_final.wav

    python3 audio/synth.py --bed          # base musicale senza gli effetti sintetizzati (public/music_bed.wav)
    python3 audio/mix_final.py            # legge audio/elevenlabs_plan.json e i file in public/elevenlabs/
    python3 audio/mix_final.py --dir <cartella> --bed public/music.wav

- Voce: ogni frase parte al suo `start` (sincronizzata con la caption). Silenzi iniziali/finali rifilati;
  se la frase supera `end_by` viene accelerata (atempo, max 1.15x, intonazione invariata), poi sfumata.
- Effetti: allineati al cue con `align` = onset | peak | end (vedi il piano).
- La base musicale si abbassa (ducking) sotto la voce; master con limiter true-peak e loudness -14 LUFS.
Deterministico: nessuna casualità oltre al dither con seed fisso.
"""
from __future__ import annotations

import argparse
import json
import os
import subprocess
import sys

import numpy as np
from scipy.io import wavfile
from scipy.ndimage import maximum_filter1d, uniform_filter1d

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
sys.path.insert(0, HERE)

from dsp import N, SR, db2lin, hp, lin2db, lufs_integrated  # noqa: E402
from synth import tp_limiter  # noqa: E402

MAX_TEMPO = 1.15


def decode(path: str, tempo: float = 1.0) -> np.ndarray:
    """Qualsiasi formato audio -> float32 stereo 48 kHz (via FFmpeg)."""
    af = ["-af", f"atempo={tempo:.4f}"] if abs(tempo - 1.0) > 1e-3 else []
    raw = subprocess.run(
        ["ffmpeg", "-hide_banner", "-loglevel", "error", "-i", path, *af, "-ac", "2", "-ar", str(SR), "-f", "f32le", "-"],
        check=True, capture_output=True,
    ).stdout
    return np.frombuffer(raw, dtype=np.float32).reshape(-1, 2).astype(np.float64)


def envelope(x: np.ndarray, ms: float = 5.0) -> np.ndarray:
    e = np.max(np.abs(x), axis=1)
    w = max(1, int(SR * ms / 1000))
    return uniform_filter1d(maximum_filter1d(e, size=w), size=w)


def trim_silence(x: np.ndarray, rel_db: float = -45.0, pad_ms: float = 15.0) -> np.ndarray:
    e = envelope(x, 3.0)
    if e.max() <= 0:
        return x[:0]
    idx = np.flatnonzero(e > e.max() * db2lin(rel_db))
    pad = int(SR * pad_ms / 1000)
    return x[max(0, idx[0] - pad): min(len(x), idx[-1] + pad)]


def anchor(x: np.ndarray, mode: str) -> int:
    """Campione della clip che deve cadere sul cue."""
    e = envelope(x, 2.0 if mode == "onset" else 12.0)
    pk = e.max()
    if pk <= 0:
        return 0
    if mode == "onset":
        return int(np.flatnonzero(e > pk * db2lin(-24.0))[0])
    if mode == "peak":
        return int(np.argmax(e))
    if mode == "end":
        return int(np.flatnonzero(e > pk * db2lin(-50.0))[-1])
    raise ValueError(f"align sconosciuto: {mode}")


def fade(x: np.ndarray, in_ms: float = 4.0, out_ms: float = 30.0) -> np.ndarray:
    y = x.copy()
    a, b = int(SR * in_ms / 1000), int(SR * out_ms / 1000)
    if a and len(y) > a:
        y[:a] *= np.linspace(0, 1, a)[:, None]
    if b and len(y) > b:
        y[-b:] *= np.linspace(1, 0, b)[:, None]
    return y


def place(bus: np.ndarray, clip: np.ndarray, start: int) -> tuple[int, int]:
    """Somma `clip` su `bus` a partire da `start` (anche negativo), tagliando ai bordi. Ritorna (inizio, fine) effettivi."""
    s0, c0 = max(0, start), max(0, -start)
    n = min(len(bus) - s0, len(clip) - c0)
    if n > 0:
        bus[s0:s0 + n] += clip[c0:c0 + n]
    return s0, s0 + max(0, n)


def follower(active: np.ndarray, attack_ms: float, release_ms: float) -> np.ndarray:
    """Inviluppo 0..1 con attacco/rilascio (per il ducking della musica sotto la voce)."""
    ka = 1.0 - np.exp(-1.0 / (attack_ms / 1000 * SR))
    kr = 1.0 - np.exp(-1.0 / (release_ms / 1000 * SR))
    out = np.empty(len(active))
    v = 0.0
    for i, a in enumerate(active.tolist()):
        v += (a - v) * (ka if a > v else kr)
        out[i] = v
    return out


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--plan", default=os.path.join(HERE, "elevenlabs_plan.json"))
    ap.add_argument("--dir", default=os.path.join(ROOT, "public", "elevenlabs"))
    ap.add_argument("--bed", default=None, help="base musicale (default: quella del piano)")
    ap.add_argument("--out", default=None)
    ap.add_argument("--require-all", action="store_true", help="errore se manca un file del piano")
    args = ap.parse_args()

    plan = json.load(open(args.plan, encoding="utf-8"))
    mix = plan["mix"]
    bed_path = os.path.join(ROOT, args.bed or mix["bed"])
    out_path = os.path.join(ROOT, args.out or mix["out"])
    missing: list[str] = []

    sr, bed = wavfile.read(bed_path)
    assert sr == SR and len(bed) == N, f"base musicale inattesa: {sr} Hz, {len(bed)} campioni"
    bed = bed.astype(np.float64) / (32768.0 if bed.dtype == np.int16 else 1.0)

    # --- voce narrante
    vo = np.zeros((N, 2))
    voice = plan["voice"]
    print("VOCE")
    for line in voice["lines"]:
        path = os.path.join(args.dir, line["file"])
        if not os.path.exists(path):
            missing.append(line["file"])
            print(f"  -- manca {line['file']}")
            continue
        clip = trim_silence(decode(path))
        budget = line["end_by"] - line["start"]
        dur = len(clip) / SR
        tempo = 1.0
        if dur > budget:
            tempo = min(MAX_TEMPO, dur / budget)
            clip = trim_silence(decode(path, tempo))
        clip = hp(clip, 80.0, 2)
        clip *= db2lin(-16.0 - lufs_integrated(clip) + voice.get("gain_db", 0.0))
        start = int(round(line["start"] * SR))
        limit = int(round(line["end_by"] * SR))
        if start + len(clip) > limit:
            clip = clip[: max(0, limit - start)]
        s, e = place(vo, fade(clip, 6, 40), start)
        warn = "  (ACCELERATA %.2fx)" % tempo if tempo > 1.005 else ""
        cut = "  (TAGLIATA a end_by)" if dur / tempo > budget + 0.01 else ""
        print(f"  {line['file']:12s} {s / SR:6.2f} -> {e / SR:6.2f} s  (limite {line['end_by']:.2f}){warn}{cut}  «{line['text']}»")

    # --- effetti sonori
    fx = np.zeros((N, 2))
    print("EFFETTI")
    for item in plan["sfx"]:
        path = os.path.join(args.dir, item["file"])
        if not os.path.exists(path):
            missing.append(item["file"])
            print(f"  -- manca {item['file']}")
            continue
        clip = decode(path)
        if np.max(np.abs(clip)) <= 0:
            continue
        clip = clip / np.max(np.abs(clip)) * db2lin(item.get("gain_db", 0.0))
        a = anchor(clip, item["align"])
        start = int(round(item["at"] * SR)) - a
        s, e = place(fx, fade(clip, 2, 30), start)
        print(f"  {item['file']:22s} {item['align']:5s} su {item['at']:6.2f} s  ->  {s / SR:6.2f}..{e / SR:6.2f} s")

    if missing and args.require_all:
        sys.exit(f"File mancanti: {', '.join(missing)}")

    # --- ducking della musica sotto la voce
    active = (np.max(np.abs(vo), axis=1) > db2lin(-50.0)).astype(np.float64)
    active = maximum_filter1d(active, size=int(SR * 0.12))  # niente "pompate" tra le sillabe
    duck = 1.0 - (1.0 - db2lin(-mix["duck_db"])) * follower(active, mix["duck_attack_ms"], mix["duck_release_ms"])
    y = bed * duck[:, None] + fx + vo

    # --- master: loudness target con limiter true-peak, silenzio digitale ai bordi
    t = np.arange(N) / SR
    edge = np.clip(t / 0.012, 0, 1) * np.clip((29.94 - t) / 0.04, 0, 1)
    y *= edge[:, None]
    g = 1.0
    out = y
    for _ in range(6):
        out, _gr = tp_limiter(y * g, mix["true_peak_db"])
        err = mix["target_lufs"] - lufs_integrated(out)
        if abs(err) < 0.03:
            break
        g *= db2lin(err)
    out *= (edge > 0)[:, None]
    rng = np.random.default_rng(4321)
    dither = (rng.random(out.shape) - rng.random(out.shape)) * (edge > 0)[:, None]
    pcm = np.clip(np.round(out * 32767.0 + dither), -32768, 32767).astype(np.int16)
    wavfile.write(out_path, SR, pcm)
    f = pcm.astype(np.float64) / 32768.0
    print(f"scritto {os.path.relpath(out_path, ROOT)}: {len(pcm)} campioni, {lufs_integrated(f):.2f} LUFS, "
          f"picco campione {lin2db(np.max(np.abs(f))):.2f} dBFS")
    if missing:
        print(f"ATTENZIONE: {len(missing)} file mancanti nel piano (mix parziale).")


if __name__ == "__main__":
    main()
