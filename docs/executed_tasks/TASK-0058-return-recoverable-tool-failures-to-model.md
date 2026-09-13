# TASK-0058 — Return recoverable tool failures to the model

Task ID: TASK-0058
Task slug: return-recoverable-tool-failures-to-model

## Goal

Change tool execution failure handling so ordinary external tool failures do not abort the entire Chat inference.

Instead, recoverable tool failures must be converted into structured tool-result messages and returned to the model using the original `tool_call_id`.

The model then decides what to do next.

Do not change the strict rule that only model-generated structured tool calls may execute tools.

## Read first

Run:

    powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\inspect-repo.ps1

Then inspect only relevant files for:

- ChatInferenceService
- ToolRegistry
- DuckDuckGo tool
- Visit Website tool
- streamed inference event flow
- persisted tool_call/tool_result event types
- model provider message construction
- inference logging
- relevant unit/integration tests
- ARCHITECTURE.md
- SECURITY.md
- TESTING.md
- CODINGSTANDARDS.md

Do not use recursive repository listing commands.

Do not read historical executed task/result files.

## Background

Observed behavior:

1. model explicitly requested two `visit_website` calls
2. first tool call succeeded
3. second tool call failed while visiting Reuters
4. server terminated the complete inference with:

    TOOL_EXECUTION_FAILED

This is too aggressive for normal external-tool failures.

A failed website request should normally become information for the model, not a terminal Chat failure.

## Core behavior

For a recoverable tool execution failure:

1. keep the original model-generated tool call
2. catch the tool failure
3. create a bounded structured failure result
4. persist the failure as a `tool_result` event
5. stream the failure result to Chat if tool display is enabled
6. append a matching OpenAI-compatible `role: "tool"` message
7. preserve the original `tool_call_id`
8. continue to the next model round
9. let the model decide whether to:
   - try another source
   - perform another search
   - use existing successful results
   - answer without retrying

Do not automatically retry another tool.

## Structured failure result

Use a clear bounded JSON-safe result.

Conceptually:

    {
      "success": false,
      "error": {
        "code": "WEBSITE_FETCH_FAILED",
        "message": "Unable to retrieve the requested webpage."
      }
    }

Exact structure may follow existing tool result conventions.

Requirements:

- stable machine-readable error code
- short model-readable message
- no stack trace
- no secret values
- no raw internal Error object
- no arbitrary response body dump

If useful and safe, include limited metadata such as:

    status: 403

or:

    reason: "timeout"

Do not expose sensitive headers.

## Successful tool results

Do not change successful tool result behavior.

A round with multiple tool calls may produce a mixture:

    tool A -> success
    tool B -> failure

Both corresponding tool results must be returned to the model.

The successful result must not be discarded because another call failed.

## Multiple tool calls

If the provider response contains:

    tool_call A
    tool_call B

process each according to existing provider order.

If A succeeds and B fails:

- persist/stream result A
- persist/stream failure result B
- append both matching tool messages
- perform the next model round

Do not abort after B solely because B had a recoverable external failure.

## Recoverable failures

Treat expected tool/environment failures as recoverable where appropriate.

For `visit_website`, examples include:

- HTTP 4xx
- HTTP 5xx
- timeout
- DNS/network failure
- connection reset
- unsupported/unreadable returned page content
- bounded parsing/extraction failure

For DuckDuckGo, examples may include:

- HTTP failure
- timeout/network failure
- extraction failure

The concrete tool should provide a controlled error classification where practical.

## Terminal failures

Do NOT turn every possible internal failure into a model-visible tool result.

Terminal inference failure should remain appropriate for problems such as:

- corrupted internal tool registry state
- impossible invariant violation
- persistence failure
- inability to safely serialize the tool result
- malformed internal provider protocol state
- server shutdown/critical infrastructure failure
- unsupported/unregistered tool explicitly requested by the model, unless current architecture already defines a safe model-visible error path

Keep the distinction explicit.

Do not silently swallow programming errors.

## Tool error type

Introduce a small explicit error classification if needed.

Conceptually:

    RecoverableToolError

with fields such as:

    code
    safeMessage
    optional safe metadata

Do not build a large error hierarchy.

Concrete tools may throw/return this controlled failure type.

Unknown exceptions should remain terminal unless they are safely classified at the tool boundary.

## Provider follow-up

For a recoverable failure, append a normal OpenAI-compatible tool message:

    {
      "role": "tool",
      "tool_call_id": "<original id>",
      "content": "{\"success\":false,...}"
    }

Then send the next provider request.

The provider message chronology must remain:

    assistant tool_call
    tool result/failure
    next model response

Do not change ordering.

## Persistence

Persist the failure in the existing typed JSONL event stream as a `tool_result`.

The event should retain:

- toolCallId
- toolName
- success/failure state
- bounded structured result
- createdAt

Do not create a separate failure-history file.

File order remains authoritative.

## Streaming UI

If `showToolCalls = true`, the failed tool result should appear immediately in the existing sand/beige tool activity area.

The UI should make the failure understandable but not alarming.

For example:

    Tool result: visit_website
    Failed: Unable to retrieve the requested webpage.

Do not use the generic red Chat inference error for a recoverable tool failure.

