// Remembers where the user dragged the window. Lives in .state/hud/, like any skill's state.
import fs from "node:fs";
import { z } from "zod";
import { readJson, writeJsonAtomic } from "../../src/core/util.js";
import type { Point } from "../shared/geometry.js";

const Saved = z.object({ x: z.number().finite(), y: z.number().finite() });

/** The saved spot, or undefined if there is none or the file is unreadable or the wrong shape. */
export function loadPosition(file: string): Point | undefined {
  const parsed = Saved.safeParse(readJson(file));
  return parsed.success ? parsed.data : undefined;
}

export function savePosition(file: string, pos: Point): void {
  writeJsonAtomic(file, { x: Math.round(pos.x), y: Math.round(pos.y) });
}

export function forgetPosition(file: string): void {
  fs.rmSync(file, { force: true });
}
