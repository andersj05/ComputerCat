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

- Talk starts voice; Chat opens a compact conversation panel above the cat. Its input shows one
  microphone, send or stop icon as needed. Enter sends; Shift+Enter adds a line. The ⋯ menu holds
  History, Copy reply, model selection, voice settings and Open chat window. New chat stays in the caption.
  Controls below the cat hide while the panel is open. Drag the cat's body to move it.
- Drag the panel's top-left grip, top edge or left edge to resize it while the cat stays anchored.
  Focus the grip and use arrow keys (Shift for larger steps) to resize with the keyboard.
  The panel remembers its size when reopened during the same app run; Expand toggles preset sizes.
- The panel prioritizes conversation text, with tool activity collapsed into an expandable status
  line. Scrolling up holds your place and Latest reply returns
  to new output. Click the cat for its model shortcut when the panel is closed.
- Assistant replies display Markdown, including bold text, lists, code blocks, and tables.
- The cat listens, thinks, takes notes, taps a tiny keyboard, and animates its face while
  text replies arrive. A happy flourish marks a finished reply. Try all eleven activity poses
  in Options → Desktop cat. Animate cat and system reduced motion control movement while
  keeping the activity readable. Replying is a text animation; speech audio is not implemented.
- Always on top keeps the cat above ordinary windows without taking keyboard focus.
  Find cat in Options or the tray brings it to the display under your pointer.
- The compact XP messenger keeps the conversation and message box in one window.
- Starter links prepare an editable message. Press Enter or Send when it is ready.
- Options controls pet size, animation, and always-on-top behavior. Apply or OK saves changes
  locally; Cancel or Escape discards unapplied changes.
- Options → Models connects your Codex subscription and saves a default model and reasoning level.
- Options → Harness guide opens an offline, themed browser guide with an interactive map,
  tool catalog and [guidance for extending the harness](docs/harness-guide.md).
- Desktop and the close button hide chat; the cat stays with you.
- `Ctrl+Shift+Space` brings chat back; `Ctrl+Shift+Escape` stops the current reply.
  `Ctrl+Alt+Space` opens Talk at the cat; press it again to finish recording.
  The tray has the same Talk / Finish action. A Reply ready button reopens a completed answer.
- Closing chat leaves the cat and tray running. Quit through Options → General or the tray menu.
- Conversations save automatically on this computer. **History** lets you find, reopen, or delete them.
- **New conversation** keeps the old chat in History; it only asks before discarding an unsent draft.
- The model and reasoning selectors above chat apply to your next reply without clearing the chat.
  The model button beneath the desktop cat opens the same controls; **Models & sign-in** opens Options.
  **This chat** changes the current conversation. Options shows defaults separately and can copy
  the current chat's settings into them. **Set up voice** opens the Voice tab before recording;
  enabled voice keeps a **Voice options** link beside Talk.

The companion includes on-demand screen context, everyday desktop utilities and public web reading for connected models. **Mouse/keyboard control,
external MCP connections, and long-term user memory are not implemented yet.**
Local Whisper speech input is available on Windows x64; see setup below and the
[implementation evidence and limitations](docs/implementation/whisper/native-evidence.md).
Agents developing this repository share versioned [project memory](docs/memory/README.md).
That development context is separate from the app's conversation memory.

## Public web research

Ask the cat to search a topic or an account already visible on your screen, or give it a public
URL to read with sources. Search needs no API key: it tries keyless DuckDuckGo, then opens a
Google search in your default browser when direct search is blocked. The cat must observe the
results before answering; browser challenges still require your interaction. It can search
within the extracted text and continue reading longer pages from the same snapshot. Reading
needs no search key. The cat can compare up to three sources, follow discovered links, inspect
page metadata and headings, and read public RSS/Atom feeds. Static reading supports HTML, plain
text, Markdown and JSON. It does not use browser sign-ins, run page scripts, read PDFs or access
private networks.

