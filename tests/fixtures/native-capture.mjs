import { pathToFileURL } from "node:url";
import { app, BrowserWindow, nativeImage } from "electron";

app.whenReady().then(async () => {
  const { SourceCapturer } = await import(pathToFileURL(process.argv[2]).href);
  const target = new BrowserWindow({
    width: 640,
    height: 480,
    show: true,
    frame: false,
    webPreferences: { sandbox: true, contextIsolation: true, nodeIntegration: false },
  });
  await target.loadURL(
    "data:text/html," +
      encodeURIComponent(
        '<!doctype html><html><body style="margin:0;background:#f02010"><div style="position:absolute;left:50%;top:0;right:0;bottom:0;background:#1040e0"></div></body></html>',
      ),
  );
  const capturer = new SourceCapturer(process.argv[3]);
  globalThis.captureFixture = async () => {
    const result = await capturer.capture(target.getMediaSourceId(), new AbortController().signal);
    const image = nativeImage.createFromBuffer(Buffer.from(result.data, "base64"));
    const bitmap = image.toBitmap();
    const sample = (x, y) =>
      Array.from(bitmap.subarray((y * result.width + x) * 4, (y * result.width + x) * 4 + 4));
    return {
      width: result.width,
      height: result.height,
      left: sample(Math.floor(result.width / 4), Math.floor(result.height / 2)),
      right: sample(Math.floor((3 * result.width) / 4), Math.floor(result.height / 2)),
      windows: BrowserWindow.getAllWindows().length,
    };
  };
  globalThis.captureCancelFixture = async () => {
    const abort = new AbortController();
    const pending = capturer.capture(target.getMediaSourceId(), abort.signal);
    abort.abort();
    try {
      await pending;
      return "unexpected result";
    } catch (error) {
      return error.code;
    }
  };
});
