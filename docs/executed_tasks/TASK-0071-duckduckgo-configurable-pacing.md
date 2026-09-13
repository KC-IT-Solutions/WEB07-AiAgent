# TASK-0071 - Add configurable DuckDuckGo pacing and cooldown

Task ID: TASK-0071
Task slug: duckduckgo-configurable-pacing

## Instruction

Add configurable request pacing for `duckduckgo_search` while preserving browser-profile rotation, response classification, one-fallback behavior, cancellation, and all other stated invariants.

Add integer millisecond tool settings `requestDelayMs` and `cooldownAfter202Ms`, validated server-side as finite integers greater than or equal to zero, with defaults of `1500` and `8000`. Older saved JSON settings without these fields must remain valid and receive defaults through the existing settings mechanism, without a database migration unless the persistence design requires one.

Expose both settings in the existing DuckDuckGo Settings UI as numeric inputs labeled `Request delay (ms)` and `Cooldown after HTTP 202 (ms)`, with minimum `0` and step `1`. Verify rendering, current/saved values, defaults for old settings, editing, and persistence through the existing API.

Implement a small process-shared DuckDuckGo-specific scheduler used by all production `duckduckgo_search` executions. Requests must enter in deterministic arrival order, and only one external DuckDuckGo request may pass the gate at a time. Every primary and fallback request must supply the execution's captured effective `requestDelayMs` and pass through the same gate. The next request start must respect both `lastRequestStartedAt + requestDelayMs` and any globally established HTTP 202 cooldown. An HTTP 202 response must centrally extend the shared cooldown to at least response time plus that execution's `cooldownAfter202Ms`; a later request with smaller settings must not weaken it. An HTTP 200 structurally unusable response receives normal pacing only.

Gate waiting must respect the existing inference-scoped `AbortSignal`, reject promptly when cancelled or timed out, make no fetch for an aborted queued request, leave the scheduler usable afterward, and create no independent timeout. Resolve settings before external waiting and hold no SQLite transaction during waits. Newly started executions use current resolved settings, while settings changes do not mutate an execution already waiting.

Preserve existing bounded diagnostics and add only bounded pacing metadata if useful. Do not log sensitive or raw response data. Do not add generic retries, a generic queue/HTTP abstraction, new dependencies, or more than the existing primary plus optional one fallback.

Add deterministic tests with a seam around time and waiting, without real multi-second sleeps or new fake-timer dependencies. Cover normal 1500 ms pacing, zero delay, shared HTTP 202 cooldown, fallback after 202, fallback normal pacing, independent tool executions sharing the scheduler, queued AbortSignal behavior and recovery, settings validation accepted/rejected values, frontend behavior, and old saved settings receiving defaults.

Do not change DuckDuckGo browser profiles, response parsing, structural classification, one-fallback limit, SafeSearch behavior, result shape, model-only tool execution, exact provider chronology, recoverable failures, inference cancellation/timeout, Skill behavior, Chat history, `visit_website`, Chat autoscroll, or unrelated Settings architecture.

Run:

```text
npm.cmd run build
npm.cmd run build:client
npm.cmd run typecheck:client
npm.cmd run lint
npm.cmd test
```

Create `docs/executed_results/TASK-0071-duckduckgo-configurable-pacing.md`, re-read it before responding, and return only the requested Task ID, status, result path, and one-sentence summary.
