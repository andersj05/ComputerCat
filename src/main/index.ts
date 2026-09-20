import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import {
  app,
  BrowserWindow,
  clipboard,
  globalShortcut,
  type IpcMainInvokeEvent,
  ipcMain,
  Menu,
  nativeImage,
  powerMonitor,
  type Rectangle,
  safeStorage,
  screen,
  session,
  shell,
  Tray,
} from "electron";
import { CodexAuth } from "../agent/codex-auth";
import { readRuntimeConfig } from "../agent/config";
import { type AppInfo, IPC } from "../shared/contracts";
import { activeModelInfo, DEFAULT_MODEL_SETTINGS } from "../shared/models";
import {
  loginAttemptSchema,
  loginCodeSchema,
  loginRequestSchema,
  modelSettingsSchema,
  petDragSchema,
  petResizeSchema,
} from "../shared/validation";
import { sessionSchema, VoiceError } from "../shared/voice";
import { ChatController } from "./chat-controller";
import { ConversationStore } from "./conversation-store";
import { DesktopController } from "./desktop/controller";
import { ElectronDesktopProvider } from "./desktop/electron-provider";
import { createDesktopUtilities } from "./desktop/electron-utilities";
import { desktopFixture } from "./desktop/fixture-provider";
import { HarnessGuide } from "./harness-guide";
import { ModelController } from "./model-controller";
import { ModelSettingsStore } from "./model-settings";
import { keepInWorkArea, PetDrag, PetResize, resizeFromAnchor } from "./pet-window";
import { PreferencesStore } from "./preferences";
import { EncryptedSecretStore } from "./secret-store";
import { VoiceController } from "./voice/controller";
import { VoiceModelStore } from "./voice/model-store";
import { allowMicrophone } from "./voice/permissions";
import { VoiceSettingsStore } from "./voice/settings";
import { WhisperRuntime } from "./voice/whisper-runtime";
import { readSearchKey, WebController } from "./web/controller";
import { webFixture } from "./web/fixture";
import { WorkerRuntime } from "./worker-runtime";

const here = dirname(fileURLToPath(import.meta.url));
const smoke = process.env.COMPUTERCAT_SMOKE_TEST === "1";
if (smoke && process.env.COMPUTERCAT_TEST_USER_DATA)
  app.setPath("userData", process.env.COMPUTERCAT_TEST_USER_DATA);
const config = readRuntimeConfig(process.env);
const trusted = new Map<number, { url: string; role: "chat" | "pet" }>();
let chat: BrowserWindow;
let pet: BrowserWindow;
let tray: Tray | undefined;
let quitting = false;
let shutdownComplete = false;
let controller: ChatController;
let voice: VoiceController;
const desktop = new DesktopController(
  smoke
    ? desktopFixture(process.env.COMPUTERCAT_DESKTOP_FIXTURE === "1")
    : new ElectronDesktopProvider(),
  Date.now,
  createDesktopUtilities(smoke),
);
function captureWindow(): BrowserWindow | undefined {
  return voice?.snapshot().owner === "pet" ? pet : chat;
}
function assertCaptureSender(event: IpcMainInvokeEvent): void {
  assertSender(event);
  if (event.sender.id !== captureWindow()?.webContents.id)
    throw new Error("Not the active capture owner.");
}
function stopAll(): void {
  controller.stop();
  desktop.cancel();
  void voice?.cancel();
}
if (smoke) app.commandLine.appendSwitch("use-fake-device-for-media-stream");
let models: ModelController;
let codex: CodexAuth;
let disconnecting = false;
let shortcutRegistered = false;
let stopShortcutRegistered = false;
let talkShortcutRegistered = false;
const petDrag = new PetDrag();
const petResize = new PetResize();
function cancelPetGestures(): void {
  petDrag.cancel();
  petResize.cancel();
}
let presenceTimer: ReturnType<typeof setInterval> | undefined;
const preferences = new PreferencesStore(join(app.getPath("userData"), "preferences.json"));
const harnessGuide = new HarnessGuide(
  join(here, "harness-guide.html"),
  app.getPath("userData"),
  (path) => shell.openPath(path),
);
const modelSettings = new ModelSettingsStore(join(app.getPath("userData"), "models.json"), {
  ...DEFAULT_MODEL_SETTINGS,
  source: config.mode === "pi" ? "environment" : "demo",
});

