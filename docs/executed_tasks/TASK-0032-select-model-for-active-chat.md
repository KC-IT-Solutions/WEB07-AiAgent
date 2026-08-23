# TASK-0032 - Select model connection and model for active chat

Task ID: TASK-0032
Task slug: select-model-for-active-chat

## Instruction

Goal: Allow the active chat to select and persist a model connection and model without adding real model inference.

Read first by running `powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\inspect-repo.ps1`, then inspect only relevant Chat UI, chat persistence API/service/repository/types, model connection API, useful Settings model-selection behavior, tests, and required project documentation. Do not use recursive repository listing commands or read historical task/result files.

Required behavior:

- For the currently active persisted chat, show compact Model connection and Model controls.
- Load saved connections from `GET /api/model-connections`; only enabled connections are selectable.
- When a connection is selected, use its saved `modelId` as the initial model when available and allow selecting the model for the active chat.
- Do not request a model server, call `/v1/models`, add inference, or expose API keys.
- Show a clear unavailable state when no model is available.
- Disable or make controls unavailable when no persisted chat is active and do not persist anything.
- Reflect and restore the active chat's persisted `modelConnectionId` and `modelId`.
- Persist selection without a reload or duplicate chat, preserving the same active chat.

Persistence and API:

- Keep the chat schema unchanged; add no columns or migration.
- Keep `modelConnectionId` and `modelId` in chat JSON data.
- Add the smallest generic `ChatRepository` update by chat id and userId using parameterized SQL.
- Update chat data JSON, preserve `created_at`, update `updated_at`, and return the updated chat or not found.
- Add `ChatService` update behavior while enforcing `UserId = 1` server-side.
- Add `PUT /api/chats/:id`; HTTP must call `ChatService`, not the repository.
- Allow validated updates only for `title`, `modelConnectionId`, and `modelId`.
- Preserve the existing title when only model selection changes.
- Reject attempts to supply `userId`, `createdAt`, or `updatedAt`.
- Return not found for unknown or wrong-user chat ids.
- Never send `userId` from the browser.

Tests:

- Use deterministic tests and isolated SQLite databases.
- Cover repository update for UserId 1 and refusal for another user, timestamp behavior, and model selection persistence.
- Cover `PUT /api/chats/:id`, not found ownership behavior, and inability to override userId.
- Cover loading connections in Chat UI, enabled-only selection, restoring active selection, persisting changes, no update without an active chat, and no `/v1/models` request.
- Do not use LM Studio in automated tests.

Out of scope: inference, message persistence, streaming, automatic model discovery, Chat connection testing, credential persistence, chat delete, chat rename UI, authentication, dynamic users, inference queues, new dependencies, and unrelated refactors.

Verification: run `npm run build`, `npm run build:client`, `npm run typecheck:client`, `npm run lint`, and `npm test`.

Acceptance: active chat model connection and model selections persist on the existing chat; UserId 1 remains server-side; schema is unchanged; no inference or `/v1/models` request is added; all tests pass; no dependencies or unrelated changes are added.

Tracking: create this task file and `docs/executed_results/TASK-0032-select-model-for-active-chat.md`; do not read historical tracking files.
