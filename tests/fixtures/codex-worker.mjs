// Test-only entry: intercept requests, then load the actual built/packaged agent worker.
// No provider traffic may leave this process, including on an unexpected endpoint.
import { pathToFileURL } from "node:url";
import { zstdDecompressSync } from "node:zlib";

globalThis.fetch = async (url, options) => {
  if (url !== "https://chatgpt.com/backend-api/codex/responses")
    throw new Error("Unexpected offline provider endpoint");
  const payload =
    options.headers.get("content-encoding") === "zstd"
      ? zstdDecompressSync(options.body).toString("utf8")
      : options.body;
  const body = JSON.parse(payload);
  process.parentPort.postMessage({
    type: "test-provider-request",
    model: body.model,
    reasoning: body.reasoning?.effort,
    input: body.input,
    tools: body.tools ?? [],
    authenticated: options.headers.get("Authorization")?.startsWith("Bearer header.") === true,
  });
  if (JSON.stringify(body.input).includes("trigger-provider-error"))
    return new Response("private provider details", { status: 401 });
  const item = {
    id: "offline-message",
    type: "message",
    role: "assistant",
    content: [{ type: "output_text", text: "Offline Codex reply." }],
  };
  const events = [
    { type: "response.created", response: { id: "offline-response" } },
    { type: "response.output_item.added", output_index: 0, item: { ...item, content: [] } },
    { type: "response.output_text.delta", output_index: 0, delta: "Offline Codex reply." },
    { type: "response.output_item.done", output_index: 0, item },
    {
      type: "response.completed",
      response: { id: "offline-response", status: "completed", output: [item] },
    },
  ];
  return new Response(events.map((event) => `data: ${JSON.stringify(event)}\n\n`).join(""), {
    headers: { "Content-Type": "text/event-stream" },
  });
};
await import(pathToFileURL(process.argv[2]).href);
