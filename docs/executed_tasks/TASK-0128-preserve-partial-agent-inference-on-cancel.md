# TASK-0128: Preserve Partial Agent Inference on Cancel

## Task ID
TASK-0128

## Slug
preserve-partial-agent-inference-on-cancel

## Goal
When an Agent is cancelled during an active model inference, abort provider generation promptly while preserving partial reasoning/content already received. Write that partial data to the Agent Execution log, then terminate the run as cancelled exactly as before. Do not wait indefinitely for the model to finish naturally.

## Requirements
- Cancel currently aborts the request, but with non-streaming response any reasoning/content produced before disconnect is lost
- Add focused streaming support for Agent inference only if needed (do not redesign Chat inference unless shared transport changes are necessary)
- Request provider streaming in an OpenAI-compatible way
- Accumulate assistant content incrementally
- Accumulate reasoning_content incrementally when provider supplies it
- Preserve correct chronological chunk order
- Collect usage/finishReason when available
- Keep normal completed inference semantics unchanged
- On Cancel: AbortController must abort the provider request promptly, persist any accumulated partial data before terminating execution
- Add explicit cancelled-inference entries to Execution log with partial reasoning/content/finish reason/usage/tokens/cancellation indication
- No tool calls execute after cancellation
- No final result saved after cancellation
- No next Agent triggered after cancellation
- Run status must remain cancelled, not failed

## Edge Cases
- cancel before first response chunk
- cancel after partial reasoning only
- cancel after partial assistant content
- cancel while streamed tool-call arguments are incomplete
- provider closes stream normally before abort arrives
- AbortError during stream read
- provider without reasoning_content
- provider that does not return usage during cancelled stream

## Compatibility
Preserve existing non-cancelled Agent behavior, multi-round tool loop, per-Agent timeout, temperature/topP, inference serialization queue, latestTotalTokens semantics, execution/reasoning display, normal error handling, Chat behavior unless transport sharing requires minimal compatible changes.

## Tests Required (14 minimum)
Mock-provider tests covering all cancellation scenarios and normal streaming completion.

## Verification Commands
npm.cmd run build; npm.cmd run build:client; npm.cmd run typecheck:client; npm.cmd run lint; npm.cmd test