For an optional Brave Search connection (tried before keyless search), set
`COMPUTERCAT_BRAVE_SEARCH_API_KEY` in `.env.local` and restart `npm run dev`. For a packaged build, supply it in the app's launch environment.
This is a separate Brave Search credential, with the provider's own account and usage terms;
it is not included in a model subscription. No settings screen for this key exists yet.
The key stays in the main process. Retrieved page text and search results reach your selected
model and saved chat context. The cat should cite returned URLs and report missing or truncated
content. Click a citation to open it in your browser; a failed launch offers retry without leaving
chat. See [web scope and limits](docs/web-research.md).

## Everyday desktop help

Ask the cat to open Downloads, show a file it found in its folder, open a web link, summarize
text you copied, copy an answer for pasting, or search in your browser. Seven dedicated tools
handle current time and standard folders, plain-text clipboard reads/writes, and browser/file-manager launches.
Clipboard text is limited to 8,000 characters; a read reports truncation. Clipboard content
reaches your selected model and saved chat context. Copying replaces the clipboard; it does
not paste into another app. Opening a link does not search the web or read the page.

These tools run during your request. Stop, lock and sleep block pending work, but cannot undo
an action already sent to the OS. The cat must inspect the resulting window before claiming
the page or folder appeared. See the [harness research and next steps](docs/harness-improvements.md).

## Help with your screen

Ask a connected model “What is this page?”, “What does this error mean?” or “Summarize the
text I selected.” You can type or use Talk. The agent chooses desktop tools automatically;
there is no Share screen button. It can identify the current app, combine a screenshot with
accessible text, inspect named windows, and read exposed browser tabs and selected text.
Focused text tools avoid collecting the full page; region screenshots let it inspect small
text or diagrams more closely without sending the whole window again.
The cat can also find a phrase in exposed app text, list visible buttons and fields with their
enabled states, and read document titles and page addresses where the app exposes them.
Try “Find the error mentioning timeout,” “What buttons are available?” or “What's this page's
address?” These tools do not click controls, scroll, or read hidden tabs; incomplete results
are identified as such.
When the cat or chat has focus, the app behind it is used as a starting point.

Observations happen on tool calls during your request, not in a background screen feed.
**Stop** cancels the reply and pending observations. Windows lock/sleep blocks observation;
tools are available again after unlock/resume. Screenshots need an image-capable model;
text-only models receive accessible text, and the local demo never reads the desktop.
Captured content goes to the selected model and remains in the chat's local model context,
including images, until that conversation is deleted.

Text and tab support depends on the application's Windows accessibility provider. The cat
does not have access to every browser tab's contents and cannot select text, click, or type
through these tools. See [desktop context](docs/desktop-context.md) for limits and verification.

## Local voice input (Windows x64)

1. Open **Options → Voice**, choose Turbo (multilingual, 1.51 GiB) or Base English (141 MiB),
   and click **Download model**. A small Silero speech detector is included. Download and
   Remove take effect immediately; downloads can be cancelled and restarted.
2. Check **Enable voice input**, choose English or automatic detection for Turbo, and Apply.
   Voice starts disabled. Installed weights prepare in the background when enabled and on startup;
   this never opens the microphone. Models stay ready while voice is enabled, including after
   cancelling a short recording. Microphone & performance can opt into unloading after five idle minutes.
3. Click **Talk** on the cat to open its speech bubble without opening chat. Wait for **Listening**,
   speak, then choose **Finish recording**. Provisional text updates during recording as local
   recognition completes. Recordings are limited to two minutes.
4. Edit the transcript and **Send message** (or Enter) in the bubble; the reply appears there too.
   Closing the bubble cancels recording and keeps an already reviewed draft for this app run.
   **Talk** in chat still places the transcript in its composer. Concurrent edits use **Insert**
   or **Discard**. Nothing is sent automatically.

**Cancel recording**, Escape, Stop, or hiding/minimizing the recording's window discards active recognition.
Conversation/model changes, Options, sleep, screen lock and quit also stop capture.
Audio and unsent transcripts remain in memory. Sent text follows normal chat retention.
Speech is transcribed on this computer; sending the text uses the selected connection.

