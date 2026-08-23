# TASK-0039 - Connect Chat UI to real inference

Task ID: TASK-0039
Status: PASS

Summary:

The Chat UI now sends one trimmed message at a time to the active persisted chat inference endpoint and safely renders validated responses or concise errors.

Repository analysis:

- Ran the required repository inspection script after completing the documentation preflight.
- Reviewed the focused ChatView, active-chat layout state, inference route/service, Chat UI styles, and relevant frontend and API tests.
- Confirmed the backend endpoint already resolves the saved chat, model connection, and model without client-supplied configuration.

Files changed:

- `src/client/components/chat/ChatView.ts`
- `src/client/components/layout.ts`
- `src/client/components/chat/__tests__/ChatView.test.ts`
- `tests/frontend/chat-list-ui.test.ts`
- `docs/executed_tasks/TASK-0039-connect-chat-ui-to-real-inference.md`
- `docs/executed_results/TASK-0039-connect-chat-ui-to-real-inference.md`

Tests and verification:

- `powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\inspect-repo.ps1` - passed.
- `npm.cmd run test:compile` followed by focused ChatView and chat-list tests - passed, 50 tests.
- `npm.cmd run build` - passed.
- `npm.cmd run build:client` - passed.
- `npm.cmd run typecheck:client` - passed.
- `npm.cmd run lint` - passed.
- `npm.cmd test` - passed, 239 tests.
- Direct `npm` invocation was blocked by the machine PowerShell execution policy, so the equivalent Windows executable `npm.cmd` was used successfully.
- Optional live LM Studio verification was not run and was not required for automated success.

Production code:

- Replaced the ChatView `/api/chat` request with `POST /api/chats/:id/inference` using the active persisted chat id.
- Sends only `{ message: <trimmed message> }`; no model, connection, URL, user, or credential data is sent.
- Validates successful inference JSON before rendering assistant text through `textContent`-based DOM creation.
- Preserves the immediate user message and shows a safe generic Chat UI error for failed, configuration-rejected, or invalid responses.
- Disables the input and Send button during inference, displays `Thinking...`, blocks duplicate click/Enter sends, and restores controls after completion.
- Keeps input and Send unavailable without an active persisted chat.
- Uses the layout's current active chat id to suppress late responses after chat or view switching.
- Messages remain client-memory-only; no persistence, history, streaming, queue, markdown, tool, or agent behavior was added.

Architecture:

- Preserved existing client component and layout state boundaries.
- Backend inference configuration resolution remains unchanged behind the existing endpoint.
- No new state-management abstraction or server architecture change was introduced.

Dependencies:

- No dependencies added or changed.

Deviations:

- None from required scope.
- The legacy `/api/chat` backend endpoint remains for existing unrelated API behavior, but ChatView no longer calls or implements its deterministic stub response.

Risks / findings:

- Existing frontend test conventions are source-level assertions rather than browser DOM execution; API integration coverage remains deterministic and the complete suite passes.
- The repository had extensive pre-existing untracked files and a modified `README.md`; they were not altered or reverted as part of this task.

Diff summary:

- Updated two production client files for persisted-chat inference, request ordering, safe response handling, loading state, no-active-chat state, and late-response protection.
- Updated two focused frontend test files to cover endpoint/payload constraints, response validation, safe errors, single-flight behavior, control restoration, inactive-chat behavior, and chat switching.
- Added the required task and result tracking records.
