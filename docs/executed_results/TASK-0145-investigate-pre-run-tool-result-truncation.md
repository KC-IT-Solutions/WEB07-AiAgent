# TASK-0145: Investigate Pre-Run Tool Result Truncation

Task ID: TASK-0145
Status: Completed

## Summary

`[ITEMS TRUNCATED]` is created only by `sanitizeStructuredValue` in
`src/server/agent-execution-safety.ts`. It is an execution-transcript safety representation, not a
marker produced by `fred_data`, persistence, the API, or the frontend.

Pre-run execution retains the raw tool result in memory. `AgentRunService` independently derives:

- a sanitized, item-bounded representation for the persisted execution event; and
- a raw-derived, character-bounded representation for the initial model user context.

The persisted representation and model representation are therefore not identical. Seeing the item
marker in the UI proves that an array in the raw result contained more than 200 items. It does not, by
itself, prove that the model received truncated data. The model receives the complete serialized raw
result when it is at most 32,000 JavaScript string characters, otherwise it receives a separate
prefix-bounded wrapper.

## Exact Marker Source

Production source: `src/server/agent-execution-safety.ts`, in `sanitizeStructuredValue`.

For every array encountered before the depth limit:

1. Keep the first 200 array items with `slice(0, 200)`.
2. Recursively sanitize those retained items.
3. If the original array length is greater than 200, append the literal string
   `[ITEMS TRUNCATED]` as one additional array item.

The marker condition is item count, not serialized character count or byte count. Exactly 200 items
do not produce the marker; 201 or more do. Array order is retained for items `0` through `199`; every
item from index `200` onward is removed.

Related execution-safety rules are separate but run in the same sanitizer:

- Objects retain their first 200 `Object.entries` entries and receive `truncated: true` when they
  have more than 200 keys. Objects do not receive the item marker.
- Strings are redacted and limited to 32,000 JavaScript string characters by `safeExecutionText`.
- Values at structured depth 20 are replaced with `[DEPTH TRUNCATED]`.
- Non-finite numbers become strings; unsupported primitive values are stringified.
- Sensitive-key values, inline credentials, and absolute paths are redacted.
- After structural sanitization, `safeExecutionJson` limits the complete serialized string to 32,000
  JavaScript string characters. Oversized output becomes a fitting JSON object with
  `truncated: true` and a prefix `preview`.

These lengths use JavaScript `string.length` (UTF-16 code units), not UTF-8 byte count.

## Full Data-Flow Trace

1. `FredDataTool.execute` requests metadata and observations through its injected transport.
2. `parseFredResponse` filters malformed observations and maps each valid observation to
   `{ date, value }`. It does not cap, slice, summarize, reverse, or sort the observation array.
3. `FredDataTool.execute` returns a `FredDataResponse` containing the complete parsed observation
   array in provider order.
4. `AgentRunService.executePreRunTools` awaits `tool.execute` and keeps that raw object in the local
   `result` variable and then in `PreRunToolResult.calls`.
5. For execution observability, `AgentRunService` immediately calls `safeExecutionJson(result)` and
   passes that string as `pre_run_tool_result.data.result` to `AgentRunRepository.addExecutionEvent`.
6. The repository does no result truncation or sanitization. It JSON-serializes the event data into
   `agent_run_events.data`. On read, it parses and validates that `result` is a string containing valid
   JSON, without changing that result string.
7. The execution HTTP route returns the repository event array unchanged through `res.json(events)`.
8. `parseExecutionEvents` in `ProjectAgentsSection.ts` validates and retains the event result string.
9. `renderExecution` performs `JSON.parse` followed by indented `JSON.stringify` and assigns the full
   result to `pre.textContent`. The CSS gives the `pre` a maximum visible height and `overflow: auto`;
   it does not remove content.
10. Separately, after all pre-run calls complete, `composeInitialUserContent` receives the raw
    `PreRunToolResult.calls`. It calls `boundedToolResult(call.result)`, not `safeExecutionJson`, and
    embeds that output in the first user message sent to the provider.