Auto uses a CPU helper, selecting the AVX2 build when the CPU and Windows support it.
CUDA is not included in this build. Turbo can be slow on CPU; choose Base English for a
smaller, faster English option. Previews arrive in passes after at least four seconds of audio;
they may lag on slower CPUs and can change when you finish. A portable Turbo trial exceeded the two-minute transcription
limit; the selected model is never silently replaced. Real microphone accuracy, clean-machine
installation, and broader latency evaluation remain [release checks](docs/memory/handoffs/2026-09-17-local-whisper.md).

Developers need CMake and Visual Studio C++ Build Tools with the Windows SDK, then run
`npm run voice:build` once before using voice or packaging. The build verifies pinned source
archives and stages private executables; end users need no compiler, Python, FFmpeg, CUDA
kit or speech API key. `npm run voice:test-native` tests native framing and cancellation
without model downloads. Weights are explicitly installed through Options and are excluded
from source control and the installer.

## Connect your Codex subscription

1. Open **Options → Models → Sign in with ChatGPT**. Finish on the OpenAI page in your browser.
   If the browser cannot return to the app, expand the fallback and paste its complete localhost
   callback URL. **Use a device code** is an alternative; your ChatGPT security settings may need
   device-code login enabled. Closing Options cancels an unfinished sign-in.
2. Choose **Codex subscription** under Connection, select a model and reasoning level, and click
   **Apply** or **OK**. Model choices come from the pinned Pi SDK catalogue. Your account and plan
   determine which models are available and the applicable usage limits.
3. If a conversation already has messages, choose **New conversation** to use the new default.
   Empty chats use it immediately. To change a current chat, use the selector above the conversation.
   Defaults and saved conversations survive app restarts.

Codex CLI installation and API keys are not required for this connection. Computer Cat uses
the Pi SDK's Codex OAuth integration and its own encrypted credential file in app user data.
It does not read, import, or change your global Codex/Pi login. Windows protects the saved tokens
through Electron safeStorage; insecure storage fails closed. Tokens never enter the renderer,
Git, or model preferences. Main refreshes expired credentials before replies.

**Disconnect** removes Computer Cat's saved credential and stops its Codex session. It leaves the
transcript visible; reconnect and choose a model, or select Local demo directly above chat, to continue.
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
extensions and project instruction discovery are not loaded. All eight built-in Pi file/search
and shell tools are enabled, with the Desktop as the working folder. Tools run with your OS
permissions; PowerShell is available on Windows, and Bash needs an installed Bash executable.
Tool activity appears in chat. The find/grep helpers (fd and ripgrep) can download on first use
into Computer Cat’s own cache.
The packaged app currently accepts the same process environment variables; a secure credential
settings UI for other providers is a future feature. If a saved model default already exists,
choose **Environment API key** in Options → Models and apply it. Model requests use the configured
provider and may incur its normal API charges. No live API requests are part of the test suite.

## Saved conversations

Chat transcripts and native Pi tool context are stored as local plaintext in the app’s user-data
folder, separately from encrypted sign-in credentials. They remain until you delete them in History.
The most recently updated conversation opens at startup. Unreadable records are kept on disk and
reported; a save failure stays visible and blocks switching away from unsaved chat.
Deleting a conversation removes its transcript and Pi context, but does not undo files changed
by tools. Unsent drafts survive switching chats while the app is running; they are not saved on quit.
Chats from app versions that kept history only in memory cannot be recovered after that app exits.

## Development commands

| Command | Purpose |
| --- | --- |
| `npm run dev` | Development app with hot reload |
| `npm run memory:check` | Offline checks for shared agent context and documentation links |
| `npm run verify` | Memory checks, lint, TypeScript, offline unit/integration tests, production build |
| `npm run test:smoke` | Build and exercise the actual Electron windows and worker |
| `npm run format` | Apply formatting and safe lint fixes |
| `npm run voice:build` | Build and stage pinned Windows CPU speech helpers |
| `npm run voice:test-native` | Offline native protocol and cancellation tests |
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

## License

Computer Cat is licensed under the [MIT License](LICENSE).