The overall Chat inference should continue.

If the model later returns a final normal answer, render it normally.

## Reasoning visibility

Do not change reasoning behavior.

If the model receives the failed tool result and produces new `reasoning_content`, continue persisting/streaming it according to existing settings.

## Strict model-only execution

Preserve TASK-0057 behavior:

- no tool may execute unless explicitly requested by the model
- a tool failure must not directly trigger another tool
- the server must not inspect the failed URL and choose an alternative
- only the next model response can request another tool

## Logging

Update existing logging so recoverable tool failures are clear.

For example:

    event=tool_execution_failed
    recoverable=true
    tool=visit_website
    tool_call_id=...
    errorCode=WEBSITE_FETCH_FAILED

Then log:

    event=tool_result

for the structured failure result sent to the model.

Do not log the inference itself as terminally failed if the inference continues successfully.

If the model later finishes normally:

    inference_completed

should still be recorded.

If a terminal failure occurs later, log that separately.

## Current reproduction

The previous real failure had this shape:

    DuckDuckGo calls -> success
    model round 2 -> visit_website x2
    first visit -> success
    second visit -> "Website visit failed"
    complete inference -> TOOL_EXECUTION_FAILED

After this task, the expected behavior is:

    first visit -> success result
    second visit -> structured failure result
    model round 3 -> receives both
    model decides next action

## Tests

Automated tests must remain deterministic.

Do not use LM Studio.

Do not use live network access.

### Recoverable Visit Website test

Provider requests:

    visit_website https://example.com/blocked

Tool stub returns/throws controlled recoverable HTTP failure.

Assert:

- inference does not terminate immediately
- matching `tool_result` failure event is persisted
- matching streamed event is emitted
- provider follow-up receives:
      role: "tool"
      matching tool_call_id
      structured failure content
- model is called again
- final assistant response succeeds

### Mixed success/failure test

Provider requests two tools:

    visit_website A
    visit_website B

A succeeds.

B fails recoverably.

Assert:

- both tool calls execute exactly once
- success result A is preserved
- failure result B is preserved
- both tool messages reach the next provider round
- order matches the original provider call order
- inference continues

### DuckDuckGo recoverable failure

Simulate network/HTTP failure.

Assert:

- structured failure result reaches model
- no automatic alternative tool executes
- model gets next decision

### Terminal failure test

Simulate an internal persistence failure after tool execution.

Assert:

- inference terminates
- terminal error is logged
- it is not converted into a fake recoverable tool result

### Unknown exception test

Simulate an unexpected programming/runtime exception outside the classified tool boundary.

Assert safe terminal behavior.

### UI tests

Cover:

- recoverable failed tool result renders in tool activity flow when enabled
- no generic inference-error block appears merely because one tool failed recoverably
- final assistant response can appear after failed tool result
- hidden tool setting still hides the block but persistence remains

### Chronology test

Assert exact sequence:

    user
    reasoning
    tool_call A
    tool_call B
    tool_result A success
    tool_result B failure
    reasoning/final assistant

according to the current actual orchestration.

Do not reorder results after persistence/streaming.

### Logging tests

Assert:

- recoverable failure is logged as recoverable
- inference is not logged as failed merely because that recoverable tool failed
- subsequent model round is logged
- final completion is logged if successful

## Manual verification

After deterministic tests, optionally verify against:

    http://127.0.0.1:1234
    qwen/qwen3.8-27b

Use a prompt that may request multiple webpages.

If one visited site rejects the request:

Verify:

1. failed page creates a visible tool-result failure
2. Chat does not stop with the generic red inference error
3. model receives the failure
4. model chooses the next action itself
5. final assistant response can still complete
6. logs show the recoverable failure and later model round

Do not require this live test for automated PASS.

## Out of scope

Do not add:

- automatic retries
- server-selected fallback websites
- automatic fallback tools
- exponential backoff
- generic retry framework
- changes to tool permissions
- new tools
- changes to Chat Settings
- new logging types
- changes to reasoning UI
- global inference queue
- agents
- context trimming
- new dependencies
- unrelated refactors

## Verification

Run:

    npm.cmd run build
    npm.cmd run build:client
    npm.cmd run typecheck:client
    npm.cmd run lint
    npm.cmd test

## Acceptance

- ordinary external tool failures no longer automatically terminate Chat inference
- recoverable failures become structured tool results
- original tool_call_id is preserved
- failed tool result is persisted
- failed tool result is streamed
- model receives the failed result in the next round
- model alone decides what to do next
- successful sibling tool results are preserved
- no automatic fallback tool executes
- terminal internal failures remain terminal
- inference logs clearly distinguish recoverable tool failures from terminal inference failures
- existing chronology is preserved
- all tests pass
- no new dependencies
- no unrelated changes

## Tracking

Create:

- docs/executed_tasks/TASK-0058-return-recoverable-tool-failures-to-model.md
- docs/executed_results/TASK-0058-return-recoverable-tool-failures-to-model.md

Do not read historical task/result files.

## Final response

Return only:

    Task ID: TASK-0058
    Status: <PASS|FAIL|BLOCKED>
    Result: docs/executed_results/TASK-0058-return-recoverable-tool-failures-to-model.md
    Summary: <one short sentence>
