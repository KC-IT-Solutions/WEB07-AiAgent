# TASK-0059 - Control LM Studio transport timeouts with Undici dispatcher

Task ID: TASK-0059
Status: PASS

Summary:

OpenAI-compatible inference now uses a reusable per-inference Undici Agent with disabled headers/body timeouts, a 60-second connect timeout, authoritative saved application timeout aborts, and structured transport diagnostics.

Repository analysis:

- The provider implementation calls the OpenAI-compatible `/v1/chat/completions` endpoint through native `fetch`; the installed OpenAI SDK is not used for inference.
- The saved model connection `timeoutMinutes` was already enforced by an AbortController around each model request.
- Native fetch did not receive a custom dispatcher, leaving lower-level Undici response timeouts capable of ending long inference before the saved timeout.
- Chat inference owns the complete multi-round provider operation and is therefore the narrowest lifecycle boundary for one dispatcher reused across all model/tool rounds.
- Existing `MODEL_SERVER_TIMEOUT` is the project's safe, distinct application-timeout classification and remains mapped to HTTP 504; `MODEL_SERVER_UNREACHABLE` remains mapped to HTTP 502.

Files changed:

- `package.json`
- `package-lock.json`
- `src/services/model-inference.ts`
- `src/server/services/chat-inference-service.ts`
- `tests/unit/model-inference.test.ts`
- `tests/unit/chat-inference-tools.test.ts`
- `docs/executed_tasks/TASK-0059-control-model-transport-timeouts-undici-dispatcher.md`
- `docs/executed_results/TASK-0059-control-model-transport-timeouts-undici-dispatcher.md`

Tests and verification:

- `powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\inspect-repo.ps1` - PASS.
- `npm.cmd run build` - PASS.
- `npm.cmd run test:unit` - PASS, 138 tests.
- `npm.cmd run build` - PASS (required final run).
- `npm.cmd run build:client` - PASS.
- `npm.cmd run typecheck:client` - PASS.
- `npm.cmd run lint` - PASS.
- `npm.cmd test` - PASS, 387 tests across 35 suites.
- `git diff --check` - PASS; only existing Windows line-ending warnings were emitted.
- `npm.cmd ls undici` - PASS; `undici@7.29.0` is a direct dependency and is deduplicated with Cheerio's copy.
- Live LM Studio verification was optional and was not run; automated tests use no external network access.

Production code:

- Added a type-safe OpenAI-compatible transport factory backed by `undici.Agent` with `headersTimeout: 0`, `bodyTimeout: 0`, and `connectTimeout: 60_000`.
- Kept the saved `timeoutMinutes` AbortController as the overall request timeout and track whether that application timer initiated the abort.
- Reuse one transport across every provider round in a chat inference and close it in the inference `finally` path.
- Safely extract bounded top-level error name/code and structured cause code without logging Error objects.
- Classify configured timeout aborts as `MODEL_SERVER_TIMEOUT`; structured connection, reset, DNS, and Undici timeout failures remain `MODEL_SERVER_UNREACHABLE`.
- Added provider failure log fields for domain classification, provider error name/code/cause, configured timeout, duration, stage, and explicit application-timeout status.
- Added `messageCount` and a numeric `approximateRequestBytes` estimate to existing `model_request` diagnostics without adding another request-body log.

Architecture:

- Dispatcher logic remains in the OpenAI-compatible provider infrastructure.
- The Chat inference service only owns and disposes the transport lifecycle; no dispatcher behavior was added to Chat UI or tools.
- No provider URL, model ID, local port, API key, or LM Studio-specific credential behavior was hardcoded.
- Provider message chronology, tool orchestration, reasoning, persistence, streaming events, and round limits were not changed.

Dependencies:

- Added `undici@^7.29.0` as an explicit production dependency rather than relying on Cheerio's transitive dependency.
- No other dependency was added.

Deviations:

- The existing `MODEL_SERVER_TIMEOUT` code was retained as the project's equivalent of the suggested `MODEL_REQUEST_TIMEOUT` to preserve established API and UI behavior while keeping timeout classification distinct from unreachable failures.
- Optional live LM Studio verification was not performed.

Risks / findings:

- The worktree contained extensive pre-existing modified and untracked files from earlier tasks. They were preserved and not reverted; task edits were limited to the files listed above.
- The deterministic long-running test simulates elapsed provider time without waiting minutes; the complete integration suite separately verifies the real saved AbortController timeout and safe HTTP response.

Diff summary:

- Added explicit Undici transport configuration and lifecycle ownership.
- Enriched provider error classification and safe inference failure logging.
- Added request-size observability and deterministic regression coverage.
- Added one explicit dependency and no unrelated refactor.
