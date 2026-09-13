# TASK-0146: Fail Fast on Semantic Size Overflow

Task ID: TASK-0146
Slug: fail-fast-on-semantic-size-overflow

## Instruction

### Preflight

Read:
- AGENTS.md
- docs/IGNORE.md
- docs/CODINGSTANDARDS.md
- docs/DEFINITION_OF_DONE.md
- docs/TASK_WORKFLOW.md
- relevant ARCHITECTURE / TESTING / SECURITY / DATABASE docs

Create and re-read:

docs/executed_tasks/TASK-0146-fail-fast-on-semantic-size-overflow.md

### Goal

Audit Agent runtime and related Agent input/data paths for size limits and truncation behavior.

Any size overflow that would otherwise cause semantically relevant data to be truncated, partially delivered, silently bounded, or otherwise changed before being used by the Agent/model must fail fast with an explicit sanitized Agent error.

Observability-only truncation may remain bounded if it does not affect model/runtime semantics.

### Primary principle

No silent truncation of semantically delivered Agent data.

If the system cannot deliver the complete required data to the Agent/model within an enforced size limit, the Agent run must stop with an explicit size/truncation error instead of continuing with incomplete data.

This applies to all relevant size boundaries, not only FRED or pre-run tool results.

### Background

TASK-0145 established that:

- execution transcript serialization and model-bound tool-result serialization are separate;
- execution transcript arrays may be truncated after 200 items with `[ITEMS TRUNCATED]`;
- model-bound tool results are currently bounded at 32,000 JavaScript string characters;
- oversized model-bound tool results are currently wrapped with a prefix-based truncated representation;
- this can silently remove later/latest time-series observations while inference continues.

That silent semantic truncation must be eliminated.

### Audit scope

Inspect narrowly for Agent-relevant size limits, truncation, bounding, slicing, previews, or shortening behavior in:

- AgentRunService;
- Agent execution safety serialization;
- Assignment resolution;
- Instructions resolution;
- attached Project files;
- pre-run input files;
- pre-run tool results;
- ordinary model-requested tool results;
- model message construction;
- Project text-file reads used by Agent runtime;
- relevant Agent DTO/types/repositories;
- any directly related helpers used to bound model-delivered Agent data.

