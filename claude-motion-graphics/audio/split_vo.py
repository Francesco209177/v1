"""
Divide una ripresa unica della voce narrante (es. ElevenLabs, frasi separate da pause) in N clip, una per frase.

    python3 audio/split_vo.py <ripresa.mp3> <cartella_uscita> vo_01 vo_02 ... vo_NN

I tagli cadono al centro delle N-1 pause PIÙ LUNGHE (le pause brevi dentro una frase vengono ignorate).
Ogni clip è rifilata dai silenzi con un piccolo margine e salvata in WAV 48 kHz mono.
Stampa la durata di ogni clip, utile per pianificare i tempi nel video.
"""
from __future__ import annotations

import os
import re
import subprocess
import sys

SR = 48000


def silences(path: str, noise_db: float = -42.0, min_dur: float = 0.3) -> list[tuple[float, float]]:
    out = subprocess.run(
        ["ffmpeg", "-hide_banner", "-nostats", "-i", path, "-af", f"silencedetect=n={noise_db}dB:d={min_dur}", "-f", "null", "-"],
        capture_output=True, text=True,
    ).stderr
    starts = [float(x) for x in re.findall(r"silence_start: ([\d.]+)", out)]
    ends = [float(x) for x in re.findall(r"silence_end: ([\d.]+)", out)]
    return list(zip(starts, ends))


def duration(path: str) -> float:
    out = subprocess.run(["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "default=nw=1:nk=1", path], capture_output=True, text=True).stdout
    return float(out.strip())


def main() -> None:
    src, out_dir, names = sys.argv[1], sys.argv[2], sys.argv[3:]
    n = len(names)
    os.makedirs(out_dir, exist_ok=True)
    total = duration(src)
    gaps = silences(src)
    inner = [g for g in gaps if g[0] > 0.05 and g[1] < total - 0.05]
    if len(inner) < n - 1:
        sys.exit(f"Trovate solo {len(inner)} pause, servono {n - 1}: controlla la ripresa o abbassa min_dur.")
    cuts = sorted(sorted(inner, key=lambda g: g[1] - g[0], reverse=True)[: n - 1])
    bounds = [0.0] + [(a + b) / 2 for a, b in cuts] + [total]
    for i, name in enumerate(names):
        seg = os.path.join(out_dir, f"{name}.wav")
        a, b = bounds[i], bounds[i + 1]
        # rifila i silenzi ai bordi (con 40 ms di margine) e normalizza il formato
        subprocess.run(
            ["ffmpeg", "-hide_banner", "-loglevel", "error", "-y", "-ss", f"{a:.3f}", "-to", f"{b:.3f}", "-i", src,
             "-af", "silenceremove=start_periods=1:start_threshold=-45dB:start_silence=0.04,areverse,"
                    "silenceremove=start_periods=1:start_threshold=-45dB:start_silence=0.06,areverse",
             "-ar", str(SR), "-ac", "1", seg],
            check=True,
        )
        print(f"{name}: {duration(seg):5.2f} s   (da {a:6.2f} a {b:6.2f} nella ripresa)")


if __name__ == "__main__":
    main()
