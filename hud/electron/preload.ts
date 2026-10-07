// The renderer gets a tiny, fixed API. No Node, no files, no secrets.
import { contextBridge, ipcRenderer } from "electron";
import { CHANNELS, type HudApi } from "../shared/ipc.js";

const api: HudApi = {
  submit: (text) => ipcRenderer.send(CHANNELS.submit, text),
  setInteractive: (on) => ipcRenderer.send(CHANNELS.interactive, on),
  dragStart: () => ipcRenderer.send(CHANNELS.dragStart),
  dragMove: (dx, dy) => ipcRenderer.send(CHANNELS.dragMove, { dx, dy }),
  dragEnd: () => ipcRenderer.send(CHANNELS.dragEnd),
  inputClosed: () => ipcRenderer.send(CHANNELS.inputClosed),
  onToggleInput: (cb) => {
    ipcRenderer.on(CHANNELS.toggleInput, () => cb());
  },
};

contextBridge.exposeInMainWorld("hud", api);
