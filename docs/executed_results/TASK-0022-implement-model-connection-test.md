# TASK-0022 — Implement model connection test

Task ID: TASK-0022
Status: PASS

## Summary

Implemented POST `/api/model-connections/test` endpoint and Settings UI integration for testing OpenAI-compatible model server connections.

## Repository analysis

- Existing SettingsView had a Test connection button with placeholder behavior
- Server had no model-connection endpoint
- No service layer existed for external HTTP calls to model servers

## Files changed

### New files
- `src/services/model-connection.ts` — Service for testing model server connections
- `tests/unit/model-connection.test.ts` — Unit tests with mocked fetch (13 tests)

### Modified files
- `src/server.ts` — Added POST `/api/model-connections/test` route handler
- `src/client/components/settings/SettingsView.ts` — Test callback now calls backend API, populates model selector, shows status
- `src/client/components/settings/settings.css` — Added status message styling (success/error)
- `src/client/components/settings/__tests__/SettingsView.test.ts` — Updated test for fetch usage; added 7 new behavior tests
- `eslint.config.js` — Added `tests/**/*.ts` to parser configuration

## Tests and verification

### Automated tests (59/59 pass)
- ChatView: 14 tests (unchanged)
- SettingsView: 25 tests (7 new)
- POST /api/chat: 7 tests (unchanged)
- testConnection service: 13 tests (new)

### Service tests cover
- Successful model discovery
- Base URL trailing slash handling (single and multiple)
- Invalid base URL
- Connection failure
- Non-OK HTTP response
- Authorization header inclusion when API key provided
- Authorization header exclusion when API key empty/whitespace
- Empty models array handling
- Invalid model entry filtering
- Non-array data response
- AbortController timeout usage

### Verification commands
- `npm run build` — PASS
- `npm run build:client` — PASS
- `npm run typecheck:client` — PASS
- `npm run lint` — PASS
- `npm test` — PASS (59/59)

### Live verification
- `http://192.168.4.127:1234/v1/models` — UNAVAILABLE (connection timed out)
- Per task specification: live verification failure does not affect task status when automated tests pass

## Production code

- Service function validates URL, handles trailing slashes, applies timeout via AbortController
- Authorization header sent only when API key is non-empty and non-whitespace
- API key never logged or returned in responses
- Error messages are safe (no internal details exposed)
- Default timeout of 30 minutes applied when not specified
- Frontend fetches models on test, populates selector on success, disables on failure
- Status message displayed with success (green) or error (red) styling

## Architecture

- Service layer (`src/services/model-connection.ts`) separates connection logic from HTTP handler
- Follows existing project convention of thin route handlers
- No new dependencies (uses native fetch)
- ESM-compatible imports with `.js` extensions

## Dependencies

No new dependencies added.

## Deviations

None.

## Risks / findings

- Live verification server (192.168.4.127:1234) was unreachable during testing
- ESM module resolution requires explicit `.js` extensions in imports; added to new files

## Diff summary

```
+ src/services/model-connection.ts        (new: 80 lines)
+ tests/unit/model-connection.test.ts     (new: 230 lines)
~ src/server.ts                          (+38 lines: new route)
~ src/client/components/settings/SettingsView.ts  (+110 lines: test callback, status)
~ src/client/components/settings/settings.css     (+12 lines: status styles)
~ src/client/components/settings/__tests__/SettingsView.test.ts  (~20 lines: updated/new tests)
~ eslint.config.js                       (+6 lines: tests dir parser config)
```
