// HUD ring renderer. No agent, no Electron. Driven by two inputs only:
//   setState(name)      one of STATE_NAMES
//   setAmplitude(0..1)  mic or reply level

const TAU = Math.PI * 2;

interface Look {
  rgb: readonly [number, number, number]; // glow color
  spin: number; // ring speed multiplier
  breath: number; // idle pulse size
  breathRate: number; // idle pulse speed (Hz)
  flicker: number; // core instability, 0..1
  ampGain: number; // how strongly amplitude drives the core and the outer bars
}

const LOOKS = {
  idle:      { rgb: [90, 200, 255],  spin: 0.35, breath: 0.06, breathRate: 0.35, flicker: 0,    ampGain: 0.2 },
  listening: { rgb: [110, 220, 255], spin: 0.6,  breath: 0.03, breathRate: 0.6,  flicker: 0,    ampGain: 1 },
  thinking:  { rgb: [70, 160, 255],  spin: 2.8,  breath: 0.04, breathRate: 1.4,  flicker: 0.35, ampGain: 0.2 },
  speaking:  { rgb: [120, 235, 255], spin: 0.8,  breath: 0.03, breathRate: 0.8,  flicker: 0,    ampGain: 1 },
  confirm:   { rgb: [255, 184, 64],  spin: 0.15, breath: 0.1,  breathRate: 1.1,  flicker: 0,    ampGain: 0.2 },
  error:     { rgb: [255, 80, 80],   spin: 0.2,  breath: 0.02, breathRate: 0.5,  flicker: 0.9,  ampGain: 0 },
} as const satisfies Record<string, Look>;

export type StateName = keyof typeof LOOKS;
export const STATE_NAMES = Object.keys(LOOKS) as StateName[];

const ERROR_HOLD_MS = 1400;
const BAR_COUNT = 72;
const TICK_COUNT = 90;

const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;
// Frame-rate independent smoothing: rate is "per second".
const ease = (rate: number, dt: number): number => 1 - Math.exp(-rate * dt);

// Cheap deterministic noise for per-bar variation.
function noise(i: number, t: number): number {
  return 0.5 + 0.5 * Math.sin(i * 12.9898 + t * 3.1) * Math.sin(i * 4.1414 + t * 1.7);
}

export interface HudOptions {
  reducedMotion?: boolean;
  onStateChange?: (name: StateName) => void;
}

export interface Hud {
  start(): void;
  stop(): void;
  setState(name: StateName): void;
  setAmplitude(v: number): void;
  setReducedMotion(v: boolean): void;
  getState(): StateName;
}

