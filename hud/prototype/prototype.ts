// Demo page for the ring renderer: a state switcher and an amplitude slider.
import { createHud, STATE_NAMES, type StateName } from "../renderer/rings.js";

function byId<T extends HTMLElement>(id: string): T {
  const el = document.getElementById(id);
  if (!el) throw new Error(`missing element #${id}`);
  return el as T;
}

const canvas = byId<HTMLCanvasElement>("hud");
const statesEl = byId<HTMLDivElement>("states");
const amp = byId<HTMLInputElement>("amp");
const ampOut = byId<HTMLOutputElement>("ampOut");
const sim = byId<HTMLInputElement>("sim");
const reduce = byId<HTMLInputElement>("reduce");

const media = window.matchMedia("(prefers-reduced-motion: reduce)");
reduce.checked = media.matches;

const buttons = new Map<StateName, HTMLButtonElement>();
const hud = createHud(canvas, {
  reducedMotion: media.matches,
  onStateChange: (name) => {
    for (const [n, b] of buttons) b.setAttribute("aria-pressed", String(n === name));
  },
});

STATE_NAMES.forEach((name, i) => {
  const b = document.createElement("button");
  b.textContent = `${i + 1} ${name}`;
  b.addEventListener("click", () => hud.setState(name));
  statesEl.appendChild(b);
  buttons.set(name, b);
});

function setAmp(v: number): void {
  amp.value = v.toFixed(2);
  ampOut.textContent = v.toFixed(2);
  hud.setAmplitude(v);
}

amp.addEventListener("input", () => setAmp(Number(amp.value)));
reduce.addEventListener("change", () => hud.setReducedMotion(reduce.checked));

window.addEventListener("keydown", (e) => {
  const name = STATE_NAMES[Number(e.key) - 1];
  if (name) hud.setState(name);
});

// Fake speech-like amplitude: bursts of syllables with pauses between words.
let t = 0;
setInterval(() => {
  const s = hud.getState();
  if (!sim.checked || (s !== "listening" && s !== "speaking")) return;
  t += 0.05;
  const word = Math.max(0, Math.sin(t * 1.3)) ** 0.5;
  const syllable = 0.5 + 0.5 * Math.sin(t * 13);
  setAmp(word * (0.35 + 0.65 * syllable) * (0.8 + 0.2 * Math.random()));
}, 50);

// Outside those states the slider decays to silence.
setInterval(() => {
  const s = hud.getState();
  if (sim.checked && s !== "listening" && s !== "speaking" && Number(amp.value) > 0) {
    setAmp(Math.max(0, Number(amp.value) - 0.1));
  }
}, 100);

hud.setState("idle");
hud.start();
