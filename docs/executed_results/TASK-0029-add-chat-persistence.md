# TASK-0029 - Add chat persistence

Task ID: TASK-0029
Status: PASS

Summary:

Added SQLite-backed chats for server-enforced UserId 1 through migration, repository, service, and validated API boundaries.

Repository analysis:

- Ran the required `scripts/inspect-repo.ps1` discovery after the documentation preflight.
- Reused the existing model-connection migration, repository, service, API, and isolated SQLite test patterns.
- Preserved the existing `/api/chat` stub and Chat UI without client changes.

Files changed:

- `src/server/migrations.ts`
- `src/server/chat-types.ts`
- `src/server/repositories/chat-repository.ts`
- `src/server/services/chat-service.ts`
- `src/server.ts`
- `tests/unit/migrations.test.ts`
- `tests/unit/chat-persist.test.ts`
- `tests/unit/chat-service.test.ts`
- `tests/integration/chats-api.test.ts`
- `docs/executed_tasks/TASK-0029-add-chat-persistence.md`
- `docs/executed_results/TASK-0029-add-chat-persistence.md`

Tests and verification:

- `npm run build` could not start because PowerShell blocked the `npm.ps1` shim under the machine execution policy.
- `npm.cmd run build` passed.
- `npm.cmd run build:client` passed.
- `npm.cmd run typecheck:client` passed.
- `npm.cmd run lint` passed.
- `npm.cmd test` passed: 161 tests, 0 failures.
- Automated chat tests use in-memory or temporary isolated SQLite databases and make no LM Studio calls.

Production code:

- Migration `0002_create_chats` owns the requested hybrid `chats` table schema without indexes or model-connection schema changes.
- `ChatData` explicitly types `title`, nullable `modelConnectionId`, and nullable `modelId` JSON data.
- `ChatRepository` owns parameterized SQL, JSON serialization/parsing, semantic stored-data validation, and row mapping.
- `ChatService` enforces UserId 1 for create, list, and get-by-id operations.
- `POST /api/chats`, `GET /api/chats`, and `GET /api/chats/:id` validate external input and use the service boundary.

Architecture:

- HTTP routes call `ChatService`, which calls `ChatRepository`, which owns all chat SQL.
- `user_id` is relational and never accepted into or stored in chat JSON.
- `modelConnectionId` remains flexible JSON data as required.

Dependencies:

- No dependencies were added or changed.

Deviations:

- Used `npm.cmd` instead of the PowerShell-blocked `npm` shim; the requested npm scripts themselves ran unchanged.

Risks / findings:

- No acceptance blockers or known functional risks remain.
- The repository had extensive pre-existing untracked files and a modified `README.md`; those unrelated changes were not modified.

Diff summary:

- Added five production-code changes for chat schema and backend layers.
- Added four focused migration, repository, service, and API test changes.
- Added the two required TASK-0029 tracking files.
