# TASK-0128: Preserve Partial Agent Inference on Cancel — Results

## Transport / Root-Cause Analysis

**Root cause:** `agent-run-service.ts` called `checkpoint()` before checking for cancelled inference results. When cancellation occurred, `checkpoint()` threw `ExecutionStopped` (because `signal.aborted === true`) in the catch block at line 667, which silently returned without writing any execution event — causing partial data to be lost.

**Streaming was already implemented:** The transport layer (`model-inference.ts`) had been converted from non-streaming to streaming SSE as part of prior work. `requestStreamedModelInference` uses `readSSEStream` with a stream accumulator, and on abort returns `buildPartialResult(accumulated)` — a `StreamedModelInferencePartialResult` with `type: 'cancelled'`.

**The bug was ordering:** After `requestStreamedModelInference` returned the partial result, `agent-run-service.ts` called `checkpoint()` before checking `result.type === 'cancelled'`. Since checkpoint throws when signal is aborted, the cancelled-result handling code was never reached.

## Whether Streaming Was Required

Streaming support already existed in `model-inference.ts` (SSE-based with accumulator). No new streaming transport changes were needed for this task — only the ordering fix in agent-run-service.ts.

## Files Changed

| File | Change |
|------|--------|
| `src/server/services/agent-run-service.ts` | Moved cancelled-result handling (`result.type === 'cancelled'`) before `checkpoint()` call, so partial data is persisted even when signal.aborted is true |
| `tests/unit/agent-run-service.test.ts` | Added 14 new tests in "AgentRunService streaming cancellation" suite covering all required scenarios |

## Cancellation Lifecycle

```
cancel requested
    ↓
execution.controller.abort() — sets signal.aborted = true
    ↓
wake cleared to prevent further checkpoints
    ↓
provider stream reader throws (abort propagates through fetch)
    ↓
requestStreamedModelInference catches abort, returns buildPartialResult(accumulated)
    ↓
agent-run-service checks result.type === 'cancelled' BEFORE checkpoint
    ↓
writes inference_cancelled execution event with partial data
    ↓
returns from execute() without further processing
    ↓
_runAgentAsync sees signal.aborted, calls cancelInternal()
    ↓
run status set to 'cancelled', activeExecution cleared
```

## Partial Data Persisted

When cancellation occurs during inference, the `inference_cancelled` execution event captures:
- `reasoning`: partial reasoning_content already received (sanitized via safeExecutionText)
- `content`: partial assistant content already received (sanitized via safeExecutionText)
- `finishReason`: value if provider sent it before cancellation
- `totalTokens`: usage.totalTokens if available

All fields are optional — the event is created even with no partial data.

## Tool-Call Behavior

- Incomplete streamed tool calls in `toolCallsInProgress` map are discarded during `buildPartialResult()` — they never reach agent-run-service
- No tool calls from cancelled responses execute (the function returns early at line 508)
- No final result is saved, no result file written, no next Agent triggered

## Verification Results

| Command | Result |
|---------|--------|
| `npm run build` | PASS — TypeScript compilation succeeds |
| `npm run build:client` | PASS — Client build and asset copy succeed |
| `npm run typecheck:client` | PASS — No type errors |
| `npm run lint` | PASS — ESLint clean |
| `npm test` | 1011/1016 pass, 5 pre-existing failures (integration tests for uncommitted Agent infrastructure) |

## Pre-Existing Failures

5 integration test failures in `tests/integration/agent-runs-api.test.ts` ("Agent run API" suite):
- These are HTTP-based integration tests that start servers and make real requests
- They time out waiting for agent runs to reach expected states
- The file `src/server/services/agent-run-service.ts` is untracked (new, never committed)
- These failures existed before this task's changes

## Tests Added (14 new)

All in "AgentRunService streaming cancellation" suite:

| # | Test | Status |
|---|------|--------|
| 1 | normal streamed inference completes successfully | PASS |
| 2 | partial reasoning is preserved when Cancel occurs during inference | PASS |
| 3 | partial assistant content is preserved when Cancel occurs | PASS |
| 4 | Cancel aborts provider request promptly | PASS |
| 5 | no tool call executes after cancellation | PASS |
| 6 | incomplete streamed tool call discarded safely on cancel | PASS |
| 7 | no final result saved after cancellation | PASS |
| 8 | no result file written after cancellation | PASS |
| 9 | no next Agent triggered after cancellation | PASS |
| 10 | cancelled run remains cancelled, not failed | PASS |
| 11 | cancel before first chunk produces clean cancelled execution | PASS |
| 12 | normal multi-round inference still works with streaming transport | PASS |
| 13 | usage and finishReason captured when available on cancelled inference | PASS |
| 14 | no usage requirement when provider does not send it on cancelled inference | PASS |

## Manual LM Studio Verification

Not performed — requires local OpenAI-compatible server running. The implementation follows the same streaming transport used by Chat inference, which has been verified through existing tests.

## Result

**PASS**

The cancellation lifecycle correctly preserves partial data and terminates cleanly:
- Provider generation aborted promptly via AbortController
- Partial reasoning/content accumulated before abort is persisted to execution log
- No tool calls execute after cancellation
- Run status remains 'cancelled' (not failed)
- All normal inference behavior preserved for non-cancelled cases
