import { insideRings, type Point } from "../shared/geometry.js";
import "../shared/ipc.js";
import { createHud } from "./rings.js";

const RING_CENTER: Point = { x: 170, y: 150 }; // matches canvas placement in hud.css
const REPLY_VISIBLE_MS = 5000;

function byId<T extends HTMLElement>(id: string): T {
  const el = document.getElementById(id);
  if (!el) throw new Error(`missing element #${id}`);
  return el as T;
}

const canvas = byId<HTMLCanvasElement>("rings");
const replyEl = byId<HTMLParagraphElement>("reply");
const form = byId<HTMLFormElement>("ask");
const input = byId<HTMLInputElement>("text");

const media = window.matchMedia("(prefers-reduced-motion: reduce)");
const rings = createHud(canvas, { reducedMotion: media.matches });
media.addEventListener("change", () => rings.setReducedMotion(media.matches));
rings.start();

// ---- click-through: only the rings and the open input take the mouse ----

let interactive = false;
let dragging = false;

function setInteractive(on: boolean): void {
  if (on === interactive) return;
  interactive = on;
  window.hud.setInteractive(on);
}

function overInput(target: EventTarget | null): boolean {
  return !form.hidden && target instanceof Node && form.contains(target);
}

document.addEventListener("pointermove", (e) => {
  if (dragging) return;
  setInteractive(insideRings({ x: e.clientX, y: e.clientY }, RING_CENTER) || overInput(e.target));
});
document.addEventListener("pointerleave", () => {
  if (!dragging) setInteractive(false);
});

// ---- drag the window by the rings ----

let dragStart: Point | null = null;

canvas.addEventListener("pointerdown", (e) => {
  if (!insideRings({ x: e.clientX, y: e.clientY }, RING_CENTER)) return;
  dragging = true;
  dragStart = { x: e.screenX, y: e.screenY };
  canvas.setPointerCapture(e.pointerId);
  window.hud.dragStart();
});
canvas.addEventListener("pointermove", (e) => {
  if (!dragging || !dragStart) return;
  window.hud.dragMove(e.screenX - dragStart.x, e.screenY - dragStart.y);
});
function endDrag(): void {
  if (!dragging) return;
  dragging = false;
  dragStart = null;
  window.hud.dragEnd();
}
canvas.addEventListener("pointerup", endDrag);
canvas.addEventListener("pointercancel", endDrag);

// ---- text input ----

function openInput(): void {
  form.hidden = false;
  input.focus();
}

function closeInput(): void {
  if (form.hidden) return;
  form.hidden = true;
  input.value = "";
  window.hud.inputClosed();
}

window.hud.onToggleInput(() => (form.hidden ? openInput() : closeInput()));

document.addEventListener("keydown", (e) => {
  if (e.key === "Escape") closeInput();
});

// ---- placeholder reply (replaced by the real agent in stage 2) ----

const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

let replyTimer: ReturnType<typeof setTimeout> | undefined;

function showReply(text: string): void {
  replyEl.textContent = text;
  replyEl.classList.add("show");
  clearTimeout(replyTimer);
  replyTimer = setTimeout(() => replyEl.classList.remove("show"), REPLY_VISIBLE_MS);
}

async function fakeTurn(): Promise<void> {
  rings.setState("thinking");
  await sleep(1200);
  rings.setState("speaking");
  showReply("No agent connected yet. Stage 2 will answer this.");
  const t0 = performance.now();
  while (performance.now() - t0 < 1800) {
    const t = (performance.now() - t0) / 1000;
    const word = Math.max(0, Math.sin(t * 5)) ** 0.5;
    rings.setAmplitude(word * (0.4 + 0.6 * Math.random()));
    await sleep(50);
  }
  rings.setAmplitude(0);
  rings.setState("idle");
}

let busy = false;

form.addEventListener("submit", async (e) => {
  e.preventDefault();
  const text = input.value.trim();
  if (!text || busy) return;
  window.hud.submit(text);
  closeInput();
  busy = true;
  try {
    await fakeTurn();
  } finally {
    busy = false;
  }
});
