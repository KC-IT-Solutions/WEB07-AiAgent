# TASK-0063 - Make DuckDuckGo search failures explicit and remove fixed tool-round cap

Task ID: TASK-0063
Task slug: robust-duckduckgo-search-and-unbounded-tool-rounds

## Goal

Fix the long-running tool loop observed during Skill-driven news compilation.

The root problem is not that the model uses too many tool rounds. DuckDuckGo search can return an apparently successful `{"results":[]}` result for ordinary queries when the provider response is unusable, causing repeated query reformulation.

## Instruction

Implement two changes:

1. DuckDuckGo search must distinguish genuine no-result searches from unusable/failed provider responses.
2. Remove any fixed model/tool round cap that prevents the model from continuing as long as the overall inference remains valid.

Do not change Skill behavior, provider chronology, model-only tool execution, or recoverable tool failure semantics.

### Repository inspection

- Run `powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\inspect-repo.ps1` first.
- Inspect only relevant current DuckDuckGo, tool error/registry, inference loop, timeout/abort, logging, chronology test, architecture, testing, security, and coding-standard files.
- Do not use recursive repository listing commands.
- Do not read historical executed task/result files.

### Inference termination and cancellation

- A Chat inference normally ends only when the model returns a final response without tool calls, the user aborts, the configured overall inference timeout is reached, or a terminal internal/invariant error occurs.
- Remove fixed provider/tool round-count limitations without replacing them with another arbitrary cap, silently truncating, or fabricating a response.
- Keep the configured inference timeout authoritative.
- Every provider round and tool phase must continue respecting the existing AbortSignal, user cancellation, and configured inference timeout.
- Do not introduce polling or background execution.

### DuckDuckGo response semantics

- Classify responses as valid results, valid no-results, or unusable response, using project-conventional internal names.
- Treat a page as valid only when it has expected result-page structure, using robust structural checks for result containers, known markers, or a known no-results marker.
- Do not treat arbitrary HTML, challenge/error/consent pages, redirects, or changed markup as successful empty searches.
- A clearly valid explicit no-results page returns the normal successful result with `results: []`.
- A 2xx page with neither recognizable result structure nor explicit no-results state fails through the existing recoverable mechanism with a stable safe code/message, conceptually `SEARCH_RESPONSE_UNUSABLE` and `Search provider returned an unusable response.`
- When the first response is unusable, perform at most one controlled internal fallback using the smallest robust DuckDuckGo request variant already supported or suitable to the implementation.
- Keep the intermediate failed response hidden from the model.
- Do not introduce another provider, retry framework, or indefinite retries.
- Preserve existing recoverable behavior for network, timeout, refused/reset connection, non-success HTTP, unreadable response, and extraction failures.
- Preserve result shape, limits, SafeSearch/settings behavior, and URL normalization/security checks.
- Validation remains inside the tool and raw HTML must not be exposed to the model.

### Tool and provider invariants

- An unusable response becomes a recoverable tool failure whose matching tool result is persisted/streamed and returned safely to the model 1:1 with the originating tool call.
- Do not make it a terminal Chat inference error.
- Preserve exact chronology: assistant tool-call response, matching tool results in execution order, then next provider request.
- Do not sort, group, or reorder messages.
- Do not change active Skill resolution, Skill system messages or order, Skill-required tool union, Skill Markdown storage, or slash commands.
- The Skill system message remains first in every provider round.

### Observability

- Add bounded DuckDuckGo diagnostic fields where useful, including response status/bytes, parsed result count, recognition flags, fallback usage, and classification.
- Do not log full HTML, credentials, or Skill Markdown in new tool-specific logs.
- Use the existing logger.

### Deterministic tests

- Mock valid DuckDuckGo result HTML and assert parsed entries, no fallback, and no recoverable error.
- Mock an explicit valid no-results page and assert successful empty results and valid classification behavior.
- Mock an unusable first response followed by valid fallback and assert exactly one fallback, successful parsed output, and no raw/intermediate response leak.
- Mock two unusable responses and assert exactly two attempts, stable RecoverableToolError code/message, no successful empty result, and no raw HTML leak.
- Assert the fallback path never exceeds two requests per tool execution and never uses real network access.
- Use a deterministic provider stub producing tool calls for six rounds and a final response on round seven; assert all rounds execute, chronology remains exact, and tools remain model-originated.
- Use a deterministic indefinitely continuing provider/tool loop and trigger configured timeout/AbortSignal without waiting real minutes; assert timeout classification and no later rounds.
- Simulate user/request abort during a multi-round inference and assert current operation aborts, no subsequent provider request begins, and cleanup follows existing architecture.
- Keep regression coverage green for Skills, system message order, effective tools, slash routing, recoverable failures, website visits, model-only execution, chronology, reasoning, history, streaming, transport timeout, and admin Skill CRUD.

### Verification

Run:

```text
npm.cmd run build
npm.cmd run build:client
npm.cmd run typecheck:client
npm.cmd run lint
npm.cmd test
```

Manual local-model verification is optional and not required for PASS.

### Acceptance criteria

- The fixed model/tool round cap is removed and inference may continue beyond five rounds.
- Configured timeout/cancellation remain authoritative.
- Valid DuckDuckGo results work and genuine explicit no-results can return `results: []`.
- Structurally unusable responses never masquerade as successful empty searches.
- Unusable responses receive at most one internal fallback, then a recoverable failure if still unusable.
- The matching recoverable tool result returns safely to the model without raw HTML leakage.
- Exact provider chronology and Skill behavior remain unchanged.
- All required verification passes with no unrelated changes.

### Out of scope

Do not implement another search provider, ranking changes, server query rewriting, prompt changes, generic retries/circuit breakers, context trimming, token budgeting, tool-round UI counters, arbitrary new caps, unrelated refactors, or new dependencies unless absolutely required.

### Tracking and final response

- Create `docs/executed_results/TASK-0063-robust-duckduckgo-search-and-unbounded-tool-rounds.md`.
- Re-read the task file before implementation and the result file before the final response.
- Return only the requested four-line Task ID, status, result path, and one-sentence summary.
