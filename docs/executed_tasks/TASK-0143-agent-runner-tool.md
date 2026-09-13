# TASK-0143: Agent Runner Tool

## Instruction

Add a new model tool that allows one Agent to start another configured Agent during its own run.

The tool must be exposed under Agent Settings -> Tools & Skills -> Model tool access. The target Agent must be selected through tool-specific settings on the Agent that uses the tool. The model must never dynamically select an Agent id or name.

## Tool Identity

- Internal name: `run_agent`.
- Human-readable label: `Agent Runner`.
- Register and resolve it through the existing tool registry/tool-resolution architecture rather than as a provider-only shortcut.

## UI Requirements

- Add `Agent Runner: Allow model to use this tool` in Model tool access, following the existing tool row style.
- Add a keyboard-accessible `...` settings control at the far right of the row.
- Keep the settings control available while model access is disabled.
- Open an Agent Runner settings UI containing a `Target agent` selector.
- Populate the selector from Agents in the current Project and exclude the Agent being edited.
- Preserve the saved target and do not silently retarget after list refresh.
- Safely represent stale configuration where existing conventions permit.
- Do not permanently place the selector inline or redesign the tab.

## Persistence And Validation

- Extend the current Agent tool-specific configuration compatibly with optional `targetAgentId: number | null` for Agent Runner.
- Persist the target with the current Agent's tool configuration, preserve it while disabled, and do not repurpose `preRunInputFile`.
- Existing configurations without `targetAgentId`, unrelated tools, pre-run behavior, and modelEnabled/toolNames decoupling must remain unchanged.
- Do not add a migration unless genuinely required by the current architecture.
- If enabled, saving requires a target that exists, belongs to the current user's current Project, and is not the Agent being edited.
- Reject stale, missing, self, and cross-Project target ids at existing validation/service boundaries.
- Never silently choose another target.

## Provider Schema And Invocation

- Expose a minimal empty-object tool input schema.
- Do not expose a target Agent id, Agent name, or arbitrary Agent selection in provider-visible arguments.
- Resolve `targetAgentId` solely from the calling Agent's persisted tool configuration.
- Revalidate existence, current-user ownership, same-Project ownership, and non-self targeting at runtime.
- Start the target through the normal Agent runtime/service flow using its current persisted Assignment source/content, Instructions, Model, Context, Skills, Tools, pre-run configuration, Runtime settings, and Advanced/result settings.
- Do not duplicate or reduce Agent execution behavior.
- Wait for terminal target state while leaving the caller active.
- Return only `{ "status": "Done" }` when the target finishes `done`.
- Return only `{ "status": "Error" }` for target `error`, target `cancelled`, validation/start/observation failures, active-target conflicts, or other safe runner failures.
- Do not return or inject the target's final model output or `finalResult` into caller context.
- Preserve target-owned result saving, events, execution/error history, and chaining behavior.
- Surface failures using recoverable and sanitized tool-error/result conventions without crashing unrelated runtime state.

## Concurrency

- Permit active runs for different Agents in the same Project.
- Continue prohibiting multiple active runs for the same Agent.
- If a target already has an active run, return `Error`; do not attach to it.
- Preserve `ModelConnectionInferenceQueue` connection-level serialization.
- Do not replace it with global Agent serialization.
- Agents sharing a connection may both remain active while inference requests serialize; existing behavior governs separate connections.
- While caller A waits on target B, A stays active, B can progress, the server must not deadlock, and A must not unnecessarily retain the model-connection inference slot across tool execution.

## Cycle Protection And Chaining

- Reject self-targeting in UI/backend/runtime.
- Detect indirect and longer Agent Runner cycles before starting a target, including A -> B -> A and A -> B -> C -> A.
- Use deterministic runtime ancestry/call-chain protection, extending existing chain ancestry only if safe.
- Do not rely only on UI validation.
- Allow otherwise valid non-cyclic nesting.
- Keep Agent Runner separate from existing post-completion `triggerNextAgent` chaining.
- Do not alter chaining semantics except for narrowly generalized shared ancestry/cycle handling if required.

