# TASK-0047 - File-based chat message persistence

Task ID: TASK-0047
Status: PASS

Summary:

Chat messages now persist as validated, per-chat JSONL history files with ownership-checked retrieval, inference persistence, deletion cleanup, and isolated deterministic tests.

Repository analysis:

- Ran the required `powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\inspect-repo.ps1` after completing the documentation preflight and confirming TASK-0047.
- Inspected the chat service/repository, inference service, chat HTTP routes, server and database path configuration, existing inference transport, relevant backend tests, and task-required architecture, database, security, testing, and coding documentation.
- Existing `ChatService` owns the fixed server-side UserId 1 boundary, while `ChatRepository` stores only chat metadata in SQLite.
- Existing inference used a deterministic OpenAI-compatible test stub and sent one current user message to the model.
- Pre-existing client changes and TASK-0044 through TASK-0046 tracking files were present and were not modified as part of TASK-0047.

Files changed:

- `.env.example` - documents the optional `CHAT_HISTORY_PATH` configuration.
- `.gitignore` - ignores the default `data/chat-history/` application data directory.
- `src/server/chat-types.ts` - adds the typed persisted chat message shape.
- `src/server/stores/chat-message-store.ts` - adds the filesystem-backed `ChatMessageStore` abstraction and JSONL implementation.
- `src/server/services/chat-service.ts` - enforces ownership before message reads/writes and coordinates history cleanup during chat deletion.
- `src/server/services/chat-inference-service.ts` - persists accepted user messages and successful assistant messages in the required order.
- `src/server.ts` - wires configured/default history storage and adds `GET /api/chats/:id/messages`.
- `tests/unit/chat-message-store.test.ts` - covers missing files, both roles, ordering, UTF-8, malformed data, trusted IDs, concurrency, and idempotent deletion using temporary storage.
- `tests/unit/chat-service.test.ts` - supplies isolated temporary message storage to the service ownership test.
- `tests/integration/chats-api.test.ts` - covers retrieval ownership, persisted retrieval, missing history, history deletion, and no-history deletion.
- `tests/integration/chat-inference-api.test.ts` - covers user/assistant persistence, failed inference behavior, ordering, and the unchanged single-message model request.
- `docs/executed_tasks/TASK-0047-file-based-chat-message-persistence.md` - records the active execution instruction.
- `docs/executed_results/TASK-0047-file-based-chat-message-persistence.md` - records this result.

Tests and verification:

- `npm.cmd run build` - PASS.
- `npm.cmd run build:client` - PASS; client static assets copied.
- `npm.cmd run typecheck:client` - PASS.
- `npm.cmd run lint` - PASS.
- `npm.cmd test` - PASS; 274 tests passed, 0 failed, 0 skipped.
- Focused compiled store/service tests - PASS; 7 tests passed.
- Focused chats API tests - PASS; 15 tests passed.
- Focused inference API tests - PASS; 12 tests passed.
- `git diff --check` - PASS with only existing Windows line-ending conversion warnings and no whitespace errors.
- No LM Studio connection was used; integration inference used the existing local deterministic HTTP stub.

Production code:

- The default history root is `data/chat-history`, outside the static client root, and can be overridden by server-owned `CHAT_HISTORY_PATH` configuration.
- History paths are generated exclusively from validated positive safe-integer user and chat IDs as `user-<userId>/chat-<chatId>.jsonl` and checked to remain within the configured root.
- The JSONL store appends UTF-8 records, validates exact stored message fields at runtime, returns an empty list for missing files, rejects malformed history with a controlled error, and serializes operations per file.
- Inference still sends only the current accepted message to the model and preserves the existing `{ message }` response contract.
- No SQLite message table, message migration, or client history loading was added.

Architecture:

- Request flow is HTTP -> `ChatService`/`ChatInferenceService` -> `ChatMessageStore` -> filesystem.
- HTTP handlers contain no filesystem operations.
- Ownership remains centralized through `ChatService` and the existing `ChatRepository` lookup for UserId 1.
- SQLite continues to own chat identity, ownership, metadata, and lifecycle.

Dependencies:

- No dependencies were added.
- The implementation uses built-in Node.js filesystem and path APIs.

Deviations:

- None.

Risks / findings:

- File operation serialization is process-local, which matches the current single-server architecture and requested simple concurrency scope.
- Filesystem and SQLite deletion cannot be one atomic transaction; history cleanup is completed before the existing synchronous metadata delete so a successful metadata deletion does not normally leave an orphaned history file.

Diff summary:

- Added one production filesystem store, one focused unit test file, and the two required TASK-0047 tracking files.
- Updated server wiring, chat application services/types, relevant integration and unit tests, and storage configuration/ignore entries.
- No database migrations, client behavior changes, dependencies, or unrelated refactors were introduced.
