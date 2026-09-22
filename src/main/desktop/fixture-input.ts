import type { ComputerSnapshot } from "../../shared/computer-use";
import type { ComputerInput } from "./computer-use";

/** Inert smoke/evaluation backend. No native processes, focus, clipboard or network. */
export function computerFixture(enabled: boolean, title: string): ComputerInput {
  const fields = ["robin@example.com", "", ""];
  let status = "Unsent";
  function snapshot(): ComputerSnapshot {
    if (!enabled) throw new Error("Computer input fixture disabled");
    return {
      windowHandle: "123",
      processId: 42,
      processStarted: "1",
      foreground: "123",
      lastInput: 1,
      title,
      app: "Fixture",
      bounds: { x: 0, y: 0, width: 800, height: 600 },
      text: `Email draft for Robin. ${status}`,
      truncated: false,
      elements: ["Recipient", "Subject", "Message body", "Send message"].map((name, index) => ({
        runtimeId: [42, index],
        name,
        role: index === 3 ? "Button" : "Edit",
        enabled: true,
        bounds: { x: 10, y: 10 + 50 * index, width: 400, height: 40 },
        signature: "a".repeat(64),
        actions: index === 3 ? ["click"] : ["fill", "type", "key"],
        ...(index < 3 ? { value: fields[index] ?? "" } : {}),
      })),
    };
  }
  return {
    inspect: async () => snapshot(),
    act: async (_before, element, action, signal) => {
      signal.throwIfAborted();
      if (!enabled) throw new Error("Computer input fixture disabled");
      const index = element.runtimeId[1];
      if (index === undefined) throw new Error("Invalid fixture target");
      if (action.kind === "fill") fields[index] = action.text;
      if (action.kind === "type") fields[index] = `${fields[index]}${action.text}`;
      if (action.kind === "click" && index === 3) status = "Sent";
      return { status: "dispatched", reason: "ok", snapshot: snapshot() };
    },
  };
}
