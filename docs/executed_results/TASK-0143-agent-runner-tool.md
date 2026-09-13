# TASK-0143: Agent Runner Tool

Task ID: TASK-0143
Status: Completed

## Summary

Added the registered `run_agent` model tool and its Agent-specific settings. A calling Agent can invoke its configured same-Project target as a distinct normal Agent run, wait for the target's terminal state, and receive only `{ "status": "Done" }` or `{ "status": "Error" }`.

The target identity is never provider-controlled. It is persisted in the calling Agent's tool configuration, validated when the Agent is saved, and resolved again through current-user and current-Project boundaries at runtime.

## Repository Analysis

- Tools are registered through `ToolRegistry`, exposed through `ToolSettingsService`, and converted to effective model tools by `AgentRunService`.
- Agent-specific tool relationships are stored in `agent_tools.data`; the existing JSON shape can compatibly hold an optional target without a schema migration.
- `AgentService` owns Agent definition validation, `AgentRepository` owns relationship serialization, and `AgentRunService` owns run lifecycle and nested execution.
- Agent runs already have independent persistence, execution events, operational events, result saving, Skills, prompt resolution, pre-run tools, runtime settings, and post-completion chaining.
- `ModelConnectionInferenceQueue` scopes serialization to an inference request, so the caller releases its connection slot while executing a tool and waiting for a target.
- The Project Agent editor already receives the current Project's Agent list and supports actions attached to model-tool checklist rows.

## Production Files Changed

- `src/server/tools/run-agent-tool.ts`: added the Agent Runner tool with an empty-object input schema, no target argument, and sanitized status-only execution result.
- `src/server/tools/tool-registry.ts`: added the smallest explicit execution-context bridge needed for Agent runtime-backed tools.
- `src/server/tool-types.ts`: added the tool identity, Agent-only registry metadata, and contextual execution contract.
- `src/server.ts`: registered `RunAgentTool` through the existing tool registry.
- `src/server/services/agent-run-service.ts`: added contextual resolution, configured target lookup, normal target-run creation/launch, terminal waiting, status mapping, active-target handling, ancestry propagation, sanitized operational events, and cancellation-listener cleanup.
- `src/server/services/agent-service.ts`: added enabled-target validation scoped to current user and Project while preserving disabled configuration.
- `src/server/services/tool-settings-service.ts`: exposed Agent-only metadata and excluded Agent-only tools from Chat tool availability.
- `src/server/repositories/agent-repository.ts`: parsed and serialized optional `targetAgentId` in existing relationship JSON.
- `src/server/repositories/agent-run-repository.ts`: parsed the new bounded operational-event metadata.
- `src/server/agent-types.ts`: extended Agent tool configuration with optional `targetAgentId`.
- `src/server/agent-run-types.ts`: extended sanitized run-event metadata types.
- `src/client/components/projects/ProjectAgentsSection.ts`: added the Agent Runner row action, accessible settings dialog, same-Project target selector, stale-target representation, save validation, and payload persistence.
- `src/client/components/projects/projects.css`: styled the row action and settings dialog consistently with the existing editor.
- `src/client/components/tools/ToolsView.ts`: prevented Agent-only tools from appearing in standalone Chat/tool settings.
- `docs/ARCHITECTURE.md`: documented Agent Runner execution, concurrency, and ancestry boundaries.

## Tests Added Or Changed

- `tests/unit/agent-persistence.test.ts`: covers target JSON persistence, save/load survival, null/legacy compatibility, and unrelated tool configuration.
- `tests/unit/agent-service.test.ts`: covers enabled-target requirements, same-Project ownership, self-target rejection, stale/wrong-Project rejection, and disabled-target preservation.
- `tests/unit/agent-run-service.test.ts`: covers distinct target runs, persisted target configuration, independent history, caller continuation, status-only results, terminal mappings, active/missing/unconfigured failures, result saving, shared-connection serialization, concurrent different Agents, same-Agent exclusion, cycles, valid nesting, and unchanged chaining/runtime behavior.
- `tests/integration/tools-api.test.ts`: covers registry identity, empty provider schema, Agent-only metadata, contextual execution, and absence from Chat availability.
- `tests/frontend/projects-ui.test.ts`: covers row text, settings control/dialog, same-Project options, current-Agent exclusion, saved/stale selection, disabled configuration, payload shape, and frontend validation.
- `tests/frontend/tools-ui.test.ts`: covers Agent-only filtering and the registry context contract.

## Configuration Model

The existing Agent tool relationship JSON now accepts:

```json
{
  "preRunInputFile": null,
  "targetAgentId": 42
}
```

