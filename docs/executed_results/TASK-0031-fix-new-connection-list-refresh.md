# TASK-0031 - Fix new connection list refresh

Task ID: TASK-0031
Status: PASS

Summary:

Settings now validates and immediately selects the connection returned by a successful create request, so later saves update it without reloading the list.

Repository analysis:

- `POST /api/model-connections` returns the complete created model connection object directly.
- `SettingsView` already had the reusable `isSavedConnection` runtime guard and used the selector value as local create/update state.
- Existing Settings tests are source-level Node tests, so focused regression assertions follow that convention.

Files changed:

- `src/client/components/settings/SettingsView.ts`
- `src/client/components/settings/__tests__/SettingsView.test.ts`
- `docs/executed_tasks/TASK-0031-fix-new-connection-list-refresh.md`
- `docs/executed_results/TASK-0031-fix-new-connection-list-refresh.md`

Tests and verification:

- `powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\inspect-repo.ps1` passed.
- `npm run build` could not launch because local PowerShell policy blocked `npm.ps1`; the equivalent `npm.cmd run build` passed.
- `npm.cmd run build:client` passed.
- `npm.cmd run typecheck:client` passed.
- `npm.cmd run lint` passed, including the final rerun.
- `npm.cmd test` passed, including the final rerun: 173 tests passed, 0 failed.
- No LM Studio or external model connection was used.

Production code:

- Parses the successful POST response as `unknown` and validates it with `isSavedConnection`.
- Rejects malformed or non-JSON successful responses through the existing save-error state.
- Adds the returned connection to in-memory saved state and adds or updates its selector option.
- Selects the returned connection id, enables Delete, and updates the saved-connection count.
- Leaves form values and the existing success state intact.
- Does not issue an additional saved-connections GET request.
- Existing PUT and DELETE behavior remains unchanged.

Architecture:

- Client-only change; endpoints, server behavior, persistence, service, and repository layers were not changed.

Dependencies:

- No dependencies added or changed.

Deviations:

- The required npm scripts were invoked through `npm.cmd` because this machine's PowerShell execution policy blocks the `npm.ps1` launcher.

Risks / findings:

- The focused Settings suite uses source inspection rather than a browser DOM harness, consistent with the existing test design.
- The repository is largely untracked in Git, so final review used direct reads of the changed files because `git diff` could not display untracked file changes.

Diff summary:

- One focused client behavior fix.
- Four focused Settings regression tests covering created-list state, selection/PUT transition, no redundant GET, and malformed POST responses.
- Active task and result tracking records added.
