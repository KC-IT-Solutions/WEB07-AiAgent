# TASK-0090 - Agent run persistence, lifecycle, status UI, and logs

Task ID: TASK-0090
Task slug: agent-run-persistence-lifecycle-status-and-logs

## Instruction

Implement the first real persistent Agent run lifecycle while preserving existing Agent CRUD and configuration.

Users must be able to start an Agent with a non-empty task, observe persisted `idle`, `running`, `paused`, `done`, `error`, and `cancelled` overview states, pause/resume/cancel nonterminal runs through real server controls, inspect a sanitized clickable error, inspect the latest run's operational event log, and inspect historical failed-run errors. Poll status approximately every 1-2 seconds and clean polling up when the Project/Agents view changes.

Persist each execution separately from Agent configuration. Add new migrations for `agent_runs` and `agent_run_events`, with relational Agent/Project/run foreign keys, intentional cascades, typed JSON payloads, latest/active lookup indexes, deterministic latest and active queries, and database-backed protection against multiple active runs per Agent. Persist task, final result, sanitized safe error, timestamps, statuses, and only real operational events. Never persist or expose credentials, raw provider payloads, absolute paths, stack traces, hidden reasoning, reasoning content, or chain-of-thought. Failed-run error history must remain visible after later successful runs.

Add Project/Agent-owned APIs for start, latest/detail/events/errors, pause, resume, and cancel. Every route must validate input and enforce current-user Project and Agent ownership. Reject Agent deletion while a run is active. Conditional transitions must keep terminal states terminal and prevent stale completion from overwriting cancellation or another terminal result. Normalize orphaned running/paused runs after process restart to a sanitized interrupted-run error.

Starting a run must create and return a persistent running DTO promptly and execute detached in process. Perform a real but deliberately minimal direct inference: load the Agent; use inline instructions or load configured file instructions at runtime through `ProjectFilesystemService` without fallback; use the configured model connection and configured default model regardless of `allowModelSelection`; reuse existing credential/provider boundaries and TASK-0080's connection-level inference queue; expose no tools; persist only a normal final assistant result; and produce honest done/error/cancelled lifecycle events. Pause only at safe checkpoints and do not claim mid-request suspension. Cancellation must prevent further work and stale persistence; abort queue/provider work where existing boundaries support it.

Selected Skills may be instruction context only if an existing safe application resolver makes that narrow; otherwise leave Skill execution activation for TASK-0091 and document the limitation. Do not implement Agent filesystem tools, web tools, general tool loops, chaining, final-result file writing, self-directed model switching, scheduling, streaming, WebSockets/SSE, external workers, Git, shell, or distributed coordination.

Add deterministic migration/repository, lifecycle service, logs, API ownership/safety, and plain TypeScript DOM frontend tests covering the numbered acceptance criteria in the received task, including concurrency, restart normalization, safe DTOs/logs, configured inference and queue reuse, UI controls/modals/accessibility, polling cleanup, and preservation of existing Agent settings/edit/delete behavior. Use deterministic OpenAI-compatible stubs and no real external provider.

Run first after required documentation preflight:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\inspect-repo.ps1
```

Mandatory verification, all of which must actually run and succeed for PASS:

```powershell
npm.cmd run build
npm.cmd run build:client
npm.cmd run typecheck:client
npm.cmd run lint
npm.cmd test
```

Create this execution record and `docs/executed_results/TASK-0090-agent-run-persistence-lifecycle-status-and-logs.md`. Do not read historical execution records. After each edit, immediately re-read the edited range. Before responding, re-read every changed range, complete the requested invariant self-check, and report exactly:

```text
Task ID: TASK-0090
Status: <PASS|FAIL|BLOCKED>
Result: docs/executed_results/TASK-0090-agent-run-persistence-lifecycle-status-and-logs.md
Verification: build=<PASS|FAIL|NOT RUN>, build:client=<PASS|FAIL|NOT RUN>, typecheck:client=<PASS|FAIL|NOT RUN>, lint=<PASS|FAIL|NOT RUN>, test=<PASS|FAIL|NOT RUN>
Summary: <one short sentence>
```
