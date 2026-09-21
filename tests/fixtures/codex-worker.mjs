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
  const utilityLines = userText.split("\n").filter((line) => line.startsWith("utility-fixture:"));
  const utility = utilityLines.length
    ? JSON.parse(utilityLines.at(-1).slice("utility-fixture:".length))
    : undefined;
  const utilityCallId = `offline-utility-${utilityLines.length}`;
  const utilityResult = utility
    ? body.input.find(
        (item) => item.type === "function_call_output" && item.call_id === utilityCallId,
      )
    : undefined;
  const needsUtility = utility && !utilityResult;
  const webTurns = userText.split("\n").filter((line) => line.startsWith("web-fixture:"));
  const webId = `offline-web-${webTurns.length}`;
  const webResult = (stage) =>
    body.input.find(
      (entry) => entry.type === "function_call_output" && entry.call_id === `${webId}-${stage}`,
    );
  const outputText = (entry) =>
    typeof entry.output === "string"
      ? entry.output
      : entry.output.find((part) => part.type === "input_text")?.text;
  const webPage = webResult("read") ? JSON.parse(outputText(webResult("read"))) : undefined;
  const browserRecovery = webTurns.at(-1)?.includes("browser-recovery");
  const webSteps = browserRecovery
    ? [
        { stage: "search", name: "web_search", args: { query: "fixture browser recovery" } },
        { stage: "observe", name: "desktop_observe", args: { includeScreenshot: false } },
      ]
    : [
        { stage: "search", name: "web_search", args: { query: "fixture research" } },
        { stage: "read", name: "web_read", args: { url: "https://example.com/guide" } },
        { stage: "find", name: "web_find", args: { pageId: webPage?.pageId, query: "needle" } },
        {
          stage: "more",
          name: "web_read_more",
          args: { pageId: webPage?.pageId, start: webPage?.nextStart },
        },
        { stage: "status", name: "web_get_status", args: {} },
        {
          stage: "links",
          name: "web_list_links",
          args: { pageId: webPage?.pageId, query: "article" },
        },
        { stage: "metadata", name: "web_read_metadata", args: { pageId: webPage?.pageId } },
        { stage: "follow", name: "web_follow_link", args: { pageId: webPage?.pageId, index: 0 } },
        {
          stage: "many",
          name: "web_read_many",
          args: {
            urls: ["https://example.com/guide", "https://example.com/article", "http://127.0.0.1"],
          },
        },
        { stage: "feed", name: "web_read_feed", args: { url: "https://example.com/feed.xml" } },
      ];
  const webStep = webTurns.length ? webSteps.find((step) => !webResult(step.stage)) : undefined;
  const needsTool = webStep || needsUtility || needsRead || needsDesktop;
  const desktopText = desktopResult
    ? typeof desktopResult.output === "string"
      ? desktopResult.output
      : JSON.stringify(desktopResult.output)
    : undefined;
  const replyText =
    webTurns.length && !webStep
      ? browserRecovery
        ? "Offline browser recovery observed."
        : "Offline web research complete: [Fixture web guide](https://example.com/guide)."
      : utilityResult
        ? `Offline utility result: ${typeof utilityResult.output === "string" ? utilityResult.output : JSON.stringify(utilityResult.output)}`
        : desktopText
          ? `Offline desktop result: ${desktopText}`
          : "Offline Codex reply.";
  const item = needsTool
    ? {
        id: "offline-tool-call",
        type: "function_call",
        call_id: webStep
          ? `${webId}-${webStep.stage}`
          : needsUtility
            ? utilityCallId
            : needsRead
              ? "offline-read"
              : desktopCallId,
        name: webStep
          ? webStep.name
          : needsUtility
            ? utility.name
            : needsRead
              ? "read"
              : "desktop_observe",
        arguments: webStep
          ? JSON.stringify(webStep.args)
          : needsUtility
            ? JSON.stringify(utility.args)
            : needsRead
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
