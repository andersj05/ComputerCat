import { contextBridge, ipcRenderer } from "electron";
import {
  type ChatSnapshot,
  type ComputerCatAPI,
  IPC,
  type PetPreferences,
} from "../shared/contracts";

const api: ComputerCatAPI = {
  info: () => ipcRenderer.invoke(IPC.info),
  snapshot: () => ipcRenderer.invoke(IPC.snapshot),
  send: (request) => ipcRenderer.invoke(IPC.send, request),
  stop: () => ipcRenderer.invoke(IPC.stop),
  clear: () => ipcRenderer.invoke(IPC.clear),
  openChat: () => ipcRenderer.invoke(IPC.openChat),
  hideChat: () => ipcRenderer.invoke(IPC.hideChat),
  minimizeChat: () => ipcRenderer.invoke(IPC.minimizeChat),
  toggleMaximizeChat: () => ipcRenderer.invoke(IPC.toggleMaximizeChat),
  showPet: () => ipcRenderer.invoke(IPC.showPet),
  updatePreferences: (patch) => ipcRenderer.invoke(IPC.updatePreferences, patch),
  onPreferencesChanged: (listener) => {
    const receive = (_event: Electron.IpcRendererEvent, preferences: PetPreferences) =>
      listener(preferences);
    ipcRenderer.on(IPC.preferencesChanged, receive);
    return () => ipcRenderer.removeListener(IPC.preferencesChanged, receive);
  },
  onWindowChanged: (listener) => {
    const receive = (_event: Electron.IpcRendererEvent, maximized: boolean) => listener(maximized);
    ipcRenderer.on(IPC.windowChanged, receive);
    return () => ipcRenderer.removeListener(IPC.windowChanged, receive);
  },
  quit: () => ipcRenderer.invoke(IPC.quit),
  onChanged: (listener) => {
    const receive = (_event: Electron.IpcRendererEvent, snapshot: ChatSnapshot) =>
      listener(snapshot);
    ipcRenderer.on(IPC.changed, receive);
    return () => ipcRenderer.removeListener(IPC.changed, receive);
  },
};
contextBridge.exposeInMainWorld("computerCat", api);
