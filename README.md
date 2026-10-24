# Breathwork

A simple guided-breathing web app. No build step and no dependencies.

## Run it

Open `index.html` in a browser, or serve the folder:

```sh
python3 -m http.server 8000
# then visit http://localhost:8000
```

## Features

- Animated circle that grows on the inhale and shrinks on the exhale
- Patterns: box (4-4-4-4), 4-7-8, 3-10-6, coherent (5.5-5.5), physiological sigh, and custom
- Custom timings are remembered in the browser between visits
- Adjustable seconds for each step (breathe in, hold, breathe out) on every pattern; set a step to 0 to skip it
- Session length (1, 3, 5 or 10 minutes, or open-ended), with cycle and time counters
- Optional soft tones at each phase change
- Pause/resume (also with the space bar), plus light and dark mode

## Files

- `index.html`: page layout
- `style.css`: styles
- `app.js`: breathing patterns and timer logic. Add a pattern by adding an entry to `PATTERNS`.