## Registration, Boundaries, And Errors

- Use existing ToolRegistry, tool settings, and AgentRunService architecture where practical.
- Avoid circular construction dependencies; if needed, add the smallest explicit runtime bridge, not a service locator or global singleton.
- Keep responsibilities clear: Agent service/repository for definition and validation, AgentRunService for lifecycle, tool registry/runtime adapter for exposure/execution, frontend for configuration.
- Deterministically and safely handle no configured target, missing target, wrong Project, self-target, target active, cycle, start failure, target error/cancel, and persistence/observation failure.
- Never expose paths, stacks, SQL, secrets, keys, or provider internals to model-visible results.

## Observability

- Preserve ordinary provider-originated `tool_call`, `tool_result`, and `tool_call_started/completed/failed` events through existing execution flow.
- Add only sanitized metadata such as targetAgentId, targetRunId, and terminal status where useful.
- Do not expose hidden reasoning or synthesize provider tool-call ids.
- Keep target run/event/error history independent.
- Do not change logging behavior.

## Security

- Never cross Project ownership boundaries.
- Scope target resolution by current user, current Project, and configured target Agent id.
- Manipulated payloads and stale persisted ids must not execute an Agent from another Project.
- The model cannot supply target identity.
- Agent Runner itself requires no external network call.

## Required Deterministic Coverage

Configuration/persistence:

- Agent Runner appears as a model tool option.
- `targetAgentId` persists and survives save/load.
- Existing configurations without it remain valid and unrelated tools remain unchanged.
- Disabling Agent Runner preserves its target.
- Enabling without a valid target is rejected.
- Self and wrong-Project targets are rejected.

Frontend:

- Model tool access contains Agent Runner and its `...` control.
- The control opens Agent Runner settings.
- Selector lists same-Project Agents, excludes current Agent, and selects the saved target.
- Target can be configured before model access is enabled.
- Save payload includes target configuration.
- Provider/model tool-call input never includes target identity.

Runtime:

- Caller can invoke Agent Runner and configured target starts as a distinct normal run.
- Target uses its persisted assignment/configuration and stores independent history.
- Caller remains active while target runs and continues inference after tool result.
- Done/error/cancel map to the required simple statuses.
- Active, missing, and unconfigured target failures return Error.
- Target final output is not returned as tool content.
- Target result-file behavior remains normal.

Concurrency:

- Different Agents may be active concurrently; duplicate active runs for one Agent remain prohibited.
- Shared model-connection inference remains serialized without deadlock.
- Different connections retain existing semantics.

Cycle protection:

- Reject A -> A, A -> B -> A, and A -> B -> C -> A.
- Allow otherwise valid non-cyclic nested execution.

Regression:

- Standard and pre-run tools, chaining, Assignment file/inline behavior, Prompt/Instructions behavior, Copy agent behavior, pause/resume/cancel behavior, result-file behavior, and per-connection model inference serialization remain unchanged.

## Scope Constraints

- Inspect only task-required documentation, Agent types/service/repository/runtime, tool registry/types/settings, relevant server wiring/routes, ProjectAgentsSection and directly relevant UI helpers/styles, and directly relevant tests.
- Do not perform broad repository enumeration or unrelated refactoring.
- Do not add arbitrary maximum tool rounds.
- Do not alter logging, `reasoning_content`, current-date context, attached-file semantics, or Project filesystem permissions beyond normal Agent execution.

## Verification

All must pass:

```text
npm.cmd run build
npm.cmd run build:client
npm.cmd run typecheck:client
npm.cmd run lint
npm.cmd test
```

## Result Documentation

Create `docs/executed_results/TASK-0143-agent-runner-tool.md` after implementation and verification. Record implementation summary, repository analysis, production files, tests, configuration model, runtime flow, concurrency and queue behavior, cycle/deadlock protection, persistence/database and architecture impacts, security/Project isolation, deviations, risks/findings, and all five command results.

Re-read this task file before finalizing, verify every requirement, and explicitly document deviations.