function publishModels(): void {
  if (!models) return;
  for (const window of BrowserWindow.getAllWindows()) {
    if (!window.isDestroyed()) {
      const state = models.snapshot();
      if (trusted.get(window.webContents.id)?.role !== "chat") state.codex.login = null;
      window.webContents.send(IPC.modelsChanged, state);
    }
  }
}
const conversations = new ConversationStore(join(app.getPath("userData"), "conversations"));

const petSizes = {
  small: { width: 148, height: 244 },
  medium: { width: 188, height: 298 },
  large: { width: 228, height: 352 },
};
let petVoiceOpen = false;
// Panel dimensions survive closing/reopening during this app run, independently of cat size.
let petPanelSize = { width: 400, height: 340 };
let placedPetBounds: Rectangle | undefined;
function petWindowSize() {
  const size = petSizes[preferences.snapshot().size];
  return petVoiceOpen
    ? { width: petPanelSize.width, height: size.height + petPanelSize.height }
    : size;
}
function petResizeLimits() {
  const height = petSizes[preferences.snapshot().size].height;
  return { minWidth: 360, minHeight: height + 240, maxWidth: 1200, maxHeight: height + 800 };
}
function applyPanelResize(bounds: Rectangle, area: Rectangle): void {
  placePet(bounds, area);
  petPanelSize = {
    width: bounds.width,
    height: bounds.height - petSizes[preferences.snapshot().size].height,
  };
}

function placePet(bounds: Rectangle, area: Rectangle): void {
  const target = keepInWorkArea(
    {
      ...bounds,
      width: Math.min(bounds.width, area.width),
      height: Math.min(bounds.height, area.height),
    },
    area,
  );
  // Move first so Windows resolves the destination DPI before applying the DIP size.
  pet.setPosition(target.x, target.y);
  pet.setBounds(target);
  const actual = pet.getBounds();
  const fitted = keepInWorkArea(actual, area);
  if (fitted.x !== actual.x || fitted.y !== actual.y) pet.setPosition(fitted.x, fitted.y);
  // Native bounds may round up at fractional DPI. Never feed that size into the next gesture.
  placedPetBounds = {
    ...target,
    x: target.x + fitted.x - actual.x,
    y: target.y + fitted.y - actual.y,
  };
}

function applyPetPreferences(): void {
  if (!pet || pet.isDestroyed()) return;
  cancelPetGestures();
  const settings = preferences.snapshot();
  const bounds = placedPetBounds ?? pet.getBounds();
  const size = petWindowSize();
  const area = screen.getDisplayMatching(bounds).workArea;
  placePet(
    {
      ...size,
      x: bounds.x + bounds.width - size.width,
      y: bounds.y + bounds.height - size.height,
    },
    area,
  );
  pet.setAlwaysOnTop(settings.alwaysOnTop, "screen-saver");
  raisePet();
}

function raisePet(): void {
  if (!pet || pet.isDestroyed() || !pet.isVisible() || !preferences.snapshot().alwaysOnTop) return;
  pet.setAlwaysOnTop(true, "screen-saver");
  // Reassert z-order without stealing keyboard focus from the user's active application.
  pet.moveTop();
}

function findPet(): void {
  if (!pet || pet.isDestroyed()) return;
  cancelPetGestures();
  const area = screen.getDisplayNearestPoint(screen.getCursorScreenPoint()).workArea;
  // Off-screen Windows bounds can report a different size after a DPI transition.
  const size = petWindowSize();
  placePet(
    {
      ...size,
      x: area.x + area.width - size.width - 24,
      y: area.y + area.height - size.height - 16,
    },
    area,
  );
  pet.showInactive();
  pet.moveTop();
  raisePet();
}

function talkToPet(): void {
  if (!pet || pet.isDestroyed()) return;
  const state = voice.snapshot();
  if (voice.busy) {
    if (state.phase === "recording" && state.sessionId)
      void voice.action(() => voice.requestFinish({ sessionId: state.sessionId }));
    const owner = captureWindow();
    owner?.show();
    owner?.focus();
    return;
  }
  if (!pet.isVisible()) findPet();
  pet.show();
  pet.focus();
  pet.webContents.send(IPC.petTalkRequested);
}

