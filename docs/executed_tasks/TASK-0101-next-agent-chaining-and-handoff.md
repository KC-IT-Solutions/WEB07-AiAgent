# TASK-0101 — Next-Agent chaining and handoff

Task ID: TASK-0101
Task slug: next-agent-chaining-and-handoff

Run first:

    powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\inspect-repo.ps1

## Goal

Activate the existing Agent chaining configuration.

When Agent A completes successfully and has:

    triggerNextAgent = true
    nextAgentId = <Agent B>

the server should automatically start Agent B.

Do not change the existing cycle-safe configuration rules.

## Handoff content

Agent B must receive:

- the original user task from Agent A's chain
- the previous Agent's identity/name
- the previous Agent's final result

Do NOT forward:

- hidden reasoning
- reasoning_content
- tool-call internals
- tool results
- raw provider payloads
- Run log / Error log

The handoff should be explicit and structured enough for B to understand that it is continuing work from another Agent.

## Original task propagation

The original task must remain stable through a chain.

Example:

    User starts A with task T
    A → B → C

Then:

    A receives T
    B receives original task T + A final result
    C receives original task T + B final result

Do not replace the original task with the previous Agent's final result.

## Execution order

Preserve the successful completion order:

    Agent tool/model loop
        ↓
    final result
        ↓
    save final-result file if enabled
        ↓
    mark current run done
        ↓
    trigger next Agent if configured

If result-file persistence fails:

    current run → error
    next Agent must NOT start

No chaining after:

    error
    cancelled

## New AgentRun

The triggered Agent gets its own normal persistent AgentRun.

Do not reuse the previous run ID.

The new run must use the existing AgentRun lifecycle and execution path, including:

- its own Agent instructions
- selected Skills
- effective tools
- configured model
- Project filesystem tools
- result-file settings
- lifecycle/status/logs/Execution transcript

Do not build a second execution engine for chained runs.

## Chain metadata

Persist enough safe relational/run metadata to identify chaining.

Recommended run metadata:

    triggeredByRunId
    previousAgentId
    rootRunId or chainRootRunId

Use real relational columns where identifiers/relationships require them under DATABASE.md.

If a schema change is needed:

- add a NEW migration
- do not edit existing migrations

This should allow future UI/debugging to determine:

    A run → triggered B run → triggered C run

## Same Project only

The configured next Agent must remain in the same Project.

Existing configuration validation already enforces this; execution must still resolve it server-side.

Never trust a stale client-side Agent relationship.

If the configured next Agent no longer exists:

- current completed run stays done
- chaining attempt must fail safely and be logged
- do not corrupt current run history

Choose a controlled chain-trigger failure event/error representation.

Do not rewrite a successful current Agent run to error merely because the later trigger target disappeared, unless the existing architecture strongly requires that behavior.

Preferred: current run remains done and a safe chaining failure event is recorded.

## One active run rule

Triggered Agents must obey the existing rule:

    max one running/paused run per Agent

If Agent B already has an active run when A tries to trigger B:

- do not start a second run
- record a controlled chaining failure/skipped event
- A remains done

Do not queue an unlimited hidden backlog in this task.

## Chain safety

Configuration already rejects cycles.

Execution should additionally defend against corrupt/stale data.

Before triggering, verify enough chain ancestry to prevent an execution-time loop if persisted configuration is unexpectedly inconsistent.

Do not allow:

    A → B → A → ...

even if database state somehow bypassed normal configuration validation.

## Cancellation

Cancelling A means:

    no B

Cancelling B means:

    no C

A run that has already become done and successfully triggered B is not retroactively cancelled when B is cancelled.

Each AgentRun owns its own lifecycle.

## Pause

A paused Agent does not trigger another Agent.

Triggering occurs only after successful terminal completion.

## Logging

Add safe operational events such as:

    next_agent_trigger_started
    next_agent_run_started
    next_agent_trigger_skipped
    next_agent_trigger_failed

Use safe metadata only:

    nextAgentId
    triggeredRunId
    status/reason code

Do not log reasoning or credentials.

## Execution transcript

The next Agent's Execution transcript should begin with its handoff task/context in a readable way.

Do not duplicate the previous Agent's entire transcript.

The user should be able to see that the run was triggered from another Agent and what final result was handed over.

## UI

No major redesign is required.

Existing polling should naturally show the next Agent changing to:

    RUNNING

when triggered.

If easy within current UI, expose a small indicator in Execution/Run log such as:

    Triggered by Agent A

Do not build a full chain-graph UI yet.

## Tests

Add focused deterministic coverage for at least:

1. A successful A run starts configured B.
2. B gets a distinct AgentRun.
3. original task is preserved.
4. previous Agent final result is handed to B.
5. reasoning/tool transcript is not handed to B.
6. A → B → C works.
7. result-file write happens before B starts.
8. result-file failure prevents B.
9. cancelled A does not trigger B.
10. errored A does not trigger B.
11. B already active prevents duplicate B run.
12. missing next Agent fails safely without changing A from done.
13. execution-time cycle guard prevents looping.
14. chained run uses B's own instructions/Skills/tools/model.
15. chain metadata/operational events are ownership scoped and safe.
16. existing manual Start behavior remains unchanged.

Use deterministic provider stubs.

## Out of scope

Do not implement:

- multiple next Agents
- parallel fan-out
- trigger-on-error
- trigger-on-cancel
- arbitrary branching conditions
- scheduling
- Agent self-directed model switching
- chain visualization graph
- hidden background retry queue

## Mandatory verification

Run:

    npm.cmd run build
    npm.cmd run build:client
    npm.cmd run typecheck:client
    npm.cmd run lint
    npm.cmd test

Report PASS only if every command was actually run and succeeded.

## Tracking

Create:

    docs/executed_tasks/TASK-0101-next-agent-chaining-and-handoff.md

and:

    docs/executed_results/TASK-0101-next-agent-chaining-and-handoff.md

Do not read historical task/result files.

## Final response exactly

    Task ID: TASK-0101
    Status: <PASS|FAIL|BLOCKED>
    Result: docs/executed_results/TASK-0101-next-agent-chaining-and-handoff.md
    Verification: build=<PASS|FAIL|NOT RUN>, build:client=<PASS|FAIL|NOT RUN>, typecheck:client=<PASS|FAIL|NOT RUN>, lint=<PASS|FAIL|NOT RUN>, test=<PASS|FAIL|NOT RUN>
    Summary: <one short sentence>
