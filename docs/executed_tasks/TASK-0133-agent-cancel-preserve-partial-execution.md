# TASK-0133: agent-cancel-preserve-partial-execution

**Task ID:** TASK-0133
**Slug:** agent-cancel-preserve-partial-execution

## Goal

When a running Agent inference is cancelled, preserve any partial streamed model output already received in the Agent Execution transcript.

## Requirements

### Current behavior
Cancelled inference may already return partial data with `reasoningContent` and/or `content` fields on the `inference_cancelled` event.

### Required behavior
When handling an inference result with `type === 'cancelled'`:
- If `reasoningContent` is a non-empty string: append one `reasoning` execution event containing that text
- If `content` is a non-empty string: append one `assistant_message` execution event containing that text
- Then retain the existing `inference_cancelled` event and cancellation metadata behavior

### Required chronology
```
user_task
...
reasoning          // only if partial reasoning exists
assistant_message  // only if partial content exists
inference_cancelled
```

### Critical semantics
- partial content is NOT a final result
- never create `final_result` from cancelled output
- run status remains `cancelled`
- do not execute tool calls from cancelled partial output
- do not continue inference after cancellation
- do not trigger next Agent
- do not save result file
- do not alter pause/resume semantics
- preserve existing finishReason / usage metadata on `inference_cancelled`
- preserve existing cancellation abort behavior
- reasoning remains display-only and must never re-enter inference context

## Scope
- Prefer changing only Agent cancelled-inference handling in `src/server/services/agent-run-service.ts`
- Update relevant tests in `tests/unit/agent-run-service.test.ts`

## Tests Required
12 deterministic tests covering all scenarios.
