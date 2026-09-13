# TASK-0092 - Agent row layout, persistent drag ordering, and log clearing

Task ID: TASK-0092
Task slug: agent-row-layout-persistent-ordering-and-log-clearing

## Instruction

Implement three focused improvements without changing Agent execution semantics:

1. Center the existing persisted/latest AgentRun lifecycle status in a responsive three-region Agent overview row while preserving the interactive, keyboard-accessible ERROR control and existing polling.
2. Add dedicated inline-SVG-handle vertical drag-and-drop ordering within the selected Project. Persist the complete Project-owned order through a validated, atomic Project-scoped API and a new relational `agents.sort_order` migration. Existing Agents receive deterministic order, new Agents append, list queries use persisted order plus a deterministic ID tie-breaker, failures restore authoritative UI state, and ordering never changes chaining or Agent configuration.
3. Add a distinct Logs section to persisted Agent settings, outside the Save/Cancel footer and separate from Danger zone. Require confirmation before clearing only terminal (`done`, `error`, `cancelled`) runs and their events for that Agent. Block clearing while a `running` or `paused` run exists in both UI and service, enforce Project/Agent ownership, protect against clear/start races, refresh existing lifecycle state after success, and do not create synthetic idle runs.

Preserve Project ownership, Agent CRUD/configuration, Skills, tools, instruction source, file picker, chaining, result-file configuration, persistent run lifecycle, polling, logs, safe errors, filesystem sandboxing, Chat behavior, and inference serialization. Do not add dependencies or implement Agent tools, chaining execution, result writes, model switching, cross-Project reorder, realtime infrastructure, or an execution redesign.

Add deterministic migration/repository/service/API/frontend coverage for ordering, validation, atomicity, centered layout, drag interaction safety, log-clearing terminal/active/ownership behavior, confirmation, state refresh, and unchanged configuration/chaining.

Run and require success from:

```text
npm.cmd run build
npm.cmd run build:client
npm.cmd run typecheck:client
npm.cmd run lint
npm.cmd test
```

Create the corresponding result report, re-read every changed range, complete the specified final self-check, and return exactly the requested five-line final response.
