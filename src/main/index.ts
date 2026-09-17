import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import {
  app,
  BrowserWindow,
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
  petDragSchema,
} from "../shared/validation";
import { ChatController } from "./chat-controller";
import { ModelController } from "./model-controller";
import { ModelSettingsStore } from "./model-settings";
import { keepInWorkArea, PetDrag } from "./pet-window";
import { PreferencesStore } from "./preferences";
import { EncryptedSecretStore } from "./secret-store";
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
let controller: ChatController;
let models: ModelController;
let codex: CodexAuth;
let disconnecting = false;
let shortcutRegistered = false;
let stopShortcutRegistered = false;
const petDrag = new PetDrag();
let presenceTimer: ReturnType<typeof setInterval> | undefined;
const preferences = new PreferencesStore(join(app.getPath("userData"), "preferences.json"));
const modelSettings = new ModelSettingsStore(join(app.getPath("userData"), "models.json"), {
  ...DEFAULT_MODEL_SETTINGS,
  source: config.mode === "pi" ? "environment" : "demo",
});

function publishModels(): void {
  if (!models) return;
  for (const window of BrowserWindow.getAllWindows()) {
    if (!window.isDestroyed() && trusted.get(window.webContents.id)?.role === "chat")
      window.webContents.send(IPC.modelsChanged, models.snapshot());
  }
}
const petSizes = {
  small: { width: 148, height: 244 },
  medium: { width: 188, height: 298 },
  large: { width: 228, height: 352 },
};

function placePet(bounds: Rectangle, area: Rectangle): void {
  const target = keepInWorkArea(bounds, area);
  // Move first so Windows resolves the destination DPI before applying the DIP size.
  pet.setPosition(target.x, target.y);
  pet.setBounds(target);
  const actual = pet.getBounds();
  const fitted = keepInWorkArea(actual, area);
  if (fitted.x !== actual.x || fitted.y !== actual.y) pet.setPosition(fitted.x, fitted.y);
}

function applyPetPreferences(): void {
  if (!pet || pet.isDestroyed()) return;
  const settings = preferences.snapshot();
  const bounds = pet.getBounds();
  const size = petSizes[settings.size];
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
  const area = screen.getDisplayNearestPoint(screen.getCursorScreenPoint()).workArea;
  // Off-screen Windows bounds can report a different size after a DPI transition.
  const size = petSizes[preferences.snapshot().size];
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
        (resolveConfig) =>
          new WorkerRuntime(join(here, "agent-worker.js"), app.getPath("userData"), resolveConfig),
        publishModels,
      );
      session.defaultSession.setPermissionRequestHandler((_contents, _permission, callback) =>
        callback(false),
      );
      session.defaultSession.setPermissionCheckHandler(() => false);
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
        () => models.createRuntime(),
        (snapshot) => {
          for (const window of BrowserWindow.getAllWindows()) {
            if (!window.isDestroyed()) window.webContents.send(IPC.changed, snapshot);
          }
        },
      );
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
          preferences: preferences.snapshot(),
          maximized: chat?.isMaximized() ?? false,
        };
      });
      ipcMain.handle(IPC.snapshot, (event) => {
        assertSender(event);
        return controller.snapshot();
      });
      ipcMain.handle(IPC.send, (event, request: unknown) => {
        assertSender(event, true);
        if (disconnecting)
          return { ok: false, message: "Wait for the connection change to finish." };
        return controller.send(request);
      });
      ipcMain.handle(IPC.updateModels, async (event, request: unknown) => {
        assertSender(event, true);
        const result = await models.update(request);
        if (result.ok && !controller.snapshot().busy && controller.snapshot().messages.length === 0)
          controller.clear();
        return result;
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
        try {
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
        controller.stop();
      });
      ipcMain.handle(IPC.clear, (event) => {
        assertSender(event, true);
        return controller.clear();
      });
      ipcMain.handle(IPC.openChat, (event) => {
        assertSender(event);
        showChat();
      });
      ipcMain.handle(IPC.openOptions, (event) => {
        assertSender(event);
        showChat();
        chat.webContents.send(IPC.optionsRequested);
      });
      ipcMain.handle(IPC.dragPet, (event, request: unknown) => {
        assertSender(event);
        if (trusted.get(event.sender.id)?.role !== "pet")
          throw new Error("Only the companion can move itself.");
        const phase = petDragSchema.parse(request);
        if (phase === "start") petDrag.start(screen.getCursorScreenPoint(), pet.getBounds());
        if (phase === "move" || phase === "end") {
          const next = petDrag.move(screen.getCursorScreenPoint());
          if (next) {
            placePet(
              { ...next, ...petSizes[preferences.snapshot().size] },
              screen.getDisplayMatching(next).workArea,
            );
          }
        }
        if (phase === "cancel") petDrag.cancel();
        return { moved: phase === "end" ? petDrag.end() : false };
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
        !smoke && globalShortcut.register("CommandOrControl+Shift+Escape", () => controller.stop());
      chat = await createWindow("chat");
      pet = await createWindow("pet");
      pet.on("blur", () => {
        petDrag.cancel();
        raisePet();
      });
      pet.on("hide", () => petDrag.cancel());
      pet.webContents.on("did-start-loading", () => petDrag.cancel());
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
            { label: "Open chat", click: showChat },
            { label: "Find cat", click: findPet },
            { label: "Stop current reply", click: () => controller.stop() },
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

app.on("before-quit", () => {
  quitting = true;
  clearInterval(presenceTimer);
  petDrag.cancel();
  controller?.dispose();
  codex?.dispose();
  globalShortcut.unregisterAll();
  tray?.destroy();
});
app.on("activate", showChat);
app.on("window-all-closed", () => {
  if (quitting) app.quit();
});
