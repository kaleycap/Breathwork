// Each pattern is a list of phases. `size` is the circle scale at the end of the phase.
const MIN_SIZE = 0.4;
const MAX_SIZE = 1;

const PATTERNS = {
  box: {
    name: "Box breathing (4-4-4-4)",
    description: "Equal inhale, hold, exhale, hold. Steadying and focusing.",
    phases: [
      { label: "Breathe in", seconds: 4, size: MAX_SIZE },
      { label: "Hold", seconds: 4, size: MAX_SIZE },
      { label: "Breathe out", seconds: 4, size: MIN_SIZE },
      { label: "Hold", seconds: 4, size: MIN_SIZE },
    ],
  },
  relax: {
    name: "4-7-8 relaxing breath",
    description: "Long hold and slow exhale. Often used to wind down before sleep.",
    phases: [
      { label: "Breathe in", seconds: 4, size: MAX_SIZE },
      { label: "Hold", seconds: 7, size: MAX_SIZE },
      { label: "Breathe out", seconds: 8, size: MIN_SIZE },
    ],
  },
  coherent: {
    name: "Coherent breathing (5.5-5.5)",
    description: "About 5.5 breaths per minute, no holds. Calm and balanced.",
    phases: [
      { label: "Breathe in", seconds: 5.5, size: MAX_SIZE },
      { label: "Breathe out", seconds: 5.5, size: MIN_SIZE },
    ],
  },
  sigh: {
    name: "Physiological sigh",
    description: "Two inhales through the nose, then a long exhale through the mouth.",
    phases: [
      { label: "Breathe in", seconds: 2, size: 0.85 },
      { label: "Sip in more", seconds: 1, size: MAX_SIZE },
      { label: "Long breath out", seconds: 6, size: MIN_SIZE },
    ],
  },
  custom: {
    name: "Custom",
    description: "Start from an even 4-4-4-4 and build your own rhythm.",
    phases: [
      { label: "Breathe in", seconds: 4, size: MAX_SIZE },
      { label: "Hold", seconds: 4, size: MAX_SIZE },
      { label: "Breathe out", seconds: 4, size: MIN_SIZE },
      { label: "Hold", seconds: 4, size: MIN_SIZE },
    ],
  },
};

// Remember each pattern's original timings so they can be restored after editing.
const DEFAULT_SECONDS = Object.fromEntries(
  Object.entries(PATTERNS).map(([key, pattern]) => [key, pattern.phases.map((p) => p.seconds)])
);

const $ = (id) => document.getElementById(id);
const circle = $("circle");
const phaseEl = $("phase");
const countEl = $("count");
const cyclesEl = $("cycles");
const elapsedEl = $("elapsed");
const patternSelect = $("pattern");
const durationSelect = $("duration");
const soundToggle = $("sound");
const startBtn = $("start");
const resetBtn = $("reset");
const timingsEl = $("timings");
const restoreBtn = $("restore");

const state = {
  running: false,
  phaseIndex: 0,
  phaseStart: 0,   // performance.now() when the current phase began
  elapsed: 0,      // ms of active breathing, excluding pauses
  lastTick: 0,
  cycles: 0,
  size: MIN_SIZE,  // circle scale at the start of the current phase
  frame: null,
};

let audioCtx = null;

function beep(frequency) {
  if (!soundToggle.checked) return;
  audioCtx ??= new AudioContext();
  const osc = audioCtx.createOscillator();
  const gain = audioCtx.createGain();
  const now = audioCtx.currentTime;
  osc.frequency.value = frequency;
  gain.gain.setValueAtTime(0.0001, now);
  gain.gain.exponentialRampToValueAtTime(0.15, now + 0.02);
  gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.4);
  osc.connect(gain).connect(audioCtx.destination);
  osc.start(now);
  osc.stop(now + 0.45);
}

function activePhases() {
  return PATTERNS[patternSelect.value].phases.filter((p) => p.seconds > 0);
}

