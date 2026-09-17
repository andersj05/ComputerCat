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
  screen,
  session,
  Tray,
} from "electron";
import { isConfigured, readRuntimeConfig } from "../agent/config";
import { DemoRuntime } from "../agent/demo-runtime";
import { type AppInfo, IPC } from "../shared/contracts";
import { ChatController } from "./chat-controller";
import { PreferencesStore } from "./preferences";
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
let shortcutRegistered = false;
let stopShortcutRegistered = false;
const preferences = new PreferencesStore(join(app.getPath("userData"), "preferences.json"));
const petSizes = {
  small: { width: 148, height: 244 },
  medium: { width: 188, height: 298 },
  large: { width: 228, height: 352 },
};

function applyPetPreferences(): void {
  if (!pet || pet.isDestroyed()) return;
  const settings = preferences.snapshot();
  const bounds = pet.getBounds();
  const size = petSizes[settings.size];
  const area = screen.getDisplayMatching(bounds).workArea;
  pet.setBounds({
    ...size,
    x: Math.max(
      area.x,
      Math.min(bounds.x + bounds.width - size.width, area.x + area.width - size.width),
    ),
    y: Math.max(
      area.y,
      Math.min(bounds.y + bounds.height - size.height, area.y + area.height - size.height),
    ),
  });
  pet.setAlwaysOnTop(settings.alwaysOnTop);
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
  window.show();
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
        () =>
          config.mode === "demo"
            ? new DemoRuntime()
            : new WorkerRuntime(join(here, "agent-worker.js"), app.getPath("userData")),
        (snapshot) => {
          for (const window of BrowserWindow.getAllWindows()) {
            if (!window.isDestroyed()) window.webContents.send(IPC.changed, snapshot);
          }
        },
      );
      ipcMain.handle(IPC.info, (event): AppInfo => {
        assertSender(event);
        return {
          version: app.getVersion(),
          mode: config.mode,
          configured: isConfigured(config),
          provider: config.provider || null,
          model: config.model || null,
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
        return controller.send(request);
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
        applyPetPreferences();
        pet.show();
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
            { label: "Show cat", click: () => pet.show() },
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
  controller?.dispose();
  globalShortcut.unregisterAll();
  tray?.destroy();
});
app.on("activate", showChat);
app.on("window-all-closed", () => {
  if (quitting) app.quit();
});
