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
  const userText = body.input
    .filter((item) => item.role === "user")
    .flatMap((item) => item.content ?? [])
    .map((part) => part.text ?? "")
    .join("\n");
  const readLine = userText.split("\n").find((line) => line.startsWith("read-fixture:"));
  // Image tool output may become a synthetic user message. Count only actual
  // screen questions so a tool result keeps the same ID and later turns get new IDs.
  const desktopQuestions = body.input
    .filter((item) => item.role === "user")
    .map((item) => (item.content ?? []).map((part) => part.text ?? "").join("\n"))
    .filter((text) => /^What is this page\?/i.test(text));
  const desktopCallId = desktopQuestions.length
    ? `offline-desktop-${desktopQuestions.length}`
    : undefined;
  const desktopResult = desktopCallId
    ? body.input.find(
        (item) => item.type === "function_call_output" && item.call_id === desktopCallId,
      )
    : undefined;
  const needsDesktop = desktopCallId && !desktopResult;
  const needsRead =
    readLine &&
    !body.input.some(
      (item) =>
        item.type === "function_call_output" &&
        JSON.stringify(item).includes("fixture-file-content"),
    );
  const needsTool = needsRead || needsDesktop;
  const desktopText = desktopResult
    ? typeof desktopResult.output === "string"
      ? desktopResult.output
      : JSON.stringify(desktopResult.output)
    : undefined;
  const replyText = desktopText ? `Offline desktop result: ${desktopText}` : "Offline Codex reply.";
  const item = needsTool
    ? {
        id: "offline-tool-call",
        type: "function_call",
        call_id: needsRead ? "offline-read" : desktopCallId,
        name: needsRead ? "read" : "desktop_observe",
        arguments: needsRead
          ? JSON.stringify({ path: JSON.parse(readLine.slice("read-fixture:".length)) })
          : "{}",
        status: "completed",
      }
    : {
        id: "offline-message",
        type: "message",
        role: "assistant",
        content: [{ type: "output_text", text: replyText }],
      };
  const events = [
    { type: "response.created", response: { id: "offline-response" } },
    {
      type: "response.output_item.added",
      output_index: 0,
      item: needsTool ? { ...item, arguments: "" } : { ...item, content: [] },
    },
    ...(needsTool
      ? [{ type: "response.function_call_arguments.delta", output_index: 0, delta: item.arguments }]
      : [{ type: "response.output_text.delta", output_index: 0, delta: replyText }]),
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
