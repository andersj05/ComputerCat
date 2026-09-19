import { contextBridge, ipcRenderer } from "electron";
import {
  type ChatSnapshot,
  type ComputerCatAPI,
  IPC,
  type PetPreferences,
} from "../shared/contracts";
import type { ModelState } from "../shared/models";

const api: ComputerCatAPI = {
  voiceSnapshot: () => ipcRenderer.invoke(IPC.voiceSnapshot),
  voiceStart: () => ipcRenderer.invoke(IPC.voiceStart),
  voiceCaptureStarted: (request) => ipcRenderer.invoke(IPC.voiceCaptureStarted, request),
  voiceAppend: (request) => ipcRenderer.invoke(IPC.voiceAppend, request),
  voiceRequestFinish: (request) => ipcRenderer.invoke(IPC.voiceRequestFinish, request),
  voiceFinish: (request) => ipcRenderer.invoke(IPC.voiceFinish, request),
  voiceCancel: (request) => ipcRenderer.invoke(IPC.voiceCancel, request),
  voiceCaptureFailed: (request) => ipcRenderer.invoke(IPC.voiceCaptureFailed, request),
  voiceCaptureReleased: (request) => ipcRenderer.invoke(IPC.voiceCaptureReleased, request),
  voiceResultConsumed: (request) => ipcRenderer.invoke(IPC.voiceResultConsumed, request),
  voiceUpdateSettings: (request) => ipcRenderer.invoke(IPC.voiceUpdateSettings, request),
  voiceDownloadModel: (request) => ipcRenderer.invoke(IPC.voiceDownloadModel, request),
  voiceCancelDownload: (request) => ipcRenderer.invoke(IPC.voiceCancelDownload, request),
  voiceRemoveModel: (request) => ipcRenderer.invoke(IPC.voiceRemoveModel, request),
  onVoiceChanged: (listener) => {
    const receive = (
      _event: Electron.IpcRendererEvent,
      value: import("../shared/voice").VoiceSnapshot,
    ) => listener(value);
    ipcRenderer.on(IPC.voiceChanged, receive);
    return () => ipcRenderer.removeListener(IPC.voiceChanged, receive);
  },
  onVoiceCaptureRequested: (listener) => {
    const receive = (
      _event: Electron.IpcRendererEvent,
      value: import("../shared/voice").CaptureRequest,
    ) => listener(value);
    ipcRenderer.on(IPC.voiceCaptureRequested, receive);
    return () => ipcRenderer.removeListener(IPC.voiceCaptureRequested, receive);
  },
  onVoiceCaptureStopped: (listener) => {
    const receive = (
      _event: Electron.IpcRendererEvent,
      value: import("../shared/voice").CaptureStop,
    ) => listener(value);
    ipcRenderer.on(IPC.voiceCaptureStopped, receive);
    return () => ipcRenderer.removeListener(IPC.voiceCaptureStopped, receive);
  },
  info: () => ipcRenderer.invoke(IPC.info),
  snapshot: () => ipcRenderer.invoke(IPC.snapshot),
  send: (request) => ipcRenderer.invoke(IPC.send, request),
  stop: () => ipcRenderer.invoke(IPC.stop),
  clear: () => ipcRenderer.invoke(IPC.clear),
  conversations: () => ipcRenderer.invoke(IPC.conversations),
  openConversation: (id) => ipcRenderer.invoke(IPC.openConversation, id),
  deleteConversation: (id) => ipcRenderer.invoke(IPC.deleteConversation, id),
  selectModel: (settings) => ipcRenderer.invoke(IPC.selectModel, settings),
  openModels: () => ipcRenderer.invoke(IPC.openModels),
  onModelsRequested: (listener) => {
    const receive = () => listener();
    ipcRenderer.on(IPC.modelsRequested, receive);
    return () => ipcRenderer.removeListener(IPC.modelsRequested, receive);
  },
  openChat: () => ipcRenderer.invoke(IPC.openChat),
  openOptions: (tab) => ipcRenderer.invoke(IPC.openOptions, tab),
  dragPet: (phase) => ipcRenderer.invoke(IPC.dragPet, phase),
  setPetVoiceOpen: (open) => ipcRenderer.invoke(IPC.petVoiceOpen, open),
  onOptionsRequested: (listener) => {
    const receive = (_event: Electron.IpcRendererEvent, tab?: "voice") => listener(tab);
    ipcRenderer.on(IPC.optionsRequested, receive);
    return () => ipcRenderer.removeListener(IPC.optionsRequested, receive);
  },
  hideChat: () => ipcRenderer.invoke(IPC.hideChat),
  minimizeChat: () => ipcRenderer.invoke(IPC.minimizeChat),
  toggleMaximizeChat: () => ipcRenderer.invoke(IPC.toggleMaximizeChat),
  showPet: () => ipcRenderer.invoke(IPC.showPet),
  updatePreferences: (patch) => ipcRenderer.invoke(IPC.updatePreferences, patch),
  updateModels: (settings) => ipcRenderer.invoke(IPC.updateModels, settings),
  codexLogin: (request) => ipcRenderer.invoke(IPC.codexLogin, request),
  codexCancel: (request) => ipcRenderer.invoke(IPC.codexCancel, request),
  codexOpen: (request) => ipcRenderer.invoke(IPC.codexOpen, request),
  codexCode: (request) => ipcRenderer.invoke(IPC.codexCode, request),
  codexDisconnect: () => ipcRenderer.invoke(IPC.codexDisconnect),
  onModelsChanged: (listener) => {
    const receive = (_event: Electron.IpcRendererEvent, state: ModelState) => listener(state);
    ipcRenderer.on(IPC.modelsChanged, receive);
    return () => ipcRenderer.removeListener(IPC.modelsChanged, receive);
  },
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
