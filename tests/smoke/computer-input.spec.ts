import { expect, test } from "@playwright/test";
import { WindowsInput } from "../../src/main/desktop/windows-input";
import type { ComputerSnapshot } from "../../src/shared/computer-use";
import { ownedWindow } from "../fixtures/owned-window";

test("native computer input drafts in an owned window, verifies edits and refuses changed targets", async () => {
  test.skip(process.platform !== "win32", "Windows input requires Windows");
  test.setTimeout(150_000);
  const fixture = await ownedWindow("tests/fixtures/computer-input.ps1");
  const input = new WindowsInput();
  const signal = new AbortController().signal;
  const source = {
    id: `window:${fixture.handle}:0`,
    name: "Computer Cat input fixture",
    kind: "window" as const,
  };
  const inspect = () => input.inspect(source, signal);
  const find = (state: ComputerSnapshot, name: string) => {
    const element = state.elements.find((item) => item.name === name);
    if (!element) throw new Error(`Missing fixture control ${name}: ${JSON.stringify(state)}`);
    return element;
  };
  try {
    let state = await inspect();
    expect(state.title).toBe(source.name);
    expect(JSON.stringify(state)).not.toMatch(/never-expose|Secret fixture/);
    expect(find(state, "Read only").actions).not.toContain("fill");
    expect(find(state, "Message body").actions).toEqual(expect.arrayContaining(["fill", "type"]));
    const draft = "Hi Robin,\r\nCould we review the design on Friday? Café 🐈\r\nThanks!";
    const fill = await input.act(
      state,
      find(state, "Message body"),
      { kind: "fill", elementId: "e1", text: draft },
      signal,
    );
    expect(fill.status).toBe("dispatched");
    expect(fill.snapshot).toBeDefined();
    expect(find(fill.snapshot as ComputerSnapshot, "Message body").value).toBe(draft);
    state = await inspect();
    const save = await input.act(
      state,
      find(state, "Save draft"),
      { kind: "click", elementId: "e1" },
      signal,
    );
    expect(save.status).toBe("dispatched");
    expect(JSON.parse(await fixture.command("status"))).toMatchObject({
      body: draft,
      status: "Saved, unsent",
      recipient: "robin@example.com",
    });

    state = await inspect();
    await fixture.command("edit");
    expect(
      await input.act(
        state,
        find(state, "Message body"),
        { kind: "fill", elementId: "e1", text: "must not overwrite" },
        signal,
      ),
    ).toMatchObject({ status: "rejected", reason: "stale" });
    state = await inspect();
    await fixture.command("move");
    expect(
      await input.act(
        state,
        find(state, "Message body"),
        { kind: "fill", elementId: "e1", text: "must not overwrite" },
        signal,
      ),
    ).toMatchObject({ status: "rejected", reason: "stale" });

    await fixture.command("focus-body");
    state = await inspect();
    const typed = await input.act(
      state,
      find(state, "Message body"),
      { kind: "type", elementId: "e1", text: " + café 🐈" },
      signal,
    );
    // Interactive Windows hosts may deny foreground activation. That is a supported
    // refusal, never a reason for the test/helper to force input into another app.
    if (typed.status === "rejected") {
      expect(typed.reason).toBe("focus");
      test
        .info()
        .annotations.push({
          type: "native-input-coverage",
          description:
            "Windows denied foreground activation; typed-text success not exercised on this host.",
        });
    } else expect(typed.status).toBe("dispatched");
    expect(JSON.parse(await fixture.command("status"))).toMatchObject({
      body: typed.status === "dispatched" ? "User changed this + café 🐈" : "User changed this",
      status: "Saved, unsent",
    });
    state = await inspect();
    const key = await input.act(
      state,
      find(state, "Message body"),
      { kind: "key", elementId: "e1", key: "Control+A" },
      signal,
    );
    if (key.status === "rejected") expect(key.reason).toBe("focus");
    else expect(key.status).toBe("dispatched");
    state = await inspect();
    const scroller = state.elements.find((element) => element.actions.includes("scroll"));
    expect(scroller).toBeDefined();
    if (!scroller) throw new Error("Missing scroll control");
    expect(
      await input.act(
        state,
        scroller,
        { kind: "scroll", elementId: "e1", direction: "down", amount: "large" },
        signal,
      ),
    ).toMatchObject({ status: "dispatched" });
    expect(JSON.parse(await fixture.command("status")).status).toBe("Saved, unsent");
  } finally {
    await fixture.close();
  }
});
