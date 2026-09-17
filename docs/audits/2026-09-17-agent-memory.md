# Agent memory audit, 2026-09-17

Scope: repository instructions, project knowledge, task continuity, client entry points, and
the separation between developer memory and Computer Cat's runtime state. Application baseline:
`f977044` on `dev`, refreshed against origin at audit start. This is not a general security audit
or proof that every third-party agent honors instructions.

## Findings and corrections

| Finding | Evidence at baseline | Correction |
| --- | --- | --- |
| Project rules existed, but there was no durable memory index or resume procedure | Root AGENTS.md only linked three introductory documents | [Startup and maintenance instructions](../../AGENTS.md), [memory guide](../memory/README.md) |
| Capabilities and proposals were spread across documents | Architecture says sessions are transient; research proposes future restoration and tools | [Evidence-linked current state](../memory/current-state.md); research explicitly labeled historical proposals |
| Reasons and recurring environment lessons were easy to lose between sessions | Pi isolation, XP design, and Windows authentication guidance existed in separate places | [Decision record](../memory/decisions.md), [pitfalls](../memory/gotchas.md) |
| Other coding clients had no native entry points | No CLAUDE.md, GEMINI.md, or Copilot instructions | Thin adapters pointing to the same root instructions |
| No check detected broken memory routing or documentation drift | Verification covered code, tests, and build only | [Offline memory check](../../scripts/check-memory.mjs) in npm run verify and existing CI |
| No task-scoped transfer or shared-memory update convention | No handoff records or maintenance process | [Handoff protocol and template](../memory/handoffs/README.md), contributor and PR guidance |
| Application memory could be confused with developer context | Pi explicitly uses SessionManager.inMemory and an empty resource loader | Boundary retained and documented; regression checks exercise discovered-file isolation and fresh sessions |

The existing application persistence design is internally consistent: preferences persist,
conversations do not. Cross-session user memory remains an unimplemented product capability;
adding a developer knowledge directory does not implement it. Its future requirements are
listed in the [current-state snapshot](../memory/current-state.md).

## Design assessment

A small Git-backed knowledge base fits this repository: portable text, targeted retrieval,
reviewed updates, evidence, and branch-local handoffs. It avoids requiring a service or private
agent memory store. Required guidance belongs in checked-in files, consistent with
[OpenAI's memory guidance](https://learn.chatgpt.com/docs/customization/memories).
Client loading references are recorded in the [memory guide](../memory/README.md).

The startup path is bounded; deeper topics load when relevant. Memory cannot grant permissions
or override current user instructions. No personal memory store, global agent setting,
credential configuration, production dependency, or application persistence behavior is changed.

## Verification and limits

Validated on Windows with Node 24.12.0 and npm 11.6.2, in the feature working tree based on
the application baseline above:

- `npm.cmd run verify`: passed memory checks across 18 Markdown files, lint, TypeScript,
  all 22 offline unit/integration tests, and the production build. Nine checker tests cover
  broken links, missing entry points, native import routing, path escapes, command drift,
  size limits, private-note exclusion, and operation without Git or installed dependencies.
- Pi tests prove that planted developer instruction/memory files do not reach the model,
  that context is retained within a runtime, and that a replacement runtime starts fresh.
- `npm.cmd run test:smoke`: all four Electron tests passed against the built application,
  including preference persistence without chat persistence, options failure/retry, and the
  unavailable-model path. This did not build or test a new installer.
- `git diff --check`: passed. Scratch and personal Claude files match their ignore rules.
  Application source and dependency versions are unchanged.

The first sandboxed verification attempt passed lint and TypeScript, but esbuild could not
read a parent directory while loading Vitest's configuration. The same verification completed
successfully in the approved host context; no dependency, credential, or application permission
change was used to work around it. The [pitfall record](../memory/gotchas.md) preserves this lesson.

The structural checker does not prove factual freshness, resolve external URLs, validate heading
fragments, or test model adherence. Native Claude, Gemini, and Copilot sessions were not launched;
their entry-point syntax was checked against official documentation and by the local checker.
No live paid agent sessions are run. Team review remains
responsible for evidence quality and updating memory when behavior changes. Git is the sharing
mechanism: uncommitted notes do not automatically propagate to other worktrees or machines.
