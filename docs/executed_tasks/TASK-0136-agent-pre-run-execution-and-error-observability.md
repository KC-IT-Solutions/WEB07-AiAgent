# TASK-0136: Agent pre-run execution and error observability

Task ID: TASK-0136
Slug: agent-pre-run-execution-and-error-observability

## Instruction

Goal

Make Agent pre-run tool execution visible in the Agent Execution UI and make pre-run failures visible in the Agent error log.

TASK-0135 introduced system-initiated pre-run tool calls from Project JSON files.

Currently those calls are not sufficiently visible in Agent execution history, and failures must also be surfaced through the Agent's existing error log.

Required behavior

Successful pre-run activity must appear in Agent Execution chronology.

Failed pre-run initialization must create a meaningful Agent error entry.

Pre-run activity must remain semantically distinct from model-requested tool calls.

Do not fabricate or require tool_call_id values.

Execution events

Add dedicated execution event types for successful pre-run activity:

    pre_run_tool_call
    pre_run_tool_result

Do not reuse:

    tool_call
    tool_result

because those represent model-requested calls correlated through provider-generated tool_call_id values.

A pre-run tool call event should preserve safe display information such as:

    toolName
    inputFile
    callIndex
    arguments

A pre-run tool result event should preserve safe display information such as:

    toolName
    inputFile
    callIndex
    result

Do not add tool_call_id.

The event representation may follow existing execution-event data conventions.

Execution chronology

Pre-run events must appear in the actual chronological order in which the run executes them.

For example:

    User task
    Pre-run tool call — fred_data — Call 1
    Pre-run tool result — fred_data — Call 1
    Pre-run tool call — fred_data — Call 2
    Pre-run tool result — fred_data — Call 2
    Provider reasoning
    Assistant
    Final result

If several tools are configured, preserve the same deterministic tool and call ordering established by TASK-0135.

If a configured pre-run file contains an empty array, do not create synthetic call/result events.

Rendering

Update Agent Execution frontend parsing and rendering to accept:

    pre_run_tool_call
    pre_run_tool_result

Use human-readable labels:

    Pre-run tool call
    Pre-run tool result

Display enough metadata to debug the pre-run phase:

For pre_run_tool_call:
- tool name
- Project-relative input file
- call number/index
- arguments

For pre_run_tool_result:
- tool name
- Project-relative input file
- call number/index
- returned result

Do not:
- require tool_call_id
- display a fabricated tool_call_id
- treat these events as normal model tool events
- render them as reasoning, assistant content, or final_result

Use existing safe JSON display behavior where appropriate.

Do not introduce unsafe JSON.parse behavior for already-parsed event data.

Error logging

Any failure during pre-run initialization must be recorded in the Agent's existing error log.

This includes failures caused by:

- configured file missing
- configured file unreadable
- Project path violation
- malformed JSON
- non-array top-level JSON
- invalid array element
- invalid tool arguments
- unavailable configured tool
- failed pre-run tool execution
- any other controlled pre_run_initialization failure

The error entry must include enough safe diagnostic metadata to identify the failure.

Where available, preserve:

    stage: pre_run_initialization
    toolName
    inputFile
    callIndex
    arguments
    errorCode
    errorName
    errorMessage

Do not fabricate missing metadata.

If the failure happens before a specific call exists, callIndex and arguments may be omitted.

If arguments may contain data that existing logging rules consider unsafe, follow the existing safe logging/redaction conventions instead of weakening them.

Failure semantics

Preserve TASK-0135 fail-fast behavior.

On pre-run failure:

- stop remaining pre-run processing
- do not start first model inference
- do not send partial successful pre-run results to the provider
- do not create final_result
- do not continue chaining/result-file behavior

Successful pre-run events already recorded before a later failure may remain in Execution chronology because they accurately represent work that occurred.

The failure itself must be visible in the Agent error log.

