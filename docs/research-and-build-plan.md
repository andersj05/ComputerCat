# Computer Cat: research and proposed build plan

Research date: September 16, 2026. Assumption: Windows is the first target, with other operating systems possible later. This is an architecture recommendation based on official documentation, source files, and release notes. No framework or desktop driver was installed or benchmarked during this research.

Build Computer Cat as its own Electron/TypeScript application, embed Pi through its supported SDK, and initially connect Cua Driver through a small MCP client bridge. Keep the desktop driver replaceable and test Windows-MCP as the fallback. Own the cat interface, screen-context selection, permissions, memory, and integration modules. Consume upstream packages without maintaining a product fork.

This recommendation optimizes for a distinctive desktop companion, control over its behavior, and manageable upstream upgrades. It is not a claim that Pi has the highest computer-use success rate: that depends heavily on the model, tools, observations, and target applications.

The basic pieces have different jobs:

| Piece | Job | Proposed choice |
| --- | --- | --- |
| Desktop application | Cat animation, chat, tray, shortcuts, settings | Electron + TypeScript; React for chat/settings |
| Model | Understand requests and decide actions | A vision-capable model with tool calling; compare providers on our tasks |
| Agent harness | Run the model/tool loop and manage conversations | Pi coding-agent SDK behind a small adapter |
| Computer tools | Inspect windows, capture images, interact with controls | Cua Driver first; Windows-MCP fallback |
| Integrations | Reach service APIs and external tools | MCP client plus direct API adapters |
| Product behavior | Context rules, memory, consent, stopping, progress | Computer Cat-owned modules |

## Why Pi is the preferred starting point

