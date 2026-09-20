# Resuming unfinished work

Use a handoff when a task pauses, changes owner, or needs a context reset with meaningful work
remaining. Completed work does not need a handoff. Durable lessons belong in the
[memory guide's topic documents](../README.md).

Copy [TEMPLATE.md](TEMPLATE.md) to a uniquely named file such as
`YYYY-MM-DD-feature-topic.md` in this directory. Use the real date and task topic. Each task
owns its own file; never use a single shared CURRENT.md or append everyone's work to one log.

Record the objective, actual branch and baseline commit, files changed, evidence gathered,
verification commands with outcomes, uncertainties, and the next concrete action. Identify
uncommitted changes explicitly. Include any relevant user constraints, without private chat
quotes or secrets. Do not claim a pass for an unrun check or treat an old authorization as a
new grant of access. The template is a checklist, not a file to fill with placeholders and commit.

The receiving agent reads root [AGENTS.md](../../../AGENTS.md), compares the handoff to the
actual checkout, and resumes only the intended scope. A committed handoff travels with its
branch; uncommitted notes require explicit transfer. Concurrent agents report to the task
owner, who reconciles conflicting observations and integrates durable changes.

Before finishing, promote useful facts into their topic documents and remove the resolved
handoff in the same change. Git preserves its history. Search this directory for a named task;
do not infer all current work from the files present in one branch.

## Release qualification

- [Local Whisper speech input](2026-09-17-local-whisper.md): Windows CPU implementation and automated tests
  are complete on `feat/local-whisper-input`; microphone/clean-machine release qualification remains.

## Evaluation baseline

- [First local Luna run](2026-09-20-luna-live-evaluations.md): runner and offline checks are complete;
  the first live measurement needs the app connection restored.
