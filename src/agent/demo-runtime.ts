import { setTimeout } from "node:timers/promises";
import type { AgentRuntime } from "./runtime";

export class DemoRuntime implements AgentRuntime {
  async run(prompt: string, signal: AbortSignal, onDelta: (text: string) => void): Promise<void> {
    const answer = /screen|see|looking/i.test(prompt)
      ? "My screen tools aren't connected yet, so I can't see what's on your desktop. This is a local demo of our chat. Once screen context is added, you'll be able to choose what I can look at."
      : /do|help|can|ready/i.test(prompt)
        ? "For now, you can chat with this demo, move my little desktop window, and bring me back with the shortcut. Connecting a model unlocks real conversation. Screen context and computer actions come next."
        : "Hello, I'm Computer Cat. A little company for your desktop. You're trying a local demo response right now—no model is connected and no API calls are being made. Try asking what I can do!";
    for (const word of answer.match(/\S+\s*/g) ?? []) {
      await setTimeout(28, undefined, { signal });
      onDelta(word);
    }
  }

  dispose(): void {}
}
