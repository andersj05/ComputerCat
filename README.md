# Computer Cat

A Windows XP-inspired desktop companion built with Electron, React, TypeScript,
and the [Pi SDK](https://github.com/earendil-works/pi).

[![CI](https://github.com/andersj05/ComputerCat/actions/workflows/ci.yml/badge.svg)](https://github.com/andersj05/ComputerCat/actions/workflows/ci.yml)
[![CodeQL](https://github.com/andersj05/ComputerCat/actions/workflows/codeql.yml/badge.svg)](https://github.com/andersj05/ComputerCat/actions/workflows/codeql.yml)

## Run locally

Use Node **24.12.0** (see `.node-version`) and npm. Windows is the first supported desktop target.

```sh
npm ci
npm run dev
```

The first launch may download Electron. The app starts in **local demo mode**: sample replies,
no credentials, and no API calls. The supplied pixel artwork is in `assets/computer_cat.png`.

- Click the pixel cat to open chat, or drag the cat itself to move it. Its grip still works too.
- The buttons beneath the cat open Chat and Options; Stop appears during a reply.
- The cat blinks, breathes, and looks around, with a separate thinking pose. Animate cat and
  the system reduced-motion setting control motion.
- Always on top keeps the cat above ordinary windows without taking keyboard focus.
  Find cat in Options or the tray brings it to the display under your pointer.
- The compact XP messenger keeps the conversation and message box in one window.
- Starter links prepare an editable message. Press Enter or Send when it is ready.
- Options controls pet size, animation, and always-on-top behavior. Apply or OK saves changes
  locally; Cancel or Escape discards unapplied changes.
- Options → Models connects your Codex subscription and saves a default model and reasoning level.
- Desktop and the close button hide chat; the cat stays with you.
- `Ctrl+Shift+Space` brings chat back; `Ctrl+Shift+Escape` stops the current reply.
- Closing chat leaves the cat and tray running. Quit through Options → General or the tray menu.
- Conversations live only for the current app session. New conversation asks before clearing a chat or draft.

The initial foundation includes the companion UI and Pi conversation adapter. **Screen capture,
computer control, external MCP connections, and long-term memory are not implemented yet.**
Agents developing this repository share versioned [project memory](docs/memory/README.md).
That development context is separate from the app's conversation memory.

## Connect your Codex subscription

1. Open **Options → Models → Sign in with ChatGPT**. Finish on the OpenAI page in your browser.
   If the browser cannot return to the app, expand the fallback and paste its complete localhost
   callback URL. **Use a device code** is an alternative; your ChatGPT security settings may need
   device-code login enabled. Closing Options cancels an unfinished sign-in.
2. Choose **Codex subscription** under Connection, select a model and reasoning level, and click
   **Apply** or **OK**. Model choices come from the pinned Pi SDK catalogue. Your account and plan
   determine which models are available and the applicable usage limits.
3. If a conversation already has messages, choose **New conversation** to use the new default.
   Empty chats use it immediately. The default survives app restarts; conversation history does not.

Codex CLI installation and API keys are not required for this connection. Computer Cat uses
the Pi SDK's Codex OAuth integration and its own encrypted credential file in app user data.
It does not read, import, or change your global Codex/Pi login. Windows protects the saved tokens
through Electron safeStorage; insecure storage fails closed. Tokens never enter the renderer,
Git, or model preferences. Main refreshes expired credentials before replies.

**Disconnect** removes Computer Cat's saved credential and stops its Codex session. It leaves the
transcript visible; reconnect or select Local demo and start a new conversation to continue.
Stop any active reply before disconnecting. Disconnecting here does not sign you out of other
Codex apps or revoke your subscription. Local demo is always available without model requests.

If sign-in or a reply fails, check your connection, retry sign-in, or select another model and
start a new conversation. The app does not switch to a paid API connection automatically.
See [OpenAI's authentication documentation](https://learn.chatgpt.com/docs/auth).

## Use an API-key connection

For a separate API-key connection, copy `.env.example` to `.env.local`,
set `COMPUTERCAT_RUNTIME=pi`, and supply a Pi-supported provider ID, model ID, and its API key
through `COMPUTERCAT_PROVIDER`, `COMPUTERCAT_MODEL`, and `COMPUTERCAT_API_KEY`.
`npm run dev` loads `.env.local`. The file is ignored by Git. Never put a key in source, a Vite
`VITE_*` variable, a screenshot, or a GitHub issue.

Only the explicitly selected credential is passed to the Pi worker. Global Pi logins,
extensions, project instruction discovery, and built-in shell/file tools are not loaded.
The packaged app currently accepts the same process environment variables; a secure credential
settings UI for other providers is a future feature. If a saved model default already exists,
choose **Environment API key** in Options → Models and apply it. Model requests use the configured
provider and may incur its normal API charges. No live API requests are part of the test suite.

## Development commands

| Command | Purpose |
| --- | --- |
| `npm run dev` | Development app with hot reload |
| `npm run memory:check` | Offline checks for shared agent context and documentation links |
| `npm run verify` | Memory checks, lint, TypeScript, offline unit/integration tests, production build |
| `npm run test:smoke` | Build and exercise the actual Electron windows and worker |
| `npm run format` | Apply formatting and safe lint fixes |
| `npm run package:dir` | Build an unpacked desktop application |
| `npm run package:win` | Build an unsigned Windows NSIS installer |

The smoke tests open temporary Computer Cat windows and use a separate temporary user-data
directory. They check the renderer boundary, demo streaming/cancellation, and loading the real
Pi worker. Codex tests intercept OAuth and model traffic to verify sign-in, encrypted persistence,
refresh, model selection, streaming, and provider errors without live credentials or usage.
They never control other applications. Live account entitlement is verified only when you sign
in and send a message yourself.

## Project layout

```text
assets/           Original cat artwork
src/agent/        Pi adapter, demo runtime, worker and runtime contract
src/main/         Electron lifecycle, IPC boundary, conversation controller
src/preload/      Small typed bridge exposed to the renderer
src/renderer/     Cat, chat, preferences, and visual tokens
src/shared/       Serializable contracts and input validation
tests/unit/       Offline behavioral tests and real Pi SDK integration
tests/smoke/      Electron desktop and packaged-worker checks
scripts/          Repository automation
.github/          CI, CodeQL, Dependabot, release workflow, templates
docs/             Architecture, design, research, audits, and shared project memory
```

See [architecture](docs/architecture.md), [research](docs/research-and-build-plan.md), and
[contribution guidelines](CONTRIBUTING.md).
Coding agents start with [AGENTS.md](AGENTS.md) and the [current state](docs/memory/current-state.md).

## Git and releases

Changes follow **`feat/<name>` → `dev` → `main`** through pull requests. Commit small, coherent
changes frequently. Main is the stable branch; dev collects verified features. Dependabot PRs
target dev and are an explicit automation exception to the feature branch naming rule.

CI checks formatting, types, offline tests, builds, high-severity dependency advisories, branch
flow, and the packaged Windows app. CodeQL scans TypeScript. GitHub Actions are pinned by commit.
Dependency updates are proposed weekly; they do not install themselves into users' apps.

After a version change is merged into main, run **Draft Windows release** from GitHub Actions
on main. It re-runs checks, builds and tests the application, and creates a **draft** release.
The installer is currently unsigned; Windows may show a SmartScreen prompt. Code signing and
automatic application updates are intentionally not configured yet. A draft must be reviewed
before publishing. Reusing an existing version tag fails rather than overwriting a release.

Report vulnerabilities through [private reporting](SECURITY.md).