Pi exposes an embeddable SDK, custom tools, system-prompt overrides, session management, and event subscriptions. Its lower-level agent-core package is another option, but starting with the full coding-agent SDK avoids rebuilding conversation infrastructure. The SDK can disable built-in coding tools while retaining custom tools. [Versioned Pi SDK documentation](https://github.com/earendil-works/pi/blob/v0.85.1/packages/coding-agent/docs/sdk.md)

Pi's extensions provide hooks for context and behavior. Its model layer supports multiple providers and text/image tool results, which is useful for returning desktop screenshots to the agent. These are the relevant extension points for Computer Cat. [Extensions](https://github.com/earendil-works/pi/blob/main/packages/coding-agent/docs/extensions.md), [pi-ai documentation](https://github.com/earendil-works/pi/blob/v0.85.1/packages/ai/README.md)

There are real gaps: Pi intentionally does not ship native MCP integration or a built-in permission system. Computer Cat must supply the MCP bridge and enforce its own tool permissions. That is part of the proposed work, not something Pi automatically solves. [Pi project overview](https://pi.dev/), [repository permissions statement](https://github.com/earendil-works/pi#permissions--containerization)

Current naming matters: the original `badlogic/pi-mono` repository redirects to `earendil-works/pi`. Current documentation uses `@earendil-works/pi-coding-agent`, `@earendil-works/pi-agent-core`, and `@earendil-works/pi-ai`. Older guides commonly use `@mariozechner/*`. The project is MIT-licensed. [Official repository](https://github.com/earendil-works/pi)

## Alternatives considered

The judgments below are about fit for this project, not universal rankings.

| Option | Documented strengths | Assessment for Computer Cat |
| --- | --- | --- |
| Pi SDK | Embedded runtime and extensive customization | Preferred foundation when we own the product behavior and interface. MCP and permissions require our integration work. |
| OpenCode server + SDK | Typed client/server API, local/remote MCP, configurable tool approvals | Closest alternative. Attractive if reducing connector plumbing matters more than having a small embedded harness. We would operate its coding-oriented server and configuration model. |
| Claude Agent SDK | Agent loop, context management, sessions, hooks, MCP, permissions | Strong choice for a Claude-centered product. Less aligned with a provider-flexible foundation. Its documentation directs third-party products to API-key authentication unless separately approved. |
| Codex App Server | Product embedding with authentication, history, approvals, streaming events | Strong choice if the product should specifically embed Codex. Keep as an alternative backend if that becomes the priority. |
| OpenAI Agents SDK | Application-owned agent loop, tools, MCP, state integration and handoffs | Credible runner-up for a custom agent application. More of the companion's conversation/product conventions would be ours to assemble. This is distinct from OpenAI's hosted Agents API. |
| OpenClaw | Personal assistant gateway, channels, plugins, state and memory | Better if the goal becomes a cat interface for an existing OpenClaw assistant. For the current scope, taking on its wider gateway/channel architecture adds product surface we do not yet need. |
| Microsoft UFO / Galaxy | Windows-native automation and hybrid GUI/API actions; multi-device orchestration | Useful reference and potential specialist executor. More infrastructure than this first single-computer companion needs. |

Sources: [OpenCode SDK](https://opencode.ai/docs/sdk/), [server](https://opencode.ai/docs/server/), [MCP](https://opencode.ai/docs/mcp-servers/), [permissions](https://opencode.ai/docs/permissions/); [Claude Agent SDK](https://code.claude.com/docs/en/agent-sdk/overview); [Codex App Server](https://learn.chatgpt.com/docs/app-server); [OpenAI Agents SDK](https://developers.openai.com/api/docs/guides/agents/sdk), [runtime comparison](https://developers.openai.com/api/docs/guides/agents); [OpenClaw README](https://github.com/openclaw/openclaw); [Microsoft UFO](https://github.com/microsoft/UFO).

## How we keep updates without losing customization

Treat Pi as a versioned dependency. Keep its imports inside an `agent-runtime` module with an interface such as start, send message, cancel, subscribe to events, and restore session. Keep our context capture and tools independent of Pi's internal types wherever practical.

The upgrade process should be:

1. Pin exact tested package and desktop-driver versions and commit lockfiles.
2. Have dependency tooling propose an upgrade in a pull request.
3. Read release notes and run our integration and desktop task checks.
4. Make small adapter changes if necessary, then release a new Computer Cat version.
5. Retain a rollback path for both application binaries and changed session/storage formats.

Core fixes and provider improvements become available through dependency upgrades. New terminal UI features do not automatically appear in our cat UI; we choose whether to implement an equivalent. New SDK features may require wiring. This is ongoing maintenance, but usually avoids the repeated source merges of a heavily modified fork.

There is concrete evidence for testing upgrades: the release page currently lists Pi v0.85.1, released September 5, with an SDK import fix for v0.85.0. Earlier listed releases include breaking API/event changes. The v0.85.1 notes also distinguish supported local SDK/stdio RPC surfaces from experimental source-only server/client APIs. Use the supported SDK and version-matched documentation. [Pi releases](https://github.com/earendil-works/pi/releases)

If a necessary feature eventually requires an upstream change, first try an extension, contribute a patch, or maintain a small documented temporary patch. A full product fork should be a later decision supported by a concrete limitation. No maintainer or library can guarantee future updates or backward compatibility.

## Computer use needs its own design

Cua Driver is the first driver I would test. Its documentation lists Windows UI Automation, Win32/native input, screenshots, browser routes, and conditional background operation. It exposes MCP and typed SDK integrations, allowing us to reuse a driver rather than write OS automation ourselves. [Cua platform support](https://cua.ai/docs/reference/cua-driver/platform-support), [integration surfaces](https://github.com/trycua/cua/blob/main/libs/cua-driver/README.md)

These are documented capabilities, not measurements from this PC. Windows app/toolkit support and background behavior have explicit limits. A working background click in one app does not prove that typing, scrolling, or dragging works in every app. The Windows browser routes require an interactive desktop. [Cua known limits](https://cua.ai/docs/reference/cua-driver/limits)

Windows-MCP is the comparison/fallback candidate. It documents screenshots, desktop snapshots with interactive elements, multi-display information, input controls, and browser extraction. It requires Python 3.13+ and is MIT-licensed. Its broader tools include PowerShell, filesystem, process, and registry operations; only expose the subset Computer Cat needs. [Windows-MCP](https://github.com/CursorTouch/Windows-MCP)

Cua's repository is MIT-licensed. Its installer has stable/nightly channels and documents default content-free telemetry. Review the exact shipped component's configuration and disable optional telemetry for our initial build. Do not silently let a bundled driver upgrade independently of our tested app release. [Cua license](https://github.com/trycua/cua/blob/main/LICENSE.md), [installation and update behavior](https://cua.ai/docs/how-to-guides/driver/install)

My proposed action strategy is to use the most direct reliable route available: service APIs for structured service work, browser tools for web interactions, native accessibility controls for desktop widgets, and screenshot-based coordinates for visual surfaces without useful structure. Do not force every task through pixel clicking.

Cua already exposes browser routes. Start there; add Playwright only when our browser tasks demonstrate a need. Playwright MCP is another reusable browser tool server, not a replacement for native desktop control. [Playwright MCP](https://github.com/microsoft/playwright-mcp)

The agent should observe, act, and verify the result. An input call returning successfully does not establish that the intended application changed. Refresh stale observations, bind actions to the intended window, cap retries, and stop or yield when the user takes over the desktop. Keep physical mouse/keyboard actions serialized.

Provider-native computer-use APIs and ordinary function/MCP tools are separate integration paths. Start with image-capable function tools through Pi; test specialized provider paths if they improve results enough to justify another adapter. OpenAI explicitly documents using existing function/MCP UI tools as well as its computer tool and code-execution approaches. [OpenAI computer-use guide](https://developers.openai.com/api/docs/guides/tools-computer-use)

## What “use anything on your screen for context” should mean

Provide a hotkey and cat action for inspecting the active window, a selected region, or a chosen display. Combine a screenshot with relevant UI text and window identity. Offer an explicit live-context mode later, with a visible indicator and app exclusions.

For the first version, capture on request and during an active task. Later, use local change detection and a bounded recent context buffer so the cat can follow work without sending a full screenshot to a model continuously. Store deliberate user preferences and task summaries separately from transient screen observations; do not equate conversation history with useful long-term memory.

Local software can still call cloud models. Any images/text included in those requests leave the machine for the chosen provider. Screen coverage is also bounded by OS/app restrictions; the product should handle unavailable or protected surfaces honestly. “All normal supported apps” is a testable goal; universal access to every possible screen is not.

## The application we would own

Electron has transparent/frameless windows and mouse-event controls suitable for the floating cat. Transparency alone does not make the empty area click-through; that behavior needs explicit implementation. Keep a small cat window separate from the chat/settings window. Electron is my implementation preference because the application and Pi can share TypeScript/Node tooling; it carries a memory footprint tradeoff that we should measure for an always-running companion. [Electron window styles](https://www.electronjs.org/docs/latest/tutorial/custom-window-styles), [BrowserWindow API](https://www.electronjs.org/docs/latest/api/browser-window)

Proposed module boundaries:

```text
Computer Cat desktop UI
  | messages, progress, approvals, stop
Application controller
  |-- Agent runtime adapter -> supported Pi SDK -> selected model provider
  |-- Context service -> scoped screen/window observations
  |-- Tool broker -> permissions, cancellation, activity records
  |     |-- Cua Driver over local MCP
  |     |-- Service MCP connections / direct API adapters
  |     `-- Optional browser or Windows-MCP adapter
  `-- Local settings, session storage, and explicit memory
```

Run the agent and desktop helper outside the renderer, with narrow validated messages between the UI and privileged code. A helper process is useful for cancellation and crash recovery; it is not automatically a security sandbox.

Use the official MCP client SDK for the bridge rather than inventing a tool protocol. Preserve image results, validate tool arguments, manage helper startup/shutdown, and propagate cancellation/errors. Add servers deliberately and load only task-relevant tools. API integrations still need their own credentials and scopes; MCP does not grant access to services by itself. [Official TypeScript MCP SDK](https://github.com/modelcontextprotocol/typescript-sdk), [local MCP servers](https://modelcontextprotocol.io/docs/2026-07-28/develop/connect-local-servers)

Computer Cat should own the permission decisions: allow ordinary actions within a user-authorized task, ask at consequential boundaries, provide a reliable stop hotkey, and show the target of screen observation/control. Enforce these decisions in the tool broker rather than relying only on model instructions. Keep credentials in OS-backed storage and avoid loading arbitrary Pi extensions or project instructions discovered on the user's disk.

## Build order and decision gates

1. **Prove the loop.** Connect a pinned Pi SDK to one model and one desktop driver. Demonstrate a screenshot returning as an image, an inspected UI element, one action, verified output, cancellation, and session restoration. This is the first gate before investing in elaborate art or infrastructure.
2. **Run representative Windows tasks.** Use Calculator, Notepad/save dialogs, File Explorer in a test folder, Chrome/Edge forms, and at least one app the user actually relies on. Exercise window movement, multiple displays, scaling, missing accessibility information, and user interruption. Compare Cua with Windows-MCP where a failure warrants it.
3. **Add the companion shell.** Draggable cat, idle/working/waiting states, chat bubble, tray, hotkey, inspect-screen action, and stop. Keep animation local so idle time does not require model calls.
4. **Make useful workflows repeatable.** Add scoped context, task progress, recovery, approved app actions, and one external service integration. Record whether the requested outcome happened, how long it took, model cost, and how much user help was needed.
5. **Prepare for daily use.** Installer, credential setup, session/memory controls, release upgrades/rollback, crash handling, and idle resource measurement. Add voice, proactive suggestions, and broader integrations after the core workflow is reliable.

Suggested initial evaluation: about 15–20 repeatable tasks, each run multiple times. A proposed early target is at least 90% completion on the deliberately limited supported task set, with all stop/permission tests passing. This is a target, not an achieved result or a claim of general desktop competence. If a driver fails our required apps, replace it through the adapter. If Pi integration costs become disproportionate, evaluate the same tools/tasks through OpenCode or the OpenAI Agents SDK before expanding the product.

The first useful product goal is concrete: click the cat, ask it about the current window, then ask it to complete a small action and see it verify completion. That validates the defining experience while leaving room to grow.

Cost should be measured per completed task. Screenshots, long context, retries, provider pricing, and continuous observation all affect it. Start with user-supplied API credentials and a configurable usage budget for development; choose a distribution/billing model later. This research does not assume an existing chat subscription can fund a separately distributed application.
