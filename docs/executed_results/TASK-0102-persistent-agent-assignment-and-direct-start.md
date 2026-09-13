# TASK-0102 - Persistent Agent assignment and direct start

Task ID: TASK-0102
Status: PASS

Summary:

Agents now persist a Task / Assignment, start directly from that saved assignment, reject empty assignments server-side, and preserve role-specific assignments throughout chained runs.

Repository analysis:

- Agent configuration is stored as typed JSON in the existing `agents.data` field, so the backward-compatible optional JSON default required no schema migration.
- Manual runs previously accepted a client-supplied `task`; chained runs already persisted chain provenance and a safe handoff.
- The Agent overview previously opened a dedicated task-entry confirmation modal before posting a run.

Files changed:

- `docs/ARCHITECTURE.md`
- `docs/executed_tasks/TASK-0102-persistent-agent-assignment-and-direct-start.md`
- `docs/executed_results/TASK-0102-persistent-agent-assignment-and-direct-start.md`
- `src/client/components/projects/ProjectAgentsSection.ts`
- `src/server.ts`
- `src/server/agent-types.ts`
- `src/server/repositories/agent-repository.ts`
- `src/server/services/agent-run-service.ts`
- `src/server/services/agent-service.ts`
- `tests/frontend/projects-ui.test.ts`
- `tests/integration/agent-runs-api.test.ts`
- `tests/integration/agents-api.test.ts`
- `tests/unit/agent-persistence.test.ts`
- `tests/unit/agent-run-persistence.test.ts`
- `tests/unit/agent-run-service.test.ts`
- `tests/unit/agent-service.test.ts`

Tests and verification:

- `npm.cmd run build` - PASS
- `npm.cmd run build:client` - PASS
- `npm.cmd run typecheck:client` - PASS
- `npm.cmd run lint` - PASS
- `npm.cmd test` - PASS, 635 tests passed and 0 failed
- Focused Agent persistence, service, API, chaining, and frontend suites also passed before the full verification run.

Production code:

- Added a bounded `assignment` property to persisted Agent configuration with `''` as the legacy-record default.
- Added the multiline Task / Assignment field to Agent create/edit UI and restored saved values during editing.
- Disabled Start when the saved assignment is blank after trimming.
- Removed the run task modal and changed Start to immediately POST to the run endpoint without a request body.
- Resolved and validated the assignment from the owned persisted Agent before creating a manual run; client task payloads cannot override it.
- Stored the root Agent assignment as both the run task and chain original task.
- Combined each chained Agent's own saved assignment with the existing safe original-task, previous-Agent, and final-result handoff.
- Preserved existing instructions, Skills, effective tools, result-file output, execution transcript, operational logs, and chain topology.

Architecture:

- Preserved the existing HTTP, service, repository, and JSON persistence boundaries.
- No migration or new dependency was required.
- Updated the Agent-run architecture note to describe role-specific chained assignments.

Dependencies:

- None added or changed for this task.

Deviations:

- None.

Risks / findings:

- Existing Agents intentionally default to an empty assignment and cannot run until the assignment is saved.
- Chaining safely stops before creating the next run when that target Agent has no assignment.
- The worktree contained extensive pre-existing modified and untracked files; unrelated changes were preserved.

Diff summary:

- Added persistent Agent assignment data and backward-compatible parsing.
- Replaced modal-based task entry with validated direct start.
- Extended safe chaining with each target Agent's saved assignment.
- Added focused persistence, API, service, chain, and UI regression coverage.
