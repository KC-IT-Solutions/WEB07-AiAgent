# TASK-0025 — List and select saved model connections

Task ID: TASK-0025
Status: PASS

## Summary

Settings now lists saved model connections (UserId 1) from `GET /api/model-connections` in a select control, populates the existing form (name, baseUrl, timeoutMinutes, modelId, enabled) on selection while keeping the API key empty, and offers a "New connection" option that resets the form to defaults. No backend, update, or delete behavior was added.

## Repository analysis

- `src/client/components/settings/SettingsView.ts`: vanilla-DOM Settings view; form fields with stable ids (`settings-name`, `settings-base-url`, `settings-api-key`, `settings-timeout`, `settings-model`, `settings-enabled`); Save POSTs to `POST /api/model-connections`; Test connection POSTs to `/api/model-connections/test`. View is re-created on every Settings open (`layout.ts` calls `createSettingsView()` in `switchView`), so loading saved connections at view creation satisfies "when Settings opens".
- `src/server.ts`: `GET /api/model-connections` returns an array of `ModelConnection` (`{ id, userId, createdAt, updatedAt, data: { name, baseUrl, timeoutMinutes, modelId, enabled } }`); `GET /api/model-connections/:id` returns one. API key is not part of persisted data.
- `src/server/services/model-connection-service.ts` / `src/server/repositories/model-connection-repository.ts`: list/get are scoped to `SERVER_USER_ID = 1`. No changes needed.
- `tests/integration/model-connections-api.test.ts`: confirms response shape and that API key is never persisted.
- `src/client/components/settings/__tests__/SettingsView.test.ts`: deterministic source-assertion style (no DOM harness, no LM Studio). New tests follow the same style.
- `docs/CODINGSTANDARDS.md`, `docs/ARCHITECTURE.md`, `docs/TESTING.md`: client-side feature change only; no new architecture or dependencies.

## Files changed

- `src/client/components/settings/SettingsView.ts`:
  - Added `SavedConnection`/`SavedConnectionData` types, `NEW_CONNECTION_VALUE` constant, and `isSavedConnection` type guard (validates untrusted server payload).
  - Added "Saved connections" card with a labeled `<select>` (`settings-saved-connections`) containing a "New connection" option (value `new`) and one option per saved connection labeled `name - baseUrl`, plus a status element with loading/error/empty states.
  - On view creation, loads saved connections via `fetch('/api/model-connections')` (GET; no `/v1/models` call) and shows "Failed to load saved connections" on failure.
  - On selecting a saved connection: populates name, baseUrl, timeoutMinutes, enabled, and sets the persisted `modelId` as the only model option (model selector enabled); API key is explicitly cleared and never read from persisted data.
  - On selecting "New connection": resets name/baseUrl/apiKey to empty, timeout to `DEFAULT_TIMEOUT_MINUTES` (30), enabled to true, and model selector back to the disabled "No models available" placeholder.
  - Extracted `updateTestButtonState`, `clearModelOptions`, and `createNoModelsPlaceholderOption` helpers; form input listeners now use the shared `updateTestButtonState` (behavior identical).
- `src/client/components/settings/settings.css`: added `.settings-saved-status` and `.settings-saved-status-error` (reuses existing color/typography conventions).
- `src/client/components/settings/__tests__/SettingsView.test.ts`: added a "saved connections" suite (12 deterministic tests) covering loading from GET `/api/model-connections`, name/base URL display, loading and error states, form population (name, baseUrl, timeoutMinutes, enabled, modelId), no `/v1/models` call on load/select, API key staying empty, and "New connection" reset.

## Tests and verification

- `npm run build` — pass
- `npm run build:client` — pass
- `npm run typecheck:client` — pass
- `npm run lint` — pass
- `npm test` — pass (110 tests, 13 suites, 0 failures), including all pre-existing unit/integration/frontend/system tests and the new Settings saved-connections tests
- `npm run test:e2e` (Playwright) — not run; not listed in the task's verification commands and requires browser binaries; reported per Definition of Done
- Note: `npm` had to be invoked as `npm.cmd` due to the local PowerShell execution policy; command semantics unchanged

## Production code

- Client-only change in the Settings feature module. No backend routes, services, repositories, schema, or migrations touched. No update/delete APIs added.

## Architecture

- Follows existing structure: client view makes direct API calls (existing convention), server response validated with a type guard over `unknown` before use. No new layers, patterns, or cross-feature coupling.

## Dependencies

- No new dependencies added.

## Deviations

- Selected-connection data is taken from the already-fetched list payload instead of a second `GET /api/model-connections/:id` call (task allows "fetch or use the selected connection data"); avoids a redundant request.
- Initial form still pre-fills from the module-level `connectionState` (pre-existing behavior preserved); "New connection" reset also clears that local state for consistency.

## Risks / findings

- The `saved connections` card sits between the header and the form card; visual styling is minimal and consistent with existing `.settings-card` conventions. No layout redesign.
- If the server returns a malformed list, invalid entries are filtered out and no option is created for them; a non-array payload shows the load-failure state.

## Diff summary

- `SettingsView.ts`: +~215 lines (types, helpers, saved-connections card, load/populate/reset logic, listener wiring); 3-line listener refactor to shared helper.
- `settings.css`: +9 lines (2 new classes).
- `SettingsView.test.ts`: +~165 lines (new "saved connections" suite, 12 tests).
- Tracking files created: `docs/executed_tasks/TASK-0025-list-select-model-connections.md`, this result file.
