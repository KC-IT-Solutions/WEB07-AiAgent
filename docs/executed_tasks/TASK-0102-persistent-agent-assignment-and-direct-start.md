# TASK-0102 - Persistent Agent assignment and direct start

Task ID: TASK-0102
Task slug: persistent-agent-assignment-and-direct-start

## Instruction

### Goal

Add a persistent `Task / Assignment` field to Agent Settings and make `Start` launch the Agent immediately from its saved configuration.

Remove the current Start modal that asks the user for a task.

### Agent settings

Add a multiline field:

```text
Task / Assignment
```

Meaning:

```text
Instructions
-> how the Agent should work

Task / Assignment
-> what the Agent should do when started
```

Persist the assignment as part of Agent configuration.

Use backward-compatible defaults for existing Agents.

### Validation

For a runnable Agent, assignment must be non-empty after trimming.

If assignment is empty:

- Start must be unavailable/disabled in UI
- server must also reject a direct start attempt

Do not rely on frontend validation only.

### Direct Start

Clicking `Start` must immediately create and execute an AgentRun.

Do not open `Run Agent` or `Task` input UI.

Remove the old task-entry modal and its related frontend state.

The run must use:

- Agent instructions
- Agent saved assignment
- selected Skills
- effective tools

and continue through the existing AgentRun/tool lifecycle unchanged.

### AgentRun task

For a manually started Agent, persist the Agent's saved assignment as the run's original task.

Do not require a task field in the Start API request anymore.

Prefer `POST /api/projects/:projectId/agents/:agentId/runs` with no user-supplied task body, or the smallest equivalent shape consistent with the current API.

Server resolves the assignment from the persisted Agent.

### Chained Agents

Preserve TASK-0101 chaining.

When A triggers B:

- B uses its own saved Task / Assignment as its role-specific task
- B also receives the existing safe handoff:
  - chain original task
  - previous Agent identity
  - previous Agent final result

Do not forward reasoning/tool internals.

The manually started root Agent's saved assignment becomes the chain's original task.

Do not break A -> B -> C propagation.

### UI

Agent create/edit modal must include:

```text
Task / Assignment
[ multiline textarea ]
```

Use existing readable/contained Agent modal styling.

When editing, restore the saved value.

No separate Save semantics beyond the current Agent form behavior.

### Tests

Add focused deterministic coverage for at least:

1. Agent assignment persists.
2. Existing Agents get safe default assignment.
3. Create/edit UI shows Task / Assignment.
4. Saved assignment restores on edit.
5. Empty assignment cannot start.
6. Start no longer opens task modal.
7. Start immediately calls run endpoint.
8. Run uses persisted assignment as task.
9. Client cannot override assignment with arbitrary Start payload.
10. Chained Agent uses its own assignment plus existing handoff.
11. Root assignment remains the chain original task.
12. Existing Skills/tools/result-file/chaining lifecycle remains intact.

### Out of scope

Do not change:

- Agent tool loop
- Skills activation
- result-file behavior
- chain topology
- model self-selection
- Execution/Run/Error logs
- Project filesystem security

### Mandatory verification

Run:

```text
npm.cmd run build
npm.cmd run build:client
npm.cmd run typecheck:client
npm.cmd run lint
npm.cmd test
```

Report PASS only if every command was actually run and succeeded.

### Tracking

Create:

```text
docs/executed_tasks/TASK-0102-persistent-agent-assignment-and-direct-start.md
docs/executed_results/TASK-0102-persistent-agent-assignment-and-direct-start.md
```

Do not read historical task/result files.