Search for relevant patterns such as:
- MAX_*
- slice(
- substring(
- truncat*
- bounded*
- preview
- size / length checks
- byte limits
- character limits

Do not perform broad unrelated repository enumeration.

### Classification requirement

For each discovered size/truncation boundary, classify it as one of:

#### A. Observability-only

Examples:
- execution transcript/log representation;
- UI-safe execution rendering;
- persisted diagnostic preview;
- sanitized bounded metadata not reused by runtime/model input.

Observability-only data may remain truncated/bounded if:
- it is not reused as model/runtime input;
- truncation is clearly represented;
- it preserves existing safety/redaction guarantees.

#### B. Semantic/runtime data

Examples:
- Assignment;
- Instructions;
- attached context;
- pre-run tool result delivered to model;
- normal tool result delivered to model;
- other provider message content;
- required Project file content used by Agent execution.

Semantic/runtime data must never be silently truncated.

If a semantic/runtime value exceeds its allowed size:
- do not send a partial value to the model;
- do not continue inference;
- stop the Agent run with an explicit safe error.

### Model-bound tool results

Replace silent model-context truncation behavior for Agent execution.

Current conceptual behavior:

raw tool result
-> serialize
-> if > limit, keep prefix
-> send truncated wrapper to model
-> continue

Required behavior:

raw tool result
-> serialize
-> check limit
-> if within limit: send complete serialized result
-> if over limit: fail Agent run
-> do not send partial result to model

This applies to:

1. Pre-run tool results included in the initial Agent user message.
2. Ordinary model-requested tool results returned in `role: "tool"` messages.

Do not silently preserve the old prefix wrapper for Agent runtime.

The existing Chat runtime may remain unchanged unless the audited code is shared in a way that requires an explicit compatible refactor. Do not broaden scope unnecessarily.

### Pre-run behavior

If a pre-run tool result is too large for model delivery:

- fail before the first model inference request;
- do not compose/send a truncated pre-run result;
- retain normal safe observability/error records;
- identify the failing tool and call.

The error must include sanitized metadata sufficient to diagnose the failure.

At minimum where available:
- toolName;
- inputFile;
- callIndex;
- actual serialized size;
- configured limit;
- unit of the limit.

Example safe metadata:

```json
{
  "stage": "pre_run_initialization",
  "code": "TOOL_RESULT_TOO_LARGE",
  "message": "The tool result exceeded the maximum size allowed for model context.",
  "toolName": "fred_data",
  "inputFile": "tool-pre-runs/fred-pre-run-1.json",
  "callIndex": 1,
  "actualCharacters": 48732,
  "limitCharacters": 32000
}
```

Use project conventions for exact field naming.

Do not expose:
- raw oversized result;
- secrets;
- API keys;
- absolute filesystem paths;
- stack traces;
- provider internals.

### Ordinary model tool-call behavior

If an ordinary Agent model tool call returns a result that exceeds the semantic model-delivery limit:

- do not create a truncated `role: "tool"` provider message;
- do not continue another model round;
- fail the Agent run safely.

This overflow is terminal for the current Agent run.

Do not convert it to a normal recoverable tool result containing incomplete data.

Preserve the execution event/tool-call chronology up to the failure.

Where practical, record:
- tool call started;
- tool execution completed or result-size validation reached;
- tool result overflow failure;
- final Agent error.

Use existing execution/operational event conventions rather than inventing unrelated event infrastructure.

### Size accounting

For every enforced semantic size limit, use the correct existing unit and make it explicit.

Examples:
- JavaScript string characters;
- UTF-8 bytes;
- item count.

Do not silently compare bytes against character limits or vice versa.

If an existing limit is currently defined as JavaScript string length, preserve that semantic unless there is a strong documented reason to change it.

If a limit is bytes, use bytes.

Error metadata must make the unit clear, for example:
- actualCharacters / limitCharacters;
- actualBytes / limitBytes;
- actualItems / limitItems.

### Assignment/task size

Audit the existing Assignment/task length limit.

If oversized Assignment currently:
- already fails the Agent before inference with an explicit error, preserve or improve it;
- is masked as another unrelated error, fix the error mapping;
- is truncated anywhere, replace truncation with fail-fast behavior.

For file-based Assignment:
- distinguish file unavailable from Assignment content too large;
- do not report content-size overflow as file-unavailable.

Use explicit safe error codes/messages.

### Instruction size

Audit inline and file-based Agent Instructions.

If there is an existing size limit:
- ensure overflow fails before model inference;
- use an explicit instruction-too-large error;
- do not silently truncate.

If there is no current limit and no truncation, do not invent a new limit solely for this task unless required by an existing downstream bounded path.

### Attached Project files

Audit:
- per-file limit;
- aggregate attached-files limit.

Existing explicit fail-fast behavior should be preserved.

Verify that:
- no partial attached file is delivered;
- no later file is silently dropped;
- errors distinguish per-file versus aggregate overflow;
- file path metadata is sanitized/Project-relative where exposed.

If current behavior already satisfies this, add/adjust tests only as needed.

### Project text files used by Agent runtime

Audit ProjectFilesystemService / ProjectFilesystemStore file-size boundaries as they affect:
- Assignment files;
- Instruction files;
- attached files;
- pre-run input files.

If a Project file exceeds a filesystem read limit:
- preserve the filesystem safety boundary;
- map the error at the Agent layer to the semantic operation where possible.

Examples:
- Assignment file too large
- Instruction file too large
- Attached file too large
- Pre-run input file too large

Do not collapse all size overflow into generic unavailable-file errors if the underlying cause is known and safely distinguishable.

### Pre-run input files

Pre-run input JSON files are semantic runtime input.

Audit their read/parse path.

If the file exceeds an existing read limit:
- fail pre-run initialization;
- use an explicit size-related safe error if the underlying filesystem error identifies that condition;
- do not report it only as generic unavailable input.

Do not introduce partial JSON reading.

### Execution transcript / observability safety

Preserve existing execution safety behavior unless a narrow change is required for better observability.

The following may remain bounded because they are observability-only:

- array item cap such as first 200 items + `[ITEMS TRUNCATED]`;
- object entry cap;
- depth cap;
- safe string length cap;
- whole-event JSON preview bound;
- secret/path redaction.

Do not remove these protections as part of this task.

However, make sure no observability-bounded representation is ever reused as semantic model/runtime input.

If such reuse is found, separate the data paths.

### Error taxonomy

Introduce or refine explicit safe error codes for semantic size overflow.

Use the smallest coherent taxonomy.

At minimum distinguish major contexts where useful, for example:

- ASSIGNMENT_TOO_LARGE
- INSTRUCTION_TOO_LARGE
- ATTACHED_FILE_TOO_LARGE
- ATTACHED_FILES_TOO_LARGE
- PRE_RUN_INPUT_TOO_LARGE
- TOOL_RESULT_TOO_LARGE

Do not create excessive duplicate codes if existing error types already represent a case correctly.

Messages should be user-readable and precise.

Example:

"The tool result exceeded the maximum size allowed for model context."

Do not use wording implying "file unavailable" for a known size overflow.

### Runtime chronology

For every semantic overflow:
- stop before incomplete data reaches the next inference step;
- preserve deterministic event chronology;
- mark the Agent run terminal error;
- do not write a normal final result;
- do not trigger next Agent;
- do not save a result file;
- do not continue tool rounds;
- do not continue provider inference.

If the overflow occurs before first inference, there must be zero provider requests.

If it occurs after a model tool call, there must be no subsequent provider request.

### Agent Runner / concurrent Agents

Do not change TASK-0143 concurrency semantics.

If a target Agent fails because of a size overflow:
- the target Agent records its own explicit size error;
- Agent Runner should observe the target's terminal error according to its existing contract;
- do not weaken size-overflow behavior to preserve runner success.

Do not introduce new cross-Agent error propagation semantics unless required by existing Agent Runner behavior.

### Tests

Add deterministic coverage for the size-limit audit and all changed behavior.

At minimum cover:

Model-bound pre-run result:
- result below limit is delivered completely;
- result exactly at limit is delivered completely;
- result above limit fails the Agent;
- no provider inference occurs after pre-run overflow;
- error identifies toolName;
- error identifies inputFile/callIndex where available;
- actual and limit size metadata are correct;
- no partial/truncated raw result is delivered.

Ordinary model tool result:
- result below limit continues normally;
- oversized result fails the Agent;
- no truncated `role: "tool"` message is sent;
- no subsequent provider request occurs;
- tool/result chronology remains valid;
- explicit TOOL_RESULT_TOO_LARGE error is persisted.

Assignment:
- oversized inline Assignment fails explicitly;
- oversized file Assignment fails explicitly;
- file-content-too-large is not mislabeled as file unavailable;
- normal Assignment remains unchanged.

Instructions:
- if an applicable existing size boundary exists, test explicit overflow failure and no inference;
- normal inline/file/none behavior remains unchanged.

Attached files:
- existing per-file limit remains fail-fast;
- existing aggregate limit remains fail-fast;
- no semantic partial delivery occurs.

Pre-run input file:
- oversized input file maps to explicit size error if underlying filesystem code supports it;
- invalid JSON behavior remains separate;
- unavailable-file behavior remains separate.

Observability-only truncation:
- `[ITEMS TRUNCATED]` may still appear in execution transcript for >200-item arrays;
- this does not itself fail the Agent when the semantic model-bound value is within its allowed size;
- transcript truncation remains separate from semantic size validation.

Boundary tests:
- exact limit passes;
- limit + 1 fails;
- units are deterministic.

Existing behavior:
- normal tools continue working;
- pre-run tools continue working;
- Agent chaining remains unchanged;
- Agent Runner remains unchanged;
- Copy agent remains unchanged;
- current-date context remains unchanged;
- reasoning_content remains display-only;
- attached Project file semantics remain unchanged;
- model connection serialization remains unchanged;
- no arbitrary tool-round limit is introduced.

No external provider calls.

### Architecture

Preserve existing boundaries.

Prefer:
HTTP / controllers
-> services/runtime
-> repositories/stores

Do not move size-policy logic into frontend code.

Semantic size validation belongs in the server/runtime layer where complete values are available.

Keep execution-safety serialization separate from semantic model-delivery validation.

Avoid creating a generic global "truncate everything" abstraction.

A small explicit helper for "serialize or throw if over semantic limit" is acceptable if it improves consistency without obscuring context-specific errors.

### Security

Preserve all existing:
- secret redaction;
- Project path safety;
- Project ownership isolation;
- sanitized errors;
- no stack traces/API keys/provider internals in Agent-visible errors.

Do not include oversized raw content in errors or logs.

Do not log the complete offending payload.

### Scope discipline

Do not perform broad repository enumeration.

Inspect only:
- required docs;
- Agent runtime/types/repositories;
- Agent execution safety helpers;
- Project filesystem read path;
- relevant Agent service logic;
- directly related tests;
- any small shared helper actually used by these paths.

Do not modify unrelated:
- logging feature behavior;
- UI layout;
- Agent Runner UI;
- Copy agent;
- model inference parser;
- token accounting;
- Project file editor behavior.

### Required verification

Run all five formal verification commands:

npm.cmd run build
npm.cmd run build:client
npm.cmd run typecheck:client
npm.cmd run lint
npm.cmd test

All five must PASS.

### Documentation

After implementation and verification, create:

docs/executed_results/TASK-0146-fail-fast-on-semantic-size-overflow.md

The result must include:

- complete size-limit audit table;
- each discovered limit;
- unit;
- current/pre-change behavior;
- final behavior;
- whether it is observability-only or semantic/runtime;
- exact production files changed;
- error codes added/changed;
- model-bound tool-result behavior;
- Assignment behavior;
- Instructions behavior;
- attached-file behavior;
- pre-run input behavior;
- Project filesystem size mapping;
- tests added/changed;
- architecture impact;
- persistence/database impact;
- security implications;
- deviations;
- risks/findings;
- verification results for all five required commands.

Explicitly document any discovered size/truncation boundary that was intentionally left unchanged and why.

Re-read:

docs/executed_tasks/TASK-0146-fail-fast-on-semantic-size-overflow.md

before finalizing.

Verify the implementation against every requirement.

Do not silently retain semantic truncation anywhere in the audited Agent paths. If a semantic value cannot be delivered completely, the Agent must fail explicitly.
