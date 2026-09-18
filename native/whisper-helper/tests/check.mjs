import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { once } from "node:events";
import { copyFile, link, mkdir, readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";

const executable = resolve(process.argv[2] ?? "resources/voice/bin/cpu/computercat-whisper.exe");
export function frame(value, pcm = Buffer.alloc(0)) {
  return rawFrame(JSON.stringify({ version: 1, ...value }), pcm);
}
function rawFrame(raw, pcm = Buffer.alloc(0)) {
  const data = Buffer.from(raw);
  const result = Buffer.alloc(data.length + pcm.length + 8);
  result.writeUInt32LE(data.length);
  data.copy(result, 4);
  result.writeUInt32LE(pcm.length, data.length + 4);
  pcm.copy(result, data.length + 8);
  return result;
}
export function launch(path = executable) {
  const child = spawn(path, [], {
    cwd: dirname(path),
    shell: false,
    windowsHide: true,
    env: { SystemRoot: process.env.SystemRoot, PATH: `${process.env.SystemRoot}/System32` },
  });
  const exited = once(child, "exit");
  const queue = [];
  let waiter;
  let data = Buffer.alloc(0);
  child.stdout.on("data", (chunk) => {
    data = Buffer.concat([data, chunk]);
    while (data.length >= 4 && data.length >= data.readUInt32LE() + 8) {
      const n = data.readUInt32LE();
      assert(n <= 65536);
      assert.equal(data.readUInt32LE(n + 4), 0);
      queue.push(JSON.parse(data.subarray(4, n + 4)));
      data = data.subarray(n + 8);
      if (waiter) {
        waiter();
        waiter = undefined;
      }
    }
  });
  child.stderr.resume();
  child.stdin.on("error", () => {});
  return {
    child,
    exited,
    async next() {
      if (!queue.length)
        await new Promise((ok, fail) => {
          const timeout = setTimeout(() => {
            child.kill();
            fail(new Error("Native response deadline"));
          }, 120000);
          waiter = () => {
            clearTimeout(timeout);
            ok();
          };
        });
      return queue.shift();
    },
    async exit() {
      await Promise.race([
        exited,
        new Promise((_, fail) => {
          const t = setTimeout(() => {
            child.kill();
            fail(new Error("Native exit deadline"));
          }, 2500);
          t.unref();
        }),
      ]);
    },
  };
}
for (const payload of [
  Buffer.from([255, 255, 255, 127]),
  frame({ kind: "shutdown", unexpected: true }),
  Buffer.from([1, 0, 0, 0, 255, 0, 0, 0, 0]),
  rawFrame('{"version":1,"kind":"shutdown","kind":"shutdown"}'),
  rawFrame(
    '{"version":1,"kind":"transcribe","requestId":"00000000-0000-4000-8000-000000000000","language":"en","sampleRate":16000,"sampleCount":9223372036854780608}',
    Buffer.alloc(9600),
  ),
]) {
  const p = launch();
  assert.equal((await p.next()).kind, "hello");
  p.child.stdin.write(payload);
  await p.exit();
}
{
  const p = launch();
  assert.equal((await p.next()).backend, "cpu");
  const id = randomUUID();
  const bytes = frame({
    kind: "load",
    requestId: id,
    modelId: "base.en",
    modelPath: "missing",
    vadPath: "missing",
    backend: "cpu",
    threads: 1,
  });
  for (const byte of bytes) p.child.stdin.write(Buffer.from([byte]));
  assert.equal((await p.next()).code, "model-load-failed");
  p.child.stdin.end(frame({ kind: "shutdown" }));
  await p.exit();
}
if (process.argv[3]) {
  const root = resolve(process.argv[3]);
  const modelId = process.argv[4] ?? "base.en";
  // Copying just the executable proves no developer DLL/PATH dependency.
  const dir = resolve(".local/whisper/Unpacked app é/voice");
  await mkdir(dir, { recursive: true });
  await copyFile(executable, resolve(dir, "computercat-whisper.exe"));
  for (const name of [`ggml-${modelId}.bin`, "ggml-silero-v6.2.0.bin"])
    await link(resolve(root, name), resolve(dir, name)).catch((error) => {
      if (error.code !== "EEXIST") throw error;
    });
  const p = launch(resolve(dir, "computercat-whisper.exe"));
  await p.next();
  const id = randomUUID();
  p.child.stdin.write(
    frame({
      kind: "load",
      requestId: id,
      modelId,
      modelPath: resolve(dir, `ggml-${modelId}.bin`),
      vadPath: resolve(dir, "ggml-silero-v6.2.0.bin"),
      backend: "cpu",
      threads: 6,
    }),
  );
  const ready = await p.next();
  assert.equal(ready.kind, "ready");
  const wav = await readFile(resolve(root, "source/samples/jfk.wav"));
  let cursor = 12;
  let pcm;
  while (cursor < wav.length) {
    const n = wav.readUInt32LE(cursor + 4);
    if (wav.toString("ascii", cursor, cursor + 4) === "data") {
      pcm = wav.subarray(cursor + 8, cursor + 8 + n);
      break;
    }
    cursor += 8 + n + (n % 2);
  }
  assert(pcm);
  for (const [input, kind] of [
    [pcm, "result"],
    [Buffer.alloc(160000), "no-speech"],
  ]) {
    const requestId = randomUUID();
    p.child.stdin.write(
      frame(
        {
          kind: "transcribe",
          requestId,
          language: "en",
          sampleRate: 16000,
          sampleCount: input.length / 2,
        },
        input,
      ),
    );
    const result = await p.next();
    assert.equal(result.kind, kind);
    if (kind === "result") {
      assert.match(result.text, /ask not/i);
      console.log(
        JSON.stringify({
          modelId,
          loadMs: ready.loadMs,
          inferenceMs: result.inferenceMs,
          audioMs: result.audioMs,
          backend: ready.backend,
        }),
      );
    }
  }
  const requestId = randomUUID();
  p.child.stdin.write(
    frame(
      {
        kind: "transcribe",
        requestId,
        language: "en",
        sampleRate: 16000,
        sampleCount: pcm.length / 2,
      },
      pcm,
    ),
  );
  p.child.stdin.write(frame({ kind: "cancel", requestId }));
  assert.equal((await p.next()).kind, "cancelled");
  p.child.stdin.end();
  await p.exit();
}
console.log("Native protocol/lifecycle checks passed.");
