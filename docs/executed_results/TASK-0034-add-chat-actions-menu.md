# TASK-0034 - Add chat actions menu with rename and delete

Task ID: TASK-0034
Status: PASS

Summary:

Added an accessible per-chat actions menu with persistent rename and owner-scoped delete behavior while preserving active-chat state.

Repository analysis:

- Completed the required documentation preflight and repository inspection script before scoped code inspection.
- Reused the existing partial `PUT /api/chats/:id` behavior for title-only rename.
- Followed the existing HTTP to service to repository to SQLite dependency direction for delete.
- Confirmed the existing chat schema supports deletion without a migration.

Files changed:

- `src/client/components/layout.ts`
- `src/client/components/chat/chat.css`
- `src/server.ts`
- `src/server/repositories/chat-repository.ts`
- `src/server/services/chat-service.ts`
- `tests/frontend/chat-list-ui.test.ts`
- `tests/integration/chats-api.test.ts`
- `tests/unit/chat-persist.test.ts`
- `tests/unit/chat-service.test.ts`
- `docs/executed_tasks/TASK-0034-add-chat-actions-menu.md`
- `docs/executed_results/TASK-0034-add-chat-actions-menu.md`

Tests and verification:

- `powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\inspect-repo.ps1` - passed.
- `npm run build` - could not start because local PowerShell policy blocked the `npm.ps1` shim.
- `npm.cmd run build` - passed.
- `npm.cmd run build:client` - passed; client assets copied.
- `npm.cmd run typecheck:client` - passed.
- `npm.cmd run lint` - passed.
- `npm.cmd test` - passed: 202 tests, 20 suites, 0 failures.
- Required scripts were rerun after the final test addition and all passed.
- Tests use isolated in-memory or temporary SQLite databases and no LM Studio connection.

Production code:

- Added an owner-scoped, parameterized repository delete returning a boolean deleted/not-found result.
- Added `ChatService.deleteChat`, which enforces server-side UserId 1.
- Added validated `DELETE /api/chats/:id` responses for success, not found, invalid IDs, and server errors.
- Added a hover/focus three-dot button and compact Rename/Delete menu for every saved chat.
- Added single-menu state, Escape closing with trigger focus restoration, and outside-click closing.
- Rename uses a prefilled native prompt, trims/rejects empty input, sends a title-only PUT, and updates active UI without reload.
- Delete uses native confirmation, removes only the deleted chat, and clears active state only when that chat was active.

Architecture:

- Delete follows HTTP -> ChatService -> ChatRepository -> SQLite.
- Ownership remains server-side in `ChatService`; the browser sends no `userId`.
- No schema or migration changes were made.

Dependencies:

- No dependencies were added or changed.

Deviations:

- Used `npm.cmd` instead of the blocked PowerShell `npm` shim; this executes the same package scripts without changing execution policy.
- Frontend interaction coverage follows the repository's existing deterministic source-contract test style; no browser E2E suite was added.

Risks / findings:

- The worktree was already broadly untracked, so Git could not provide a meaningful baseline diff for the affected untracked files. Existing unrelated changes were left untouched.
- No known acceptance criteria remain unmet.

Diff summary:

- Production: chat actions UI and styling, repository/service delete support, and DELETE API route.
- Tests: repository ownership, service UserId enforcement, API rename/delete behavior, route validation, and all requested menu/state contracts.
- Tracking: active task and result records added.
