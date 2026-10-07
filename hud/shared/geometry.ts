// Pure window/pointer math, free of Electron and the DOM so it can be unit tested.

export interface Size { width: number; height: number }
export interface Point { x: number; y: number }
export interface Rect extends Point, Size {}

export const WINDOW_SIZE: Size = { width: 340, height: 430 };
export const RING_DIAMETER = 300;
const MARGIN = 24;

/** Default spot: bottom-right of the work area, with a margin. */
export function defaultPosition(workArea: Rect, size: Size = WINDOW_SIZE): Point {
  return {
    x: Math.round(workArea.x + workArea.width - size.width - MARGIN),
    y: Math.round(workArea.y + workArea.height - size.height - MARGIN),
  };
}

/** Keep a dragged window mostly on screen: at least `keep` px must stay visible. */
export function clampToWorkArea(pos: Point, workArea: Rect, size: Size = WINDOW_SIZE, keep = 80): Point {
  const minX = workArea.x - size.width + keep;
  const maxX = workArea.x + workArea.width - keep;
  const minY = workArea.y - size.height + keep;
  const maxY = workArea.y + workArea.height - keep;
  return {
    x: Math.round(Math.min(maxX, Math.max(minX, pos.x))),
    y: Math.round(Math.min(maxY, Math.max(minY, pos.y))),
  };
}

/** True when a point (window coordinates) is inside the ring circle. */
export function insideRings(point: Point, ringCenter: Point, diameter = RING_DIAMETER): boolean {
  const dx = point.x - ringCenter.x;
  const dy = point.y - ringCenter.y;
  return dx * dx + dy * dy <= (diameter / 2) * (diameter / 2);
}
