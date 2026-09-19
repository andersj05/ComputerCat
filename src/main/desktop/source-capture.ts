import { randomUUID } from "node:crypto";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { BrowserWindow } from "electron";
import { z } from "zod";
import { type DesktopRegion, desktopRegionSchema } from "../../shared/desktop";

export const captureImageSchema = z.strictObject({
  data: z
    .string()
    .min(4)
    .max(8_000_000)
    .regex(/^[A-Za-z0-9+/]*={0,2}$/),
  width: z.number().int().min(1).max(1920),
  height: z.number().int().min(1).max(1080),
});
export type CapturedImage = z.infer<typeof captureImageSchema>;
export class CaptureError extends Error {
  constructor(readonly code: "unavailable" | "timeout" | "cancelled" | "busy") {
    super(
      {
        unavailable:
          "The selected source could not provide a frame. It may be minimized, closed, or capture-protected. Use readable text or choose another source.",
        timeout:
          "The selected source did not provide a frame in time. Use readable text or choose another source.",
        cancelled: "Screen capture was cancelled.",
        busy: "Another screen capture is still stopping. Wait for it to finish.",
      }[code],
    );
  }
}

// Fixed code in an isolated, invisible media renderer. The app's chat/pet renderers
// never receive a capture permission, source ID, media stream, or raw image.
function captureFrame(sourceId: string, region?: DesktopRegion) {
  return (async () => {
    let stream: MediaStream | undefined;
    const video = document.createElement("video");
    video.muted = true;
    document.body.append(video);
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: {
          mandatory: {
            chromeMediaSource: "desktop",
            chromeMediaSourceId: sourceId,
            maxWidth: 3840,
            maxHeight: 2160,
            maxFrameRate: 1,
          },
        } as MediaTrackConstraints,
      });
      const ready = new Promise<void>((resolve, reject) => {
        video.onloadeddata = () => resolve();
        video.onerror = () => reject(new Error("No frame"));
      });
      video.srcObject = stream;
      await video.play();
      await ready;
      if (!video.videoWidth || !video.videoHeight) throw new Error("Empty frame");
      const crop = region ?? { x: 0, y: 0, width: 1, height: 1 };
      const x = Math.floor(crop.x * video.videoWidth);
      const y = Math.floor(crop.y * video.videoHeight);
      const width = Math.min(video.videoWidth - x, Math.ceil(crop.width * video.videoWidth));
      const height = Math.min(video.videoHeight - y, Math.ceil(crop.height * video.videoHeight));
      const scale = Math.min(1, 1920 / width, 1080 / height);
      const canvas = document.createElement("canvas");
      canvas.width = Math.max(1, Math.round(width * scale));
      canvas.height = Math.max(1, Math.round(height * scale));
      const context = canvas.getContext("2d", { alpha: false });
      if (!context) throw new Error("No canvas");
      context.drawImage(video, x, y, width, height, 0, 0, canvas.width, canvas.height);
      return {
        data: canvas.toDataURL("image/png").slice("data:image/png;base64,".length),
        width: canvas.width,
        height: canvas.height,
      };
    } finally {
      for (const track of stream?.getTracks() ?? []) track.stop();
      video.pause();
      video.srcObject = null;
      video.remove();
    }
  })();
}

export class SourceCapturer {
  private active = false;
  // One memory-only session per provider, reused without retaining media windows.
  private readonly partition = `cat-capture-${randomUUID()}`;
  constructor(
    private readonly documentPath = join(
      dirname(fileURLToPath(import.meta.url)),
      "../renderer/desktop-capture.html",
    ),
  ) {}

  async capture(
    sourceId: string,
    signal: AbortSignal,
    region?: DesktopRegion,
  ): Promise<CapturedImage> {
    if (signal.aborted) throw new CaptureError("cancelled");
    if (region && !desktopRegionSchema.safeParse(region).success)
      throw new CaptureError("unavailable");
    if (!/^(window:[1-9]\d{0,18}:[01]|screen:[0-9]+:[0-9]+)$/.test(sourceId))
      throw new CaptureError("unavailable");
    if (this.active) throw new CaptureError("busy");
    this.active = true;
    let window: BrowserWindow | undefined;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let abort: (() => void) | undefined;
    try {
      const url = pathToFileURL(this.documentPath).href;
      window = new BrowserWindow({
        show: false,
        focusable: false,
        skipTaskbar: true,
        width: 16,
        height: 16,
        webPreferences: {
          partition: this.partition,
          sandbox: true,
          contextIsolation: true,
          nodeIntegration: false,
          backgroundThrottling: false,
          offscreen: true,
          webSecurity: true,
        },
      });
      const contents = window.webContents;
      const session = contents.session;
      const owns = (sender: Electron.WebContents | null) =>
        sender === contents &&
        !signal.aborted &&
        !contents.isDestroyed() &&
        contents.getURL() === url;
      session.setPermissionCheckHandler(
        (sender, permission, _origin, details) =>
          owns(sender) &&
          permission === "media" &&
          details.isMainFrame === true &&
          details.mediaType === "video" &&
          (details.requestingUrl === url || details.requestingUrl === ""),
      );
      session.setPermissionRequestHandler((sender, permission, callback, details) =>
        callback(
          owns(sender) &&
            permission === "media" &&
            details.isMainFrame &&
            details.requestingUrl === url &&
            "mediaTypes" in details &&
            // Electron's legacy desktop request has no physical mediaTypes.
            // Requests for microphone/camera devices have audio/video entries.
            details.mediaTypes?.length === 0,
        ),
      );
      session.webRequest.onBeforeRequest((details, callback) =>
        callback({ cancel: details.url !== url }),
      );
      contents.setWindowOpenHandler(() => ({ action: "deny" }));
      contents.on("will-navigate", (event) => event.preventDefault());
      contents.on("will-attach-webview", (event) => event.preventDefault());
      const interrupted = new Promise<never>((_resolve, reject) => {
        abort = () => reject(new CaptureError("cancelled"));
        signal.addEventListener("abort", abort, { once: true });
        timer = setTimeout(() => reject(new CaptureError("timeout")), 6_000);
        contents.once("render-process-gone", () => reject(new CaptureError("unavailable")));
        window?.once("closed", () => reject(new CaptureError("unavailable")));
      });
      const work = (async () => {
        await window.loadFile(this.documentPath);
        if (signal.aborted) throw new CaptureError("cancelled");
        const result: unknown = await contents.executeJavaScript(
          `(${captureFrame.toString()})(${JSON.stringify(sourceId)}, ${JSON.stringify(region)})`,
        );
        if (signal.aborted) throw new CaptureError("cancelled");
        return captureImageSchema.parse(result);
      })();
      return await Promise.race([work, interrupted]);
    } catch (error) {
      throw error instanceof CaptureError ? error : new CaptureError("unavailable");
    } finally {
      clearTimeout(timer);
      if (abort) signal.removeEventListener("abort", abort);
      if (window && !window.isDestroyed()) {
        window.webContents.session.setPermissionCheckHandler(() => false);
        window.webContents.session.setPermissionRequestHandler((_sender, _permission, callback) =>
          callback(false),
        );
        window.destroy(); // Stops even a getUserMedia request that never resolved.
      }
      this.active = false;
    }
  }
}
