# TASK-0151: Configurable Agent runtime limits and size error details

Task ID: TASK-0151
Slug: configurable-agent-runtime-limits-and-size-error-details

## Instruction

### Preflight

Read:

- `AGENTS.md`
- `docs/IGNORE.md`
- `docs/CODINGSTANDARDS.md`
- `docs/DEFINITION_OF_DONE.md`
- `docs/TASK_WORKFLOW.md`
- relevant ARCHITECTURE / TESTING / SECURITY / DATABASE docs

Create and re-read:

`docs/executed_tasks/TASK-0151-configurable-agent-runtime-limits-and-size-error-details.md`

### Goal

Add configurable global Agent runtime size limits under Admin Settings and improve Agent Error Log rendering so size-related failures clearly show:

- actual size;
- configured limit;
- how much the limit was exceeded by;
- the unit;
- the affected data/tool/file where available.

The existing complete-or-terminal rule must remain unchanged:

```text
complete semantic data
-> allowed

semantic data exceeding configured limit
-> Agent terminates with explicit size error
```

Never reintroduce silent semantic truncation.

### Primary use case

An Agent currently fails with an error such as:

`The tool result exceeded the maximum size allowed for model context.`

The Error Log may identify:

- tool;
- input file;
- call number;

but the user also needs to see:

```text
Actual size
47,832 characters

Limit
32,000 characters

Exceeded by
15,832 characters
```

The Admin must then be able to raise the applicable runtime limit intentionally instead of guessing.

### Part A - Admin Settings: Agent runtime limits

Add a new Admin Settings section:

`Agent runtime limits`

Expose configurable semantic runtime limits for:

1. Tool result for model context
2. Effective Agent assignment
3. Inline Agent instructions
4. Attached Project file
5. Attached Project files total

Recommended UI:

```text
Agent runtime limits

Tool result for model context
[ 32000 ] characters
Default: 32,000

Effective Agent assignment
[ 100000 ] characters
Default: 100,000

Inline Agent instructions
[ 20000 ] characters
Default: 20,000

Attached Project file
[ 256 ] KiB
Default: 256 KiB

Attached Project files total
[ 1024 ] KiB
Default: 1024 KiB

[Reset to defaults] [Save]
```

Use existing Admin/Settings visual and persistence conventions.

Do not redesign the Settings application.

#### Default values

Preserve current effective defaults:

- tool result for model context: 32,000 JavaScript string characters;
- effective Assignment runtime limit: 100,000 JavaScript string characters;
- inline Instructions: 20,000 JavaScript string characters;
- attached file: 256 KiB;
- attached files aggregate: 1,024 KiB.

Existing installations with no stored runtime-limit settings must behave exactly as today.

#### Persistence

Persist these limits as global application/Admin settings using the existing Settings architecture.

UserId remains the existing fixed/global Settings ownership convention until authentication architecture changes.

Do not add per-Agent overrides in this task.

Do not add per-Project overrides.

Use the existing:

```text
HTTP/controller
-> Settings/Application service
-> repository
-> database
```

architecture.

Prefer backward-compatible JSON evolution if Settings already uses JSON storage.

Do not add a migration unless the current Settings persistence genuinely requires one.

#### Runtime source of truth

After this task, semantic Agent runtime checks must obtain their configurable limits from one authoritative runtime-limit configuration rather than duplicating editable constants across unrelated files.

Do not duplicate values independently between:

- Admin UI;
- AgentService;
- AgentRunService;
- tests.

#### Hard safety caps

Admin-configurable limits must still have internal hard minimum and maximum bounds.

The purpose is to prevent accidental or malicious configuration such as:

`999999999999999`

Choose conservative hard bounds after inspecting existing architecture and expected context sizes.

For example, conceptually:

```text
Tool result:
minimum: 1,000 characters
maximum: 1,000,000 characters
```

Do not blindly use these exact values if a better bounded range follows from the existing application architecture.

Document the selected hard bounds and rationale.

Hard bounds must:

- remain code-controlled;
- not be editable from Admin UI;
- be validated server-side;
- also be reflected by appropriate HTML/input validation for usability.

Invalid values must not be persisted.

Do not silently clamp an invalid Admin value.

Return a clear validation error.

#### Units

Keep the existing semantic units.