function showChat(): void {
  if (!chat || chat.isDestroyed()) return;
  if (chat.isMinimized()) chat.restore();
  chat.show();
  chat.focus();
}

function assertSender(event: IpcMainInvokeEvent, chatOnly = false): void {
  const owner = trusted.get(event.sender.id);
  if (
    !owner ||
    (chatOnly && owner.role !== "chat") ||
    event.senderFrame !== event.sender.mainFrame ||
    event.senderFrame.url !== owner.url
  ) {
    throw new Error("Untrusted application request.");
  }
}

async function createWindow(role: "chat" | "pet"): Promise<BrowserWindow> {
  const isPet = role === "pet";
  const area = screen.getPrimaryDisplay().workArea;
  const petSize = petSizes[preferences.snapshot().size];
  const window = new BrowserWindow({
    width: isPet ? petSize.width : 720,
    height: isPet ? petSize.height : 560,
    ...(isPet
      ? {
          x: area.x + area.width - petSize.width - 24,
          y: area.y + area.height - petSize.height - 16,
        }
      : {}),
    minWidth: isPet ? 148 : 500,
    minHeight: isPet ? 244 : 420,
    title: isPet ? "Computer Cat companion" : "Computer Cat",
    frame: false,
    transparent: isPet,
    backgroundColor: isPet ? "#00000000" : "#ece9d8",
    resizable: !isPet,
    alwaysOnTop: isPet && preferences.snapshot().alwaysOnTop,
    skipTaskbar: isPet,
    show: false,
    autoHideMenuBar: true,
    webPreferences: {
      preload: join(here, "../preload/index.cjs"),
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
      webSecurity: true,
      spellcheck: true,
    },
  });
  window.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
  window.webContents.on("will-navigate", (event) => event.preventDefault());
  window.webContents.on("will-attach-webview", (event) => event.preventDefault());
  const contentsId = window.webContents.id;
  window.on("closed", () => trusted.delete(contentsId));
  if (!isPet) {
    window.on("maximize", () => window.webContents.send(IPC.windowChanged, true));
    window.on("unmaximize", () => window.webContents.send(IPC.windowChanged, false));
  }
  const devURL = !app.isPackaged ? process.env.ELECTRON_RENDERER_URL : undefined;
  const url = new URL(devURL ?? pathToFileURL(join(here, "../renderer/index.html")).href);
  url.searchParams.set("view", role);
  trusted.set(window.webContents.id, { url: url.href, role });
  await window.loadURL(url.href);
  if (isPet) {
    window.setAlwaysOnTop(preferences.snapshot().alwaysOnTop, "screen-saver");
    window.showInactive();
  } else window.show();
  return window;
}

