# TASK-0135: Agent tool pre-run input file

Task ID: TASK-0135
Status: PASS

## Summary

Added an optional Project-relative JSON pre-run input file to each enabled Agent-tool relationship. Configured calls run sequentially before the first provider inference, fail the run on the first initialization error, and prepend successful arguments/results to the existing single initial user message before the unchanged Agent task.

## Repository Analysis

- Agent configuration is split between `agents.data` and relational `agent_tools` rows.
- `agent_tools.data` was an existing JSON field containing `{}`, making it the compatible relationship-owned persistence location without a schema migration.
- Agent execution and the normal unbounded provider tool loop are coordinated by `AgentRunService`.
- Project file ownership, lexical containment, real-path containment, and safe filesystem errors are enforced by `ProjectFilesystemService` and its store.
- External tools already expose JSON input schemas and execute through `ToolRegistry` with persisted tool settings.

## Persistence / Model Location

- `src/server/agent-types.ts` defines `AgentToolConfiguration` with `toolName` and nullable `preRunInputFile`.
- `src/server/repositories/agent-repository.ts` stores `preRunInputFile` in each matching `agent_tools.data` JSON document.
- Legacy `{}` Agent-tool rows load as `preRunInputFile: null`.
- `toolNames` remains available for backward API compatibility; `toolConfigurations` carries relationship settings.
- `src/server/services/agent-service.ts` accepts omitted `toolConfigurations`, defaults each enabled tool to no file, validates exact enabled-tool correspondence, persists paths, and supports clearing with `null`.
- No database migration was required.

## UI Implementation Location

- `src/client/components/projects/ProjectAgentsSection.ts` adds per-enabled-tool `Pre-run input file` controls under Agent Settings -> Tools & Skills.
- Saved values are parsed and restored from `toolConfigurations`.
- Each control has a Project file browser filtered to `.json`, displays the Project-relative path, permits safe manual relative entry consistent with existing Project path controls, and has a `None` action that clears the value.
- Help text describes the ordered argument-object array, one execution per entry before first model request, and insertion of results before the Agent task.
- `src/client/components/projects/projects.css` adds scoped layout styles.

## Project File Selection Behavior

- The picker reads only the current Project through `/api/projects/{projectId}/files` and returns Project-relative paths.
- Server input validation rejects absolute paths, drive paths, backslashes, traversal segments, encoded traversal/separators, empty segments, non-JSON extensions, and overlong paths.
- Runtime reads the explicitly configured path through `ProjectFilesystemService`, retaining ownership and filesystem containment checks.
- The explicit pre-run read does not depend on the Agent's generic `Read files` tool permission and does not enable any broader filesystem tool.

## JSON Format And Validation

- Files must contain valid JSON with an array top level.
- Every array element must be a non-null, non-array object.
- Every object is checked with the same schema validation used by normal Agent tool calls before execution.
- Tool-level `InvalidToolArgumentsError` remains authoritative for validation performed by individual tool implementations.
- Missing arguments are not created or defaulted by the pre-run feature.
- An empty array is valid and performs zero calls without changing initial user content.

## Pre-Run Execution Location

- `src/server/services/agent-run-service.ts` executes pre-run initialization after tool/model/attachment setup and before construction or dispatch of the first provider request.
- It uses resolved `EffectiveTool` instances, preserving existing ToolRegistry execution and saved tool settings.
- Calls are checkpointed for existing pause/cancellation behavior.

## Deterministic Ordering

- Configured Agent tools are sorted by exact tool name.
- Entries within each input file execute sequentially in JSON array order.
- Each configured file is fully parsed and schema-validated before its calls begin.

## Initial User-Context Composition

- Successful calls are rendered in sections containing tool name, Project-relative input file, numbered call, serialized arguments, and bounded serialized result.
- All sections are prepended to the existing task in the same single initial provider `user` message.
- The provider still receives one initial `system` message followed by one initial `user` message.
- The persisted run task and Agent assignment are not mutated.
- No configured calls, including an empty configured array, preserves the existing user content exactly.

