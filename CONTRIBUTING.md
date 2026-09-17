# Contributing

Computer Cat uses one TypeScript application with explicit process and module boundaries.
See [the architecture](docs/architecture.md) before adding a feature.

## Branch workflow

| Branch | Purpose | Receives changes from |
| --- | --- | --- |
| `main` | Stable, releasable application | Pull requests from `dev` |
| `dev` | Integration branch | Pull requests from `feat/<name>` |
| `feat/<name>` | One bounded feature | Start from current `dev` |

```sh
git switch dev
git pull --ff-only
git switch -c feat/your-feature
```

Commit frequently in coherent pieces using prefixes such as `feat:`, `fix:`, `test:`,
`docs:`, `build:`, and `ci:`. Push the feature branch and open a pull request into `dev`.
Use merge commits when promoting `dev` into `main` to preserve shared ancestry.
Do not force-push shared branches. No direct pushes to `main` or `dev` after bootstrap.

## Verification

Use the Node version in `.node-version`, install with `npm ci`, and run `npm run verify`.
Desktop changes also require `npm run test:smoke`. Tests use a deterministic local adapter,
never real model credentials. Explain what changed and which behavior you verified in the PR.

## Dependencies and releases

Keep dependency versions exact. Upgrade through a feature PR after reading release notes.
The release workflow builds an unsigned Windows installer from `main` and creates a draft
GitHub release. Code signing and automatic client updates require a later release decision.
Never publish an installer that claims to be signed when it is not.

