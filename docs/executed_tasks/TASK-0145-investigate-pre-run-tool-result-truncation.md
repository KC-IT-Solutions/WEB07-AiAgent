# TASK-0145: Investigate Pre-Run Tool Result Truncation

Task ID: TASK-0145
Slug: investigate-pre-run-tool-result-truncation

## Instruction

Task ID: TASK-0145
Slug: investigate-pre-run-tool-result-truncation

Preflight

Read:
- AGENTS.md
- docs/IGNORE.md
- docs/CODINGSTANDARDS.md
- docs/DEFINITION_OF_DONE.md
- docs/TASK_WORKFLOW.md
- relevant ARCHITECTURE / TESTING docs

Create and re-read:

docs/executed_tasks/TASK-0145-investigate-pre-run-tool-result-truncation.md

Goal

Investigate why Agent pre-run tool results can contain the literal marker:

"[ITEMS TRUNCATED]"

Determine exactly where that truncation occurs, whether the underlying tool data is actually being truncated or only the UI/display representation, and whether the same truncated representation is passed into the model context.

Do not change production behavior until the investigation has identified the exact truncation layer and documented the impact.

Context

Observed in Agent Execution UI for a pre-run FRED tool result:

Pre-run tool result
Tool: fred_data
Input file: ...
Result:
...
"[ITEMS TRUNCATED]"
...

The marker appears inside the serialized result structure.

Existing Agent runtime also has a separate generic tool-result bounding mechanism around 32,000 characters. Do not assume these are the same mechanism.

Investigation requirements

1. Locate marker origin

Search narrowly for the exact literal:

ITEMS TRUNCATED

Determine:
- which production file creates it;
- under what conditions;
- whether it truncates arrays, objects, strings, or serialized output;
- whether the limit is based on item count, character count, byte count, depth, or another rule.

Do not perform broad repository enumeration.

2. Trace the full data path

Trace one pre-run tool result from:

fred_data tool execution
→ returned JavaScript object
→ pre-run runtime handling
→ execution event persistence/sanitization
→ Agent Execution UI rendering
→ composed model user context

Document each transformation.

Specifically determine whether truncation occurs:
- inside fred_data itself;
- in safeExecutionJson or related safety serialization;
- in AgentRunService pre-run result handling;
- in execution event persistence;
- in frontend rendering;
- in boundedToolResult;
- elsewhere.

3. Distinguish these representations

Explicitly compare:

A. Raw tool return value
B. Stored execution-event result
C. UI-displayed pre-run result
D. Value passed into composeInitialUserContent / provider context
E. Generic tool result sent back after ordinary model tool calls

Determine whether they are identical or separately transformed.

4. Model-context impact

This is the most important part.

Determine whether the model receives:
- the complete raw pre-run tool result;
- the truncated representation containing "[ITEMS TRUNCATED]";
- a separately bounded representation;
- or some other form.

If the model receives truncated data, document:
- which observations/items are preserved;
- which are removed;
- whether first/last/latest observations are preserved;
- whether the truncation can materially affect time-series analysis.

5. FRED-specific verification

Use deterministic tests/stubs only.

Create or adapt a focused test with a FRED-like result large enough to trigger the observed "[ITEMS TRUNCATED]" behavior.

Verify and record:
- raw returned observation count;
- execution-event representation;
- model-context representation;
- whether marker is present in each;
- whether latest observations survive truncation.

Do not call the live FRED API.

6. Generic 32k bounding

Inspect the existing generic tool-result bounding behavior separately.

Determine:
- whether pre-run tool results use it;
- whether execution-event serialization uses a different truncation mechanism;
- whether ordinary model tool results use it;
- whether double truncation can occur.

Do not modify the 32k limit in this investigation task.

7. UI-only hypothesis

Explicitly test whether the UI merely shortens a complete stored value.

If UI CSS/DOM rendering is the only truncation layer, prove that stored/model values remain complete.

If not, document where irreversible truncation happens.

8. Safety and observability

Review why the truncation exists.

Determine whether it protects against:
- oversized execution logs;
- excessive model context;
- database growth;
- UI performance;
- secret/path exposure;
- another safety concern.

Do not remove safety controls without replacement analysis.

9. No behavioral fix yet

This task is investigation-first.

Do not remove or raise truncation limits unless required only to create a deterministic diagnostic test.

If a production bug is confirmed, document the recommended follow-up fix as a separate next task.

10. Tests

Add only the minimum deterministic regression/diagnostic coverage needed to prove the current behavior.

Tests should establish:
- exact marker-producing layer;
- exact truncation condition;
- raw vs stored vs UI/model-context differences;
- whether latest FRED observations are retained or lost.

No external provider calls.

Required verification

Run all five formal verification commands:

npm.cmd run build
npm.cmd run build:client
npm.cmd run typecheck:client
npm.cmd run lint
npm.cmd test

All five must PASS.

Documentation

After investigation and verification, create:

docs/executed_results/TASK-0145-investigate-pre-run-tool-result-truncation.md

The result must include:

- exact source of "[ITEMS TRUNCATED]";
- truncation algorithm and limits;
- full data-flow trace;
- whether raw FRED data is truncated;
- whether stored execution data is truncated;
- whether UI-only truncation occurs;
- whether model context receives truncated data;
- interaction with the existing 32k generic tool-result limit;
- deterministic reproduction details;
- tests added/changed;
- production files changed, if any;
- architecture impact;
- risks/findings;
- recommended follow-up action;
- verification results for all five required commands.

Re-read:

docs/executed_tasks/TASK-0145-investigate-pre-run-tool-result-truncation.md

before finalizing.

Do not implement the follow-up fix in this task unless the task documentation is explicitly amended first.