## Failure Behavior

- Pre-run initialization maps missing/unreadable files, outside-Project paths, malformed JSON, non-array roots, non-object entries, invalid arguments, unavailable tools, and failed invocations to controlled run errors at `pre_run_initialization`.
- No first inference occurs after any pre-run failure.
- A later call failure stops remaining calls; earlier results are never sent to a provider.
- Failures are not silently skipped and do not create a final result or continue normal Agent execution.

## Tool Call ID Handling

- Pre-run execution calls `EffectiveTool.execute` directly and neither requires nor creates a `tool_call_id`.
- Pre-run observability uses system-initiated operational event names only; it does not persist model-style execution `tool_call` or `tool_result` events.
- No synthetic assistant calls, provider `tool` messages, or additional initial user messages are created.
- The existing normal loop still records and returns the provider-generated `call.id` unchanged as `tool_call_id`.

## Files Changed

- `docs/ARCHITECTURE.md`
- `docs/executed_tasks/TASK-0135-agent-tool-pre-run-input-file.md`
- `docs/executed_results/TASK-0135-agent-tool-pre-run-input-file.md`
- `src/server/agent-types.ts`
- `src/server/repositories/agent-repository.ts`
- `src/server/services/agent-service.ts`
- `src/server/services/agent-run-service.ts`
- `src/client/components/projects/ProjectAgentsSection.ts`
- `src/client/components/projects/projects.css`
- `tests/unit/agent-persistence.test.ts`
- `tests/unit/agent-service.test.ts`
- `tests/unit/agent-run-service.test.ts`
- `tests/frontend/projects-ui.test.ts`

## Focused Tests

Command:

`node --test --test-concurrency=1 .test-dist/tests/unit/agent-persistence.test.js .test-dist/tests/unit/agent-service.test.js .test-dist/tests/unit/agent-run-service.test.js .test-dist/tests/frontend/projects-ui.test.js`

Result: PASS, 243 tests passed, 0 failed.

Coverage added for relationship persistence and legacy defaults; clear-to-None; path validation; UI restoration, picker, help, and payload behavior; read-permission independence; missing, unreadable, escaping, malformed, non-array, non-object, schema-invalid, and empty files; one/multiple calls; array and tool ordering; fail-fast later invocation; unchanged task; two-message initial shape; context ordering; and absence of synthetic tool-call execution records.

Existing tests continue to cover provider-generated tool-call IDs, normal tool result correlation, and the unbounded multi-round Agent loop.

## Tests And Verification

- `npm.cmd run build`: PASS
- `npm.cmd run build:client`: PASS
- `npm.cmd run typecheck:client`: PASS
- `npm.cmd run lint`: PASS
- `npm.cmd test`: PASS, 1083 tests passed, 0 failed

## Production Code

Production behavior is implemented and all requested failure paths are controlled before provider inference.

## Architecture

The change reuses the existing Agent-tool join JSON, Agent service/repository boundaries, Project filesystem boundary, ToolRegistry/settings execution path, and Agent run orchestration. No new architectural layer or global Agent setting was introduced.

## Dependencies

No dependencies were added or changed.

## Deviations

None.

## Risks / Findings

- The workspace contained many pre-existing modified and untracked files. They were not reverted or altered for this task except for the explicitly listed task files; `docs/ARCHITECTURE.md` already had unrelated uncommitted additions, and only the pre-run paragraph was added by this task.
- Pre-run result text uses the existing Agent tool-result bound to avoid unbounded provider context.

## Diff Summary

Added typed per-tool configuration persistence, strict Project-relative JSON path validation, Agent Settings controls, fail-fast pre-inference execution/context composition, architecture documentation, and deterministic tests. Normal model-driven tool execution remains unchanged.
