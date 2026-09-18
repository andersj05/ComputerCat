let buffer = Buffer.alloc(0);
function send(value) {
  const json = Buffer.from(JSON.stringify({ version: 1, ...value }));
  const out = Buffer.alloc(json.length + 8);
  out.writeUInt32LE(json.length);
  json.copy(out, 4);
  process.stdout.write(out);
}
send({ kind: "hello", buildId: "computercat-whisper-1", engine: "1.9.4", backend: "cpu" });
process.stdin.on("data", (chunk) => {
  buffer = Buffer.concat([buffer, chunk]);
  while (buffer.length >= 4) {
    const size = buffer.readUInt32LE();
    if (buffer.length < size + 8) return;
    const payload = buffer.readUInt32LE(size + 4);
    if (buffer.length < size + 8 + payload) return;
    const value = JSON.parse(buffer.subarray(4, size + 4));
    buffer = buffer.subarray(size + 8 + payload);
    if (value.kind === "shutdown") process.exit(0);
    if (value.kind === "load")
      send({
        kind: "ready",
        requestId: value.requestId,
        modelId: value.modelId,
        backend: "cpu",
        loadMs: 1,
      });
    if (value.kind === "transcribe") {
      if (process.argv.includes("crash")) process.exit(2);
      if (process.argv.includes("hang")) continue;
      send({
        kind: "result",
        requestId: value.requestId,
        text: "Do not delete the folder.",
        language: "en",
        audioMs: 1000,
        inferenceMs: 1,
      });
    }
  }
});
process.stdin.on("end", () => process.exit(0));
