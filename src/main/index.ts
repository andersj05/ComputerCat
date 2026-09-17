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
  const window = new BrowserWindow({
    width: isPet ? 148 : 1000,
    height: isPet ? 180 : 780,
    ...(isPet ? { x: area.x + area.width - 174, y: area.y + area.height - 208 } : {}),
    minWidth: isPet ? 148 : 700,
    minHeight: isPet ? 180 : 590,
    title: isPet ? "Computer Cat companion" : "Computer Cat",
    frame: !isPet,
    transparent: isPet,
    backgroundColor: isPet ? "#00000000" : "#fbf8f2",
    resizable: !isPet,
    alwaysOnTop: isPet,
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
      ipcMain.handle(IPC.quit, (event) => {
        assertSender(event);
        app.quit();
      });
      shortcutRegistered =
        !smoke && globalShortcut.register("CommandOrControl+Shift+Space", showChat);
      if (!smoke) globalShortcut.register("CommandOrControl+Shift+Escape", () => controller.stop());
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
          ? join(process.resourcesPath, "computer-cat.png")
          : join(app.getAppPath(), "assets/computer-cat.png");
        tray = new Tray(nativeImage.createFromPath(artwork).resize({ width: 24, height: 24 }));
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
