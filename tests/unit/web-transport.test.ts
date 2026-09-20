import { EventEmitter } from "node:events";
import type { RequestOptions } from "node:http";
import { beforeEach, describe, expect, it, vi } from "vitest";

const transportRequest = vi.hoisted(() => vi.fn());
vi.mock("node:http", () => ({ request: transportRequest }));
vi.mock("node:https", () => ({ request: transportRequest }));

import { MAX_WEB_BYTES, requestPublic } from "../../src/main/web/public-http";

function setup(
  headers: Record<string, string> = { "content-type": "text/plain" },
  statusCode = 200,
) {
  const response = Object.assign(new EventEmitter(), {
    headers,
    statusCode,
    complete: true,
    destroy: vi.fn(),
  });
  const request = Object.assign(new EventEmitter(), { end: vi.fn() });
  transportRequest.mockImplementation(
    (_url: URL, _options: RequestOptions, callback: (response: unknown) => void) => {
      request.end.mockImplementation(() => callback(response));
      return request;
    },
  );
  const abort = new AbortController();
  const promise = requestPublic(
    new URL("https://example.com/article"),
    { address: "93.184.216.34", family: 4 },
    abort.signal,
    {},
  );
  return { response, request, abort, promise };
}
beforeEach(() => vi.clearAllMocks());
describe("bounded HTTP transport", () => {
  it("pins the vetted address without ambient headers, proxy agents or connection reuse", async () => {
    const { response, abort, promise } = setup();
    const options = transportRequest.mock.calls[0]?.[1];
    expect(options).toMatchObject({
      method: "GET",
      family: 4,
      agent: false,
      signal: abort.signal,
      maxHeaderSize: 16384,
    });
    expect(options.headers).toEqual({
      "User-Agent": expect.any(String),
      Accept: expect.any(String),
      "Accept-Encoding": "identity",
    });
    const callback = vi.fn();
    options.lookup("example.com", {}, callback);
    expect(callback).toHaveBeenCalledWith(null, "93.184.216.34", 4);
    response.emit("data", Buffer.from("fixture page"));
    response.emit("end");
    expect(await promise).toMatchObject({ status: 200, body: "fixture page" });
  });
  it.each(["gzip", "br"])("refuses unexpected %s compression", async (encoding) => {
    const { promise, response } = setup({ "content-encoding": encoding });
    await expect(promise).rejects.toThrow("unsupported compression");
    expect(response.destroy).toHaveBeenCalledOnce();
  });
  it("enforces advertised and streamed byte caps", async () => {
    await expect(setup({ "content-length": String(MAX_WEB_BYTES + 1) }).promise).rejects.toThrow(
      "too large",
    );
    const { response, promise } = setup();
    response.emit("data", Buffer.alloc(MAX_WEB_BYTES + 1));
    await expect(promise).rejects.toThrow("2 MB");
    expect(response.destroy).toHaveBeenCalledOnce();
  });
  it("rejects incomplete transfers and sanitizes socket errors", async () => {
    const one = setup();
    one.response.complete = false;
    one.response.emit("end");
    await expect(one.promise).rejects.toThrow("incomplete");
    const two = setup();
    two.request.emit("error", new Error("private certificate details"));
    await expect(two.promise).rejects.toThrow("could not be reached");
  });
});
