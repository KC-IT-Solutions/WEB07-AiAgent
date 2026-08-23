# TASK-0026 — Update selected model connection

Task ID: TASK-0026
Status: PASS

Summary:

An existing saved model connection can now be updated from Settings. When a saved
connection is selected, Save calls `PUT /api/model-connections/:id` and updates the
same row; when "New connection" is selected, Save still calls `POST /api/model-connections`.
UserId 1 remains enforced server-side, `created_at` is preserved, `updated_at` changes,
JSON connection data is updated, and the API key remains unpersisted.

Repository analysis:

- Ran `scripts/inspect-repo.ps1` for discovery (no recursive listing commands used).
- Read `AGENTS.md`, `docs/IGNORE.md`, `docs/CODINGSTANDARDS.md`, `docs/DEFINITION_OF_DONE.md`,
  `docs/TASK_WORKFLOW.md`, `docs/ARCHITECTURE.md`, `docs/DATABASE.md`, `docs/TESTING.md`,
  `docs/SECURITY.md`.
- Inspected: `src/server.ts` (HTTP routes for model connections),
  `src/server/model-connection-types.ts` (domain types),
  `src/server/repositories/model-connection-repository.ts` (persistence),
  `src/server/services/model-connection-service.ts` (service boundary enforcing USER_ID 1),
  `src/server/database.ts` and `src/server/migrations.ts` (hybrid schema: id, user_id,
  created_at, updated_at, data JSON),
  `src/client/components/settings/SettingsView.ts` (Settings UI) and its static test file,
  `tests/unit/model-connection-persist.test.ts`, `tests/unit/model-connection-service.test.ts`,
  `tests/integration/model-connections-api.test.ts`.
- No schema change was required; the existing hybrid table supports the update in place.
- No migration was added.

Files changed:

- `src/server/repositories/model-connection-repository.ts` — added `update(userId, id, input)`
  using parameterized SQL; updates `data` JSON and `updated_at` where `id` AND `user_id` match;
  preserves `created_at`; returns the updated connection or `null`.
- `src/server/services/model-connection-service.ts` — added `updateConnection(id, input)`
  enforcing `SERVER_USER_ID = 1`.
- `src/server.ts` — added `PUT /api/model-connections/:id`; validates route id, name, baseUrl,
  timeoutMinutes, modelId, enabled; does not accept userId or apiKey; 404 when the connection
  does not exist for UserId 1; 200 with the updated connection otherwise.
- `src/client/components/settings/SettingsView.ts` — Save now branches on the saved-connections
  selector: selected saved connection → `PUT /api/model-connections/:id`; "New connection" →
  `POST /api/model-connections`. After a successful update the visible selector label and the
  in-memory saved connection entry are updated and a success state is shown.
- `tests/unit/model-connection-persist.test.ts` — new repository update tests (update for UserId 1,
  JSON data updated, created_at preserved, updated_at changes, cross-user update blocked,
  not-found update, no duplicate row).
- `tests/unit/model-connection-service.test.ts` — new service update tests (update scoped to UserId 1,
  cross-user blocked, created_at preserved, updated_at changes, no apiKey persisted).
- `tests/integration/model-connections-api.test.ts` — new `PUT /api/model-connections/:id` suite
  (updates existing connection, updated_at changes, no duplicate created, 404 unknown id,
  404 another user's id via direct DB insert, userId cannot be overridden, apiKey not accepted
  or persisted, 400 invalid id / missing name / missing baseUrl).
- `src/client/components/settings/__tests__/SettingsView.test.ts` — new static tests (Save uses PUT
  for a selected saved connection, still POST for New connection, visible label/data updated,
  success state shown).
- `docs/executed_tasks/TASK-0026-update-selected-model-connection.md` — task traceability file.
- `docs/executed_results/TASK-0026-update-selected-model-connection.md` — this file.

Tests and verification:

All commands ran on Windows PowerShell and passed:

- `npm run build` — PASS (tsc -p tsconfig.json)
- `npm run build:client` — PASS (tsc -p tsconfig.client.json + asset copy)
- `npm run typecheck:client` — PASS (tsc -p tsconfig.client.json --noEmit)
- `npm run lint` — PASS (eslint .)
- `npm test` — PASS: 136 tests, 14 suites, 0 failures, 0 skipped
  (includes 8 new repository update tests, 5 new service update tests, 10 new API PUT tests,
  4 new Settings static tests)

Notes:

- Integration tests use an isolated SQLite file database per test process (existing pattern).
- `updated_at` changes were verified deterministically by first regressing `updated_at` to a
  fixed old value in the test database, then asserting the update moves it forward.
- `test:e2e` (Playwright) was not part of the required verification list for this task and was
  not run; no browser-level changes required it (Settings Save behavior is covered by the
  existing static Settings test style used across the project).
- No LM Studio or live model server was used in any test.

Production code:

- `src/server/repositories/model-connection-repository.ts`
- `src/server/services/model-connection-service.ts`
- `src/server.ts`
- `src/client/components/settings/SettingsView.ts`

Architecture:

- Dependency direction preserved: HTTP route → `ModelConnectionService.updateConnection` →
  `ModelConnectionRepository.update` → SQLite. HTTP does not touch the repository directly.
- The service remains the sole place enforcing `USER_ID = 1`; the repository stays generic and
  receives `userId` from the service.
- No new architectural patterns, layers, or global abstractions were introduced.
- The "server.ts architecture" static test suite (service boundary, no schema SQL in server.ts)
  still passes.

Dependencies:

- No new dependencies added. `package.json` and `package-lock.json` are unchanged.

Deviations:

- None.

Risks / findings:

- `updated_at` granularity is integer seconds (existing convention); an update within the same
  second as the previous one would not visibly change it. This matches the existing create
  behavior and project timestamp convention; tests verify the change deterministically.
- The Settings "Save" static test `should POST to persistence endpoint on save` still passes
  because the file-wide assertion matches the Test connection POST; the new tests explicitly pin
  the Save callback's `PUT` for saved connections and `POST` for new connections.

Diff summary:

- Added one repository method, one service method, one HTTP route, and a Save-branch in the
  Settings view (PUT vs POST based on the selected saved connection), plus tests at all layers.
- No delete API, delete UI, credential persistence, authentication, or schema changes were added.
- No unrelated refactors; all changed files are required for this task.