`targetAgentId` is optional and nullable for compatibility. It is meaningful only for `run_agent`. Disabling model access removes `run_agent` from `toolNames` but preserves this relationship configuration, matching the existing model-enabled/configuration decoupling.

No target identity is present in the provider schema, which remains:

```json
{
  "type": "object",
  "properties": {},
  "additionalProperties": false
}
```

## Runtime Flow

1. The provider invokes `run_agent` with an empty object.
2. The registry passes the server-created execution context to `RunAgentTool`.
3. `AgentRunService` reads `targetAgentId` from the calling Agent's persisted tool configuration.
4. The service rejects missing, self, ancestral, unavailable, wrong-Project, or already-active targets before launch.
5. The target's current assignment is resolved and a distinct target run is persisted with chain provenance.
6. The normal `launch` path executes the target with its current Instructions, model, Context, Skills, Tools, pre-run configuration, runtime settings, result settings, and chaining behavior.
7. The caller remains active while waiting for target completion, but does not retain an inference-queue slot.
8. The terminal target status maps to `Done` only for `done`; every other safe failure maps to `Error`.
9. The target's final output is retained only in target-owned history/result handling and is never returned as caller tool content.

## Concurrency And Queue Behavior

- The existing database/runtime restriction continues to prohibit two active runs for the same Agent.
- Different Agents in one Project can remain active concurrently.
- Agent Runner does not attach to an existing target run; it returns `Error`.
- `ModelConnectionInferenceQueue` remains per connection and per inference request. It is not replaced by Project-wide or global Agent serialization.
- A caller waiting during tool execution has already released its inference request lease, allowing a same-connection target to acquire the queue and avoiding deadlock.
- Separate connections retain their existing independent behavior.

## Cycle And Deadlock Protection

- Save-time validation rejects direct self-targeting.
- Runtime checks reject direct self-targeting and any target already in the active execution ancestry.
- Ancestry is copied into each nested launch, detecting two-node and longer cycles before another target run starts while permitting non-cyclic nesting.
- Existing post-completion `triggerNextAgent` chaining remains separate; only the shared ancestry set is carried through normal launches.
- Target waiting occurs outside inference queue ownership. Cancellation stops the caller's wait and removes its abort listener without exposing internal errors.

## Persistence, Database, And Architecture Impact

- No database migration or new dependency was required.
- The only definition persistence addition is optional JSON data in existing `agent_tools` rows.
- Target runs use existing `agent_runs` and `agent_run_events` tables and therefore retain independent history, errors, token usage, result files, and chain provenance.
- Dependency direction remains explicit: registered tool -> registry execution context -> `AgentRunService`; no service locator, global singleton, or circular construction dependency was introduced.
- Standard tools, pre-run configuration, prompt/assignment resolution, Project filesystem permissions, logging, provider reasoning, and attached-file semantics were not altered.

## Security And Project Isolation

- Save-time target validation uses current-user and current-Project scoped Agent lookup.
- Runtime target resolution repeats the current-user, current-Project, configured-ID, and non-self checks.
- A manipulated request or stale stored cross-Project ID cannot resolve or execute a target.
- Provider-visible arguments contain no Agent ID, Agent name, path, credential, provider detail, or arbitrary target selector.
- Model-visible results contain only the two specified status values.
- Operational events contain only bounded identifiers and terminal status; target execution/error history remains target-owned.
- Agent Runner performs no external network request of its own.

## Deviations

None.

## Risks / Findings

- The worktree contained extensive pre-existing modified and untracked files. They were treated as user-owned and were not reverted or modified outside the task's scoped files.
- Runtime ancestry is intentionally in-memory execution state. Existing startup recovery governs interrupted persisted runs after process termination.
- Frontend behavior is covered deterministically, but no separate manual browser session was required by the repository verification workflow.
- Final review found that caller cancellation originally left an abort listener attached until target completion. The listener now cleans up immediately on either cancellation or completion, and the full verification suite passed afterward.

## Verification Results

- `npm.cmd run build`: PASS
- `npm.cmd run build:client`: PASS
- `npm.cmd run typecheck:client`: PASS
- `npm.cmd run lint`: PASS
- `npm.cmd test`: PASS, 1,112 tests passed, 0 failed

## Requirement Review

- Registration, Agent settings UI, persisted configuration, empty provider schema, normal target runtime, status-only output, concurrency, queue behavior, cycle protection, observability, and Project isolation are implemented.
- Target configuration remains available while disabled and is never silently replaced.
- Direct, indirect, and longer cycles are rejected; valid nested execution remains allowed.
- Target final output is not exposed to the caller.
- Existing standard/pre-run tools, chaining, assignment sources, Instructions behavior, Copy agent behavior, pause/resume/cancel behavior, result-file handling, and per-connection inference serialization remain covered by the passing suite.
