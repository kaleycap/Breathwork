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
- Spoken guidance using the device's built-in voice, or tones, or silent
- Session lengths from 1 to 60 minutes, or open-ended, with cycle and time counters
- Pause/resume (also with the space bar), plus light and dark mode
- Keeps the screen on during a session, where the browser supports it

## Files

- `index.html`: page layout
- `style.css`: styles
- `app.js`: breathing patterns and timer logic. Add a pattern by adding an entry to `PATTERNS`.
