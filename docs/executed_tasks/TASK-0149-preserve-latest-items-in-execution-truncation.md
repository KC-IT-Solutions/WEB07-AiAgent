# TASK-0149: Preserve Latest Items in Execution Truncation

## Instruction

Task ID: TASK-0149
Slug: preserve-latest-items-in-execution-truncation

### Preflight

Read:
- `AGENTS.md`
- `docs/IGNORE.md`
- `docs/CODINGSTANDARDS.md`
- `docs/DEFINITION_OF_DONE.md`
- `docs/TASK_WORKFLOW.md`
- relevant ARCHITECTURE / TESTING docs

Create and re-read:

`docs/executed_tasks/TASK-0149-preserve-latest-items-in-execution-truncation.md`

### Goal

Change observability-only structured array truncation so that when an array exceeds the execution transcript item limit, the newest/latest items are preserved instead of the oldest/earliest items.

This change applies only to execution transcript / UI-safe observability serialization.

Do not change semantic Agent/model data delivery behavior.

### Background

Current execution safety behavior for arrays over 200 items is effectively:

first 200 items
+
`"[ITEMS TRUNCATED]"`

For chronological/time-series arrays ordered oldest-to-newest, this removes the most recent data from the execution transcript/UI.

### Required behavior

For arrays whose length exceeds the existing item limit:

preserve the final 200 items

and prepend the marker:

`"[ITEMS TRUNCATED]"`

Conceptually:

input:
`[0, 1, 2, ..., 249]`

current:
`[0, 1, ..., 199, "[ITEMS TRUNCATED]"]`

required:
`["[ITEMS TRUNCATED]", 50, 51, ..., 249]`

The marker must appear before the retained tail items to indicate that earlier items were omitted.

### Scope

This change applies to the structured array handling in the execution-safety / safe observability serialization path.

It must affect arrays rendered/stored through the existing execution event sanitization flow, including:
- pre-run tool results;
- ordinary Agent tool results;
- other structured execution event data that uses the same sanitizer.

Do not special-case FRED.

Implement this generically for arrays handled by the existing structured sanitizer.

### Important separation from semantic runtime data

Do not modify the complete-or-terminal behavior introduced for semantic Agent data.

Specifically, do not change:
- `TOOL_RESULT_TOO_LARGE` behavior;
- pre-run model-bound tool result validation;
- ordinary model tool-result validation;
- Assignment size handling;
- Instructions size handling;
- attached file size handling;
- pre-run input size handling;
- Skill size handling.

Semantic Agent/model data must continue to be either:
- delivered completely; or
- rejected with an explicit terminal size error.

Do not reintroduce silent model-context truncation.

### Execution array truncation

Locate the existing execution structured array truncation logic, currently conceptually equivalent to:

`array.slice(0, MAX_ITEMS)`

Change it to retain the tail:

`array.slice(-MAX_ITEMS)`

When the original array length exceeds the limit:
- prepend `"[ITEMS TRUNCATED]"`;
- recursively sanitize all retained tail items using the existing sanitizer;
- preserve their original order.

Example:

input:
`[a0, a1, a2, ..., a200]`

required output:

```text
[
  "[ITEMS TRUNCATED]",
  a1,
  a2,
  ...,
  a200
]
```

Do not reverse the retained items.

### Boundary behavior

Exactly 200 items:
- no marker;
- all 200 items retained;
- existing order preserved.

201 items:
- marker first;
- original items 1 through 200 retained;
- original item 0 omitted.

250 items:
- marker first;
- original items 50 through 249 retained.

Keep the existing item limit unchanged.

Do not raise or lower the 200-item bound.

### Nested arrays

The behavior must apply recursively to nested arrays through the existing sanitizer.

If a nested array exceeds the limit:
- retain that nested array's final 200 items;
- prepend its own truncation marker.

Do not introduce separate nested-array rules.

### Other execution-safety behavior

Preserve unchanged:
- object entry limit;
- structured depth limit;
- string length limit;
- whole serialized execution JSON limit;
- secret redaction;
- credential redaction;
- absolute-path redaction;
- non-finite number handling;
- unsupported primitive handling.

Do not modify object truncation semantics in this task.

### UI behavior

No frontend-specific truncation logic should be added.

The Project Agent Execution UI should continue to:
- receive the stored safe execution result;
- parse it;
- pretty-print it;
- render it in the existing scrollable preformatted block.

Because the backend observability representation changes, the UI should naturally show:

`"[ITEMS TRUNCATED]"`

before the newest retained items.

Do not add frontend array slicing.

### Tests

Update/add deterministic coverage for at least:

Execution safety unit behavior:
- array with 200 items remains unchanged;
- array with 201 items produces 201 output entries:
  - marker at index 0;
  - retained items are original indices 1..200;
- array with 250 items:
  - marker first;
  - retained items are original indices 50..249;
- retained tail order is unchanged;
- marker is not appended at the end;
- nested oversized arrays preserve their latest items;
- nested marker placement is correct.

Agent runtime observability:
- FRED-like or generic 201-item pre-run result stores:
  - marker first;
  - latest observation retained;
  - oldest omitted observation removed;
- ordinary tool execution event follows the same behavior;
- model-bound context remains complete when under semantic size limit;
- transcript truncation does not fail the Agent.

Frontend:
- existing execution renderer does not perform its own truncation;
- marker renders before retained tail items;
- latest retained observation is visible in rendered execution data;
- no frontend slice/limit behavior is introduced.

Regression:
- `TOOL_RESULT_TOO_LARGE` semantics unchanged;
- 32,000-character semantic model limit unchanged;
- object/depth/string observability limits unchanged;
- execution event whole-JSON limit unchanged;
- normal Agent execution remains unchanged.

No external provider calls.

### Architecture

Keep the change inside the existing execution observability safety layer.

Do not move policy into:
- frontend;
- tool implementations;
- FRED-specific code;
- Agent runtime semantic serialization.

This should remain a small generic observability change.

### Scope discipline

Do not perform broad repository enumeration.

Inspect only:
- required docs;
- execution safety serializer;
- directly related Agent runtime tests;
- directly related frontend execution-rendering tests if necessary.

Do not modify:
- model inference;
- Agent Runner;
- Project filesystem;
- upload behavior;
- file modified timestamp behavior;
- Agent settings;
- token accounting;
- logging infrastructure;
- semantic size-limit behavior.

### Required verification

Run all five formal verification commands:

```text
npm.cmd run build
npm.cmd run build:client
npm.cmd run typecheck:client
npm.cmd run lint
npm.cmd test
```

All five must PASS.

### Documentation

After implementation and verification, create:

`docs/executed_results/TASK-0149-preserve-latest-items-in-execution-truncation.md`

Record:
- implementation summary;
- production files changed;
- tests added/changed;
- exact old array truncation behavior;
- exact new tail-preserving behavior;
- marker placement;
- nested array behavior;
- confirmation that semantic model-delivery behavior is unchanged;
- architecture impact;
- deviations;
- risks/findings;
- verification results for all five required commands.

Re-read:

`docs/executed_tasks/TASK-0149-preserve-latest-items-in-execution-truncation.md`

before finalizing.

Verify the implementation against every requirement and explicitly document any deviation.
