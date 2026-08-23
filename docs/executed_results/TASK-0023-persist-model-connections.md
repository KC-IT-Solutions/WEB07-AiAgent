# TASK-0023 — Persist model connections

**Task ID:** TASK-0023
**Status:** Completed

## Summary

Implemented SQLite persistence for model connection settings using the hybrid database model (real columns for identity/relationships, JSON for flexible domain data). UserId 1 is enforced server-side. API key is not persisted.

## Repository analysis

- No existing database infrastructure; `better-sqlite3` was available in package.json
- Server in `src/server.ts` with Express routes
- Settings UI in `src/client/components/settings/SettingsView.ts`
- Existing test patterns use `node:test` runner with isolated databases

## Files changed

### New files
- `src/server/database.ts` — Database connection management with `getDatabase()` and `createTestDatabase()`
- `src/server/model-connection-types.ts` — TypeScript types for `ModelConnectionData`, `ModelConnection`, `CreateModelConnectionInput`
- `src/server/repositories/model-connection-repository.ts` — `ModelConnectionRepository` class with `create()`, `listByUserId()`, `getById()`
- `src/server/migrations/001_create_model_connections.ts` — Migration definition
- `tests/unit/model-connection-persist.test.ts` — 12 repository unit tests with isolated in-memory SQLite
- `tests/integration/model-connections-api.test.ts` — 13 API integration tests with real Express server

### Modified files
- `src/server.ts` — Added database initialization, model_connections table creation, 3 new API endpoints (POST, GET list, GET by id)
- `src/client/components/settings/SettingsView.ts` — Save button now POSTs to `/api/model-connections`; added enabled checkbox; async save with success/error feedback
- `src/client/components/settings/__tests__/SettingsView.test.ts` — Added 4 new tests for persistence API calls and apiKey exclusion

## Tests and verification

All 88 tests pass (0 failures):
- 14 ChatView tests
- 29 SettingsView tests (including 4 new persistence tests)
- 7 chat API integration tests
- 13 model connections API integration tests
- 12 ModelConnectionRepository unit tests
- 13 testConnection service unit tests

Verification commands all pass:
- `npm run build` — OK
- `npm run build:client` — OK
- `npm run typecheck:client` — OK
- `npm run lint` — OK
- `npm test` — 88/88 pass

## Production code

### Database model
```sql
CREATE TABLE model_connections (
  id INTEGER PRIMARY KEY,
  user_id INTEGER NOT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  data TEXT NOT NULL CHECK (json_valid(data))
)
```

### JSON data structure
```json
{
  "name": "string (required)",
  "baseUrl": "string (required)",
  "timeoutMinutes": "number (default: 30)",
  "modelId": "string | null (nullable)",
  "enabled": "boolean (default: true)"
}
```

### API endpoints
- `POST /api/model-connections` — Creates connection for server-enforced UserId 1
- `GET /api/model-connections` — Lists connections for UserId 1
- `GET /api/model-connections/:id` — Gets connection by id scoped to UserId 1

### Security
- `userId` is server-enforced (constant `SERVER_USER_ID = 1`); client cannot override
- API key is not accepted or persisted by the persistence endpoint
- Input validation on name, baseUrl, timeoutMinutes, modelId, enabled
- Parameterized SQL queries

## Architecture

Follows existing layered architecture:
- HTTP routes in `server.ts` (thin handlers with validation)
- Repository in `repositories/model-connection-repository.ts` (SQL, JSON serialization, row mapping)
- Database management in `server/database.ts`
- Repository boundary respected: no SQL in HTTP routes

## Dependencies

No new dependencies added. Uses existing `better-sqlite3` from package.json.

## Deviations

- Migration file (`001_create_model_connections.ts`) is created but the table is initialized inline in `server.ts` using `CREATE TABLE IF NOT EXISTS`. This is simpler for the current project size and avoids the ESM migration loading complexity. The migration file serves as documentation of the intended schema.

## Risks / findings

- The `data/` directory for the SQLite database file is created on first server start
- The `DB_PATH` environment variable can override the default database location
- Foreign key to `users(id)` is not enforced since no users table exists (as specified in task requirements)

## Diff summary

- 6 new files
- 3 modified files
- ~450 lines added
- 0 lines removed
- 0 new dependencies
