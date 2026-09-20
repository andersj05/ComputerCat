import type { ExtensionContext } from "@earendil-works/pi-coding-agent";
import { describe, expect, it, vi } from "vitest";
import type { WorkerEvent } from "../../src/agent/protocol";
import { WebWorkerClient } from "../../src/agent/web-rpc";
import { createWebTools } from "../../src/agent/web-tools";
import type { WebResult } from "../../src/shared/web";

const turnId = "7498b276-bc66-48d4-9c2d-22233405e9ca";
const pageId = "fb57819e-1083-4c34-aacb-35940e8df37a";
const result: WebResult = { content: [{ type: "text", text: "private web content" }] };
describe("web tools and private RPC", () => {
  it("routes all web tools, hides content in details and sanitizes executor errors", async () => {
    const execute = vi.fn().mockResolvedValue(result);
    const tools = createWebTools(execute);
    const cases = [
      [
        "web_read",
        { url: "https://example.com" },
        { operation: "read", url: "https://example.com" },
      ],
      ["web_read_more", { pageId, start: 8000 }, { operation: "page", pageId, start: 8000 }],
      ["web_find", { pageId, query: "needle" }, { operation: "find", pageId, query: "needle" }],
      ["web_search", { query: "news" }, { operation: "search", query: "news" }],
      ["web_get_status", {}, { operation: "status" }],
      [
        "web_read_many",
        { urls: ["https://example.com"] },
        { operation: "read-many", urls: ["https://example.com"] },
      ],
      [
        "web_list_links",
        { pageId, query: "profile" },
        { operation: "links", pageId, start: 0, query: "profile" },
      ],
      ["web_follow_link", { pageId, index: 2 }, { operation: "follow", pageId, index: 2 }],
      ["web_read_metadata", { pageId }, { operation: "metadata", pageId }],
      [
        "web_read_feed",
        { url: "https://example.com/feed" },
        { operation: "feed", url: "https://example.com/feed" },
      ],
    ] as const;
    for (const [name, params, request] of cases) {
      const tool = tools.find((tool) => tool.name === name);
      if (!tool) throw new Error("Missing tool");
      const reply = await tool.execute(
        "fixture",
        params,
        new AbortController().signal,
        undefined,
        {} as ExtensionContext,
      );
      expect(execute).toHaveBeenLastCalledWith(request, expect.any(AbortSignal));
      expect(reply.content).toEqual(result.content);
      expect(JSON.stringify(reply.details)).not.toContain("private web content");
    }
    execute.mockRejectedValue(new Error("private key"));
    await expect(
      tools[0]?.execute(
        "fixture",
        { url: "https://example.com" },
        undefined,
        undefined,
        {} as ExtensionContext,
      ),
    ).rejects.toThrow("unavailable");
  });
  it("correlates web calls and rejects results from wrong or cancelled turns", async () => {
    const sent: WorkerEvent[] = [];
    const client = new WebWorkerClient((message) => sent.push(message));
    const abort = new AbortController();
    client.beginTurn(turnId, abort.signal);
    const pending = client.execute({ operation: "read", url: "https://example.com" }, abort.signal);
    const request = sent[0];
    if (request?.type !== "web-request") throw new Error("Missing request");
    const reply = { type: "web-result" as const, id: turnId, callId: request.callId, result };
    expect(client.receive({ ...reply, id: pageId })).toBe(false);
    expect(client.receive(reply)).toBe(true);
    await expect(pending).resolves.toEqual(result);
    const cancelled = client.execute({ operation: "search", query: "test" }, abort.signal);
    const rejection = expect(cancelled).rejects.toThrow("ended");
    client.endTurn();
    await rejection;
    expect(client.receive(reply)).toBe(false);
  });
});
