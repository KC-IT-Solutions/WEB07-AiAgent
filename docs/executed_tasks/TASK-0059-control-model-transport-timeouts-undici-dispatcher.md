# TASK-0059 - Control LM Studio transport timeouts with Undici dispatcher

Task ID: TASK-0059
Task slug: control-model-transport-timeouts-undici-dispatcher

## Instruction

Fix long-running OpenAI-compatible model requests so a lower-level HTTP timeout does not disconnect from LM Studio before the saved model-connection timeout expires.

Run `powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\inspect-repo.ps1` first, then inspect only relevant provider/client creation, model connection settings, timeout and AbortController handling, provider error classification, inference logging, tests, dependencies, and required architecture/security/testing/coding documentation. Do not recursively list the repository or read historical executed task/result files.

Use an Undici dispatcher/Agent in the OpenAI-compatible provider infrastructure with `headersTimeout: 0`, `bodyTimeout: 0`, and a separately bounded connection establishment timeout of preferably `60_000` ms. Pass the dispatcher through a type-safe custom fetch adapter without `any`. Do not hardcode LM Studio connection details, model IDs, URLs, API keys, or provider-specific behavior outside the existing OpenAI-compatible abstraction. Preserve current credential behavior and add `undici` as an explicit dependency if a direct import requires it.

The existing saved `timeoutMinutes` must remain the authoritative overall inference timeout and continue to be enforced explicitly, preferably through the existing AbortController mechanism. Do not use Undici headers/body timeouts for inference duration and do not set the connect timeout equal to the full inference timeout. Avoid a dispatcher per model round; prefer ownership/reuse by a provider/client or complete inference operation, and close resources where appropriate without introducing a global unrelated-server pool or a large pooling framework.

Improve transport error classification by safely inspecting structured errors and causes. Recognize where available `UND_ERR_CONNECT_TIMEOUT`, `UND_ERR_HEADERS_TIMEOUT`, `UND_ERR_BODY_TIMEOUT`, `ECONNREFUSED`, `ECONNRESET`, and `AbortError`. Classify expiration of the configured application timeout distinctly as `MODEL_REQUEST_TIMEOUT` or equivalent, never as model-server-unreachable. Actual connection/DNS/connect-timeout/reset failures may remain `MODEL_SERVER_UNREACHABLE`. Distinguish configured timeout aborts, existing user/client cancellation, and arbitrary provider/network failures. Keep client-facing messages safe.

Extend bounded structured provider failure logging with safe fields where available: `providerErrorCode`, `providerErrorName`, `providerErrorCauseCode`, `timeoutMinutes`, `durationMs`, and `stage`. Make application timeout aborts and any lower-level Undici timeout codes obvious. Never log API keys, authorization headers, complete Error objects, or private reasoning.

Add numeric request-size observability to existing `model_request` logs, such as `messageCount` and `approximateRequestBytes`, without logging or duplicating the request body merely to calculate it. Do not add context trimming.

Preserve exact provider message chronology, tool-call/tool-result ordering, model-only tool execution, recoverable TASK-0058 tool failures, reasoning persistence, streamed Chat events, JSONL history, max tool rounds, and user/global settings. Do not change Chat streaming semantics, inference chronology, tool orchestration, or reasoning behavior. Do not add retries, fallback providers, queues, WebSockets, request compression, context summarization, new settings/UI, agents, or tools.

Add deterministic tests without LM Studio or external network access. Test the provider transport factory/configuration seam for disabled headers/body timeouts and a 60-second connect timeout. Simulate a response beyond the old hidden timeout without waiting and prove the application timeout remains authoritative. Test configured application timeout abort/classification/logging, `ECONNREFUSED`, all three structured Undici timeout causes, and abort distinctions. Ensure provider, tool-round, streaming, recoverable-tool-failure, reasoning, persistence, and logging regressions remain passing.

Run:

```text
npm.cmd run build
npm.cmd run build:client
npm.cmd run typecheck:client
npm.cmd run lint
npm.cmd test
```

Acceptance requires disabled lower-level headers/body inference timeouts, bounded connection establishment, authoritative saved inference timeout, precise safe classifications/logging, request size/count diagnostics, intact provider abstraction and chronology, all tests passing, and no unrelated changes.

Create and maintain:

- `docs/executed_tasks/TASK-0059-control-model-transport-timeouts-undici-dispatcher.md`
- `docs/executed_results/TASK-0059-control-model-transport-timeouts-undici-dispatcher.md`

Do not read historical task/result files. The final response must contain only the task ID, PASS/FAIL/BLOCKED status, result path, and one short summary sentence.
