import { setTimeout } from "node:timers/promises";
import type { AgentRuntime } from "./runtime";

export class DemoRuntime implements AgentRuntime {
  async run(prompt: string, signal: AbortSignal, onDelta: (text: string) => void): Promise<void> {
    const answer = /screen|see|looking/i.test(prompt)
      ? "This local demo doesn't read your screen. Connect a model in Options → Models, choose Share screen, then ask about the window you'd like help with. Screen tools can observe, but cannot click or type."
      : /plan|task|day/i.test(prompt)
        ? "Start with one thing you'd like to finish. Break it into a step you can do now.\n\nWhat are you working on?"
        : /idea|think|explore/i.test(prompt)
          ? "Tell me your idea in one sentence, who it's for, and the part you're unsure about."
          : /do|help|can|ready/i.test(prompt)
            ? "I can sit on your desktop and chat. Open Options to change my size or behavior.\n\nThis demo uses sample replies. Connect a model for real conversations. Connect a model to use file and shell tools. This demo does not run tools."
            : "Hello! I'm Computer Cat. What are you working on?\n\nThis is a sample reply from the local demo.";
    for (const word of answer.match(/\S+\s*/g) ?? []) {
      await setTimeout(28, undefined, { signal });
      onDelta(word);
    }
  }

  dispose(): void {}
}
