"""Cut the voice clips in voice/ out of recordings/part1-3.mp3.

Usage: python3 tools/split_recordings.py

Each part is one ElevenLabs recording of several phrases separated by
pauses, in the order of NAMES below (12, 12 and 13 phrases). Needs ffmpeg.
"""

import math
import struct
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
NAMES = (["get-ready", "breathe-in", "hold", "breathe-out", "sip-in-more", "long-breath-out", "well-done"]
         + [str(n) for n in range(1, 31)])

# Gentle compression evens out loud and soft parts so the voice carries on a
# phone speaker; each clip's peak is then set to about -1 dB.
COMPRESS = "acompressor=threshold=-24dB:ratio=3:attack=5:release=80:makeup=1"


def segments(path):
    """Speech segments as (start, end) seconds: 10 ms windows louder than
    -50 dB, with gaps shorter than 0.3 s treated as part of the same phrase."""
    raw = subprocess.run(["ffmpeg", "-v", "error", "-i", str(path), "-ac", "1", "-ar", "8000",
                          "-f", "f32le", "-"], capture_output=True, check=True).stdout
    samples = struct.unpack(f"{len(raw) // 4}f", raw)
    window = 80
    loud = []
    for k in range(0, len(samples) - window, window):
        rms = math.sqrt(sum(v * v for v in samples[k:k + window]) / window) + 1e-9
        loud.append(20 * math.log10(rms) > -50)
    found, start, last = [], None, None
    for i, on in enumerate(loud):
        if not on:
            continue
        if start is None:
            start = i
        elif i - last > 30:
            found.append((start, last))
            start = i
        last = i
    if start is not None:
        found.append((start, last))
    return [(a / 100, (b + 1) / 100) for a, b in found]


def peak(path):
    out = subprocess.run(["ffmpeg", "-i", str(path), "-af", "volumedetect", "-f", "null", "-"],
                         capture_output=True, text=True).stderr
    return float(out.split("max_volume:")[1].split()[0])


def cut(source, start, duration, gain, dest):
    fades = f"afade=t=in:d=0.01,afade=t=out:st={duration - 0.03:.3f}:d=0.03"
    subprocess.run(["ffmpeg", "-v", "error", "-y", "-ss", f"{start:.3f}", "-t", f"{duration:.3f}",
                    "-i", str(source), "-af", f"{COMPRESS},volume={gain:.2f}dB,{fades}",
                    "-ac", "1", "-ar", "44100", "-b:a", "96k", str(dest)], check=True)


def main():
    pieces = []
    for part in (1, 2, 3):
        source = ROOT / "recordings" / f"part{part}.mp3"
        found = segments(source)
        print(f"{source.name}: {len(found)} phrases")
        pieces += [(source, a, b) for a, b in found]
    if len(pieces) != len(NAMES):
        sys.exit(f"Found {len(pieces)} phrases, expected {len(NAMES)}; check the pauses in the recordings")

    for name, (source, a, b) in zip(NAMES, pieces):
        start = max(0, a - 0.03)       # keep a little either side so soft sounds aren't clipped
        duration = b + 0.06 - start
        dest = ROOT / "voice" / f"{name}.mp3"
        gain = 0.0
        for _ in range(3):             # compression shifts the peak, so measure and correct
            cut(source, start, duration, gain, dest)
            level = peak(dest)
            if abs(level + 1) < 0.3:
                break
            gain += -1 - level
        print(f"{dest.name:20} {duration:.2f}s  peak {level} dB")


if __name__ == "__main__":
    main()
