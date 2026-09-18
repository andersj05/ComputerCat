import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { resolve } from "node:path";
import { frame, launch } from "./check.mjs";

const exe = resolve(".local/whisper/helper-build/Release/computercat-whisper-test.exe");
for (const kind of ["load", "transcribe"]) {
  const p = launch(exe);
  await p.next();
  const requestId = randomUUID();
  const command =
    kind === "load"
      ? {
          kind,
          requestId,
          modelId: "base.en",
          modelPath: "fixture",
          vadPath: "fixture",
          backend: "cpu",
          threads: 1,
        }
      : { kind, requestId, language: "en", sampleRate: 16000, sampleCount: 16000 };
  p.child.stdin.write(frame(command, kind === "transcribe" ? Buffer.alloc(32000) : undefined));
  p.child.stdin.write(frame({ kind: "cancel", requestId }));
  assert.equal((await p.next()).kind, "cancelled");
  p.child.stdin.end();
  await p.exit();
}
const p = launch(exe);
await p.next();
p.child.stdin.write(
  frame({
    kind: "load",
    requestId: randomUUID(),
    modelId: "base.en",
    modelPath: "hang",
    vadPath: "fixture",
    backend: "cpu",
    threads: 1,
  }),
);
p.child.stdin.end();
await p.exit();
console.log("Injected native inference: loading/decoding cancellation and EOF deadline passed.");
