# TASK-0137: Decouple Agent pre-run from model tool access

Task ID: TASK-0137

Status: PASS

## Summary

Agent model tool access and system-initiated pre-run configuration are now independent. A registered tool can persist and execute a configured Project-relative pre-run JSON file without appearing in `toolNames`, provider tool definitions, or the model-driven execution map.

## Repository analysis

- Input validation previously required `toolConfigurations` to have the same length and names as `toolNames`.
- `agent_tools` rows previously represented both enabled model tools and pre-run settings without an independent access value.
- The Agent editor hid pre-run controls for unchecked tools and serialized configurations only for checked tools.
- Agent runtime resolved one map for provider definitions, model-requested execution, and pre-run execution.
- The existing `agent_tools.data` JSON supports a backward-compatible relationship-owned access flag without a schema migration.

## Persistence / model changes

- `AgentRepository.replaceTools` now persists the union of model-enabled tools and configured tools in the existing `agent_tools` relationship table.
- Each relationship JSON document stores `preRunInputFile` and `modelEnabled`.
- Repository loading derives `toolNames` only from relationships whose `modelEnabled` is true.
- Repository loading returns `toolConfigurations` independently for every persisted relationship.
- Legacy relationship JSON without `modelEnabled` defaults to enabled, preserving existing Agents.
- No global Agent setting and no database migration were added.

## Validation changes

- `toolNames` retains array, uniqueness, and ToolRegistry resolution validation.
- `toolConfigurations` is optional and independently validates array shape, non-null object entries, allowed fields, non-empty unique names, ToolRegistry resolution, and the existing Project-relative `.json` path rules.
- Configured tool names no longer need to occur in `toolNames`; duplicate and unknown configured tools remain rejected.
- Omitting `toolConfigurations` retains the legacy normalized null configuration for model-enabled tools.

## UI changes

- Tools & Skills now labels the model-access checklist independently as `Model tool access`, with `Allow model to use this tool` labels.
- Every available tool's pre-run selector remains rendered while model access is off.
- Selecting or clearing a pre-run path does not mutate model-access checkboxes.
- Disabling model access does not clear a pre-run path.
- Save derives `toolNames` only from checked model-access controls.
- Save includes a `toolConfigurations` entry when either model access is enabled or a pre-run path is present, preserving pre-run-only values while omitting unused off/no-file tools.
- Reopened settings restore checkbox state from `toolNames` and paths from `toolConfigurations` independently.

## Runtime pre-run resolution

- Runtime resolves the union of model-enabled and configured non-null pre-run tools through the existing ToolRegistry and tool-settings path.
- It derives a separate model-access map by excluding tools available only because of pre-run configuration.
- Pre-run execution continues using deterministic tool-name sorting and JSON-array order, explicit Project file reads, schema validation, and fail-fast behavior.
- A pre-run-only failure is not skipped and still prevents first inference, partial provider context, final result, result-file output, and chaining through the unchanged failure path.

## Provider behavior

- Provider definitions and model-requested execution use only the normal model-access map; pre-run-only tools are excluded.
- A deliberately returned provider call for a pre-run-only tool receives the existing `TOOL_NOT_AVAILABLE` result and does not invoke that tool.
- A tool present in both concerns executes during pre-run and remains available for later model-requested calls.
- Successful pre-run arguments/results retain the existing single initial `system` plus single initial `user` message shape and are prepended before `Agent task:`.
- Empty/no-call pre-runs retain the original user task content exactly.

## Observability and tool-call IDs

- Existing `pre_run_tool_call` and `pre_run_tool_result` execution events are unchanged and work for pre-run-only tools.
- Existing `pre_run_initialization` Agent Error records and safe diagnostic metadata are unchanged for pre-run-only failures.
- Pre-run execution creates no synthetic `tool_call_id`.
- Normal model-requested calls continue correlating provider-generated IDs in assistant/tool messages and execution events.

## Files changed

- `docs/ARCHITECTURE.md`
- `docs/executed_tasks/TASK-0137-decouple-agent-pre-run-from-model-tool-access.md`
- `docs/executed_results/TASK-0137-decouple-agent-pre-run-from-model-tool-access.md`
- `src/client/components/projects/ProjectAgentsSection.ts`
- `src/server/repositories/agent-repository.ts`
- `src/server/services/agent-run-service.ts`
- `src/server/services/agent-service.ts`
- `tests/frontend/projects-ui.test.ts`
- `tests/integration/agents-api.test.ts`
- `tests/unit/agent-persistence.test.ts`
- `tests/unit/agent-run-service.test.ts`
- `tests/unit/agent-service.test.ts`

## Focused tests

- `npm.cmd run test:compile`: PASS after correcting test target compatibility and optional provider-tool typing.
- `node --test --test-concurrency=1 .test-dist/tests/unit/agent-service.test.js .test-dist/tests/unit/agent-persistence.test.js .test-dist/tests/unit/agent-run-service.test.js .test-dist/tests/frontend/projects-ui.test.js`: initial runs exposed two test expectation issues (default filesystem tools and the existing unavailable-tool payload); implementation behavior was correct and expectations/fixture permissions were corrected.
- `node --test --test-concurrency=1 .test-dist/tests/unit/agent-run-service.test.js`: PASS, 84 tests.
- `node --test --test-concurrency=1 .test-dist/tests/integration/agents-api.test.js`: PASS, 9 tests.
- Added coverage for independent validation, duplicate/unknown configured tools, unchanged path rejection, relationship persistence and legacy defaults, API round-trip, independent UI state/payload behavior, deterministic pre-run-only execution/context/events, provider non-exposure, blocked model invocation, both-enabled execution, failures, and tool-call-ID behavior.

## Required verification

- `npm.cmd run build`: PASS.
- `npm.cmd run build:client`: PASS.
- `npm.cmd run typecheck:client`: PASS.
- `npm.cmd run lint`: PASS.
- `npm.cmd test`: PASS, 1091 tests, 0 failures.
- `git diff --check -- docs/ARCHITECTURE.md src/server/services/agent-service.ts src/server/repositories/agent-repository.ts src/server/services/agent-run-service.ts src/client/components/projects/ProjectAgentsSection.ts tests/unit/agent-service.test.ts tests/unit/agent-persistence.test.ts tests/unit/agent-run-service.test.ts tests/integration/agents-api.test.ts tests/frontend/projects-ui.test.ts`: PASS; only the existing line-ending warning for `docs/ARCHITECTURE.md` was reported.

## Production code

Changed validation, existing relationship serialization, Agent runtime tool-map derivation, and Agent Settings UI. No unrelated production behavior was intentionally changed.

## Architecture

The existing relationship-owned persistence and Agent run service remain in place. The architecture documentation now records independent relationship model access and pre-run configuration, including the legacy default.

## Dependencies

No dependencies added or changed for this task.

## Deviations

None. No migration was necessary.

## Risks / findings

- The worktree contained extensive pre-existing modified and untracked files. They were not reverted or modified except for task-relevant files listed above.
- Provider access granted independently by existing Skill-required tools and intrinsic Project filesystem permissions remains unchanged; pre-run configuration itself grants no access.

## Diff summary

The change adds an optional backward-compatible access bit to existing Agent-tool relationship JSON, removes validation/UI coupling, separates runtime model and pre-run tool maps, updates architecture documentation, and adds deterministic regression coverage.