Character-based limits:

- Tool result
- Assignment
- Inline Instructions

must remain based on JavaScript string length unless deliberately changed and documented.

Byte-based limits:

- Attached file
- Attached files total

must remain byte limits.

Admin UI may display attachment limits as KiB, but conversion to bytes must be exact:

`1 KiB = 1024 bytes`

Do not mix characters and bytes.

#### Runtime behavior

##### 1. Tool result for model context

Replace the hard-coded semantic 32,000-character runtime limit with the configured value.

Applies to:

- pre-run tool results;
- ordinary model-requested tool results.

Behavior remains:

```text
serialized result <= configured limit
-> deliver entire result

serialized result > configured limit
-> terminate Agent with TOOL_RESULT_TOO_LARGE
```

Never truncate and continue.

##### 2. Effective Agent Assignment

Use the configured effective Assignment runtime limit.

This applies to the content actually used by the run, whether it originates from:

- inline Assignment;
- Assignment file.

Do not allow the runtime to silently truncate.

Known overflow must produce:

`ASSIGNMENT_TOO_LARGE`

and zero inference when detected before first request.

Important:

Audit the current difference between:

- persisted inline Assignment validation;
- effective runtime Assignment validation.

Do not create confusing behavior where Admin appears to permit a value that the Agent editor/API always rejects at a lower hidden limit.

Either:

- make the relevant inline configuration validation use the same configured policy where architecturally appropriate; or
- clearly separate the two limits in UI and naming.

Prefer one coherent user-visible policy if this can be achieved without weakening safety.

Document the final behavior explicitly.

##### 3. Inline Agent Instructions

Replace the editable semantic Instructions limit with the configured Admin value.

Do not silently truncate.

Overflow:

```text
-> INSTRUCTION_TOO_LARGE
-> terminal before inference.
```

File-based Instructions that are limited by the Project filesystem whole-file boundary must continue respecting that filesystem safety boundary.

Do not imply that raising the inline limit also raises the Project filesystem 1 MiB hard read boundary.

##### 4. Attached Project file

Use the configured per-file attachment byte limit.

Behavior remains fail-fast.

Do not partially attach a file.

##### 5. Attached Project files total

Use the configured aggregate attachment byte limit.

Behavior remains fail-fast.

Do not silently omit later attachments.

#### Cross-field validation

The Admin settings must validate relationships where applicable.

At minimum:

```text
attached-files-total limit
must be >=
attached-file-per-file limit
```

Reject inconsistent configuration instead of silently adjusting it.

If other cross-field constraints are required by implementation, document them.

#### Reset to defaults

Add:

`Reset to defaults`

This should restore the runtime-limit form values to application defaults.

Follow existing Settings save semantics.

If Settings convention requires Save after Reset, keep that convention.

Do not invent an inconsistent immediate-save interaction.

#### Observability-only limits

Do not expose execution transcript safety limits in this task.

Keep internal and unchanged:

- 200 structured array items;
- structured object entry cap;
- structured depth cap;
- execution text bound;
- whole execution JSON bound;
- secret/path redaction limits.

These are observability safety controls, not semantic Agent context controls.

#### Project filesystem hard limit

Do not expose the Project filesystem whole-text-file hard safety boundary as a general editable runtime setting in this task.

It protects filesystem operations beyond just Agent prompt context.

Keep it code-controlled.

If an Agent operation encounters that limit, existing semantic error mapping remains in force.

### Part B - Agent Error Log size details

Improve the Agent Error Log UI for every size-related Agent error that contains size metadata.

Current errors may already persist fields such as:

```text
actualCharacters
limitCharacters
actualBytes
limitBytes
```

Render them.

#### Character-based example

```text
Error log

2026-09-13 18:44:11
Run #105

pre_run_initialization

The tool result exceeded the maximum size allowed for model context.

Tool
fred_data

Input file
tool-pre-runs/fred-pre-run-3.json

Call
9

Actual size
47,832 characters

Limit
32,000 characters

Exceeded by
15,832 characters
```

#### Byte-based example

```text
Actual size
1.4 MiB

Limit
1.0 MiB

Exceeded by
0.4 MiB
```

#### Error Log calculation

When both actual and limit are present:

`exceededBy = actual - limit`

