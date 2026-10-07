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

0. **Visual prototype, no agent. (done)** Standalone canvas/WebGL page with a debug panel to switch states and drive an amplitude slider. Tune the look here first.
1. **Electron shell. (done)** Transparent always-on-top window (~300px), draggable, on all desktops, click-through while idle. Global hotkey (e.g. `Option+Space`) opens a small text input under the rings. Tray icon for quit and settings.
2. **Agent bridge. (done)** `runTurn` takes `onThinking`/`onTool` hooks. A shared `createSession` (used by the CLI chat and the HUD) and `createCtxFor` keep both front ends identical, and the skill list lives in `src/skills/index.ts`. The main process streams typed events (`thinking`, `tool`, `reply`, `prompt`, `error`) to the renderer, and `ctx.confirm`/`ctx.ask` become prompts answered only from the input box. Tested with scripted fake models, including the approval flow.
3. **Reactive motion and polish. (done)** Thinking and tool-call animation, reply pulse, and the confirm flow (the HUD shows the action and the human types `yes`).
4. **Voice (deferred, not started).** The `voice` skill isn't available yet. When it is, it feeds mic and TTS amplitude into `setAmplitude` and uses the unused `listening` state; the renderer needs no redesign. The reply pulse is a stand-in until then.

## Principles

- TypeScript only, no JavaScript sources, so the HUD gets the same type safety as the rest of the repo. `npm run hud:build` bundles `hud/` with esbuild into the git-ignored `hud/dist/`, and `npm run typecheck` covers `hud/`. The renderer and main process share one typed contract in `hud/shared/ipc.ts`, and the main process validates every IPC message with zod.
- The HUD is a thin client. No skill logic in the renderer.
- The renderer has no file or secret access. It only sends text and receives events.
- State and animation are separate: a small state machine plus a continuous `amplitude` value (0-1).
- `ctx.confirm` stays the human's typed `yes`; the HUD can display the prompt but never answers it.
- Respect macOS "reduce motion". The window is always dismissible (Esc).

## Decisions on the open questions

- Stays floating on screen; the hotkey and tray hide or show it.
- Remembers where you drag it (`.state/hud/window.json`); falls back to bottom-right if that screen is gone. Tray has Reset position.
- Per-state colours: cyan idle, blue thinking, amber approvals, red errors.
