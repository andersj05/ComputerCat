# Working on Computer Cat

Read README.md, CONTRIBUTING.md, and docs/architecture.md before changing application code.

- Branches flow `feat/<name>` -> `dev` -> `main`. Start new features from `dev`.
- Make small, descriptive commits as work becomes coherent. Never commit secrets or build outputs.
- Keep renderer code free of Node, credentials, and direct OS access. Use the typed preload bridge.
- Keep Pi-specific code in `src/agent/`. The renderer must not import the SDK.
- No implicit desktop access, shell tools, arbitrary extension discovery, or paid model calls in tests.
- Validate every IPC request at the privileged boundary. Do not expose generic IPC to the renderer.
- Test behavior at boundaries: cancellation, invalid requests, provider errors, and runtime isolation.
- Run `npm run verify` before opening a pull request, and `npm run test:smoke` for desktop changes.
- Keep dependency versions and package-lock.json aligned. Review upstream changes before upgrading.

## GitHub authentication on this Windows machine

The Windows GitHub CLI account `andersj05` is stored in Windows Credential Manager. A sandboxed
network failure can look like invalid credentials. Verify a failed `gh` operation outside the
sandbox with the narrowest appropriate approval. Do not recommend logout/login unless that
outside-sandbox check confirms an authentication failure.