Irreversible item truncation therefore occurs in `safeExecutionJson` at step 5, before database
persistence. It affects the execution transcript and UI, but that stored value is not reused to build
the model context.

## Representation Comparison

| Representation | Transformation | Item marker possible | FRED-like 201-item result |
| --- | --- | --- | --- |
| A. Raw tool return | `FredDataTool` parses valid observations; no bounding | No | 201 observations |
| B. Stored execution event | `safeExecutionJson(raw)` before repository insert | Yes | observations 0-199 plus marker; observation 200 lost |
| C. UI display | Parse and pretty-print B; scrollable DOM | Only because B contains it | Same values as B |
| D. `composeInitialUserContent` / provider context | `boundedToolResult(raw)` | Not introduced by this path | All 201 because the test result is below 32,000 characters |
| E. Ordinary Agent model tool result | `boundedToolResult(raw)` to model; independent `safeExecutionJson(raw)` to execution event | Model: no; event: yes | Separate model and transcript representations |

The raw in-memory object is not mutated by either serializer.

## Model-Context Impact

For pre-run calls, the model receives:

- the complete raw result serialized as JSON when its serialized length is at most 32,000
  characters; or
- `{"truncated":true,"content":"<first 32000 characters of serialized raw JSON>"}` when the raw
  serialization is longer than 32,000 characters.

The second wrapper can itself be longer than 32,000 characters because the 32,000-character prefix is
then JSON-escaped and wrapped. The limit is based on JavaScript characters, not bytes or tokens.

The execution event's `[ITEMS TRUNCATED]` representation is never passed into
`composeInitialUserContent`. Consequently, the observed UI marker alone cannot establish which of the
two model cases occurred. Raw serialized length must also be known.

For oversized FRED results, the generic model bound keeps a serialized prefix. FRED preserves
provider observation order. With the normal oldest-to-newest FRED ordering, metadata and earliest
observations are preserved while later/latest observations are removed. That can materially alter
trend, current-value, turning-point, and change-over-period analysis. The execution transcript has a
separate deterministic loss: whenever observations exceed 200, it keeps only the first 200 and loses
all later observations, including the latest under oldest-to-newest ordering.

## Generic 32k Bounding

`AgentRunService.boundedToolResult` is separate from execution safety. It applies to both pre-run
results in initial user content and ordinary model-requested Agent tool results returned through a
`role: "tool"` message. It serializes the raw result and uses the first 32,000 characters in a
`{ truncated: true, content: ... }` wrapper when necessary.

Ordinary Agent tool execution also writes `safeExecutionJson(raw)` to its execution event. As with
pre-run execution, the model-bound and transcript-safe forms are sibling transformations of raw data;
one is not fed into the other.

`ChatInferenceService` has a similarly shaped 32,000-character `boundedToolResult`. Unlike the Agent
execution transcript, Chat parses that same bounded JSON into its persisted tool-result message, so
Chat persistence and Chat provider context share the bounded logical value.

There is no sequential safe-event-then-model double truncation in Agent execution. A single raw Agent
result can nevertheless be represented by two different truncations in parallel. Within
`safeExecutionJson` itself, structural item/depth/string truncation can be followed by the whole-JSON
32,000-character preview bound if the structurally sanitized serialization remains oversized.

## Deterministic Reproduction

The added Agent service test uses a stub named `fred_data`; it performs no external request. Its result
has FRED-like metadata and 201 ordered `{ date, value }` observations.

Observed deterministic values:

- Raw observation count: 201.
- Raw serialized size: 7,835 characters.
- Raw marker present: no.
- `safeExecutionJson` with exactly 200 observations: marker absent.
- Stored execution-event observation-array length: 201 values comprising 200 observations and one
  marker.
- Stored preserved observations: indices 0 through 199.
- Stored removed observations: original index 200 onward; the test's latest item at index 200 is lost.
- Stored serialized result size for the fixture: 7,816 characters.
- Model-context observation count: 201.
- Model marker present: no.
- Model latest observation: preserved, because 7,835 is below the generic 32,000-character bound.