const hasLock = smoke || app.requestSingleInstanceLock();
if (!hasLock) app.quit();
else {
  app.on("second-instance", showChat);
  void app
    .whenReady()
    .then(async () => {
      app.setAppUserModelId("com.andersj05.computercat");
      await preferences.load();
      await modelSettings.load();
      await conversations.load();
      codex = new CodexAuth(
        new EncryptedSecretStore(join(app.getPath("userData"), "codex-credentials.enc"), {
          available: () =>
            safeStorage.isEncryptionAvailable() &&
            (process.platform !== "linux" ||
              safeStorage.getSelectedStorageBackend() !== "basic_text"),
          encrypt: (value) => safeStorage.encryptString(value),
          decrypt: (value) => safeStorage.decryptString(value),
        }),
        (url) => shell.openExternal(url),
        publishModels,
      );
      await codex.load();
      models = new ModelController(
        modelSettings,
        codex,
        config,
        (resolveConfig, context) =>
          new WorkerRuntime(
            join(here, "agent-worker.js"),
            app.getPath("desktop"),
            resolveConfig,
            context,
            { directory: join(app.getPath("userData"), "pi-runtime"), allowDownloads: !smoke },
            (request, signal) => desktop.execute(request, signal),
            new WebController(
              smoke ? webFixture : undefined,
              smoke ? "fixture-search-key" : readSearchKey(process.env),
            ).execute,
          ),
        publishModels,
      );

      Menu.setApplicationMenu(
        Menu.buildFromTemplate([
          {
            label: "Edit",
            submenu: [
              { role: "undo" },
              { role: "redo" },
              { type: "separator" },
              { role: "cut" },
              { role: "copy" },
              { role: "paste" },
              { role: "selectAll" },
            ],
          },
        ]),
      );
      controller = new ChatController(
        (conversation) => {
          desktop.cancel();
          return models.createRuntime(conversation.model, {
            sessionFile: conversations.sessionFile(conversation.id),
            history: conversation.messages,
          });
        },
        (snapshot) => {
          for (const window of BrowserWindow.getAllWindows()) {
            if (!window.isDestroyed()) window.webContents.send(IPC.changed, snapshot);
          }
        },
        { store: conversations, defaults: () => modelSettings.snapshot() },
      );
      const voiceSettings = new VoiceSettingsStore(join(app.getPath("userData"), "voice.json"));
      await voiceSettings.load();
      const voiceStore = new VoiceModelStore(join(app.getPath("userData"), "voice", "models"));
      const recognizer = new WhisperRuntime(
        app.isPackaged
          ? join(process.resourcesPath, "voice/bin/cpu/computercat-whisper.exe")
          : join(app.getAppPath(), "resources/voice/bin/cpu/computercat-whisper.exe"),
      );
      const voiceFixture = smoke && process.env.COMPUTERCAT_VOICE_FIXTURE === "1";
      voice = new VoiceController(
        voiceSettings,
        voiceFixture
          ? {
              installed: async () => ["base.en", "large-v3-turbo", "silero-v6.2.0"],
              prepare: async (id) => ({
                modelId: id as "base.en" | "large-v3-turbo",
                modelPath: "fixture",
                vadPath: "fixture",
              }),
              install: async () => {
                throw new VoiceError("download-failed");
              },
              remove: async () => {},
            }
          : voiceStore,
        voiceFixture
          ? {
              prepare: async () => {},
              transcribe: async (_pcm, _language, signal) => {
                await new Promise((resolve) => setTimeout(resolve, 250));
                signal.throwIfAborted();
                return "Do not delete the folder.";
              },
              dispose: async () => {},
            }
          : recognizer,
        {
          conversation: () => controller.snapshot().conversationId ?? "",
          agentBusy: () => controller.snapshot().busy || disconnecting || quitting,
          visible: () => {
            const win = captureWindow();
            return !!win && !win.isDestroyed() && win.isVisible() && !win.isMinimized();
          },
          changed: () => {
            for (const win of BrowserWindow.getAllWindows())
              if (!win.isDestroyed())
                win.webContents.send(
                  IPC.voiceChanged,
                  voice.snapshot(trusted.get(win.webContents.id)?.role === "chat"),
                );
          },
          capture: (request) =>
            captureWindow()?.webContents.send(IPC.voiceCaptureRequested, request),
          stop: (request) => {
            const win = captureWindow();
            if (win && !win.isDestroyed()) win.webContents.send(IPC.voiceCaptureStopped, request);
          },
          terminateCapture: () => {
            const win = captureWindow();
            if (win && !win.isDestroyed()) win.webContents.forcefullyCrashRenderer();
          },
        },
      );
      await voice.refresh();
      void voice.warm();
      const permissionOwner = (contents: Electron.WebContents | null) =>
        contents
          ? {
              id: contents.id,
              url: contents.getURL(),
              destroyed: contents.isDestroyed(),
              mainFrame: true,
            }
          : null;
      const capturePermission = () => {
        const win = captureWindow();
        return win && !win.isDestroyed()
          ? { id: win.webContents.id, url: trusted.get(win.webContents.id)?.url ?? "" }
          : undefined;
      };
      session.defaultSession.setPermissionRequestHandler(
        (contents, permission, callback, details) =>
          callback(
            allowMicrophone(
              permissionOwner(contents),
              capturePermission(),
              voice.permissionGranted,
              permission,
              details,
              "request",
            ),
          ),
      );
      session.defaultSession.setPermissionCheckHandler((contents, permission, _origin, details) =>
        allowMicrophone(
          permissionOwner(contents),
          capturePermission(),
          voice.permissionGranted,
          permission,
          details,
          "check",
        ),
      );
      ipcMain.handle(IPC.voiceSnapshot, (event) => {
        assertSender(event);
        return voice.snapshot(trusted.get(event.sender.id)?.role === "chat");
      });
      ipcMain.handle(IPC.voiceStart, (event) => {
        assertSender(event);
        return voice.action(() => voice.start(trusted.get(event.sender.id)?.role));
      });
      ipcMain.handle(IPC.voiceCancel, (event, request: unknown) => {
        assertSender(event);
        return voice.action(() => voice.cancel(sessionSchema.parse(request).sessionId));
      });
      ipcMain.handle(IPC.voiceCaptureStarted, (event, request: unknown) => {
        assertCaptureSender(event);
        return voice.action(() => voice.captureStarted(request));
      });
      ipcMain.handle(IPC.voiceAppend, (event, request: unknown) => {
        assertCaptureSender(event);
        return voice.action(() => voice.append(request));
      });
      ipcMain.handle(IPC.voiceRequestFinish, (event, request: unknown) => {
        assertCaptureSender(event);
        return voice.action(() => voice.requestFinish(request));
      });
      ipcMain.handle(IPC.voiceFinish, (event, request: unknown) => {
        assertCaptureSender(event);
        return voice.action(() => voice.finish(request));
      });
      ipcMain.handle(IPC.voiceCaptureFailed, (event, request: unknown) => {
        assertCaptureSender(event);
        return voice.action(() => voice.captureFailed(request));
      });
      ipcMain.handle(IPC.voiceCaptureReleased, (event, request: unknown) => {
        assertCaptureSender(event);
        return voice.action(() => voice.released(request));
      });
      ipcMain.handle(IPC.voiceResultConsumed, (event, request: unknown) => {
        assertCaptureSender(event);
        return voice.action(() => voice.consumed(request));
      });
      ipcMain.handle(IPC.voiceUpdateSettings, (event, request: unknown) => {
        assertSender(event, true);
        return voice.action(() => voice.updateSettings(request));
      });
      ipcMain.handle(IPC.voiceDownloadModel, (event, request: unknown) => {
        assertSender(event, true);
        return voice.action(() => voice.downloadModel(request));
      });
      ipcMain.handle(IPC.voiceCancelDownload, (event, request: unknown) => {
        assertSender(event, true);
        return voice.action(() => voice.cancelDownload(request));
      });
      ipcMain.handle(IPC.voiceRemoveModel, (event, request: unknown) => {
        assertSender(event, true);
        return voice.action(() => voice.removeModel(request));
      });
      ipcMain.handle(IPC.conversations, (event) => {
        assertSender(event, true);
        return controller.list();
      });
      ipcMain.handle(IPC.openConversation, (event, id: unknown) => {
        assertSender(event, true);
        desktop.cancel();
        return voice.transition(() => controller.open(id));
      });
      ipcMain.handle(IPC.deleteConversation, (event, id: unknown) => {
        assertSender(event, true);
        desktop.cancel();
        return voice.transition(() => controller.delete(id));
      });
      ipcMain.handle(IPC.selectModel, (event, request: unknown) => {
        assertSender(event, true);
        if (disconnecting)
          return { ok: false, message: "Wait for the connection change to finish." };
        const valid = models.validate(request);
        if (!valid.ok) return valid;
        desktop.cancel();
        return voice.transition(() => controller.selectModel(modelSettingsSchema.parse(request)));
      });
      ipcMain.handle(IPC.openModels, (event) => {
        assertSender(event);
        showChat();
        void voice.transition(() => chat.webContents.send(IPC.modelsRequested));
      });
      ipcMain.handle(IPC.info, (event): AppInfo => {
        assertSender(event);
        const modelState = models.snapshot();
        if (trusted.get(event.sender.id)?.role !== "chat") modelState.codex.login = null;
        return {
          version: app.getVersion(),
          ...activeModelInfo(modelState),
          models: modelState,
          shortcut: shortcutRegistered ? "Ctrl+Shift+Space" : "Use the cat or tray icon",
          stopShortcut: stopShortcutRegistered ? "Ctrl+Shift+Escape" : "Use the Stop reply button",
          talkShortcut: talkShortcutRegistered ? "Ctrl+Alt+Space" : "Use the Talk button",
          preferences: preferences.snapshot(),
          maximized: chat?.isMaximized() ?? false,
        };
      });
      ipcMain.handle(IPC.snapshot, (event) => {
        assertSender(event);
        return controller.snapshot();
      });
      ipcMain.handle(IPC.copyReply, async (event, id: unknown) => {
        assertSender(event);
        if (typeof id !== "string" || !id || id.length > 128)
          return { ok: false, message: "Choose a completed reply to copy." };
        const message = controller
          .snapshot()
          .messages.find((item) => item.id === id && item.role === "assistant");
        if (!message?.text || message.state === "streaming")
          return { ok: false, message: "This reply is no longer available to copy." };
        try {
          await clipboard.writeText(message.text);
          return { ok: true };
        } catch {
          return { ok: false, message: "Couldn't copy. Select the reply and press Ctrl+C." };
        }
      });
      ipcMain.handle(IPC.send, (event, request: unknown) => {
        assertSender(event);
        if (disconnecting)
          return { ok: false, message: "Wait for the connection change to finish." };
        if (voice.busy) return { ok: false, message: "Finish or cancel recording first." };
        return voice.transition(() => controller.send(request));
      });
      ipcMain.handle(IPC.updateModels, async (event, request: unknown) => {
        assertSender(event, true);
        return voice.transition(async () => {
          const result = await models.update(request);
          if (
            result.ok &&
            !controller.snapshot().busy &&
            controller.snapshot().messages.length === 0
          ) {
            desktop.cancel();
            await controller.selectModel(models.snapshot().defaults);
          }
          return result;
        });
      });
      ipcMain.handle(IPC.codexLogin, (event, request: unknown) => {
        assertSender(event, true);
        const parsed = loginRequestSchema.safeParse(request);
        if (!parsed.success || disconnecting)
          return { ok: false, message: "Choose a valid sign-in method." };
        return codex.start(parsed.data.method);
      });
      ipcMain.handle(IPC.codexCancel, (event, request: unknown) => {
        assertSender(event, true);
        const parsed = loginAttemptSchema.safeParse(request);
        return parsed.success
          ? codex.cancel(parsed.data.attemptId)
          : { ok: false, message: "Invalid sign-in attempt." };
      });
      ipcMain.handle(IPC.codexOpen, (event, request: unknown) => {
        assertSender(event, true);
        const parsed = loginAttemptSchema.safeParse(request);
        return parsed.success
          ? codex.openSignIn(parsed.data.attemptId)
          : { ok: false, message: "Invalid sign-in attempt." };
      });
      ipcMain.handle(IPC.codexCode, (event, request: unknown) => {
        assertSender(event, true);
        const parsed = loginCodeSchema.safeParse(request);
        return parsed.success
          ? codex.submit(parsed.data.attemptId, parsed.data.code)
          : { ok: false, message: "Paste a valid callback URL." };
      });
      ipcMain.handle(IPC.codexDisconnect, async (event) => {
        assertSender(event, true);
        if (disconnecting || controller.snapshot().busy)
          return { ok: false, message: "Stop the current reply before disconnecting." };
        disconnecting = true;
        desktop.cancel();
        try {
          await voice.cancel();
          const result = await codex.disconnect();
          if (result.ok && models.snapshot().active.source === "codex")
            controller.invalidateConnection();
          return result;
        } finally {
          disconnecting = false;
        }
      });
      ipcMain.handle(IPC.stop, (event) => {
        assertSender(event);
        stopAll();
      });
      ipcMain.handle(IPC.clear, (event) => {
        assertSender(event);
        desktop.cancel();
        return voice.transition(() => controller.clear());
      });
      ipcMain.handle(IPC.openHistory, (event, ...args: unknown[]) => {
        assertSender(event);
        if (args.length) throw new Error("History accepts no arguments.");
        showChat();
        return voice.transition(() => chat.webContents.send(IPC.historyRequested));
      });
      ipcMain.handle(IPC.openChat, (event) => {
        assertSender(event);
        showChat();
      });
      ipcMain.handle(IPC.openOptions, (event, tab: unknown) => {
        assertSender(event);
        if (tab !== undefined && tab !== "voice") throw new Error("Invalid Options tab.");
        showChat();
        void voice.transition(() => chat.webContents.send(IPC.optionsRequested, tab));
      });
      ipcMain.handle(IPC.openHarnessGuide, (event, ...args: unknown[]) => {
        assertSender(event, true);
        if (args.length) throw new Error("The harness guide accepts no arguments.");
        return harnessGuide.open();
      });
      ipcMain.handle(IPC.dragPet, (event, request: unknown) => {
        assertSender(event);
        if (trusted.get(event.sender.id)?.role !== "pet")
          throw new Error("Only the companion can move itself.");
        const phase = petDragSchema.parse(request);
        if (phase === "start") {
          petResize.cancel();
          petDrag.start(screen.getCursorScreenPoint(), placedPetBounds ?? pet.getBounds());
        }
        if (phase === "move" || phase === "end") {
          const next = petDrag.move(screen.getCursorScreenPoint());
          if (next) {
            placePet({ ...next, ...petWindowSize() }, screen.getDisplayMatching(next).workArea);
          }
        }
        if (phase === "cancel") petDrag.cancel();
        return { moved: phase === "end" ? petDrag.end() : false };
      });
      ipcMain.handle(IPC.resizePetPanel, (event, request: unknown) => {
        assertSender(event);
        if (trusted.get(event.sender.id)?.role !== "pet")
          throw new Error("Only the companion can resize its panel.");
        const value = petResizeSchema.parse(request);
        if (value.phase === "cancel") {
          petResize.cancel();
          return;
        }
        if (!petVoiceOpen || !pet.isVisible()) throw new Error("The cat panel is not open.");
        const bounds = placedPetBounds ?? pet.getBounds();
        const area = screen.getDisplayMatching(bounds).workArea;
        if (value.phase === "start") {
          petDrag.cancel();
          petResize.start(
            screen.getCursorScreenPoint(),
            bounds,
            value.edge,
            area,
            petResizeLimits(),
          );
        } else if (value.phase === "step") {
          cancelPetGestures();
          const next = resizeFromAnchor(
            bounds,
            {
              width: bounds.width + (value.axis === "width" ? value.delta : 0),
              height: bounds.height + (value.axis === "height" ? value.delta : 0),
            },
            area,
            petResizeLimits(),
          );
          applyPanelResize(next, area);
        } else {
          const next = petResize.move(screen.getCursorScreenPoint());
          if (next) applyPanelResize(next, area);
          if (value.phase === "end") petResize.cancel();
        }
      });
      ipcMain.handle(IPC.petVoiceOpen, (event, open: unknown) => {
        assertSender(event);
        if (trusted.get(event.sender.id)?.role !== "pet" || typeof open !== "boolean")
          throw new Error("Invalid cat voice panel request.");
        petVoiceOpen = open;
        applyPetPreferences();
      });
      ipcMain.handle(IPC.petExpanded, (event, expanded: unknown) => {
        assertSender(event);
        if (trusted.get(event.sender.id)?.role !== "pet" || typeof expanded !== "boolean")
          throw new Error("Invalid cat panel size request.");
        petPanelSize = expanded ? { width: 580, height: 470 } : { width: 400, height: 340 };
        applyPetPreferences();
      });
      ipcMain.handle(IPC.hideChat, (event) => {
        assertSender(event, true);
        chat.hide();
      });
      ipcMain.handle(IPC.minimizeChat, (event) => {
        assertSender(event, true);
        chat.minimize();
      });
      ipcMain.handle(IPC.toggleMaximizeChat, (event) => {
        assertSender(event, true);
        if (chat.isMaximized()) chat.unmaximize();
        else chat.maximize();
      });
      ipcMain.handle(IPC.showPet, (event) => {
        assertSender(event, true);
        findPet();
      });
      ipcMain.handle(IPC.updatePreferences, async (event, request: unknown) => {
        assertSender(event, true);
        const result = await preferences.update(request);
        if (result.ok) {
          applyPetPreferences();
          for (const window of BrowserWindow.getAllWindows()) {
            if (!window.isDestroyed())
              window.webContents.send(IPC.preferencesChanged, preferences.snapshot());
          }
        }
        return result;
      });
      ipcMain.handle(IPC.quit, (event) => {
        assertSender(event);
        app.quit();
      });
      shortcutRegistered =
        !smoke && globalShortcut.register("CommandOrControl+Shift+Space", showChat);
      stopShortcutRegistered =
        !smoke && globalShortcut.register("CommandOrControl+Shift+Escape", stopAll);
      talkShortcutRegistered =
        !smoke && globalShortcut.register("CommandOrControl+Alt+Space", talkToPet);
      chat = await createWindow("chat");
      pet = await createWindow("pet");
      for (const win of [chat, pet]) {
        const cancelOwned = () => {
          if (captureWindow() === win) void voice.cancel();
          if (
            [chat, pet].every(
              (target) => target.isDestroyed() || !target.isVisible() || target.isMinimized(),
            )
          )
            desktop.cancel();
        };
        win.on("hide", cancelOwned);
        win.on("minimize", cancelOwned);
        win.webContents.on("did-start-loading", () => {
          desktop.cancel();
          cancelOwned();
          if (win === pet) {
            petVoiceOpen = false;
            applyPetPreferences();
          }
        });
        win.webContents.on("render-process-gone", () => {
          desktop.cancel();
          const cleanup = captureWindow() === win ? voice.cancel() : Promise.resolve();
          void cleanup.then(() => {
            if (!quitting && !win.isDestroyed()) win.reload();
          });
        });
      }
      powerMonitor.on("suspend", () => void voice.setBlocked("suspended", true));
      powerMonitor.on("lock-screen", () => void voice.setBlocked("locked", true));
      powerMonitor.on("resume", () => void voice.setBlocked("suspended", false));
      powerMonitor.on("unlock-screen", () => void voice.setBlocked("locked", false));
      powerMonitor.on("suspend", () => desktop.setBlocked("suspended", true));
      powerMonitor.on("lock-screen", () => desktop.setBlocked("locked", true));
      powerMonitor.on("resume", () => desktop.setBlocked("suspended", false));
      powerMonitor.on("unlock-screen", () => desktop.setBlocked("locked", false));
      pet.on("blur", () => {
        cancelPetGestures();
        raisePet();
      });
      pet.on("hide", cancelPetGestures);
      pet.webContents.on("did-start-loading", cancelPetGestures);
      powerMonitor.on("suspend", cancelPetGestures);
      powerMonitor.on("lock-screen", cancelPetGestures);
      pet.on("show", raisePet);
      powerMonitor.on("resume", raisePet);
      powerMonitor.on("unlock-screen", raisePet);
      screen.on("display-removed", applyPetPreferences);
      screen.on("display-metrics-changed", applyPetPreferences);
      presenceTimer = setInterval(raisePet, 2000);
      chat.on("close", (event) => {
        if (!quitting) {
          event.preventDefault();
          chat.hide();
        }
      });
      pet.on("close", (event) => {
        if (!quitting) {
          event.preventDefault();
          pet.hide();
        }
      });
      if (!smoke) {
        const artwork = app.isPackaged
          ? join(process.resourcesPath, "computer_cat.png")
          : join(app.getAppPath(), "assets/computer_cat.png");
        tray = new Tray(nativeImage.createFromPath(artwork).resize({ height: 24 }));
        tray.setToolTip("Computer Cat");
        tray.setContextMenu(
          Menu.buildFromTemplate([
            { label: "Talk / Finish recording", click: talkToPet },
            { label: "Open chat", click: showChat },
            { label: "Find cat", click: findPet },
            { label: "Stop current reply", click: stopAll },
            { type: "separator" },
            { label: "Quit Computer Cat", click: () => app.quit() },
          ]),
        );
        tray.on("double-click", showChat);
      }
    })
    .catch(() => {
      console.error("Computer Cat could not start.");
      app.exit(1);
    });
}

app.on("before-quit", (event) => {
  if (!shutdownComplete && controller) {
    event.preventDefault();
    if (quitting) return;
    quitting = true;
    desktop.setBlocked("closing", true);
    void Promise.all([voice?.dispose(), controller.dispose()]).finally(() => {
      shutdownComplete = true;
      app.quit();
    });
  }
  quitting = true;
  clearInterval(presenceTimer);
  cancelPetGestures();
  codex?.dispose();
  globalShortcut.unregisterAll();
  tray?.destroy();
});
app.on("activate", showChat);
app.on("window-all-closed", () => {
  if (quitting) app.quit();
});
