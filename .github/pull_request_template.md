## Change

Describe the problem and resulting behavior.

## Verification

- [ ] `npm run verify`
- [ ] `npm run test:smoke` for desktop changes
- [ ] No credentials, personal data, or generated outputs included
- [ ] Shared project memory updated for changed capabilities/decisions, or no durable change

## Task reliability

For prompt, tool, context, recovery or model/SDK changes, follow [the evaluation workflow](../docs/task-evaluations.md).
Include baseline/candidate revision or source hash, model/reasoning, task IDs and attempts per task,
passed/planned counts, critical failures, regressions, and what the observations do not establish.
Keep private evidence and raw conversations out of the PR. If no live trials were run, state
`Live task reliability: not measured` and explain why. For other changes, mark this not applicable.

Note any relevant limitations or follow-up work.
The memory maintenance guide is in `docs/memory/README.md`.
