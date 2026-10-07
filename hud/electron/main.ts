// HUD shell: a transparent, always-on-top window with the ring renderer, wired to the same agent
// session (skills, tools, prompts) as the CLI chat. The renderer is only a display and an input box.
import { app, BrowserWindow, globalShortcut, ipcMain, Menu, nativeImage, screen, Tray } from "electron";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { z } from "zod";
import { ollamaModel } from "../../src/core/agent.js";
import { loadCoreConfig } from "../../src/core/config.js";
import { createCtxFor } from "../../src/core/context.js";
import { createSession, type Session } from "../../src/core/session.js";
import { skills } from "../../src/skills/index.js";
import { clampToWorkArea, defaultPosition, WINDOW_SIZE } from "../shared/geometry.js";
import { CHANNELS, type HudEvent } from "../shared/ipc.js";
import { createHudAgent } from "./agent.js";
import { createPromptBroker } from "./prompts.js";

const here = path.dirname(fileURLToPath(import.meta.url)); // hud/dist
const HOTKEY = process.env.HUD_HOTKEY || "Alt+Space";
const MAX_INPUT_CHARS = 2000;

// IPC is a trust boundary: validate everything the renderer sends.
const InteractiveMsg = z.boolean();
const DragMoveMsg = z.object({ dx: z.number(), dy: z.number() });
const SubmitMsg = z.string();
const AnswerMsg = z.object({ id: z.number().int(), text: z.string().nullable() });

let win: BrowserWindow | null = null;
let tray: Tray | null = null;
let dragOrigin: [number, number] | null = null;

if (!app.requestSingleInstanceLock()) app.quit();

function send(event: HudEvent): void {
  if (event.type === "prompt" && win) {
    // The agent is waiting on the human: bring the input forward.
    win.show();
    win.focus();
  }
  win?.webContents.send(CHANNELS.event, event);
}

const prompts = createPromptBroker(send);

let sessionPromise: Promise<Session> | undefined;
function getSession(): Promise<Session> {
  sessionPromise ??= (async () => {
    const core = loadCoreConfig();
    const ctxFor = createCtxFor(core, { confirm: prompts.confirm, ask: prompts.ask });
    for (const skill of skills) await skill.init?.(ctxFor(skill));
    return createSession({ skills, ctxFor, model: ollamaModel(core.ollamaModel) });
  })();
  // A failed start (bad .env, skill init) can be retried on the next message.
  sessionPromise.catch(() => { sessionPromise = undefined; });
  return sessionPromise;
}

const agent = createHudAgent({ getSession, emit: send });

function createWindow(): void {
  const pos = defaultPosition(screen.getPrimaryDisplay().workArea);

  const w = new BrowserWindow({
    ...WINDOW_SIZE,
    ...pos,
    transparent: true,
    frame: false,
    hasShadow: false,
    resizable: false,
    fullscreenable: false,
    skipTaskbar: true,
    alwaysOnTop: true,
    show: false,
    webPreferences: {
      preload: path.join(here, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });
  win = w;

  w.setAlwaysOnTop(true, "floating");
  w.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  // Idle = click-through. The renderer turns clicks on only over the rings or the input.
  w.setIgnoreMouseEvents(true, { forward: true });

  // The page is local and static: no navigation, no popups, no permissions.
  w.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
  w.webContents.on("will-navigate", (e) => e.preventDefault());
  w.webContents.session.setPermissionRequestHandler((_wc, _perm, cb) => cb(false));

  void w.loadFile(path.join(here, "..", "renderer", "index.html"));
  w.once("ready-to-show", () => w.showInactive());
  w.on("closed", () => {
    win = null;
    prompts.cancelAll();
  });
}

function summonInput(): void {
  if (!win) return;
  win.show();
  win.focus();
  win.webContents.send(CHANNELS.toggleInput);
}

function toggleVisible(): void {
  if (!win) return;
  if (win.isVisible()) win.hide();
  else win.showInactive();
}

function createTray(): void {
  tray = new Tray(nativeImage.createEmpty());
  tray.setTitle("◎");
  tray.setToolTip("Assistant HUD");
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: `Ask… (${HOTKEY})`, click: summonInput },
    { label: "Show / hide rings", click: toggleVisible },
    { type: "separator" },
    { label: "Quit", role: "quit" },
  ]));
}

ipcMain.on(CHANNELS.interactive, (_e, raw: unknown) => {
  const on = InteractiveMsg.safeParse(raw);
  if (on.success) win?.setIgnoreMouseEvents(!on.data, { forward: true });
});

ipcMain.on(CHANNELS.dragStart, () => {
  if (win) dragOrigin = win.getPosition() as [number, number];
});

ipcMain.on(CHANNELS.dragMove, (_e, raw: unknown) => {
  const d = DragMoveMsg.safeParse(raw);
  if (!win || !dragOrigin || !d.success) return;
  const [ox, oy] = dragOrigin;
  const workArea = screen.getDisplayNearestPoint({ x: ox, y: oy }).workArea;
  const next = clampToWorkArea({ x: ox + d.data.dx, y: oy + d.data.dy }, workArea);
  win.setPosition(next.x, next.y);
});

ipcMain.on(CHANNELS.dragEnd, () => { dragOrigin = null; });

// Give keyboard focus back to whatever app the user was in.
ipcMain.on(CHANNELS.inputClosed, () => {
  if (!win) return;
  if (process.platform === "darwin") {
    app.hide();
    win.showInactive();
  } else {
    win.blur();
  }
});

ipcMain.on(CHANNELS.submit, (_e, raw: unknown) => {
  const text = SubmitMsg.safeParse(raw);
  if (!text.success) return;
  const clean = text.data.slice(0, MAX_INPUT_CHARS).trim();
  if (clean) void agent.submit(clean);
});

ipcMain.on(CHANNELS.answerPrompt, (_e, raw: unknown) => {
  const msg = AnswerMsg.safeParse(raw);
  if (msg.success) prompts.answer(msg.data.id, msg.data.text?.slice(0, MAX_INPUT_CHARS));
});

app.on("second-instance", summonInput);

void app.whenReady().then(() => {
  // Accessory app: no Dock icon, no app menu. The tray item is the way out.
  app.dock?.hide();
  createWindow();
  createTray();
  if (!globalShortcut.register(HOTKEY, summonInput)) {
    console.warn(`[hud] could not register hotkey ${HOTKEY}; use the tray menu or set HUD_HOTKEY`);
  }
});

app.on("will-quit", () => globalShortcut.unregisterAll());
// Stay alive with no windows; the tray controls lifetime.
app.on("window-all-closed", () => {});
