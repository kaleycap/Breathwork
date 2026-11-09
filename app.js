// Each pattern is a list of phases. `size` is the circle scale at the end of the phase.
const MIN_SIZE = 0.06; // shrinks to a small dot
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
  long: {
    name: "3-10-6 extended hold",
    description: "Short inhale, long hold, slow exhale. A deeper, more demanding rhythm.",
    phases: [
      { label: "Breathe in", seconds: 3, size: MAX_SIZE },
      { label: "Hold", seconds: 10, size: MAX_SIZE },
      { label: "Breathe out", seconds: 6, size: MIN_SIZE },
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

// Custom timings are saved in the browser so they're still there next visit.
// Storage can be unavailable (e.g. private browsing), so failures are ignored.
const CUSTOM_KEY = "breathwork.customSeconds";

function loadCustom() {
  try {
    const saved = JSON.parse(localStorage.getItem(CUSTOM_KEY));
    if (!Array.isArray(saved)) return;
    PATTERNS.custom.phases.forEach((phase, i) => {
      const seconds = Number(saved[i]);
      if (Number.isFinite(seconds)) phase.seconds = Math.min(30, Math.max(0, seconds));
    });
  } catch {}
}

function saveCustom() {
  try {
    localStorage.setItem(CUSTOM_KEY, JSON.stringify(PATTERNS.custom.phases.map((p) => p.seconds)));
  } catch {}
}

const COUNTDOWN_SECONDS = 5;

const $ = (id) => document.getElementById(id);
const circle = $("circle");
const phaseEl = $("phase");
const countEl = $("count");
const cyclesEl = $("cycles");
const elapsedEl = $("elapsed");
const patternSelect = $("pattern");
const durationSelect = $("duration");
const gapSelect = $("gap");
const cuesSelect = $("cues");
const startBtn = $("start");
const resetBtn = $("reset");
const timingsEl = $("timings");
const restoreBtn = $("restore");

// A session is a sequence of steps: a get-ready countdown, then each breathing
// phase, with an optional short pause ("gap") after each one.
const state = {
  running: false,
  step: null,      // { kind: "countdown" | "phase" | "gap", seconds, label, index, from, to }
  stepStart: 0,    // performance.now() when the current step began
  pausedAt: 0,     // ms into the current step when paused
  elapsed: 0,      // ms of breathing, excluding the countdown and pauses
  lastTick: 0,
  lastCount: null, // last countdown number shown, so each one is announced once
  cycles: 0,
  size: MIN_SIZE,  // circle scale at the start of the current phase
  frame: null,
};

// --- Sound -----------------------------------------------------------------

let audioCtx = null;

// iPhones only allow sound that was set up during a tap, and mute web audio
// when the silent switch is on unless the page asks to play like a media app.
// Call this from the Start button's click.
function unlockAudio() {
  try {
    if (navigator.audioSession) navigator.audioSession.type = "playback";
  } catch {}
  try {
    audioCtx ??= new (window.AudioContext || window.webkitAudioContext)();
    audioCtx.resume();
    const source = audioCtx.createBufferSource();
    source.buffer = audioCtx.createBuffer(1, 1, 22050);
    source.connect(audioCtx.destination);
    source.start(0);
  } catch {}
}

function beep(frequency, duration = 0.5) {
  if (cuesSelect.value !== "tones" || !audioCtx) return;
  const osc = audioCtx.createOscillator();
  const gain = audioCtx.createGain();
  const now = audioCtx.currentTime;
  osc.type = "triangle";
  osc.frequency.value = frequency;
  gain.gain.setValueAtTime(0.0001, now);
  gain.gain.exponentialRampToValueAtTime(0.5, now + 0.02);
  gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);
  osc.connect(gain).connect(audioCtx.destination);
  osc.start(now);
  osc.stop(now + duration + 0.05);
}

// Spoken guidance uses the device's built-in text-to-speech voice.
function say(text) {
  if (cuesSelect.value !== "voice" || !window.speechSynthesis) return;
  speechSynthesis.cancel();
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.rate = 0.9;
  speechSynthesis.speak(utterance);
}

function stopSpeaking() {
  window.speechSynthesis?.cancel();
}

// Higher tone for inhaling, lower for exhaling, middle for holds.
function cuePhase(step) {
  say(step.label);
  beep(step.to > step.from ? 784 : step.to < step.from ? 523 : 659);
}

// --- Screen wake lock ------------------------------------------------------

// Keep the phone screen on during a session. Not every browser supports this,
// and the browser drops the lock whenever the page is hidden.
let wakeLock = null;

async function keepAwake() {
  try {
    wakeLock = await navigator.wakeLock?.request("screen");
    if (!state.running) allowSleep(); // paused while the request was pending
  } catch {}
}

function allowSleep() {
  wakeLock?.release().catch(() => {});
  wakeLock = null;
}

document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "visible" && state.running) {
    keepAwake();
    audioCtx?.resume();
  }
});

