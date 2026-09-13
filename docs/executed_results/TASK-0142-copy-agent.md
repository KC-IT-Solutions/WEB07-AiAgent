# TASK-0142: Copy agent

Task ID: TASK-0142
Status: Completed

## Summary

Added a `Copy agent` item to each Agent overflow menu. The action posts to the new Project-scoped Agent copy endpoint and reloads the authoritative Project Agent list after success.

The backend creates an independent persisted Agent definition, copies its Skill and tool relationships, resets outgoing chaining, generates a deterministic Project-scoped name, and inserts the new Agent immediately after its source.

## Repository Analysis

- Agent HTTP routes are defined in `src/server.ts` and delegate to `AgentService`.
- `AgentService` owns Agent validation and workflows, while `AgentRepository` owns SQLite serialization, relationships, transactions, and ordering.
- Flexible Agent definition fields are stored in Agent JSON. Skills and tools, including pre-run configuration, are separate relational records.
- Runs, errors, operational events, execution events, token usage, and chain provenance are owned by `agent_runs` and `agent_run_events`, not by the Agent definition.
- The Project Agent frontend already centralizes authoritative refresh behavior in `loadAgents()` and renders the existing overflow menu in `ProjectAgentsSection`.

## Production Files Changed

- `src/server.ts`: added `POST /api/projects/:projectId/agents/:agentId/copy` with existing route-ID validation, not-found response, Agent response shape, and Agent error mapping.
- `src/server/services/agent-service.ts`: added persisted snapshot copying, deterministic bounded unique naming, chaining reset, relationship copying, and transactional ordering coordination.
- `src/server/repositories/agent-repository.ts`: added the ordered Agent insert persistence operation that shifts only following Agents and creates the copy at `source.sortOrder + 1`.
- `src/client/components/projects/ProjectAgentsSection.ts`: added the exact `Copy agent` menu item and a POST-only action that validates the returned Agent and calls `loadAgents()`.

## Tests Added Or Changed

- `tests/unit/agent-service.test.ts`: covers new identity, same Project, complete definition configuration, all instruction sources, both assignment sources, Project-file references, permissions, Skills, model tool access, tool/pre-run configuration, model/runtime/result settings, chaining reset, history exclusion, source independence, deterministic names, Project-scoped collisions, repeated ordering, unavailable Agents, wrong Projects, and ownership.
- `tests/integration/agents-api.test.ts`: covers the POST copy endpoint response, persisted response shape, copied configuration, chaining reset, missing Agents, and wrong-Project isolation.
- `tests/frontend/projects-ui.test.ts`: covers the exact single menu label, menu role, copy route, POST method, response parsing, authoritative list refresh, no confirmation modal, and no client clone payload.
- The complete existing test suite passed, covering unchanged Agent create, edit, delete, reorder, execution, and run behavior.

## Architecture Impact

The existing dependency direction remains unchanged:

```text
HTTP route -> AgentService -> AgentRepository -> SQLite
```

The frontend only initiates the operation and refreshes rendered state. Copy-domain decisions remain in `AgentService`; SQL and ordering writes remain in `AgentRepository`.

## Persistence And Database Impact

- No schema change or migration was required.
- The copy transaction writes one new `agents` row and new `agent_skills` / `agent_tools` relationship rows.
- The new Agent receives a new database identity and independent JSON/relationship records.
- Following Agent rows have `sort_order` incremented atomically; the source row is not updated.
- No `agent_runs` or `agent_run_events` rows are read or copied by production code.
- Project-file paths remain configuration references. No filesystem operation occurs.

## Security And Project Isolation

- Route parameters use the existing positive-ID validation.
- Source lookup is scoped by current user, Project ID, and Agent ID through `AgentRepository.get`.
- A mismatched Project ID, unavailable Agent, or other user's Agent returns the existing safe not-found behavior.
- The client supplies no Agent definition or ownership data to the copy endpoint.
- No Project file is read, duplicated, moved, or rewritten.

## Dependencies

No dependencies were added or changed for this task.

## Deviations

None.

## Risks / Findings

- The worktree contained extensive pre-existing modified and untracked files. They were treated as user-owned and were not reverted or changed outside the task's narrow Agent paths.
- Names at the 120-character limit are deterministically shortened to leave room for the copy suffix, then passed through the existing Agent name normalization and length validation.
- Agent ordering is assumed to enter the operation in the valid deterministic state maintained by existing create and reorder workflows.

## Verification Results

- `npm.cmd run build`: PASS
- `npm.cmd run build:client`: PASS
- `npm.cmd run typecheck:client`: PASS
- `npm.cmd run lint`: PASS
- `npm.cmd test`: PASS, 1,106 tests passed, 0 failed

Focused checks also passed for `agent-service.test.js`, `agents-api.test.js`, and `projects-ui.test.js` before the formal full-suite run.

## Diff Summary

- 4 production files changed.
- 3 test files changed.
- 1 execution task record created.
- 1 execution result record created.
- No migration, dependency, inference, execution, prompt-resolution, filesystem-permission, or logging behavior changes.
