// Bundles the HUD's TypeScript into hud/dist/ (git-ignored). Electron runs the output.
import { build, type BuildOptions } from "esbuild";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.dirname(fileURLToPath(import.meta.url));
const at = (...p: string[]): string => path.join(root, ...p);

const common: BuildOptions = { bundle: true, sourcemap: true, logLevel: "info", target: "es2022" };

await Promise.all([
  // Main process: ESM, Node APIs. `electron` is provided by the runtime.
  build({
    ...common,
    entryPoints: [at("electron", "main.ts")],
    outfile: at("dist", "main.mjs"),
    platform: "node",
    format: "esm",
    external: ["electron"],
  }),
  // Sandboxed preload scripts must be CommonJS.
  build({
    ...common,
    entryPoints: [at("electron", "preload.ts")],
    outfile: at("dist", "preload.cjs"),
    platform: "node",
    format: "cjs",
    external: ["electron"],
  }),
  // Pages: plain browser scripts, no module loading needed under the strict CSP.
  build({
    ...common,
    entryPoints: [at("renderer", "renderer.ts")],
    outfile: at("dist", "renderer.js"),
    platform: "browser",
    format: "iife",
  }),
  build({
    ...common,
    entryPoints: [at("prototype", "prototype.ts")],
    outfile: at("dist", "prototype.js"),
    platform: "browser",
    format: "iife",
  }),
]);