// --- Session ---------------------------------------------------------------

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

function beginStep(step, now) {
  state.step = step;
  state.stepStart = now;
  phaseEl.textContent = step.label;
}

function startCountdown(now) {
  beginStep({ kind: "countdown", seconds: COUNTDOWN_SECONDS, label: "Get ready" }, now);
  state.lastCount = null;
  say("Get ready");
}

function enterPhase(index, now) {
  const phase = activePhases()[index];
  const step = { kind: "phase", seconds: phase.seconds, label: phase.label, index, from: state.size, to: phase.size };
  beginStep(step, now);
  cuePhase(step);
}

// The gap keeps the finished step's label and holds the circle still.
function enterGap(index, now) {
  beginStep({ kind: "gap", seconds: Number(gapSelect.value), label: state.step.label, index }, now);
}

// Move on to whatever follows the step that just ended.
function advance(now) {
  const step = state.step;
  const phases = activePhases();

  if (step.kind === "countdown") return enterPhase(0, now);
  if (step.kind === "gap") return enterPhase((step.index + 1) % phases.length, now);

  state.size = step.to;
  if (step.index === phases.length - 1) {
    state.cycles += 1;
    cyclesEl.textContent = state.cycles;
    const limit = Number(durationSelect.value) * 1000;
    if (limit && state.elapsed >= limit) return finish();
  }
  if (Number(gapSelect.value) > 0) return enterGap(step.index, now);
  enterPhase((step.index + 1) % phases.length, now);
}

function tick(now) {
  if (!state.running) return;
  const step = state.step;
  const dt = now - state.lastTick;
  state.lastTick = now;

  const progress = Math.min((now - state.stepStart) / (step.seconds * 1000), 1);
  const remaining = Math.max(1, Math.ceil(step.seconds * (1 - progress)));

  if (step.kind === "countdown") {
    countEl.textContent = remaining;
    if (remaining !== state.lastCount) {
      state.lastCount = remaining;
      if (remaining <= 3) {
        say(String(remaining));
        beep(880, 0.15);
      }
    }
  } else {
    state.elapsed += dt;
    elapsedEl.textContent = formatTime(state.elapsed);
  }

  if (step.kind === "phase") {
    setCircle(step.from + (step.to - step.from) * ease(progress));
    countEl.textContent = remaining;
  } else if (step.kind === "gap") {
    countEl.textContent = "";
  }

  if (progress >= 1) advance(now);
  if (state.running) state.frame = requestAnimationFrame(tick);
}

function start() {
  if (!activePhases().length) {
    phaseEl.textContent = "Set a timing";
    return;
  }
  unlockAudio();
  const now = performance.now();
  state.running = true;
  state.lastTick = now;
  if (!state.step) {
    startCountdown(now);
    // Start sits below the settings, so bring the circle back into view.
    document.querySelector(".stage").scrollIntoView({ behavior: "smooth", block: "start" });
  } else {
    // Resuming: shift the step start forward by however long we were paused.
    state.stepStart = now - state.pausedAt;
    phaseEl.textContent = state.step.label;
  }
  startBtn.textContent = "Pause";
  keepAwake();
  setControlsDisabled(true);
  state.frame = requestAnimationFrame(tick);
}

function pause() {
  state.running = false;
  state.pausedAt = performance.now() - state.stepStart;
  cancelAnimationFrame(state.frame);
  stopSpeaking();
  phaseEl.textContent = "Paused";
  startBtn.textContent = "Resume";
  allowSleep();
}

function finish() {
  reset();
  phaseEl.textContent = "Well done";
  say("Well done");
  beep(1047, 0.8);
}

function reset() {
  allowSleep();
  stopSpeaking();
  state.running = false;
  cancelAnimationFrame(state.frame);
  Object.assign(state, { step: null, stepStart: 0, pausedAt: 0, elapsed: 0, cycles: 0, size: MIN_SIZE });
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
  if (patternSelect.value === "custom") saveCustom();
});

restoreBtn.addEventListener("click", () => {
  const key = patternSelect.value;
  PATTERNS[key].phases.forEach((phase, i) => (phase.seconds = DEFAULT_SECONDS[key][i]));
  if (key === "custom") saveCustom();
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

loadCustom();
showPattern();