The frontend diagnostic assertion confirms the renderer directly parses and pretty-prints the stored
result rather than applying another shortening transformation.

## Safety And Observability

Observed facts:

- `safeExecutionJson` combines redaction, structured size/depth limits, and a final serialized-size
  limit before execution-event persistence.
- This bounds execution-log/database growth, limits payload and UI work, prevents extreme nesting,
  and reduces secret/path exposure in persisted/API/UI execution data.
- `boundedToolResult` limits raw tool data included in inference context, addressing excessive model
  context independently of transcript safety.
- The UI scroll boundary is presentation-only and does not protect storage or provider context.

Interpretation:

- The colocated redaction and bounding behavior indicates that execution safety is intentionally a
  defense for durable observability data, not a FRED-specific policy.
- Removing the item cap would weaken database, API, and UI protections unless replaced by another
  bounded representation.

## Tests Changed

- `tests/unit/agent-run-service.test.ts`
  - Added one deterministic FRED-like pre-run diagnostic covering raw count, the exact 200/201 marker
    threshold, stored first-200 behavior, loss of the latest item, and complete below-32k model
    context.
- `tests/frontend/projects-ui.test.ts`
  - Added one assertion that execution rendering only parses and pretty-prints the stored result.

Targeted diagnostic verification also passed:

- `npm.cmd run test:compile`
- `node --test .test-dist/tests/unit/agent-run-service.test.js` (91 passed)
- `node --test .test-dist/tests/frontend/projects-ui.test.js` (158 passed)

## Production Code

No production files were changed. No truncation limits or behavior were removed, raised, or modified.

## Architecture

No architecture change. The investigation confirms the existing separation between raw runtime data,
sanitized persistent execution events, frontend presentation, and provider messages.

## Dependencies

No dependencies were added or changed.

## Risks / Findings

- The execution UI is not a faithful complete view of raw pre-run arrays over 200 items, although it
  currently gives only a marker and not the omitted count or retained range.
- The UI marker can be misread as proof of provider-context truncation, but model truncation has a
  separate 32,000-character condition.
- For FRED series with more than 200 observations, execution diagnostics lose later/latest values.
- For FRED results over 32,000 serialized characters, the model's prefix strategy can lose the newest
  observations and materially impair time-series analysis.
- Character-prefix truncation can split the raw JSON at an arbitrary location. It remains valid as the
  wrapper's `content` string, but the content is not a complete JSON representation of the tool result.
- Agent transcript safety and model-context bounding duplicate limit values but implement different
  contracts. Future changes to one can easily be mistaken for changes to the other.

## Recommended Follow-Up

Create a separate implementation task to define and implement bounded, latest-aware pre-run
time-series representation while preserving redaction, database-size, UI-performance, and model-context
safety. The follow-up should explicitly decide:

- whether execution events should retain head and tail items with an omitted count;
- whether model context should use a structurally valid, latest-preserving representation rather than
  a raw character prefix;
- whether the policy should be generic or tool/result-shape aware; and
- how to make raw count, retained ranges, and truncation reason observable without exposing secrets.

No follow-up fix was implemented in this task.

## Verification

All five required commands passed:

- `npm.cmd run build` - PASS
- `npm.cmd run build:client` - PASS
- `npm.cmd run typecheck:client` - PASS
- `npm.cmd run lint` - PASS
- `npm.cmd test` - PASS (1,117 tests passed, 0 failed)

## Files Changed

- `docs/executed_tasks/TASK-0145-investigate-pre-run-tool-result-truncation.md`
- `docs/executed_results/TASK-0145-investigate-pre-run-tool-result-truncation.md`
- `tests/unit/agent-run-service.test.ts`
- `tests/frontend/projects-ui.test.ts`

## Deviations

None. The investigation used deterministic stubs only, made no live FRED or model-provider calls, and
made no production behavior change.

## Diff Summary

Added task/result traceability and two minimal diagnostic test changes. Production diff: none.
