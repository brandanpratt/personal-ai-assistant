// The one contract between the renderer and the main process.
// The preload script implements HudApi; the renderer only ever sees this shape.

export const CHANNELS = {
  interactive: "hud:interactive",
  dragStart: "hud:drag-start",
  dragMove: "hud:drag-move",
  dragEnd: "hud:drag-end",
  inputClosed: "hud:input-closed",
  submit: "hud:submit",
  toggleInput: "hud:toggle-input",
} as const;

export interface HudApi {
  submit(text: string): void;
  setInteractive(on: boolean): void;
  dragStart(): void;
  dragMove(dx: number, dy: number): void;
  dragEnd(): void;
  inputClosed(): void;
  onToggleInput(cb: () => void): void;
}

declare global {
  interface Window {
    hud: HudApi;
  }
}
