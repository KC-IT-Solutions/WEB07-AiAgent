# TASK-0038 - Add model inference service and API

Task ID: TASK-0038
Status: PASS

Summary:

Added persisted-chat OpenAI-compatible inference with server-side configuration resolution, safe upstream handling, timeouts, and deterministic API tests.

Repository analysis:

- The existing `ChatService` and `ModelConnectionService` scope all reads to server-side UserId 1.
- Existing model discovery uses native fetch, trailing-slash normalization, and `AbortController` timeouts.
- Express routes validate request boundaries and map service outcomes to small JSON responses.

Files changed:

- `src/server.ts`
- `src/server/services/chat-inference-service.ts`
- `src/services/model-inference.ts`
- `tests/integration/chat-inference-api.test.ts`
- `docs/executed_tasks/TASK-0038-add-model-inference-service-api.md`
- `docs/executed_results/TASK-0038-add-model-inference-service-api.md`

Tests and verification:

- `powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\inspect-repo.ps1` - PASS.
- `npm.cmd run build` - PASS.
- `npm.cmd run build:client` - PASS.
- `npm.cmd run typecheck:client` - PASS.
- `npm.cmd run lint` - PASS.
- `npm.cmd test` - PASS: 234 tests, 22 suites, 0 failures.
- Focused `node --test .test-dist/tests/integration/chat-inference-api.test.js` - PASS: 12 tests.
- The initial `npm run build` invocation was blocked because PowerShell script execution disabled `npm.ps1`; the equivalent Windows executable `npm.cmd` was used successfully for every required npm command.
- Optional live verification was not performed; automated tests use a deterministic local HTTP server.

Production code:

- Added `POST /api/chats/:id/inference` with positive-integer chat-id and non-empty trimmed-message validation.
- Added a chat inference application service that resolves the UserId 1 chat and connection through existing service boundaries.
- Added a native-fetch OpenAI-compatible request to normalized `<saved baseUrl>/v1/chat/completions` using the saved model and timeout.
- Added strict assistant-content validation and a normalized `{ message }` response.
- Added safe errors for missing chat configuration, missing or disabled connection, network failure, timeout, non-OK response, and invalid response.

Architecture:

- HTTP validation and status mapping remain in Express.
- Chat and connection coordination is in `ChatInferenceService`.
- External model-server HTTP and response validation are isolated in `requestModelInference`.
- Existing chat and model-connection services retain ownership enforcement and persistence access.

Dependencies:

- No dependencies added or changed.

Deviations:

- None.

Risks / findings:

- Inference intentionally supports only saved connections that require no authentication because API keys are not persisted.
- `git diff --check` reports unrelated pre-existing trailing whitespace in `README.md:10`; this task did not modify that file.

Diff summary:

- Added two focused backend service modules, one Express route, one deterministic integration test suite, and the required execution records.
- No ChatView integration, message persistence, history, streaming, credentials, database changes, or unrelated refactors were introduced.
