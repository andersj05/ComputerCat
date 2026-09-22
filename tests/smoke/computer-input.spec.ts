import { expect } from "@playwright/test";
import type { ComputerSnapshot } from "../../src/shared/computer-use";
import { findControl as find, test } from "../fixtures/input-test";

test("native draft, selection, scroll and stale targets", async ({ input, native: fixture }) => {
  test.setTimeout(150_000);
  const signal = new AbortController().signal;
  const source = fixture.source;
  const inspect = () => input.inspect(source, signal);
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
  if (process.env.COMPUTERCAT_REQUIRE_NATIVE_FOCUS === "1")
    expect(typed.status, `Keyboard qualification requires actual input: ${typed.reason}`).toBe(
      "dispatched",
    );
  if (typed.status === "rejected") {
    expect(typed.reason).toBe("focus");
    test.info().annotations.push({
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
  if (process.env.COMPUTERCAT_REQUIRE_NATIVE_FOCUS === "1")
    expect(key.status, `Keyboard qualification requires actual input: ${key.reason}`).toBe(
      "dispatched",
    );
  if (key.status === "rejected") {
    expect(key.reason).toBe("focus");
    test.info().annotations.push({
      type: "native-input-coverage",
      description: "Windows denied keyboard selection.",
    });
  } else {
    expect(key.status).toBe("dispatched");
    const selected = JSON.parse(await fixture.command("status"));
    expect(selected.selectionLength).toBe(selected.body.length);
  }
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
  expect(JSON.parse(await fixture.command("status")).scrollOffset).toBeGreaterThan(0);
});

for (const change of ["resize", "rename-body", "disable-body", "hide"] as const) {
  test(`native rejects ${change} and recovers after fresh inspection`, async ({
    input,
    native,
  }) => {
    const signal = new AbortController().signal;
    const before = await input.inspect(native.source, signal);
    const original = JSON.parse(await native.command("status"));
    await native.command(change);
    const rejected = await input.act(
      before,
      find(before, "Message body"),
      { kind: "fill", elementId: "e1", text: "must not overwrite" },
      signal,
    );
    expect(rejected).toMatchObject({
      status: "rejected",
      reason: change === "hide" ? "unavailable" : "stale",
    });
    expect(JSON.parse(await native.command("status"))).toEqual(original);
    await native.command("restore");
    const fresh = await input.inspect(native.source, signal);
    expect(
      await input.act(
        fresh,
        find(fresh, "Message body"),
        { kind: "fill", elementId: "e1", text: "Recovered draft" },
        signal,
      ),
    ).toMatchObject({ status: "dispatched" });
    expect(JSON.parse(await native.command("status"))).toMatchObject({
      body: "Recovered draft",
      recipient: original.recipient,
      status: "Unsent",
    });
  });
}

test("native clears existing drafts and rejects read-only edits", async ({ input, native }) => {
  const signal = new AbortController().signal;
  await native.command("edit");
  let state = await input.inspect(native.source, signal);
  expect(
    await input.act(
      state,
      find(state, "Message body"),
      { kind: "fill", elementId: "e1", text: "" },
      signal,
    ),
  ).toMatchObject({ status: "dispatched" });
  expect(JSON.parse(await native.command("status"))).toMatchObject({ body: "", status: "Unsent" });
  state = await input.inspect(native.source, signal);
  const original = JSON.parse(await native.command("status"));
  expect(
    await input.act(
      state,
      find(state, "Read only"),
      { kind: "fill", elementId: "e1", text: "must not overwrite" },
      signal,
    ),
  ).toMatchObject({ status: "rejected", reason: "unsupported" });
  expect(JSON.parse(await native.command("status"))).toEqual(original);
});
