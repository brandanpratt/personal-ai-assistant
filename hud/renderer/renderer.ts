import { insideRings, type Point } from "../shared/geometry.js";
import "../shared/ipc.js";
import { replyVisibleMs, speakMs } from "../shared/text.js";
import type { HudEvent } from "../shared/ipc.js";
import { createHud } from "./rings.js";

const RING_CENTER: Point = { x: 170, y: 150 }; // matches canvas placement in hud.css

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

// The input box and a visible reply card take the mouse (the card scrolls); the rest stays click-through.
function overUi(target: EventTarget | null): boolean {
  if (!(target instanceof Node)) return false;
  return (!form.hidden && form.contains(target)) || (replyEl.classList.contains("show") && replyEl.contains(target));
}

document.addEventListener("pointermove", (e) => {
  if (dragging) return;
  setInteractive(insideRings({ x: e.clientX, y: e.clientY }, RING_CENTER) || overUi(e.target));
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

// ---- reply card ----

let replyTimer: ReturnType<typeof setTimeout> | undefined;

function showReply(text: string, kind: "reply" | "prompt" | "error", autoHideMs?: number): void {
  replyEl.textContent = text;
  replyEl.className = `show ${kind}`;
  replyEl.scrollTop = 0;
  clearTimeout(replyTimer);
  if (autoHideMs) replyTimer = setTimeout(hideReply, autoHideMs);
}

function hideReply(): void {
  clearTimeout(replyTimer);
  replyEl.classList.remove("show");
  setInteractive(false); // re-evaluated on the next pointer move
}

// ---- text input ----

// While the agent waits on the human, the input answers that prompt instead of starting a turn.
let activePrompt: { id: number; kind: "confirm" | "ask" } | null = null;
let busy = false; // a turn is running

function refreshPlaceholder(): void {
  input.placeholder = activePrompt
    ? activePrompt.kind === "confirm"
      ? 'Type "yes" to approve, anything else cancels'
      : "Type your answer"
    : busy
      ? "Working… (you can type your next message)"
      : "Ask the assistant…";
}

function openInput(): void {
  form.hidden = false;
  refreshPlaceholder();
  input.focus();
}

function closeInput(): void {
  if (form.hidden) return;
  form.hidden = true;
  input.value = "";
  window.hud.inputClosed();
}

// Esc or the hotkey while a prompt is open cancels it: that counts as "no".
function cancelPrompt(): void {
  if (!activePrompt) return;
  window.hud.answerPrompt(activePrompt.id, null);
  activePrompt = null;
  showReply("Cancelled.", "reply", 3000);
  rings.setState("thinking");
}

window.hud.onOpenInput(openInput);

window.hud.onToggleInput(() => {
  if (!form.hidden) {
    cancelPrompt();
    closeInput();
  } else {
    openInput();
  }
});

document.addEventListener("keydown", (e) => {
  if (e.key !== "Escape") return;
  if (!form.hidden) {
    cancelPrompt();
    closeInput();
  } else {
    hideReply();
  }
});

form.addEventListener("submit", (e) => {
  e.preventDefault();
  const text = input.value.trim();
  if (!text) return;
  // The box stays open after sending, like a chat input: Esc or the hotkey closes it.
  if (activePrompt) {
    window.hud.answerPrompt(activePrompt.id, text);
    activePrompt = null;
    hideReply();
    rings.setState("thinking");
    input.value = "";
    refreshPlaceholder();
    return;
  }
  if (busy) return; // keep the text; send it once the current turn finishes
  busy = true;
  hideReply();
  window.hud.submit(text);
  input.value = "";
  refreshPlaceholder();
});

// ---- agent events ----

let speakToken = 0;

async function speak(text: string): Promise<void> {
  const token = ++speakToken;
  rings.setState("speaking");
  const ms = speakMs(text);
  const t0 = performance.now();
  while (token === speakToken && performance.now() - t0 < ms) {
    // No audio yet: a speech-like rhythm stands in for the reply's amplitude.
    const t = (performance.now() - t0) / 1000;
    rings.setAmplitude(Math.max(0, Math.sin(t * 5)) ** 0.5 * (0.4 + 0.6 * Math.random()));
    await new Promise((r) => setTimeout(r, 50));
  }
  if (token !== speakToken) return; // a newer event took over
  rings.setAmplitude(0);
  rings.setState("idle");
}

window.hud.onEvent((event: HudEvent) => {
  switch (event.type) {
    case "thinking":
      speakToken++;
      rings.setAmplitude(0);
      rings.setState("thinking");
      break;
    case "tool":
      // A short pulse in the core for each tool call.
      rings.setAmplitude(0.8);
      setTimeout(() => rings.setAmplitude(0), 160);
      break;
    case "reply":
      busy = false;
      refreshPlaceholder();
      showReply(event.text, "reply", replyVisibleMs(event.text));
      void speak(event.text);
      break;
    case "prompt":
      speakToken++;
      rings.setAmplitude(0);
      activePrompt = { id: event.id, kind: event.kind };
      rings.setState("confirm");
      showReply(event.question, "prompt");
      openInput();
      break;
    case "error":
      busy = false;
      refreshPlaceholder();
      speakToken++;
      rings.setAmplitude(0);
      rings.setState("error");
      showReply(event.message, "error", replyVisibleMs(event.message));
      break;
  }
});
