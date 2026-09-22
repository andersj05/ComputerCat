import type { ExtensionContext } from "@earendil-works/pi-coding-agent";
import { describe, expect, it } from "vitest";
import { createComputerTools } from "../../src/agent/computer-tools";
import { DesktopController } from "../../src/main/desktop/controller";
import { computerFixture } from "../../src/main/desktop/fixture-input";

function setup() {
  const source = { id: "window:123:0", name: "Owned fixture", kind: "window" as const };
  const fixture = computerFixture(true, source.name);
  const controller = new DesktopController({
    input: fixture,
    current: async () => ({
      source,
      target: "foreground",
      text: {
        title: source.name,
        app: "fixture",
        text: "",
        selectedText: "",
        tabs: [],
        truncated: false,
      },
    }),
    list: async () => [source],
    read: async () => {
      throw new Error("Unexpected text reader");
    },
    capture: async () => {
      throw new Error("Unexpected capture");
    },
  });
  const signal = new AbortController().signal;
  const tools = createComputerTools((request, signal) => controller.execute(request, signal));
  const invoke = async (name: string, args = {}, cancellation = signal) => {
    const tool = tools.find((tool) => tool.name === name);
    if (!tool) throw new Error("Missing tool");
    const result = await tool.execute(
      "call",
      args,
      cancellation,
      undefined,
      {} as ExtensionContext,
    );
    const text = result.content[0];
    if (text?.type !== "text") throw new Error("Missing text result");
    return JSON.parse(text.text);
  };
  const inspect = () => invoke("desktop_inspect");
  const target = async (name: string) => {
    const state = await inspect();
    const element = state.elements.find((item: { name: string }) => item.name === name);
    if (!element) throw new Error("Missing fixture control");
    return { observationId: state.observationId, elementId: element.elementId };
  };
  return { fixture, source, invoke, inspect, target };
}

describe("stateful computer-use harness through real tools and broker", () => {
  it("runs all six tools with observable editor, selection, scroll and unsent-save effects", async () => {
    const { fixture, invoke, target } = setup();
    await invoke("desktop_fill", { ...(await target("Message body")), text: "Existing draft" });
    await invoke("desktop_press_key", { ...(await target("Message body")), key: "Control+A" });
    expect(fixture.state().selections[2]).toEqual({ start: 0, end: 14 });
    await invoke("desktop_type_text", {
      ...(await target("Message body")),
      text: "Hi Robin,\nCafé 🐈 金曜日",
    });
    await invoke("desktop_scroll", {
      ...(await target("Notes")),
      direction: "down",
      amount: "large",
    });
    await invoke("desktop_scroll", {
      ...(await target("Notes")),
      direction: "right",
      amount: "small",
    });
    const result = await invoke("desktop_click", await target("Save draft"));
    expect(fixture.state()).toMatchObject({
      fields: ["robin@example.com", "", "Hi Robin,\nCafé 🐈 金曜日"],
      status: "Saved, unsent",
      scroll: { x: 10, y: 50 },
    });
    expect(result.observation.text).toContain("Saved, unsent");
    expect(JSON.stringify(result)).not.toMatch(/runtimeId|windowHandle|processId|signature/);
  });

  it("rejects consumed references and read-only targets without changing independent app state", async () => {
    const { fixture, invoke, target } = setup();
    const old = await target("Subject");
    await invoke("desktop_fill", { ...old, text: "Friday" });
    const before = fixture.state();
    await expect(invoke("desktop_fill", { ...old, text: "must not overwrite" })).rejects.toThrow(
      "expired",
    );
    await expect(
      invoke("desktop_fill", { ...(await target("Read only")), text: "must not overwrite" }),
    ).rejects.toThrow("does not advertise");
    expect(fixture.state()).toEqual(before);
  });

  it("clears selected text, preserves Unicode characters, and distinguishes unsupported keys", async () => {
    const { fixture, invoke, target } = setup();
    await invoke("desktop_fill", { ...(await target("Message body")), text: "A🐈B" });
    await invoke("desktop_press_key", { ...(await target("Message body")), key: "ArrowLeft" });
    await invoke("desktop_press_key", { ...(await target("Message body")), key: "Backspace" });
    expect(fixture.state().fields[2]).toBe("AB");
    const before = fixture.state();
    await expect(
      invoke("desktop_press_key", { ...(await target("Message body")), key: "Control+Z" }),
    ).rejects.toThrow("does not support");
    expect(fixture.state()).toEqual(before);
    await invoke("desktop_fill", { ...(await target("Message body")), text: "" });
    expect(fixture.state().fields[2]).toBe("");
  });

  it("filters inspections by literal name and never infers a click from typing", async () => {
    const { fixture, invoke, target } = setup();
    const result = await invoke("desktop_inspect", { query: "sAvE" });
    expect(result.elements.map((element: { name: string }) => element.name)).toEqual([
      "Save draft",
    ]);
    await invoke("desktop_type_text", { ...(await target("Message body")), text: "Send message" });
    expect(fixture.state().status).toBe("Unsent");
    await invoke("desktop_click", await target("Send message"));
    expect(fixture.state().status).toBe("Sent");
  });

  it("rejects pre-cancelled calls and keeps instances and returned state independent", async () => {
    const { fixture, invoke, target } = setup();
    const control = await target("Message body");
    const abort = new AbortController();
    abort.abort();
    await expect(
      invoke("desktop_fill", { ...control, text: "cancelled" }, abort.signal),
    ).rejects.toThrow();
    expect(fixture.state().fields[2]).toBe("");
    const copy = fixture.state();
    copy.fields[0] = "modified copy";
    expect(fixture.state().fields[0]).toBe("robin@example.com");
    await invoke("desktop_fill", { ...(await target("Message body")), text: "first instance" });
    expect(setup().fixture.state().fields[2]).toBe("");
  });

  it("fails closed for disabled fixtures, wrong windows and stale native snapshots", async () => {
    const { fixture, source } = setup();
    const signal = new AbortController().signal;
    await expect(computerFixture(false, source.name).inspect(source, signal)).rejects.toThrow(
      "disabled",
    );
    await expect(fixture.inspect({ ...source, id: "window:456:0" }, signal)).rejects.toThrow(
      "Invalid fixture window",
    );
    const before = await fixture.inspect(source, signal);
    const element = before.elements[2];
    if (!element) throw new Error("Missing editor");
    await fixture.act(
      before,
      element,
      { kind: "fill", elementId: "e3", text: "first edit" },
      signal,
    );
    expect(
      await fixture.act(
        before,
        element,
        { kind: "fill", elementId: "e3", text: "stale edit" },
        signal,
      ),
    ).toMatchObject({ status: "rejected", reason: "stale" });
    expect(fixture.state().fields[2]).toBe("first edit");
  });
});
