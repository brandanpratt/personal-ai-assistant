// HUD ring renderer. No dependencies, no agent. Driven by two inputs only:
//   hud.setState(name)      one of STATES
//   hud.setAmplitude(0..1)  mic or reply level
// The Electron shell (stage 1) will reuse this file unchanged.
(function (root) {
  "use strict";

  const TAU = Math.PI * 2;

  // Per-state look. Rgb is the glow color; spin multiplies ring speed;
  // breath is the idle pulse size; flicker is core instability; ampGain is how
  // strongly amplitude drives the core and the outer bars.
  const STATES = {
    idle:      { rgb: [90, 200, 255],  spin: 0.35, breath: 0.06, breathRate: 0.35, flicker: 0,    ampGain: 0.2 },
    listening: { rgb: [110, 220, 255], spin: 0.6,  breath: 0.03, breathRate: 0.6,  flicker: 0,    ampGain: 1 },
    thinking:  { rgb: [70, 160, 255],  spin: 2.8,  breath: 0.04, breathRate: 1.4,  flicker: 0.35, ampGain: 0.2 },
    speaking:  { rgb: [120, 235, 255], spin: 0.8,  breath: 0.03, breathRate: 0.8,  flicker: 0,    ampGain: 1 },
    confirm:   { rgb: [255, 184, 64],  spin: 0.15, breath: 0.1,  breathRate: 1.1,  flicker: 0,    ampGain: 0.2 },
    error:     { rgb: [255, 80, 80],   spin: 0.2,  breath: 0.02, breathRate: 0.5,  flicker: 0.9,  ampGain: 0 },
  };

  const ERROR_HOLD_MS = 1400;
  const BAR_COUNT = 72;
  const TICK_COUNT = 90;

  const lerp = (a, b, t) => a + (b - a) * t;
  // Frame-rate independent smoothing: rate is "per second".
  const ease = (rate, dt) => 1 - Math.exp(-rate * dt);

  // Cheap deterministic noise for per-bar variation.
  function noise(i, t) {
    return 0.5 + 0.5 * Math.sin(i * 12.9898 + t * 3.1) * Math.sin(i * 4.1414 + t * 1.7);
  }

  function createHud(canvas, options) {
    const opts = Object.assign({ reducedMotion: false, onStateChange: null }, options);
    const ctx = canvas.getContext("2d");

    let state = "idle";
    let target = STATES.idle;
    let errorTimer = null;

    // Smoothed, currently-displayed values.
    const cur = {
      rgb: STATES.idle.rgb.slice(),
      spin: STATES.idle.spin,
      breath: STATES.idle.breath,
      breathRate: STATES.idle.breathRate,
      flicker: 0,
      ampGain: STATES.idle.ampGain,
    };
    let ampTarget = 0;
    let amp = 0;
    const phase = { a: 0, b: 0, c: 0, d: 0, breath: 0, time: 0 };

    let size = 0;
    let last = performance.now();
    let rafId = 0;

    function resize() {
      const dpr = window.devicePixelRatio || 1;
      const rect = canvas.getBoundingClientRect();
      size = Math.min(rect.width, rect.height);
      canvas.width = Math.round(rect.width * dpr);
      canvas.height = Math.round(rect.height * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }

    function setState(name) {
      if (!STATES[name]) throw new Error("unknown HUD state: " + name);
      if (errorTimer) { clearTimeout(errorTimer); errorTimer = null; }
      state = name;
      target = STATES[name];
      if (name === "error") {
        errorTimer = setTimeout(() => setState("idle"), ERROR_HOLD_MS);
      }
      if (opts.onStateChange) opts.onStateChange(name);
    }

    function setAmplitude(v) {
      ampTarget = Math.max(0, Math.min(1, v));
    }

    const rgba = (a) => `rgba(${cur.rgb[0] | 0},${cur.rgb[1] | 0},${cur.rgb[2] | 0},${a})`;

    function step(dt) {
      const motion = opts.reducedMotion ? 0.25 : 1;
      const k = ease(5, dt);
      for (let i = 0; i < 3; i++) cur.rgb[i] = lerp(cur.rgb[i], target.rgb[i], k);
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

    function drawCore(cx, cy, R) {
      const breath = 1 + cur.breath * Math.sin(phase.breath);
      const a = amp * cur.ampGain;
      // Flicker: sharp random dips in brightness.
      const flick = cur.flicker > 0.01
        ? 1 - cur.flicker * Math.max(0, Math.sin(phase.time * 37) * Math.sin(phase.time * 11.3))
        : 1;
      const r = R * 0.2 * breath * (1 + a * 0.5);

      const glow = ctx.createRadialGradient(cx, cy, 0, cx, cy, r * 3.2);
      glow.addColorStop(0, rgba(0.95 * flick));
      glow.addColorStop(0.25, rgba(0.45 * flick));
      glow.addColorStop(1, rgba(0));
      ctx.fillStyle = glow;
      ctx.beginPath();
      ctx.arc(cx, cy, r * 3.2, 0, TAU);
      ctx.fill();

      ctx.fillStyle = `rgba(255,255,255,${0.85 * flick})`;
      ctx.beginPath();
      ctx.arc(cx, cy, r * 0.45, 0, TAU);
      ctx.fill();
    }

    function drawTickRing(cx, cy, r, rot, alpha) {
      ctx.lineWidth = 1;
      ctx.strokeStyle = rgba(alpha);
      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, TAU);
      ctx.stroke();
      for (let i = 0; i < TICK_COUNT; i++) {
        const ang = rot + (i / TICK_COUNT) * TAU;
        const long = i % 5 === 0;
        const r2 = r - (long ? 9 : 4);
        ctx.beginPath();
        ctx.moveTo(cx + Math.cos(ang) * r, cy + Math.sin(ang) * r);
        ctx.lineTo(cx + Math.cos(ang) * r2, cy + Math.sin(ang) * r2);
        ctx.stroke();
      }
    }

    function drawArcs(cx, cy, r, rot, count, gap, width, alpha) {
      const seg = TAU / count;
      ctx.lineWidth = width;
      ctx.lineCap = "round";
      ctx.strokeStyle = rgba(alpha);
      for (let i = 0; i < count; i++) {
        const start = rot + i * seg;
        ctx.beginPath();
        ctx.arc(cx, cy, r, start, start + seg - gap);
        ctx.stroke();
      }
    }

    function drawDashed(cx, cy, r, rot, alpha) {
      ctx.lineWidth = 2;
      ctx.lineCap = "butt";
      ctx.strokeStyle = rgba(alpha);
      ctx.setLineDash([3, 9]);
      ctx.lineDashOffset = -rot * r;
      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, TAU);
      ctx.stroke();
      ctx.setLineDash([]);
    }

    function drawBars(cx, cy, r, rot) {
      const a = amp * cur.ampGain;
      ctx.lineWidth = 2.5;
      ctx.lineCap = "round";
      ctx.strokeStyle = rgba(0.85);
      for (let i = 0; i < BAR_COUNT; i++) {
        const ang = rot + (i / BAR_COUNT) * TAU;
        // Resting bars stay short; amplitude lengthens them with per-bar variation.
        const len = 3 + 3 * noise(i, phase.time * 0.2) + a * 26 * noise(i, phase.time * 2);
        ctx.beginPath();
        ctx.moveTo(cx + Math.cos(ang) * r, cy + Math.sin(ang) * r);
        ctx.lineTo(cx + Math.cos(ang) * (r + len), cy + Math.sin(ang) * (r + len));
        ctx.stroke();
      }
    }

    function draw() {
      const w = canvas.getBoundingClientRect().width;
      const h = canvas.getBoundingClientRect().height;
      ctx.clearRect(0, 0, w, h);
      const cx = w / 2;
      const cy = h / 2;
      const R = size / 2 - 8; // outermost radius incl. bars headroom

      ctx.save();
      ctx.shadowColor = rgba(0.8);
      ctx.shadowBlur = 10;

      drawBars(cx, cy, R * 0.8, phase.d);
      drawTickRing(cx, cy, R * 0.66, phase.a, 0.55);
      drawArcs(cx, cy, R * 0.55, phase.b, 3, 0.5, 5, 0.8);
      drawDashed(cx, cy, R * 0.44, phase.c, 0.6);
      drawArcs(cx, cy, R * 0.34, -phase.c * 0.7, 2, 1.1, 2, 0.7);
      drawCore(cx, cy, R);

      ctx.restore();
    }

    function frame(now) {
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      step(dt);
      draw();
      rafId = requestAnimationFrame(frame);
    }

    function start() {
      resize();
      window.addEventListener("resize", resize);
      last = performance.now();
      rafId = requestAnimationFrame(frame);
    }

    function stop() {
      cancelAnimationFrame(rafId);
      window.removeEventListener("resize", resize);
      if (errorTimer) clearTimeout(errorTimer);
    }

    function setReducedMotion(v) { opts.reducedMotion = !!v; }

    return { start, stop, setState, setAmplitude, setReducedMotion, getState: () => state };
  }

  const api = { createHud, STATES: Object.keys(STATES) };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.HudRings = api;
})(typeof window !== "undefined" ? window : globalThis);
