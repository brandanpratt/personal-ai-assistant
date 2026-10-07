import { describe, it, expect } from "vitest";
import {
  clampToWorkArea,
  defaultPosition,
  insideRings,
  WINDOW_SIZE,
} from "../../hud/shared/geometry.js";

const screen = { x: 0, y: 25, width: 1440, height: 875 };

describe("hud geometry", () => {
  it("docks bottom-right with a margin", () => {
    const p = defaultPosition(screen);
    expect(p.x + WINDOW_SIZE.width).toBe(1440 - 24);
    expect(p.y + WINDOW_SIZE.height).toBe(25 + 875 - 24);
  });

  it("respects a work area that does not start at the origin", () => {
    const second = { x: 1440, y: 0, width: 1920, height: 1080 };
    expect(defaultPosition(second).x).toBeGreaterThan(1440);
  });

  it("never lets the window be dragged fully off screen", () => {
    const far = clampToWorkArea({ x: 99999, y: 99999 }, screen);
    expect(far.x).toBeLessThan(screen.width);
    expect(far.y).toBeLessThan(screen.y + screen.height);
    const near = clampToWorkArea({ x: -99999, y: -99999 }, screen);
    expect(near.x + WINDOW_SIZE.width).toBeGreaterThan(0);
    expect(near.y + WINDOW_SIZE.height).toBeGreaterThan(screen.y);
  });

  it("leaves an on-screen position alone", () => {
    expect(clampToWorkArea({ x: 300, y: 300 }, screen)).toEqual({ x: 300, y: 300 });
  });

  it("hit-tests the ring circle, not its bounding square", () => {
    const center = { x: 170, y: 150 };
    expect(insideRings({ x: 170, y: 150 }, center)).toBe(true);
    expect(insideRings({ x: 170 + 149, y: 150 }, center)).toBe(true);
    expect(insideRings({ x: 170 + 149, y: 150 + 149 }, center)).toBe(false);
  });
});
