# Computer Cat

A little company. A little help. A desktop companion built with Electron, React, TypeScript,
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

- Click the full pixel cat to open chat. Drag its small handle to move it.
- The Windows XP workspace has three destinations: Chat, My cat, and Settings.
- Starter cards prepare an editable message. Press Enter or Send when it is ready.
- My cat controls pet size, idle animation, and always-on-top behavior. These preferences save locally.
- Desktop mode and the close button tuck chat away; the cat stays with you.
- `Ctrl+Shift+Space` brings chat back; `Ctrl+Shift+Escape` stops the current reply.
- Closing chat leaves the cat and tray running. Quit through Settings or the tray menu.
- Conversations live only for the current app session. New conversation asks before clearing a chat or draft.

The initial foundation includes the companion UI and Pi conversation adapter. **Screen capture,
computer control, external MCP connections, and long-term memory are not implemented yet.**

## Connect a model later

Credential setup is deliberately deferred. When ready, copy `.env.example` to `.env.local`,
set `COMPUTERCAT_RUNTIME=pi`, and supply a Pi-supported provider ID, model ID, and its API key
through `COMPUTERCAT_PROVIDER`, `COMPUTERCAT_MODEL`, and `COMPUTERCAT_API_KEY`.
`npm run dev` loads `.env.local`. The file is ignored by Git. Never put a key in source, a Vite
`VITE_*` variable, a screenshot, or a GitHub issue.

Only the explicitly selected credential is passed to the Pi worker. Global Pi logins,
extensions, project instruction discovery, and built-in shell/file tools are not loaded.
The packaged app currently accepts the same process environment variables; a secure credential
settings UI is a future feature. Model requests use the configured provider and may incur its
normal API charges. No live API requests are part of the test suite.

## Development commands

| Command | Purpose |
| --- | --- |
| `npm run dev` | Development app with hot reload |
| `npm run verify` | Lint, TypeScript, offline unit/integration tests, production build |
| `npm run test:smoke` | Build and exercise the actual Electron windows and worker |
| `npm run format` | Apply formatting and safe lint fixes |
| `npm run package:dir` | Build an unpacked desktop application |
| `npm run package:win` | Build an unsigned Windows NSIS installer |

The smoke tests open temporary Computer Cat windows and use a separate temporary user-data
directory. They check the renderer boundary, demo streaming/cancellation, and loading the real
Pi worker with an intentionally nonexistent provider. They never control other applications.

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
docs/             Architecture and research
```

See [architecture](docs/architecture.md), [research](docs/research-and-build-plan.md), and
[contribution guidelines](CONTRIBUTING.md).

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
