import type { ExtensionContext } from "@earendil-works/pi-coding-agent";
import { describe, expect, it, vi } from "vitest";
import { createComputerTools } from "../../src/agent/computer-tools";
import type { DesktopExecutor } from "../../src/shared/desktop";

const observationId = "98dfacfb-e8a8-4495-8744-c78b33b29cce";
function setup() {
  const execute = vi
    .fn<DesktopExecutor>()
    .mockResolvedValue({ content: [{ type: "text", text: "Fresh state" }] });
  const tools = createComputerTools(execute);
  const invoke = (name: string, args = {}, signal?: AbortSignal) => {
    const tool = tools.find((item) => item.name === name);
    if (!tool) throw new Error("Missing tool");
    return tool.execute("call", args, signal, undefined, {} as ExtensionContext);
  };
  return { execute, invoke };
}
describe("agent computer tools", () => {
  it("works without image support and validates text before native dispatch", async () => {
    const { execute, invoke } = setup();
    await invoke("desktop_inspect");
    expect(execute).toHaveBeenCalledWith({ operation: "inspect" }, expect.any(AbortSignal));
    const text = "Hi Robin,\nFriday works. Café 🐈";
    const result = await invoke("desktop_fill", { observationId, elementId: "e2", text });
    expect(execute).toHaveBeenLastCalledWith(
      { operation: "act", observationId, action: { kind: "fill", elementId: "e2", text } },
      expect.any(AbortSignal),
    );
    expect(result.details).toEqual({ operation: "act" });
    for (const invalid of ["x".repeat(8001), "\0"])
      await expect(
        invoke("desktop_type_text", { observationId, elementId: "e2", text: invalid }),
      ).rejects.toThrow("Invalid computer action");
    expect(execute).toHaveBeenCalledTimes(2);
  });
  it("retains uncertain-outcome evidence and suppresses late results after Stop", async () => {
    const { execute, invoke } = setup();
    execute.mockResolvedValueOnce({
      isError: true,
      content: [{ type: "text", text: "uncertain: inspect before retrying" }],
    });
    await expect(invoke("desktop_click", { observationId, elementId: "e1" })).rejects.toThrow(
      "uncertain",
    );
    const abort = new AbortController();
    execute.mockImplementationOnce(async () => {
      abort.abort();
      return { content: [{ type: "text", text: "late" }] };
    });
    await expect(invoke("desktop_inspect", {}, abort.signal)).rejects.toThrow();
  });
});
