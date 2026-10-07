// The one contract between the renderer and the main process.
// The preload implements HudApi; the renderer only ever sees this shape.

export const CHANNELS = {
  interactive: "hud:interactive",
  dragStart: "hud:drag-start",
  dragMove: "hud:drag-move",
  dragEnd: "hud:drag-end",
  inputClosed: "hud:input-closed",
  submit: "hud:submit",
  answerPrompt: "hud:answer-prompt",
  toggleInput: "hud:toggle-input",
  event: "hud:event",
} as const;

/** What the agent is doing, streamed from the main process to the renderer. */
export type HudEvent =
  | { type: "thinking" }
  | { type: "tool"; name: string }
  | { type: "reply"; text: string }
  /** The agent needs the human. `confirm` wants a typed "yes"; `ask` wants free text. */
  | { type: "prompt"; id: number; kind: "confirm" | "ask"; question: string }
  | { type: "error"; message: string };

export interface HudApi {
  submit(text: string): void;
  /** Answer a prompt. `null` means the human cancelled (counts as "no"). */
  answerPrompt(id: number, text: string | null): void;
  onEvent(cb: (event: HudEvent) => void): void;
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
