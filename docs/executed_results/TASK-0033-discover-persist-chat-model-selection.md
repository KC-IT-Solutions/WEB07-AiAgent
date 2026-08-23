Task ID: TASK-0033
Status: PASS

Summary:
Saved chat model connections now discover models through the backend, and explicit model choices persist on the existing active chat.

Repository analysis:
The existing model-connection test service already normalizes trailing slashes, applies timeouts, calls `/v1/models`, and parses OpenAI-compatible model IDs. Model connection and chat services already scope repository access to UserId 1, while the layout already updates active chats through `PUT /api/chats/:id` and keeps returned chat data in local state.

Files changed:
- `src/server.ts`
- `src/server/services/model-connection-service.ts`
- `src/client/components/chat/ChatView.ts`
- `tests/integration/model-connections-api.test.ts`
- `tests/frontend/chat-list-ui.test.ts`
- `docs/executed_tasks/TASK-0033-discover-persist-chat-model-selection.md`
- `docs/executed_results/TASK-0033-discover-persist-chat-model-selection.md`

Tests and verification:
- `npm run build` could not start because PowerShell blocked `npm.ps1`; the equivalent `npm.cmd run build` passed.
- `npm.cmd run build`: passed.
- `npm.cmd run build:client`: passed.
- `npm.cmd run typecheck:client`: passed.
- `npm.cmd run lint`: passed.
- `npm.cmd test`: passed, 189 tests passed and 0 failed.
- Targeted model-connection API and chat frontend tests passed, 46 tests passed and 0 failed.
- `git diff --check` reported only pre-existing trailing whitespace in unrelated `README.md`; no task file whitespace error was reported.
- Optional live verification against LM Studio was not performed; automated discovery tests used a deterministic local stub server.

Production code:
- Added `GET /api/model-connections/:id/models` with positive-integer validation, UserId 1 scoped lookup, deterministic unique/sorted model IDs, not-found handling, and a controlled discovery-failure response.
- Reused the existing model-connection HTTP service with the saved `baseUrl` and `timeoutMinutes`, without adding API-key persistence or browser-to-model-server traffic.
- Updated Chat model controls to show loading, empty, and unavailable states; list every backend model ID; restore a persisted model only when valid; and avoid choosing another model automatically.
- Changing connection persists the new connection with `modelId: null`, then discovers its models. Choosing a model persists both IDs through the existing active-chat `PUT` path.

Architecture:
The HTTP route remains thin, model discovery orchestration is in `ModelConnectionService`, saved connection access remains behind the repository boundary, and external model-server HTTP logic is reused rather than duplicated.

Dependencies:
No dependencies were added or changed.

Deviations:
None. The optional live model-server verification was intentionally omitted because deterministic automated coverage passed.

Risks / findings:
Frontend workflow coverage follows the repository's existing source-contract test style rather than launching a browser. The backend discovery behavior is exercised end-to-end against a deterministic HTTP stub.

Diff summary:
Three production files implement backend discovery and Chat selection behavior, two test files cover the API and frontend contracts, and two tracking files record the task and result.
