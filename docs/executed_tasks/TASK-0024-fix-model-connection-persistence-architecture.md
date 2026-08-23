# TASK-0024 — Fix model connection persistence architecture

Task ID: TASK-0024
Task slug: fix-model-connection-persistence-architecture

## Task instruction (as received)

# TASK-0024 — Fix model connection persistence architecture

Task ID: TASK-0024
Task slug: fix-model-connection-persistence-architecture

## Goal

Correct the architecture introduced in TASK-0023.

Do not add new user-facing functionality.

## Read first

Run:

    powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\inspect-repo.ps1

Then read only relevant files for:

- database initialization
- migrations
- model connection repository
- model connection API routes
- relevant tests
- DATABASE.md
- ARCHITECTURE.md
- CODINGSTANDARDS.md

Do not use recursive repository listing commands.

## Fix 1 — Use the migration properly

The model_connections table must be created through the project migration mechanism.

Current problem:

- a migration file exists
- server.ts also creates model_connections inline with CREATE TABLE IF NOT EXISTS

Fix this.

Requirements:

- remove model_connections schema creation from server.ts
- execute the existing migration through database initialization
- migration remains the single owner of this schema change
- do not duplicate schema SQL in multiple places

Keep the migration deterministic.

## Fix 2 — Restore the application/service boundary

Follow:

    HTTP / Controller
        ↓
    Service / Use Case
        ↓
    Repository
        ↓
    Database

Add the smallest coherent application/service layer for model connection persistence.

It must support:

- create connection for UserId 1
- list connections for UserId 1
- get connection by id for UserId 1

HTTP routes must not call the repository directly.

The service must not depend on Express request/response objects.

Do not add speculative abstractions.

## Preserve existing behavior

Do not change:

- database schema
- JSON data structure
- UserId 1 behavior
- API routes
- API response behavior unless required by the architectural correction
- Settings Save behavior
- API key behavior

API key must still not be persisted.

## Tests

Update/add only the tests required for these architecture corrections.

Verify:

- database initialization runs the migration
- model_connections table exists after migration
- server.ts contains no model_connections schema SQL
- HTTP layer uses the service/application boundary
- existing repository behavior remains correct
- existing API behavior remains correct

Use isolated deterministic test databases.

Do not use LM Studio.

## Out of scope

Do not add:

- new API endpoints
- update/delete
- connection management UI
- authentication
- dynamic users
- credential persistence
- chat inference
- chat persistence
- inference queue
- new dependencies
- unrelated refactors

## Verification

Run:

    npm run build
    npm run build:client
    npm run typecheck:client
    npm run lint
    npm test

## Acceptance

- model_connections schema is owned by the migration
- server.ts does not create the table directly
- migration executes during database initialization
- HTTP routes do not access repository directly
- service/application layer sits between HTTP and repository
- existing persistence behavior is preserved
- UserId 1 remains server-side
- API key remains unpersisted
- all tests pass
- no new dependencies
- no unrelated changes

## Tracking

Create:

- docs/executed_tasks/TASK-0024-fix-model-connection-persistence-architecture.md
- docs/executed_results/TASK-0024-fix-model-connection-persistence-architecture.md

Do not read historical task/result files.

## Final response

Return only:

    Task ID: TASK-0024
    Status: <PASS|FAIL|BLOCKED>
    Result: docs/executed_results/TASK-0024-fix-model-connection-persistence-architecture.md
    Summary: <one short sentence>

## Notes

- Repository inspection found that no migration file existed before this task (the table was created inline in `src/server.ts` and duplicated in `tests/unit/model-connection-persist.test.ts`). The migration mechanism is therefore introduced as part of this correction.