function formatTime(ms) {
  const total = Math.floor(ms / 1000);
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, "0")}`;
}

function setCircle(scale) {
  circle.style.transform = `scale(${scale})`;
}

// Ease in and out so the circle's motion feels like a natural breath.
function ease(t) {
  return 0.5 - Math.cos(Math.PI * t) / 2;
}

function enterPhase(index, now) {
  const phases = activePhases();
  state.phaseIndex = index;
  state.phaseStart = now;
  const phase = phases[index];
  phaseEl.textContent = phase.label;
  // Higher tone for inhaling, lower for exhaling, middle for holds.
  const tone = phase.size > state.size ? 528 : phase.size < state.size ? 330 : 440;
  beep(tone);
}

function tick(now) {
  if (!state.running) return;
  const phases = activePhases();
  const phase = phases[state.phaseIndex];

  state.elapsed += now - state.lastTick;
  state.lastTick = now;

  const progress = Math.min((now - state.phaseStart) / (phase.seconds * 1000), 1);
  setCircle(state.size + (phase.size - state.size) * ease(progress));
  countEl.textContent = Math.max(1, Math.ceil(phase.seconds * (1 - progress)));
  elapsedEl.textContent = formatTime(state.elapsed);

  if (progress >= 1) {
    state.size = phase.size;
    let next = state.phaseIndex + 1;
    if (next >= phases.length) {
      next = 0;
      state.cycles += 1;
      cyclesEl.textContent = state.cycles;

      const limit = Number(durationSelect.value) * 1000;
      if (limit && state.elapsed >= limit) {
        finish();
        return;
      }
    }
    enterPhase(next, now);
  }

  state.frame = requestAnimationFrame(tick);
}

function start() {
  if (!activePhases().length) {
    phaseEl.textContent = "Set a timing";
    return;
  }
  audioCtx?.resume();
  const now = performance.now();
  state.running = true;
  state.lastTick = now;
  if (state.phaseStart === 0) {
    enterPhase(0, now);
  } else {
    // Resuming: shift the phase start forward by however long we were paused.
    state.phaseStart = now - state.pausedAt;
    phaseEl.textContent = activePhases()[state.phaseIndex].label;
  }
  startBtn.textContent = "Pause";
  setControlsDisabled(true);
  state.frame = requestAnimationFrame(tick);
}

function pause() {
  state.running = false;
  state.pausedAt = performance.now() - state.phaseStart;
  cancelAnimationFrame(state.frame);
  phaseEl.textContent = "Paused";
  startBtn.textContent = "Resume";
}

function finish() {
  reset();
  phaseEl.textContent = "Well done";
  beep(660);
}

function reset() {
  state.running = false;
  cancelAnimationFrame(state.frame);
  Object.assign(state, { phaseIndex: 0, phaseStart: 0, elapsed: 0, cycles: 0, size: MIN_SIZE });
  setCircle(MIN_SIZE);
  phaseEl.textContent = "Ready";
  countEl.textContent = "";
  cyclesEl.textContent = "0";
  elapsedEl.textContent = "0:00";
  startBtn.textContent = "Start";
  setControlsDisabled(false);
}

// Changing pattern mid-session would desync the phases, so lock it while running.
function setControlsDisabled(disabled) {
  patternSelect.disabled = disabled;
  restoreBtn.disabled = disabled;
  timingsEl.querySelectorAll("input").forEach((input) => (input.disabled = disabled));
}

function showPattern() {
  const pattern = PATTERNS[patternSelect.value];
  $("description").textContent = pattern.description;
  timingsEl.replaceChildren(
    ...pattern.phases.map((phase, index) => {
      const label = document.createElement("label");
      const input = document.createElement("input");
      Object.assign(input, { type: "number", min: 0, max: 30, step: 0.5, value: phase.seconds });
      input.dataset.phase = index;
      label.append(phase.label, input);
      return label;
    })
  );
}

for (const [key, pattern] of Object.entries(PATTERNS)) {
  patternSelect.add(new Option(pattern.name, key));
}

// Setting a step to 0 skips it, e.g. to drop the holds from box breathing.
timingsEl.addEventListener("input", (event) => {
  const index = Number(event.target.dataset.phase);
  const seconds = Math.min(30, Math.max(0, Number(event.target.value) || 0));
  PATTERNS[patternSelect.value].phases[index].seconds = seconds;
});

restoreBtn.addEventListener("click", () => {
  const key = patternSelect.value;
  PATTERNS[key].phases.forEach((phase, i) => (phase.seconds = DEFAULT_SECONDS[key][i]));
  showPattern();
});

patternSelect.addEventListener("change", () => {
  reset();
  showPattern();
});
startBtn.addEventListener("click", () => (state.running ? pause() : start()));
resetBtn.addEventListener("click", reset);
document.addEventListener("keydown", (event) => {
  if (event.code === "Space" && event.target === document.body) {
    event.preventDefault();
    startBtn.click();
  }
});

showPattern();