Do not fake a successful pre_run_tool_result for a failed call.

No tool_call_id

Pre-run execution is system-initiated.

It must not:

- create tool_call_id
- require tool_call_id
- persist synthetic tool_call_id
- expose synthetic tool_call_id
- create synthetic assistant tool calls
- create provider tool messages

Normal model-requested tool calls must continue to preserve provider-generated tool_call_id values exactly as today.

Runtime integration

Primary runtime location is expected to be:

    src/server/services/agent-run-service.ts

Integrate event creation at the actual points where TASK-0135 executes and receives pre-run calls/results.

Use the existing execution-event repository/service boundary rather than introducing a parallel execution history mechanism.

Integrate failures with the existing Agent run error repository/service used by the Agent Errors UI.

Do not create a separate pre-run error store.

Frontend

Primary frontend location is expected to be:

    src/client/components/projects/ProjectAgentsSection.ts

Extend the execution event model/parser/renderer only as needed for:

    pre_run_tool_call
    pre_run_tool_result

Preserve all existing event parsing/rendering, including:

    user_task
    reasoning
    assistant_message
    final_result
    tool_call
    tool_result
    inference_cancelled

Agent Errors UI should use the existing error payload/rendering path. Extend parsing/rendering only if required to safely display the new pre-run diagnostic metadata.

Scope

Do not modify unrelated behavior.

Do not change:

- TASK-0135 pre-run JSON file format
- per-Agent/per-tool persistence
- Project file selector behavior
- Project containment rules
- normal model inference
- normal model-requested tool calls
- provider-generated tool_call_id handling
- unbounded multi-round Agent tool loop
- cancellation semantics
- chaining
- result files
- attached-file behavior
- provider message shape
- initial pre-run user-context composition

Tests

Add/update deterministic tests proving:

1. successful pre-run call creates pre_run_tool_call execution event
2. successful pre-run call creates matching pre_run_tool_result execution event
3. events contain toolName
4. events contain Project-relative inputFile
5. events contain call index/order
6. pre_run_tool_call contains arguments
7. pre_run_tool_result contains result
8. multiple calls preserve execution chronology
9. multiple tools preserve deterministic chronology
10. empty pre-run array creates no pre-run call/result events
11. pre-run events do not contain or require tool_call_id
12. normal model tool events remain unchanged and still use provider-generated tool_call_id
13. frontend parser accepts pre_run_tool_call
14. frontend parser accepts pre_run_tool_result
15. frontend renders label `Pre-run tool call`
16. frontend renders label `Pre-run tool result`
17. frontend displays tool name, input file, call order, arguments/result
18. pre-run events are not parsed/rendered as normal model tool events
19. pre-run events do not break the complete Agent Execution payload
20. pre-run file/read/JSON/validation failures create Agent error-log entries
21. failed tool execution creates an Agent error-log entry
22. pre-run error metadata includes stage `pre_run_initialization`
23. toolName/inputFile/callIndex/arguments are included where available
24. failure before a specific call safely omits unavailable call metadata
25. later-call failure leaves first inference unexecuted
26. partial successful pre-run data is not sent to the provider after failure
27. no fake successful result event is emitted for the failed call
28. existing Agent Errors behavior remains unchanged for non-pre-run errors
29. existing execution parsing/rendering remains unchanged for all existing event types

Tests must be deterministic and must not use external providers.

Verification

Run:

    npm.cmd run build
    npm.cmd run build:client
    npm.cmd run typecheck:client
    npm.cmd run lint
    npm.cmd test

All five must PASS.

Before final response

Create:

docs/executed_results/TASK-0136-agent-pre-run-execution-and-error-observability.md

Report:
- runtime implementation location
- execution event types added
- execution metadata preserved
- frontend parser/renderer changes
- Agent error-log integration
- pre-run failure metadata
- tool_call_id handling
- files changed
- focused tests
- all five verification results
- PASS/BLOCKED