Only render "Exceeded by" if:

`actual > limit`

Do not store a second redundant exceededBy field in the database unless architecture genuinely requires it.

Prefer deriving it in presentation from persisted actual/limit metadata.

#### Character formatting

For character values:

- use deterministic grouped integer formatting;
- display unit as `characters`.

Example:

```text
47832
->
47,832 characters
```

Do not use locale-dependent formatting if that would make tests/UI output unstable.

A small deterministic thousands-grouping helper is acceptable.

#### Byte formatting

For byte-based error metadata, render a useful human-readable value.

Prefer:

```text
B
KiB
MiB
```

using powers of 1024.

Where useful, the UI may include exact bytes alongside the human-readable value, for example:

`1.4 MiB (1,468,002 bytes)`

Use a deterministic format.

Do not hide the exact nature of the configured limit.

#### Size error coverage

The Error Log should render size details generically when metadata exists, not only for `TOOL_RESULT_TOO_LARGE`.

Cover size errors such as:

- `TOOL_RESULT_TOO_LARGE`
- `ASSIGNMENT_TOO_LARGE`
- `INSTRUCTION_TOO_LARGE`
- `PRE_RUN_INPUT_TOO_LARGE`
- `SKILL_TOO_LARGE`
- `ATTACHED_FILE_TOO_LARGE`
- `ATTACHED_FILES_TOO_LARGE`
- and any equivalent current Agent size errors that already provide compatible metadata.

Do not key the UI only on a hard-coded list if generic metadata detection is cleaner.

#### Affected data metadata

Continue displaying existing safe contextual fields where available:

- Tool
- Input file
- Call
- File
- Stage
- Run

Do not remove existing Error Log information.

If a size error identifies a Project-relative file, display that safe Project-relative path.

Never expose absolute paths.

#### Missing actual size

Some filesystem boundaries cannot know the complete actual source size after bounded read failure.

If actual size is unavailable:

- still show the known limit if it exists;
- do not invent an actual value;
- do not calculate "Exceeded by";
- do not show zero or a misleading approximation.

Example:

```text
Limit
1 MiB

Actual size
not shown

Exceeded by
not shown
```

#### Admin usability link

Do not automatically change settings from an Error Log.

Do not add "raise limit automatically".

The Error Log should provide enough information for the Admin to make an informed decision manually.

If existing UI architecture supports a simple non-invasive navigation link to Admin Settings without significant scope expansion, it may optionally show:

`Runtime limits settings`

But this is optional.

Do not make it required for task completion.

#### API / types

Ensure safe Agent error API/client types preserve all existing size metadata:

- `actualCharacters`
- `limitCharacters`
- `actualBytes`
- `limitBytes`

Do not expose the oversized raw payload.

If repository/API already supports these fields, do not duplicate them.

Admin setting changes must be validated server-side.

#### Concurrency / running Agents

Define settings snapshot semantics clearly.

Recommended behavior:

Each Agent run captures the effective runtime-limit configuration at run start.

That same limit snapshot should be used throughout the run.

This avoids a running Agent changing behavior mid-run because an Admin edits Settings.

Implement this if consistent with current runtime architecture.

Example:

```text
Agent A starts with tool result limit 32,000.
Admin changes limit to 100,000 while A is running.
Agent A continues using 32,000.
Next Agent run uses 100,000.
```

Do not repeatedly query Settings during every tool call if a run-level snapshot is cleaner.

Document final semantics.

### Security

Preserve:

- sanitized Agent errors;
- no raw oversized payloads in error records;
- no API keys/secrets;
- no absolute filesystem paths;
- Project ownership isolation;
- existing execution redaction;
- complete-or-terminal Agent data behavior.

Admin input must be treated as untrusted.

Validate:

- integer;
- finite;
- permitted range;
- cross-field relationships.

Do not accept:

- NaN;
- Infinity;
- decimals where integer units are required;
- negative values;
- strings that parse ambiguously.

### Tests

Add deterministic coverage for at least:

Admin Settings persistence:

- defaults returned when no custom values exist;
- each runtime limit saves and reloads;
- Reset to defaults behavior;
- invalid values rejected;
- below hard minimum rejected;
- above hard maximum rejected;
- decimals rejected;
- negative values rejected;
- aggregate attachment limit below per-file limit rejected;
- existing unrelated Settings remain unchanged.

