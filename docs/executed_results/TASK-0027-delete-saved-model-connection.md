# TASK-0027 - Delete saved model connection

Task ID: TASK-0027
Status: PASS

Summary:

Saved model connections can now be confirmed and deleted from Settings through a UserId-1-scoped DELETE endpoint, with in-place list removal and a complete New connection form reset.

Repository analysis:

- The existing flow is HTTP to `ModelConnectionService` to `ModelConnectionRepository` to SQLite.
- Settings already maintained an in-memory saved-connections list and had a complete New connection reset function.
- The repository already scoped reads and updates by connection ID and user ID, so deletion follows the same pattern.

Files changed:

- `src/server/repositories/model-connection-repository.ts`
- `src/server/services/model-connection-service.ts`
- `src/server.ts`
- `src/client/components/settings/SettingsView.ts`
- `src/client/components/settings/settings.css`
- `tests/unit/model-connection-persist.test.ts`
- `tests/unit/model-connection-service.test.ts`
- `tests/integration/model-connections-api.test.ts`
- `src/client/components/settings/__tests__/SettingsView.test.ts`
- `docs/executed_tasks/TASK-0027-delete-saved-model-connection.md`
- `docs/executed_results/TASK-0027-delete-saved-model-connection.md`

Tests and verification:

- `powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\inspect-repo.ps1` passed.
- `npm run build` was initially blocked before execution by the local PowerShell policy preventing `npm.ps1` from loading.
- `npm.cmd run build` passed.
- `npm.cmd run build:client` passed.
- `npm.cmd run typecheck:client` passed.
- `npm.cmd run lint` passed.
- `npm.cmd test` passed: 149 tests, 0 failures.
- Added deterministic repository tests for successful deletion, another-user protection, and unknown IDs.
- Added service coverage proving deletion is scoped to UserId 1.
- Added API coverage for success, unknown IDs, another-user protection, and invalid route IDs.
- Added Settings coverage for selected-ID requests, New connection availability, list removal, form reset, success state, and cancelled confirmation.

Production code:

- Added a parameterized repository `DELETE` scoped by `id` and `user_id`, returning a boolean deleted/not-found result.
- Added `ModelConnectionService.deleteConnection`, which supplies the fixed server UserId 1.
- Added `DELETE /api/model-connections/:id` with positive-integer validation, 204 success, 404 not found, and existing error response conventions.
- Added a Delete button that is disabled for New connection, uses `window.confirm`, sends no request body, removes the successful deletion from local UI state, and resets all form fields without reloading.

Architecture:

- Preserved HTTP to Service to Repository to SQLite dependency direction.
- No schema or migration changes were made.

Dependencies:

- No dependencies were added or changed.

Deviations:

- Required npm scripts were executed through `npm.cmd` because this machine's PowerShell execution policy blocks the `npm.ps1` shim.

Risks / findings:

- The repository's established Settings tests inspect component source rather than running a browser DOM; the new UI checks follow that existing convention.
- No unresolved acceptance risks were found.

Diff summary:

- Added one scoped repository operation, one service method, one DELETE route, one confirmed Settings action, minimal button styling, and focused tests.
- No chat functionality, credential persistence, schema changes, migrations, dependencies, or unrelated refactors were introduced.