export function createHud(canvas: HTMLCanvasElement, options: HudOptions = {}): Hud {
  const opts = { reducedMotion: false, ...options };
  const maybeCtx = canvas.getContext("2d");
  if (!maybeCtx) throw new Error("2D canvas is not available");
  const ctx: CanvasRenderingContext2D = maybeCtx;

  let state: StateName = "idle";
  let target: Look = LOOKS.idle;
  let errorTimer: ReturnType<typeof setTimeout> | undefined;

  // Smoothed, currently-displayed values.
  const cur = { r: 90, g: 200, b: 255, spin: 0.35, breath: 0.06, breathRate: 0.35, flicker: 0, ampGain: 0.2 };
  let ampTarget = 0;
  let amp = 0;
  const phase = { a: 0, b: 0, c: 0, d: 0, breath: 0, time: 0 };

  let size = 0;
  let last = performance.now();
  let rafId = 0;

  function resize(): void {
    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    size = Math.min(rect.width, rect.height);
    canvas.width = Math.round(rect.width * dpr);
    canvas.height = Math.round(rect.height * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  function setState(name: StateName): void {
    clearTimeout(errorTimer);
    state = name;
    target = LOOKS[name];
    if (name === "error") errorTimer = setTimeout(() => setState("idle"), ERROR_HOLD_MS);
    opts.onStateChange?.(name);
  }

  function setAmplitude(v: number): void {
    ampTarget = Math.max(0, Math.min(1, v));
  }

  const rgba = (a: number): string => `rgba(${cur.r | 0},${cur.g | 0},${cur.b | 0},${a})`;

  function step(dt: number): void {
    const motion = opts.reducedMotion ? 0.25 : 1;
    const k = ease(5, dt);
    cur.r = lerp(cur.r, target.rgb[0], k);
    cur.g = lerp(cur.g, target.rgb[1], k);
    cur.b = lerp(cur.b, target.rgb[2], k);
    cur.spin = lerp(cur.spin, target.spin, k);
    cur.breath = lerp(cur.breath, target.breath, k);
    cur.breathRate = lerp(cur.breathRate, target.breathRate, k);
    cur.flicker = lerp(cur.flicker, target.flicker, k);
    cur.ampGain = lerp(cur.ampGain, target.ampGain, k);
    // Fast attack, slower release, so the rings feel like they have mass.
    amp = lerp(amp, ampTarget, ease(ampTarget > amp ? 22 : 7, dt));

    const s = cur.spin * motion;
    phase.a += dt * 0.5 * s;
    phase.b -= dt * 0.8 * s;
    phase.c += dt * 1.3 * s;
    phase.d += dt * 0.25 * s;
    phase.breath += dt * cur.breathRate * TAU * motion;
    phase.time += dt * motion;
  }

  function drawCore(c: CanvasRenderingContext2D, cx: number, cy: number, R: number): void {
    const breath = 1 + cur.breath * Math.sin(phase.breath);
    const a = amp * cur.ampGain;
    // Flicker: sharp random dips in brightness.
    const flick = cur.flicker > 0.01
      ? 1 - cur.flicker * Math.max(0, Math.sin(phase.time * 37) * Math.sin(phase.time * 11.3))
      : 1;
    const r = R * 0.2 * breath * (1 + a * 0.5);

    const glow = c.createRadialGradient(cx, cy, 0, cx, cy, r * 3.2);
    glow.addColorStop(0, rgba(0.95 * flick));
    glow.addColorStop(0.25, rgba(0.45 * flick));
    glow.addColorStop(1, rgba(0));
    c.fillStyle = glow;
    c.beginPath();
    c.arc(cx, cy, r * 3.2, 0, TAU);
    c.fill();

    c.fillStyle = `rgba(255,255,255,${0.85 * flick})`;
    c.beginPath();
    c.arc(cx, cy, r * 0.45, 0, TAU);
    c.fill();
  }

  function drawTickRing(c: CanvasRenderingContext2D, cx: number, cy: number, r: number, rot: number, alpha: number): void {
    c.lineWidth = 1;
    c.strokeStyle = rgba(alpha);
    c.beginPath();
    c.arc(cx, cy, r, 0, TAU);
    c.stroke();
    for (let i = 0; i < TICK_COUNT; i++) {
      const ang = rot + (i / TICK_COUNT) * TAU;
      const r2 = r - (i % 5 === 0 ? 9 : 4);
      c.beginPath();
      c.moveTo(cx + Math.cos(ang) * r, cy + Math.sin(ang) * r);
      c.lineTo(cx + Math.cos(ang) * r2, cy + Math.sin(ang) * r2);
      c.stroke();
    }
  }

  function drawArcs(
    c: CanvasRenderingContext2D, cx: number, cy: number, r: number,
    rot: number, count: number, gap: number, width: number, alpha: number,
  ): void {
    const seg = TAU / count;
    c.lineWidth = width;
    c.lineCap = "round";
    c.strokeStyle = rgba(alpha);
    for (let i = 0; i < count; i++) {
      const start = rot + i * seg;
      c.beginPath();
      c.arc(cx, cy, r, start, start + seg - gap);
      c.stroke();
    }
  }

  function drawDashed(c: CanvasRenderingContext2D, cx: number, cy: number, r: number, rot: number, alpha: number): void {
    c.lineWidth = 2;
    c.lineCap = "butt";
    c.strokeStyle = rgba(alpha);
    c.setLineDash([3, 9]);
    c.lineDashOffset = -rot * r;
    c.beginPath();
    c.arc(cx, cy, r, 0, TAU);
    c.stroke();
    c.setLineDash([]);
  }

  function drawBars(c: CanvasRenderingContext2D, cx: number, cy: number, r: number, rot: number): void {
    const a = amp * cur.ampGain;
    c.lineWidth = 2.5;
    c.lineCap = "round";
    c.strokeStyle = rgba(0.85);
    for (let i = 0; i < BAR_COUNT; i++) {
      const ang = rot + (i / BAR_COUNT) * TAU;
      // Resting bars stay short; amplitude lengthens them with per-bar variation.
      const len = 3 + 3 * noise(i, phase.time * 0.2) + a * 26 * noise(i, phase.time * 2);
      c.beginPath();
      c.moveTo(cx + Math.cos(ang) * r, cy + Math.sin(ang) * r);
      c.lineTo(cx + Math.cos(ang) * (r + len), cy + Math.sin(ang) * (r + len));
      c.stroke();
    }
  }

  function draw(c: CanvasRenderingContext2D): void {
    const { width: w, height: h } = canvas.getBoundingClientRect();
    c.clearRect(0, 0, w, h);
    const cx = w / 2;
    const cy = h / 2;
    const R = size / 2 - 8; // outermost radius incl. bars headroom

    c.save();
    c.shadowColor = rgba(0.8);
    c.shadowBlur = 10;
    drawBars(c, cx, cy, R * 0.8, phase.d);
    drawTickRing(c, cx, cy, R * 0.66, phase.a, 0.55);
    drawArcs(c, cx, cy, R * 0.55, phase.b, 3, 0.5, 5, 0.8);
    drawDashed(c, cx, cy, R * 0.44, phase.c, 0.6);
    drawArcs(c, cx, cy, R * 0.34, -phase.c * 0.7, 2, 1.1, 2, 0.7);
    drawCore(c, cx, cy, R);
    c.restore();
  }

  function frame(now: number): void {
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    step(dt);
    draw(ctx);
    rafId = requestAnimationFrame(frame);
  }

  return {
    start() {
      resize();
      window.addEventListener("resize", resize);
      last = performance.now();
      rafId = requestAnimationFrame(frame);
    },
    stop() {
      cancelAnimationFrame(rafId);
      window.removeEventListener("resize", resize);
      clearTimeout(errorTimer);
    },
    setState,
    setAmplitude,
    setReducedMotion(v) { opts.reducedMotion = v; },
    getState: () => state,
  };
}
