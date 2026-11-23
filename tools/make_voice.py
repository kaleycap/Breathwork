"""Regenerate the voice clips in voice/ from a Piper voice model.

Usage: python3 tools/make_voice.py path/to/voice.onnx [pace]

pace stretches the speech: 1 is the voice's normal speed, higher is slower.

Needs `pip install piper-tts` and ffmpeg. Voices are listed at
https://huggingface.co/rhasspy/piper-voices
"""

import subprocess
import sys
import tempfile
import wave
from pathlib import Path

from piper import PiperVoice, SynthesisConfig

PHRASES = ["Get ready", "Breathe in", "Hold", "Breathe out", "Sip in more", "Long breath out", "Well done"]
NUMBERS = ["one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten",
           "eleven", "twelve", "thirteen", "fourteen", "fifteen", "sixteen", "seventeen",
           "eighteen", "nineteen", "twenty", "twenty-one", "twenty-two", "twenty-three",
           "twenty-four", "twenty-five", "twenty-six", "twenty-seven", "twenty-eight",
           "twenty-nine", "thirty"]

# Trim silence from both ends, with a short fade so clips don't click.
TRIM = ("silenceremove=start_periods=1:start_threshold=-55dB,areverse,"
        "silenceremove=start_periods=1:start_threshold=-55dB,afade=t=in:d=0.03,"
        "areverse,afade=t=in:d=0.005")

# Each count is spoken once a second, so a number must finish within that.
MAX_NUMBER_SECONDS = 0.95


def probe(path, args, field):
    out = subprocess.run(["ffmpeg", "-i", str(path), *args, "-f", "null", "-"],
                         capture_output=True, text=True).stderr
    return float(out.split(field)[1].split()[0]) if field in out else None


def render(voice, text, mp3, pace):
    with tempfile.NamedTemporaryFile(suffix=".wav") as tmp:
        with wave.open(tmp.name, "wb") as w:
            voice.synthesize_wav(text, w, syn_config=SynthesisConfig(length_scale=pace))
        subprocess.run(["ffmpeg", "-v", "error", "-y", "-i", tmp.name, "-af", TRIM,
                        "-ac", "1", "-ar", "22050", "-b:a", "96k", str(mp3)], check=True)
    duration = float(subprocess.run(
        ["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", str(mp3)],
        capture_output=True, text=True).stdout)
    loudest = probe(mp3, ["-af", "volumedetect"], "max_volume:")
    return duration, loudest


def main(model, pace):
    voice = PiperVoice.load(model)
    out_dir = Path(__file__).resolve().parent.parent / "voice"
    clips = {p.lower().replace(" ", "-"): [p + "."] for p in PHRASES}
    # Some voices pad a sentence with noise; without the full stop is the fallback.
    clips.update({str(i + 1): [w.capitalize() + ".", w.capitalize()] for i, w in enumerate(NUMBERS)})

    for name, attempts in clips.items():
        mp3 = out_dir / f"{name}.mp3"
        for text in attempts:
            duration, loudest = render(voice, text, mp3, pace)
            too_long = name.isdigit() and duration > MAX_NUMBER_SECONDS
            if not too_long:
                break
        if loudest is None or loudest < -20:
            sys.exit(f"{mp3.name} came out silent ({loudest} dB)")
        flag = "  <- longer than a second" if too_long else ""
        print(f"{mp3.name:22} {duration:.2f}s  peak {loudest} dB{flag}")


if __name__ == "__main__":
    main(sys.argv[1], float(sys.argv[2]) if len(sys.argv) > 2 else 1.15)
