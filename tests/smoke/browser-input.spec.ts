import { expect } from "@playwright/test";
import type { ComputerAction, ComputerSnapshot } from "../../src/shared/computer-use";
import { findControl as find, test } from "../fixtures/input-test";

test("browser draft events and dense control discovery", async ({
  input,
  ownedBrowser: browser,
}) => {
  test.setTimeout(90_000);
  const { page, source } = browser;
  const signal = new AbortController().signal;
  let state = await input.inspect(source, signal);
  expect(JSON.stringify(state)).not.toContain("never-expose-browser-secret");
  const edited: string[] = [];
  for (const [name, selector, text] of [
    ["Subject", "#subject", "Friday design review"],
    ["Message body", "#body", "Hi Robin,\nCan we review the design on Friday? Café 🐈"],
    ["Rich message", "#rich", "A draft\nin a rich editor."],
  ] as const) {
    const control = find(state, name);
    expect(control.actions).toContain("fill");
    const result = await input.act(state, control, { kind: "fill", elementId: "e1", text }, signal);
    if (process.env.COMPUTERCAT_REQUIRE_NATIVE_FOCUS === "1")
      expect(result.status, `Keyboard qualification requires actual input: ${result.reason}`).toBe(
        "dispatched",
      );
    if (result.status === "rejected" && state.foreground !== state.windowHandle) {
      expect(result.reason).toBe("focus");
      if (selector === "#rich") await expect(page.locator(selector)).toHaveText("Original text");
      else await expect(page.locator(selector)).toHaveValue("");
      test.info().annotations.push({
        type: "native-input-coverage",
        description: `Windows denied foreground for ${name}; keyboard replacement success was not exercised.`,
      });
    } else {
      expect(result.status, `Native editor result: ${result.reason}`).toBe("dispatched");
      if (selector === "#rich")
        await expect.poll(() => page.locator(selector).innerText()).toBe(text);
      else await expect(page.locator(selector)).toHaveValue(text);
      edited.push(selector.slice(1));
      // DOM changes alone do not establish that a web app received the edit.
      expect(await page.evaluate(() => Reflect.get(window, "inputEvents"))).toEqual(
        expect.arrayContaining(edited),
      );
    }
    expect(result.snapshot).toBeDefined();
    state = result.snapshot as ComputerSnapshot;
  }
  expect(
    await input.act(state, find(state, "Save draft"), { kind: "click", elementId: "e1" }, signal),
  ).toMatchObject({ status: "dispatched" });
  await expect(page.locator("#status")).toHaveText("Saved, unsent");
  await expect(page.locator("#recipient")).toHaveValue("robin@example.com");
  expect(
    [...new Set(await page.evaluate(() => Reflect.get(window, "inputEvents") as string[]))].sort(),
  ).toEqual(edited.sort());
  expect(await page.evaluate(() => Reflect.get(window, "enterKeys"))).toBe(0);
  // A dense, deeply nested mail toolbar reproduces both discovery limits.
  await page.evaluate(() => {
    const toolbar = document.createElement("nav");
    for (let index = 0; index < 70; index++) {
      const button = document.createElement("button");
      button.textContent = String(index);
      button.setAttribute("aria-label", `Toolbar action ${index}`);
      toolbar.append(button);
    }
    document.body.prepend(toolbar);
    let container: HTMLElement = document.createElement("section");
    toolbar.after(container);
    for (let depth = 0; depth < 20; depth++) {
      const group = document.createElement("div");
      group.setAttribute("role", "group");
      group.setAttribute("aria-label", `Mail group ${depth}`);
      container.append(group);
      container = group;
    }
    const reply = document.createElement("button");
    reply.textContent = "Reply to Robin";
    reply.onclick = () => {
      const status = document.querySelector("#status");
      if (status) status.textContent = "Reply opened, unsent";
    };
    container.append(reply);
  });
  const crowded = await input.inspect(source, signal);
  expect(crowded.truncated).toBe(true);
  expect(crowded.elements.some((element) => element.name === "Reply to Robin")).toBe(false);
  const searched = await input.inspect(source, signal, "reply");
  const reply = find(searched, "Reply to Robin");
  expect(reply.actions).toContain("click");
  expect(searched.elements.every((element) => element.name.toLowerCase().includes("reply"))).toBe(
    true,
  );
  const opened = await input.act(searched, reply, { kind: "click", elementId: "e1" }, signal);
  expect(opened.status, opened.reason).toBe("dispatched");
  await expect(page.locator("#status")).toHaveText("Reply opened, unsent");
});

