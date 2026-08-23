# TASK-0027 - Delete saved model connection

Task ID: TASK-0027
Task slug: delete-saved-model-connection

## Goal

Allow a saved model connection to be deleted from Settings. Do not add chat functionality.

## Requirements

- Run `powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\inspect-repo.ps1` before relevant repository inspection.
- Read only relevant Settings, model connection API/service/repository/tests, `ARCHITECTURE.md`, `DATABASE.md`, and required project documentation. Do not read historical task/result files.
- Offer Delete only when an existing saved connection is selected.
- Require browser-compatible user confirmation without a modal framework or dependency.
- Call `DELETE /api/model-connections/:id` without a client-provided user ID or API key.
- On success, remove the connection from the UI list, select New connection, reset timeout to 30, enabled to true, API key to empty, reset models to unloaded/disabled, and show a simple success state without a full-page reload.
- Add the smallest generic repository delete operation, scoped by connection ID and user ID, using parameterized SQL and returning a clear deleted/not-found result.
- Add delete behavior to `ModelConnectionService`, enforcing `UserId = 1`.
- Add a validated DELETE API route which calls the service and preserves existing response conventions.
- Existing UserId 1 records delete successfully; unknown records and records owned by another user return not found.
- Do not change schema, add migrations, alter credential behavior, persist/log API keys, or delete any other row.
- Add deterministic tests with isolated SQLite databases for repository, service, API, route validation, and all specified Settings deletion behavior.
- Do not use LM Studio in automated tests.
- Add no dependencies or unrelated refactors.

## Out of scope

Bulk delete, soft delete, undo, credential persistence, authentication, dynamic users, chat inference, chat persistence, chat-to-model assignment, inference queue, new dependencies, and unrelated refactors.

## Verification

Run `npm run build`, `npm run build:client`, `npm run typecheck:client`, `npm run lint`, and `npm test`.

## Acceptance

Deletion works only for a selected saved UserId 1 connection after confirmation, is scoped through HTTP to service to repository to SQLite, updates and resets the UI without reload, leaves schema and dependencies unchanged, and all required verification passes.
