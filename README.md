# Breathwork

A simple guided-breathing web app. No build step and no dependencies.

## Run it

Open `index.html` in a browser, or serve the folder:

```sh
python3 -m http.server 8000
# then visit http://localhost:8000
```

## Install on iPhone

1. Open the site in Safari.
2. Tap **Share**, then **Add to Home Screen**.

It then opens full screen from its own icon. Custom timings are saved separately on each phone.

## Features

- Animated circle that grows on the inhale and shrinks to a dot on the exhale
- Patterns: box (4-4-4-4), 4-7-8, 3-10-6, coherent (5.5-5.5), physiological sigh, and custom
- Adjustable seconds for each step (breathe in, hold, breathe out) on every pattern; set a step to 0 to skip it
- Custom timings are remembered in the browser between visits
- 5-second "Get ready" countdown before each session
- Optional short pause between steps (0.5 seconds by default)
- Voice guidance that names each step and counts down every second, so you can follow with your eyes closed; or tones, or silent
- Session lengths from 1 to 60 minutes, or open-ended, with cycle and time counters
- Pause/resume (also with the space bar), plus light and dark mode
- Keeps the screen on during a session, where the browser supports it

## Files

- `index.html`: page layout
- `style.css`: styles
- `app.js`: breathing patterns and timer logic. Add a pattern by adding an entry to `PATTERNS`.
- `voice/`: recorded voice clips, one per phrase and number (1–30)
- `recordings/`: the ElevenLabs recordings the voice clips are cut from
- `tools/split_recordings.py`: cuts `recordings/` into the voice clips
- `tools/make_voice.py`: alternative: generates the voice clips with Piper

## Voice

Voice by [ElevenLabs](https://elevenlabs.io): the "Nathaniel – Engaging, British and Calm" voice.
The source recordings are in `recordings/` (three takes of 12, 12 and 13 phrases separated by
pauses), cut into the clips in `voice/` with:

```sh
python3 tools/split_recordings.py   # needs ffmpeg
```

To change a phrase, regenerate that part in ElevenLabs with the same text and voice, replace the
matching `recordings/partN.mp3`, and run the script again.

`tools/make_voice.py` can instead generate the clips offline with a [Piper](https://github.com/rhasspy/piper)
voice: `python3 tools/make_voice.py path/to/voice.onnx 1.15` (the number is pace; higher is slower).