for (const editor of [
  { name: "Subject", selector: "#subject", replacement: "Friday — Café 🐈 金曜日" },
  { name: "Message body", selector: "#body", replacement: "First\r\nSecond\rThird\nCafé 🐈" },
  { name: "Rich message", selector: "#rich", replacement: "First\r\nSecond\rThird\nCafé 🐈" },
]) {
  test(`browser replaces, selects, types and clears ${editor.name}`, async ({
    input,
    ownedBrowser: browser,
  }) => {
    test.setTimeout(90_000);
    const { page, source } = browser;
    const signal = new AbortController().signal;
    const field = page.locator(editor.selector);
    // Seed an existing user draft without exercising the adapter or firing input events.
    await field.evaluate((node) => {
      if (node instanceof HTMLInputElement || node instanceof HTMLTextAreaElement)
        node.value = "Existing user draft";
      else node.innerHTML = "<p>Existing <b>rich</b> draft</p><p>Second paragraph</p>";
    });
    const value = () => (editor.selector === "#rich" ? field.innerText() : field.inputValue());
    const events = () => page.evaluate(() => Reflect.get(window, "inputEvents") as string[]);
    const invariant = async () => {
      await expect(page.locator("#recipient")).toHaveValue("robin@example.com");
      await expect(page.locator("#status")).toHaveText("Unsent");
      expect(await page.evaluate(() => Reflect.get(window, "enterKeys"))).toBe(0);
      expect((await events()).every((id) => id === editor.selector.slice(1))).toBe(true);
    };
    const act = async (action: ComputerAction) => {
      const before = await value();
      const beforeEvents = await events();
      const state = await input.inspect(source, signal);
      const outcome = await input.act(state, find(state, editor.name), action, signal);
      if (
        process.env.COMPUTERCAT_REQUIRE_NATIVE_FOCUS !== "1" &&
        outcome.status === "rejected" &&
        outcome.reason === "focus" &&
        state.foreground !== state.windowHandle
      ) {
        expect(await value()).toBe(before);
        expect(await events()).toEqual(beforeEvents);
        test.info().annotations.push({
          type: "native-input-coverage",
          description: `Windows denied focus for ${editor.name}; ${action.kind} and subsequent editing steps were not exercised.`,
        });
        await invariant();
        return false;
      }
      expect(outcome.status, `${action.kind}: ${outcome.reason}`).toBe("dispatched");
      expect(outcome.snapshot).toBeDefined();
      await invariant();
      return true;
    };
    const normalized = editor.replacement.replace(/\r\n?|\n/g, "\n");
    if (!(await act({ kind: "fill", elementId: "e1", text: editor.replacement }))) return;
    await expect.poll(value).toBe(normalized);
    expect((await events()).length).toBeGreaterThan(0);
    const filledEvents = await events();
    if (!(await act({ kind: "key", elementId: "e1", key: "Control+A" }))) return;
    expect(await value()).toBe(normalized);
    expect(await events()).toEqual(filledEvents);
    const selected = await field.evaluate((node) => {
      if (node instanceof HTMLInputElement || node instanceof HTMLTextAreaElement)
        return node.value.slice(node.selectionStart ?? 0, node.selectionEnd ?? 0);
      return window.getSelection()?.toString() ?? "";
    });
    expect(selected).toBe(normalized);
    if (!(await act({ kind: "type", elementId: "e1", text: "Replacement café 🐈 金曜日" }))) return;
    await expect.poll(value).toBe("Replacement café 🐈 金曜日");
    expect((await events()).length).toBeGreaterThan(filledEvents.length);
    const typedEvents = await events();
    if (!(await act({ kind: "fill", elementId: "e1", text: "" }))) return;
    if (editor.selector === "#rich") {
      // Chromium keeps a caret <br> after deleting all rich text. It contributes
      // an innerText newline but no text content; do not trim away leftover user text.
      await expect.poll(() => field.textContent()).toBe("");
      expect(await value()).toMatch(/^\n?$/);
    } else await expect.poll(value).toBe("");
    expect((await events()).length).toBeGreaterThan(typedEvents.length);
    await invariant();
  });
}

test("browser rejects a replaced DOM control without touching its replacement", async ({
  input,
  ownedBrowser: browser,
}) => {
  const { page, source } = browser;
  const signal = new AbortController().signal;
  const state = await input.inspect(source, signal);
  await page.locator("#subject").evaluate((node) => {
    const replacement = node.cloneNode(true) as HTMLInputElement;
    replacement.value = "User replacement";
    node.replaceWith(replacement);
  });
  expect(
    await input.act(
      state,
      find(state, "Subject"),
      { kind: "fill", elementId: "e1", text: "must not overwrite" },
      signal,
    ),
  ).toMatchObject({ status: "rejected", reason: "stale" });
  await expect(page.locator("#subject")).toHaveValue("User replacement");
  await expect(page.locator("#recipient")).toHaveValue("robin@example.com");
  await expect(page.locator("#status")).toHaveText("Unsent");
  expect(await page.evaluate(() => Reflect.get(window, "inputEvents"))).toEqual([]);
});
