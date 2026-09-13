# TASK-0090 Result

Task ID: TASK-0090
Status: PASS

## Summary

Implemented persistent Project-owned Agent runs with real direct-model execution, checkpoint lifecycle controls, scoped status/log APIs, compact polling UI, sanitized errors, and deterministic coverage.

## Repository analysis

- Preserved the existing HTTP to service to repository to SQLite dependency direction.
- Reused `ProjectFilesystemService` for file instructions, `ModelConnectionService` for credential resolution, `requestModelInference` for provider transport, and one shared `ModelConnectionInferenceQueue` for Chat and Agent inference.
- Preserved existing Agent CRUD/configuration, Project ownership, filesystem sandboxing, credentials, Chat behavior, Skills, tools, chaining, and result-file configuration.

## Files changed

- `docs/ARCHITECTURE.md`
- `docs/executed_tasks/TASK-0090-agent-run-persistence-lifecycle-status-and-logs.md`
- `docs/executed_results/TASK-0090-agent-run-persistence-lifecycle-status-and-logs.md`
- `src/server/migrations.ts`
- `src/server/agent-run-types.ts`
- `src/server/repositories/agent-run-repository.ts`
- `src/server/services/agent-run-service.ts`
- `src/server/services/agent-service.ts`
- `src/server.ts`
- `src/client/components/projects/ProjectAgentsSection.ts`
- `src/client/components/projects/projects.css`
- `tests/unit/agent-run-persistence.test.ts`
- `tests/unit/agent-run-service.test.ts`
- `tests/integration/agent-runs-api.test.ts`
- `tests/frontend/projects-ui.test.ts`

## Tests and verification

- `npm.cmd run build` - PASS.
- `npm.cmd run build:client` - PASS.
- `npm.cmd run typecheck:client` - PASS.
- `npm.cmd run lint` - PASS.
- `npm.cmd test` - PASS, 560 tests passed and 0 failed.
- Focused repository, service, API, and frontend tests also passed during implementation.

## Production code

- Added migration `0012_create_agent_runs` with relational `agent_runs` and `agent_run_events`, ownership/cascade foreign keys, deterministic latest/event indexes, and a partial unique index allowing only one `running`/`paused` run per Agent.
- Added typed run data, sanitized errors, persistent operational events, deterministic latest/active/error queries, conditional terminal transitions, and startup orphan normalization.
- Added detached direct inference using Agent instructions/task/configured model, no exposed tools, abortable queue/provider cancellation, checkpoint pause/resume, and stale-completion protection.
- Added scoped start/latest/detail/events/errors/pause/resume/cancel APIs and active-run Agent deletion conflicts.
- Added overview statuses/actions, Task modal, safe error details, latest Run log, historical Error log, and 1.5-second polling with removal cleanup.

## Architecture

- AgentRun identity and lifecycle are separate from Agent configuration.
- Chat and Agent inference share the same process-local connection queue.
- Process restart behavior is documented: orphaned nonterminal runs become `error` with `RUN_INTERRUPTED_BY_SERVER_RESTART` and are not resumed.

## Dependencies

- No dependencies added.

## Deviations

- Selected Agent Skill IDs remain configuration-only for execution because activating Skill content would broaden this minimal direct-inference step; this limitation is documented for the later execution/tool work.
- Agent tools, chaining, final-result file writes, model switching, streaming, external workers, and Agent filesystem/web tool execution were not implemented, as required.

## Risks / findings

- Execution and pause waiters are process-local. Persisted state is recovered safely after restart, but in-flight work cannot resume.
- Pause is checkpoint-based: a provider request already in flight finishes or aborts before the run can enter `paused`; the UI continues to show the honest persisted state.
- The worktree contained extensive pre-existing modified and untracked files. They were preserved and not reverted.

## Diff summary

- Added persistent Agent run/event schema, repository, lifecycle execution service, scoped APIs, overview controls/log modals/polling, restart documentation, and comprehensive deterministic tests.