Tool result runtime:

- default 32,000 behavior remains;
- configured higher limit allows a result previously rejected by default;
- configured lower valid limit rejects appropriately;
- exact configured limit passes;
- configured limit + 1 fails;
- pre-run overflow makes zero provider requests;
- ordinary tool overflow makes no subsequent provider request;
- error metadata reports configured limit, not old hard-coded default.

Assignment:

- configured effective limit is honored;
- exact limit passes;
- +1 fails with `ASSIGNMENT_TOO_LARGE`;
- inline/file behavior follows documented coherent policy.

Instructions:

- configured inline Instructions limit is honored;
- exact passes;
- +1 fails;
- file Instructions filesystem hard boundary remains separate.

Attachments:

- configured per-file limit honored;
- configured total limit honored;
- exact limits pass;
- +1 fails;
- no partial attachment context delivered.

Run snapshot:

- run started under one configuration keeps that configuration;
- subsequent run uses newly saved configuration.

Error persistence/API:

- `actualCharacters` and `limitCharacters` preserved;
- `actualBytes` and `limitBytes` preserved;
- no raw oversized payload persisted.

Error Log frontend:

- character-based actual size rendered;
- character limit rendered;
- exceeded-by rendered correctly;
- byte-based actual/limit/exceeded values rendered correctly;
- missing actual value does not fabricate exceeded-by;
- Tool/Input file/Call fields remain visible;
- non-size errors remain unchanged;
- size details are rendered from metadata generically where possible.

Admin frontend:

- Agent runtime limits section exists;
- all required settings shown with units;
- defaults shown;
- fields load persisted values;
- Save sends expected values;
- Reset follows existing Settings convention;
- validation feedback is clear;
- unrelated Admin Settings remain unchanged.

No external provider calls.

### Architecture

Preserve existing layering.

Recommended shape:

```text
Admin Settings UI
-> existing Settings HTTP/API
-> Settings service/repository
-> persisted runtime-limit configuration

AgentRunService
-> obtains validated effective runtime limits at run start
-> captures snapshot
-> uses snapshot for semantic checks
```

Do not make frontend values authoritative.

Do not directly read database settings from AgentRunService if a Settings/Application service abstraction already exists.

Avoid circular dependencies.

A small immutable RuntimeLimits value object/type is acceptable if it reduces duplication.

### Scope discipline

Do not perform broad repository enumeration.

Inspect only:

- required docs;
- Admin/Settings frontend;
- Settings types/service/repository/API;
- AgentRunService;
- AgentService only where relevant to coherent input validation;
- Agent error types/repository/client parsing;
- Agent Error Log rendering;
- directly relevant tests.

Do not modify:

- execution observability truncation limits;
- Agent Runner semantics;
- Project upload overwrite behavior;
- Project Files size/modified UI;
- model inference parser;
- token accounting;
- logging infrastructure unrelated to Agent Error Log;
- Project filesystem hard safety limit.

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

`docs/executed_results/TASK-0151-configurable-agent-runtime-limits-and-size-error-details.md`

Record:

- implementation summary;
- production files changed;
- tests added/changed;
- persisted settings schema;
- default values;
- hard minimum/maximum values;
- units;
- cross-field validation;
- runtime snapshot semantics;
- tool-result behavior;
- Assignment behavior;
- Instructions behavior;
- attachment behavior;
- Project filesystem hard-boundary behavior;
- Error Log rendering;
- actual/limit/exceeded-by calculation;
- handling when actual size is unknown;
- architecture impact;
- database/migration impact;
- security impact;
- deviations;
- risks/findings;
- verification results for all five required commands.

Include a table of all configurable runtime limits:

```text
Setting
Default
Unit
Hard minimum
Hard maximum
Runtime consumers
```

Also include a table of all size-related Agent errors and which metadata fields are available/rendered.

Re-read:

`docs/executed_tasks/TASK-0151-configurable-agent-runtime-limits-and-size-error-details.md`

before finalizing.

Verify the implementation against every requirement and explicitly document any deviation.

Do not weaken the complete-or-terminal semantic data rule. Configurability changes the permitted maximum size; it must never turn size overflow back into silent truncation.
