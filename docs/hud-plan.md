# HUD plan (work in progress)

A floating, Jarvis-style heads-up display for the assistant: animated concentric rings that react while the assistant listens, thinks and replies.

First user: the project owner. Everything runs locally.

## Decisions

- Shell: Electron (transparent, frameless, always-on-top window; same TypeScript/Node as the agent).
- Look: Jarvis HUD rings (3-4 concentric arcs, tick marks, glowing core).
- First input: text plus a global hotkey. Voice comes later through the `voice` skill.

## States

| State | Look |
|---|---|
| Idle | Slow, soft breathing pulse |
| Listening | Reacts to mic level |
| Thinking | Faster ring spin while `runTurn` and tools work; core flickers per tool call |
| Speaking | Pulses with reply rhythm (later: real audio amplitude) |
| Confirm needed | Distinct color; shows the proposed action |
| Error | Brief flicker, then idle |

## Stages

0. **Visual prototype, no agent.** Standalone canvas/WebGL page with a debug panel to switch states and drive an amplitude slider. Tune the look here first.
1. **Electron shell.** Transparent always-on-top window (~300px), draggable, on all desktops, click-through while idle. Global hotkey (e.g. `Option+Space`) opens a small text input under the rings. Tray icon for quit and settings.
2. **Agent bridge.** `runTurn` gets an optional event callback (`thinking`, `tool:<name>`, `reply`, `confirm`, `error`). The Electron main process runs the same skill registry as `cli.ts`. CLI behavior is unchanged. Tested with a scripted fake model.
3. **Reactive motion.** Thinking and tool-call animation, reply pulse, and the confirm flow (the HUD shows the action and the human types `yes`).
4. **Voice (later).** The `voice` skill feeds mic and TTS amplitude into the same `amplitude` input.

## Principles

- TypeScript only, no JavaScript sources, so the HUD gets the same type safety as the rest of the repo. `npm run hud:build` bundles `hud/` with esbuild into the git-ignored `hud/dist/`, and `npm run typecheck` covers `hud/`. The renderer and main process share one typed contract in `hud/shared/ipc.ts`, and the main process validates every IPC message with zod.
- The HUD is a thin client. No skill logic in the renderer.
- The renderer has no file or secret access. It only sends text and receives events.
- State and animation are separate: a small state machine plus a continuous `amplitude` value (0-1).
- `ctx.confirm` stays the human's typed `yes`; the HUD can display the prompt but never answers it.
- Respect macOS "reduce motion". The window is always dismissible (Esc).

## Open questions

- Auto-hide after a reply, or stay floating?
- Default screen position?
- One Jarvis-blue palette, or a color per state (e.g. cyan idle, amber confirm)?
