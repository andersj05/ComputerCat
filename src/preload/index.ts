import { contextBridge, ipcRenderer } from "electron";
import { type ChatSnapshot, type ComputerCatAPI, IPC } from "../shared/contracts";

const api: ComputerCatAPI = {
  info: () => ipcRenderer.invoke(IPC.info),
  snapshot: () => ipcRenderer.invoke(IPC.snapshot),
  send: (request) => ipcRenderer.invoke(IPC.send, request),
  stop: () => ipcRenderer.invoke(IPC.stop),
  clear: () => ipcRenderer.invoke(IPC.clear),
  openChat: () => ipcRenderer.invoke(IPC.openChat),
  hideChat: () => ipcRenderer.invoke(IPC.hideChat),
  quit: () => ipcRenderer.invoke(IPC.quit),
  onChanged: (listener) => {
    const receive = (_event: Electron.IpcRendererEvent, snapshot: ChatSnapshot) =>
      listener(snapshot);
    ipcRenderer.on(IPC.changed, receive);
    return () => ipcRenderer.removeListener(IPC.changed, receive);
  },
};
contextBridge.exposeInMainWorld("computerCat", api);
