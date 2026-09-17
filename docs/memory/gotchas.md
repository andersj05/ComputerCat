# Known pitfalls

Keep reproducible lessons here. Each entry states its scope, evidence, and review date.
Remove obsolete remedies; keep transient environment failures in the relevant handoff.

## Windows sandbox identity and Git ownership

Reviewed: 2026-09-17. Scope: this Windows checkout under a separate sandbox account.

`git status` can report dubious ownership because the sandbox user differs from the repository
owner. First confirm the exact intended checkout and owner. Use a command-scoped exception
such as `git -c safe.directory=<verified-absolute-repository-path> status --short --branch`
for that checkout, or run the operation through the approved host context. Do not set
safe.directory to a wildcard or change global Git trust merely to inspect a repository.
Writes to Git metadata may need the host's normal approval mechanism.

Evidence: reproduced during the [memory audit](../audits/2026-09-17-agent-memory.md).

## GitHub sandbox network failures can resemble authentication failures

Reviewed: 2026-09-17. Scope: GitHub CLI on the project owner's Windows machine.

The existing account uses Windows Credential Manager. An offline sandbox failure does not
prove the token is invalid. Retry the relevant command outside the sandbox with the narrowest
appropriate approval before suggesting authentication changes. Never recommend logout/login
based only on a sandboxed result. Do not print tokens while diagnosing this.

Evidence: [project instructions](../../AGENTS.md); remote dev reference refreshed successfully
from the host during the audit. No authentication change was necessary.

## PowerShell may select npm.ps1

Reviewed: 2026-09-17. Scope: Windows command invocation.

If execution policy blocks npm.ps1, use `npm.cmd` for the same documented npm commands rather
than changing the user's execution policy. Node must match [.node-version](../../.node-version);
[.npmrc](../../.npmrc) enforces the package engine. Evidence: npm.cmd successfully reports the
installed npm version on the audit machine; [verification](../../CONTRIBUTING.md) is unchanged.

## Vitest configuration may fail before tests run in a restricted Windows sandbox

Reviewed: 2026-09-17. Scope: this checkout under the restricted Windows sandbox.

The baseline verification passed lint and types, then esbuild reported access denied reading
a parent directory while loading vitest.config.ts. This is a test-runner startup failure,
not a failed application test. Retry the same offline verification using the normal host
approval mechanism; do not weaken application isolation or edit dependencies to mask it.
Evidence: the [audit verification record](../audits/2026-09-17-agent-memory.md).

## Proposal documents and dependency defaults are not product capabilities

Reviewed: 2026-09-17. Scope: planning or upgrading the Pi integration.

The [research plan](../research-and-build-plan.md) includes future tools and session restoration.
Current code intentionally disables discovered resources and disk sessions. Read the
[capability map](current-state.md) and [adapter](../../src/agent/pi-runtime.ts), then run the
[isolation tests](../../tests/unit/pi-runtime.test.ts) when changing SDK integration.
Do not enable default filesystem discovery to make development memory available to the app.

## Independent checkouts have independent unfinished work

Reviewed: 2026-09-17. Scope: sessions, worktrees, and delegated development.

An uncommitted note in one worktree is absent from another. A handoff's listed branch/base may
also differ from the receiver's checkout. Transfer the intended commits or explicitly pass
the sanitized handoff; inspect Git before continuing. Never resolve that mismatch by resetting
someone else's changes. Evidence: [contribution workflow](../../CONTRIBUTING.md) and the
[handoff protocol](handoffs/README.md).
