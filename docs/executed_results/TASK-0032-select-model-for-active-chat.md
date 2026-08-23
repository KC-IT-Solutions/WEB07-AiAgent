# TASK-0032 - Select model connection and model for active chat

Task ID: TASK-0032
Status: PASS

Summary:

The active persisted chat now selects enabled saved model connections and their saved models, then persists the selection on the existing owned chat.

Repository analysis:

- The existing chat JSON already contained `modelConnectionId` and `modelId`; no schema change was needed.
- `ChatService` already enforced server-side UserId 1 for create/list/get behavior.
- The client layout already owned the active persisted chat state, while `ChatView` owned the compact chat content UI.
- Saved model connections already expose `modelId` and `enabled` through `GET /api/model-connections`.

Files changed:

- `src/server/chat-types.ts`
- `src/server/repositories/chat-repository.ts`
- `src/server/services/chat-service.ts`
- `src/server.ts`
- `src/client/components/chat/ChatView.ts`
- `src/client/components/chat/chat.css`
- `src/client/components/layout.ts`
- `tests/unit/chat-persist.test.ts`
- `tests/unit/chat-service.test.ts`
- `tests/integration/chats-api.test.ts`
- `tests/frontend/chat-list-ui.test.ts`
- `docs/executed_tasks/TASK-0032-select-model-for-active-chat.md`
- `docs/executed_results/TASK-0032-select-model-for-active-chat.md`

Tests and verification:

- `powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\inspect-repo.ps1` - PASS.
- Direct `npm run ...` invocation through PowerShell's `npm.ps1` launcher was blocked by the machine execution policy; the equivalent Windows executable `npm.cmd` was used.
- `npm.cmd run build` - PASS.
- `npm.cmd run build:client` - PASS.
- `npm.cmd run typecheck:client` - PASS.
- `npm.cmd run lint` - PASS.
- Initial `npm.cmd test` - FAIL with 181/183 tests because two prior frontend source assertions assumed the old ChatView title signature and no chat PUT URL anywhere in layout.
- The two assertions were narrowed to their intended behavior without weakening coverage.
- Final `npm.cmd test` - PASS, 183/183 tests.
- Automated tests use isolated SQLite databases and do not use LM Studio.

Production code:

- Added a generic parameterized repository update scoped by chat id and user id.
- The update replaces chat JSON, preserves `created_at`, advances `updated_at`, and returns the updated chat or `null`.
- Added partial chat update behavior to `ChatService`, retaining UserId 1 and preserving omitted fields such as title.
- Added validated `PUT /api/chats/:id` support for only `title`, `modelConnectionId`, and `modelId`; ownership/lifecycle fields and other unknown fields are rejected.
- Added compact Model connection and Model controls to Chat, using only enabled saved connections and saved model IDs.
- Active persisted selections are restored, unavailable/empty states are explicit, no-active-chat controls do not persist, and successful updates retain the same active chat without a reload.
- No inference or automatic model discovery request was added.

Architecture:

- HTTP validation calls `ChatService`; the route does not call `ChatRepository` directly.
- UserId 1 remains in the service layer and is never sent by the Chat client.
- SQL and JSON serialization remain in the repository.
- No migration or schema change was added.

Dependencies:

- No dependencies were added or changed.

Deviations:

- None from task scope. `npm.cmd` was used instead of the PowerShell-blocked `npm.ps1` command launcher for the requested npm scripts.

Risks / findings:

- Frontend behavior coverage follows the repository's existing deterministic source-inspection test convention; no additional browser E2E command was required by this task.

Diff summary:

- Added one chat update type, repository operation, service operation, and API route.
- Added active-chat model controls and minimal styling.
- Expanded repository, service, API, and frontend coverage for selection persistence, ownership, timestamps, disabled connections, empty states, and absence of model discovery.
