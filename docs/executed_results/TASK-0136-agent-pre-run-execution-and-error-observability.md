# TASK-0136: Agent pre-run execution and error observability

Task ID: TASK-0136
Status: PASS

## Summary

Agent pre-run calls and successful results now appear in the persisted Agent Execution chronology as dedicated system-initiated event types. Controlled pre-run failures continue to fail fast and now persist sanitized diagnostic metadata through the existing Agent run error record and Agent Errors API/UI.

## Repository Analysis

- `AgentRunService` already owned TASK-0135 pre-run execution and normal model-requested tool execution.
- `AgentRunRepository` already persisted both operational and typed execution events in `agent_run_events`, ordered by event ID.
- The Agent Errors API already derived historical entries from failed runs' persisted `safeError` values.
- `ProjectAgentsSection` already parsed and rendered the Execution and Error log payloads.
- No new persistence table, API route, service boundary, or error store was required.

## Runtime Implementation Location

- `src/server/services/agent-run-service.ts` emits `pre_run_tool_call` immediately before each configured invocation and `pre_run_tool_result` only after that invocation succeeds.
- Events are emitted inside the existing deterministic tool-name and JSON-array-order loops, preserving actual chronology.
- Empty arrays execute no calls and emit no pre-run call/result events.
- Existing fail-fast behavior remains: a failure stops remaining pre-run work before provider inference, final-result handling, result-file output, or chaining.

## Execution Event Types Added

- `pre_run_tool_call`
- `pre_run_tool_result`

`src/server/agent-run-types.ts` defines distinct event shapes, and `src/server/repositories/agent-run-repository.ts` validates, persists, filters, and returns them through the existing Execution boundary.

## Execution Metadata Preserved

- Call events contain sanitized `toolName`, Project-relative `inputFile`, one-based `callIndex`, and bounded/redacted serialized `arguments`.
- Result events contain sanitized `toolName`, Project-relative `inputFile`, one-based `callIndex`, and bounded/redacted serialized `result`.
- The existing `safeExecutionText` and `safeExecutionJson` conventions are reused.

## Frontend Parser And Renderer

- `src/client/components/projects/ProjectAgentsSection.ts` adds dedicated typed parsing for both pre-run event types.
- Parsed data is validated independently from model tool events and does not require a tool-call ID.
- Labels are `Pre-run tool call` and `Pre-run tool result`.
- Rendering shows tool name, input file, call number, and formatted arguments or result.
- Existing content, model tool, and `inference_cancelled` parsing/rendering remains intact.
- `src/client/components/projects/projects.css` gives pre-run call/result entries the established structured-tool event styling.

## Agent Error-Log Integration

- Pre-run failures are persisted by the existing `AgentRunRepository.fail` path in the run's `safeError` value.
- `AgentRunRepository.listErrors` returns the optional diagnostics through the existing Agent Errors API.
- The existing Error log UI parses and displays available pre-run diagnostics without creating a separate store or endpoint.
- Non-pre-run errors retain their existing three-field safe error payload and behavior.

## Pre-Run Failure Metadata

All controlled pre-run errors preserve `stage: pre_run_initialization`, the existing safe `code` and `message`, and, where available:

- `toolName`
- `inputFile`
- `callIndex`
- sanitized serialized `arguments`
- `errorCode`
- `errorName`
- sanitized `errorMessage`

File/read/JSON failures before a specific call omit `callIndex` and `arguments`. Invalid elements and failed invocations include their one-based call index and safely serialized argument value. Missing/unreadable/outside-Project files, malformed/non-array JSON, invalid elements/schema arguments, unavailable tools, tool-level argument rejection, and invocation failures use this path.

## Tool-Call ID Handling

- Pre-run event types contain no `toolCallId` or `tool_call_id` field.
- No ID is generated, required, persisted, displayed, or sent to the provider for pre-run execution.
- No synthetic assistant call or provider tool message is created.
- Existing normal `tool_call` and `tool_result` events remain unchanged and preserve provider-generated tool-call IDs.

## Files Changed

- `docs/ARCHITECTURE.md`
- `docs/executed_tasks/TASK-0136-agent-pre-run-execution-and-error-observability.md`
- `docs/executed_results/TASK-0136-agent-pre-run-execution-and-error-observability.md`
- `src/server/agent-run-types.ts`
- `src/server/repositories/agent-run-repository.ts`
- `src/server/services/agent-run-service.ts`
- `src/client/components/projects/ProjectAgentsSection.ts`
- `src/client/components/projects/projects.css`
- `tests/unit/agent-run-persistence.test.ts`
- `tests/unit/agent-run-service.test.ts`
- `tests/frontend/projects-ui.test.ts`

## Focused Tests

Command:

`node --test --test-concurrency=1 .test-dist/tests/unit/agent-run-persistence.test.js .test-dist/tests/unit/agent-run-service.test.js .test-dist/tests/frontend/projects-ui.test.js`

Result: PASS, 236 tests passed, 0 failed.

Coverage includes dedicated persistence shapes; call/result metadata and ID absence; deterministic multi-tool/multi-call chronology; empty arrays; all configured file/read/JSON/element/schema failures; unavailable tools; later invocation failure; no failed-call result or final result; no provider inference or partial context after failure; existing error-log retrieval; frontend parsing, labels, metadata rendering, ID separation, and existing event compatibility. Existing tests continue to verify provider-generated IDs for normal model tool calls and unchanged non-pre-run errors.

## Tests And Verification

- `npm.cmd run build`: PASS
- `npm.cmd run build:client`: PASS
- `npm.cmd run typecheck:client`: PASS
- `npm.cmd run lint`: PASS
- `npm.cmd test`: PASS, 1,088 tests passed, 0 failed

## Production Code

The requested runtime, persistence parsing, frontend display, and error-log behavior are implemented. No migration or dependency change was required.

## Architecture

The implementation reuses the existing Agent run orchestration, execution-event repository, failed-run `safeError`, Agent Errors API, and Project Agent UI. Dedicated event types preserve the semantic boundary between system pre-run work and provider-requested tool calls.

## Dependencies

No dependencies were added or changed.

## Deviations

None.

## Risks / Findings

- The workspace contained extensive pre-existing modified and untracked files. They were not reverted or modified outside the task-relevant files listed above.
- `docs/ARCHITECTURE.md` already contained unrelated uncommitted changes; this task changed only the pre-run execution paragraph.

## Diff Summary

Added two typed pre-run execution events, emitted them around actual successful pre-run work, enriched existing safe Agent errors with optional sanitized phase diagnostics, rendered both event types and diagnostics in the existing UI, and added deterministic regression coverage.
