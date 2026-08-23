Task ID: TASK-0030
Status: PASS

Summary:
Added validated saved-chat loading, persisted chat creation, and client-side active chat selection to the existing sidebar and Chat view.

Repository analysis:
The existing `GET /api/chats` response contains all persisted fields required for listing and selecting chats, so no GET-by-id request or backend change was needed. The layout already owns sidebar navigation and was the smallest appropriate location for chat collection and active-chat state.

Files changed:
- `src/client/components/layout.ts`
- `src/client/components/chat/ChatView.ts`
- `src/client/components/chat/chat.css`
- `tests/frontend/chat-list-ui.test.ts`
- `docs/executed_tasks/TASK-0030-add-chat-list-create-ui.md`
- `docs/executed_results/TASK-0030-add-chat-list-create-ui.md`

Tests and verification:
- `powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\inspect-repo.ps1` - PASS.
- `npm run typecheck:client` and `npm run test:compile` initially could not start because PowerShell blocked `npm.ps1`; the equivalent `npm.cmd` executable was used thereafter.
- `npm.cmd run test:frontend` - PASS, 8 tests.
- `npm.cmd run build` - PASS.
- `npm.cmd run build:client` - PASS.
- `npm.cmd run typecheck:client` - PASS.
- `npm.cmd run lint` - PASS.
- `npm.cmd test` - PASS, 169 tests across 19 suites.
- `git diff --check` reported only pre-existing trailing whitespace in unrelated `README.md`; that file was not modified for this task.

Production code:
The sidebar now loads and validates saved chats, shows loading, empty, and failure states, creates chats with the required nullable model fields, prevents duplicate in-flight creation, and indicates the active chat accessibly. `ChatView` accepts the active persisted title while retaining its existing stub message behavior.

Architecture:
Active chat and collection state remain client-side in the layout that owns the sidebar. Existing API, service, repository, persistence, and server-owned UserId 1 behavior remain unchanged.

Dependencies:
No dependencies were added or changed.

Deviations:
Required npm scripts were invoked through `npm.cmd` because the local PowerShell execution policy blocks the `npm.ps1` shim. No product-scope deviations were made.

Risks / findings:
Client coverage follows the repository's existing deterministic source-inspection test convention rather than adding a DOM test dependency. Message UI state remains intentionally independent of persisted chats and is not persisted.

Diff summary:
Updated three client files, added one focused frontend test file, and added the required task and result tracking files. No backend endpoint, persistence, model inference, or dependency changes were made.
