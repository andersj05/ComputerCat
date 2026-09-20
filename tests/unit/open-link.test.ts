import { describe, expect, it, vi } from "vitest";
import { openWebLink } from "../../src/main/open-link";

describe("user-clicked web links", () => {
  it("validates at the main boundary before external dispatch", async () => {
    const open = vi.fn().mockResolvedValue(undefined);
    for (const value of [
      null,
      {},
      "file:///C:/Windows/app.exe",
      "javascript:alert(1)",
      "https://user:secret@example.com",
      "https://example.com/\n",
      `https://example.com/${"x".repeat(2082)}`,
    ])
      expect((await openWebLink(value, open)).ok).toBe(false);
    expect(open).not.toHaveBeenCalled();
    expect(await openWebLink("https://example.com/source#details", open)).toEqual({ ok: true });
    expect(open).toHaveBeenCalledExactlyOnceWith("https://example.com/source#details");
  });
  it("reports a retryable failure without exposing host errors", async () => {
    const open = vi
      .fn()
      .mockRejectedValueOnce(new Error("private OS details"))
      .mockResolvedValue(undefined);
    expect(await openWebLink("https://example.com", open)).toEqual({
      ok: false,
      message: "Couldn't open this link. Try again.",
    });
    expect((await openWebLink("https://example.com", open)).ok).toBe(true);
  });
});
