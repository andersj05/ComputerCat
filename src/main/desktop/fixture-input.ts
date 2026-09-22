import { createHash } from "node:crypto";
import {
  type ComputerOutcome,
  type ComputerSnapshot,
  computerActionSchema,
} from "../../shared/computer-use";
import type { ComputerInput } from "./computer-use";

/** Deterministic app-state oracle; it does not model OS focus or browser event delivery. */
export interface ComputerFixture extends ComputerInput {
  state(): {
    fields: string[];
    selections: { start: number; end: number }[];
    status: string;
    scroll: { x: number; y: number };
  };
}

/** Inert smoke/evaluation backend. No native processes, focus, clipboard or network. */
export function computerFixture(enabled: boolean, title: string): ComputerFixture {
  const fields = ["robin@example.com", "", ""];
  const selections = fields.map((value) => ({ start: value.length, end: value.length }));
  let status = "Unsent";
  let revision = 1;
  const scroll = { x: 0, y: 0 };
  const names = [
    "Recipient",
    "Subject",
    "Message body",
    "Send message",
    "Save draft",
    "Notes",
    "Read only",
  ];
  const requireEnabled = () => {
    if (!enabled) throw new Error("Computer input fixture disabled");
  };
  function snapshot(query?: string): ComputerSnapshot {
    requireEnabled();
    const elements: ComputerSnapshot["elements"] = names.map((name, index) => ({
      runtimeId: [42, index],
      name,
      role: index < 3 || index === 6 ? "Edit" : index === 5 ? "Pane" : "Button",
      enabled: true,
      bounds: { x: 10, y: 10 + 50 * index, width: 400, height: 40 },
      signature: createHash("sha256")
        .update(JSON.stringify([index, fields[index], revision]))
        .digest("hex"),
      actions:
        index < 3 ? ["fill", "type", "key"] : index < 5 ? ["click"] : index === 5 ? ["scroll"] : [],
      ...(index < 3
        ? { value: fields[index] ?? "" }
        : index === 6
          ? { value: "Must remain unchanged" }
          : {}),
    }));
    return {
      windowHandle: "123",
      processId: 42,
      processStarted: "1",
      foreground: "123",
      lastInput: revision,
      title,
      app: "Fixture",
      bounds: { x: 0, y: 0, width: 800, height: 600 },
      text: `Email draft for Robin. ${status}. Notes: ${scroll.x},${scroll.y}`,
      truncated: false,
      elements: query
        ? elements.filter((element) => element.name.toLowerCase().includes(query.toLowerCase()))
        : elements,
    };
  }
  function outcome(reason: ComputerOutcome["reason"]): ComputerOutcome {
    return { status: reason === "ok" ? "dispatched" : "rejected", reason, snapshot: snapshot() };
  }
  function replace(index: number, text: string) {
    const value = fields[index];
    const selection = selections[index];
    if (value === undefined || !selection) throw new Error("Invalid fixture editor");
    fields[index] = value.slice(0, selection.start) + text + value.slice(selection.end);
    selection.start += text.length;
    selection.end = selection.start;
  }
  function key(index: number, key: string): boolean {
    const value = fields[index];
    const selection = selections[index];
    if (value === undefined || !selection) return false;
    const previous = (position: number) =>
      position - ([...value.slice(0, position)].at(-1)?.length ?? 0);
    const next = (position: number) => position + ([...value.slice(position)][0]?.length ?? 0);
    if (key === "Control+A") {
      selection.start = 0;
      selection.end = value.length;
    } else if (key === "Home") selection.start = selection.end = 0;
    else if (key === "End") selection.start = selection.end = value.length;
    else if (key === "ArrowLeft")
      selection.start = selection.end =
        selection.start !== selection.end ? selection.start : previous(selection.start);
    else if (key === "ArrowRight")
      selection.start = selection.end =
        selection.start !== selection.end ? selection.end : next(selection.end);
    else if (key === "Backspace" || key === "Delete") {
      if (selection.start === selection.end) {
        if (key === "Backspace") selection.start = previous(selection.start);
        else selection.end = next(selection.end);
      }
      replace(index, "");
    } else if (key === "Space") replace(index, " ");
    else if (key === "Enter" && index === 2) replace(index, "\n");
    else return false; // Unsupported fixture semantics must never masquerade as success.
    return true;
  }
  return {
    state: () => {
      requireEnabled();
      return structuredClone({ fields, selections, status, scroll });
    },
    inspect: async (source, signal, query) => {
      signal.throwIfAborted();
      requireEnabled();
      if (source.id !== "window:123:0" || source.kind !== "window" || source.name !== title)
        throw new Error("Invalid fixture window");
      return snapshot(query?.trim());
    },
    act: async (before, element, raw, signal) => {
      signal.throwIfAborted();
      requireEnabled();
      const action = computerActionSchema.parse(raw);
      const current = snapshot();
      const target = current.elements.find(
        (item) => JSON.stringify(item.runtimeId) === JSON.stringify(element.runtimeId),
      );
      if (
        before.windowHandle !== current.windowHandle ||
        before.processId !== current.processId ||
        before.processStarted !== current.processStarted ||
        before.lastInput !== revision ||
        !target ||
        target.signature !== element.signature
      )
        return outcome("stale");
      if (!target.actions.includes(action.kind)) return outcome("unsupported");
      const index = target.runtimeId[1];
      if (index === undefined) return outcome("stale");
      if (action.kind === "fill") {
        const selection = selections[index];
        if (!selection) return outcome("unsupported");
        selection.start = 0;
        selection.end = fields[index]?.length ?? 0;
        replace(index, action.text);
      } else if (action.kind === "type") replace(index, action.text);
      else if (action.kind === "key") {
        if (!key(index, action.key)) return outcome("unsupported");
      } else if (action.kind === "click") status = index === 3 ? "Sent" : "Saved, unsent";
      else if (action.kind === "scroll") {
        const axis = ["left", "right"].includes(action.direction) ? "x" : "y";
        const direction = ["up", "left"].includes(action.direction) ? -1 : 1;
        scroll[axis] = Math.max(
          0,
          Math.min(100, scroll[axis] + direction * (action.amount === "large" ? 50 : 10)),
        );
      }
      revision++;
      return outcome("ok");
    },
  };
}
