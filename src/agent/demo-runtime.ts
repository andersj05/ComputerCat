import { setTimeout } from "node:timers/promises";
import type { AgentRuntime } from "./runtime";

export class DemoRuntime implements AgentRuntime {
  async run(prompt: string, signal: AbortSignal, onDelta: (text: string) => void): Promise<void> {
    const answer = /screen|see|looking/i.test(prompt)
      ? "My screen tools aren't connected yet, so I can't see what's on your desktop. This is a local demo of our chat. Once screen context is added, you'll be able to choose what I can look at."
      : /plan|task|day/i.test(prompt)
        ? "Let's make a little room to breathe.\n\n1. Pick one thing you'd like to finish.\n2. Break it into a first step small enough to start now.\n3. Leave some space for a break. Even cats take naps.\n\nWhat are you working on today?\n\nThis is a sample reply in local demo mode. Connect a model for a conversation tailored to you."
        : /idea|think|explore/i.test(prompt)
          ? "A fresh pair of eyes, coming right up.\n\nTry telling me your idea in one sentence, who it's for, and the part you're unsure about. Sometimes saying it out loud is the first little breakthrough.\n\nThis is a sample reply in local demo mode. Connect a model to explore your idea together."
          : /do|help|can|ready/i.test(prompt)
            ? "I can keep you company, try a sample chat, and hang out on your desktop. Visit My cat to choose my size, turn my little bounce on or off, and decide whether I stay above other windows.\n\nConnect a model for real conversations. Screen context and computer actions aren't connected yet."
            : "Hey, friend. I'm Computer Cat. A little company for your desktop, and a friendly place to start.\n\nAsk a question, bring an idea, or let me keep you company while you work. You can click Desktop mode to tuck this window away. I'll be right there.\n\nYou're trying a local demo: no model is connected and no API calls are being made.";
    for (const word of answer.match(/\S+\s*/g) ?? []) {
      await setTimeout(28, undefined, { signal });
      onDelta(word);
    }
  }

  dispose(): void {}
}
