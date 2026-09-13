# TASK-0146: Fail Fast on Semantic Size Overflow

Task ID: TASK-0146
Status: Completed

## Summary

Agent model-delivery paths no longer truncate oversized tool results. A serialized tool result of at most 32,000 JavaScript string characters is delivered completely; a larger result terminates the Agent run with `TOOL_RESULT_TOO_LARGE` before any incomplete `role: "tool"` message or pre-run context reaches the provider.

Known Project filesystem size failures are now mapped to their Agent semantic operation instead of being mislabeled as unavailable input. Assignment, Instructions, attached-file, pre-run-input, and selected-Skill size failures are explicit and terminal.

## Size-Limit Audit

| Boundary | Production location | Unit / limit | Classification | Pre-change behavior | Final behavior |
| --- | --- | --- | --- | --- | --- |
| Effective Agent Assignment/task | `src/server/services/agent-run-service.ts` | JavaScript string characters, 100,000 | Semantic/runtime | Exact limit passed. Oversized inline data raised generic `INVALID_INPUT` without a terminal run; oversized file content was reported as unavailable. No truncation occurred. | Exact limit is delivered completely. Limit + 1 creates a terminal Agent run with `ASSIGNMENT_TOO_LARGE`, actual/limit character metadata when content was read, and zero inference requests. |
| Persisted inline Assignment configuration | `src/server/services/agent-service.ts` | JavaScript string characters, 20,000 | Semantic/configuration | CRUD rejected overflow as `INVALID_INPUT`; no truncation. | Intentionally unchanged. Runtime separately protects malformed/legacy repository data at 100,000 characters. |
| Inline Agent Instructions | `src/server/services/agent-service.ts`, `src/server/services/agent-run-service.ts` | JavaScript string characters, 20,000 | Semantic/runtime | CRUD rejected overflow, but malformed/legacy persisted values had no runtime recheck. | Runtime exact limit passes completely; overflow terminates before inference with `INSTRUCTION_TOO_LARGE` and actual/limit character metadata. |
| File-based Agent Instructions | `src/server/stores/project-filesystem-store.ts`, `src/server/services/agent-run-service.ts` | UTF-8 bytes, 1 MiB Project text read boundary | Semantic/runtime | Files within the read boundary were delivered completely. Files over the boundary were reported as `INSTRUCTION_FILE_UNAVAILABLE`. | Files within the existing boundary remain complete. Known filesystem overflow maps to `INSTRUCTION_TOO_LARGE`; no partial read is delivered. No new file-instruction limit was invented. |
| Attached Project file, per file | `src/server/services/agent-run-service.ts` | Bytes, 256 KiB | Semantic/runtime | Exact limit passed and limit + 1 failed with `ATTACHED_FILE_TOO_LARGE`; no partial provider context. A preceding 1 MiB filesystem rejection was mislabeled unavailable. | Existing fail-fast boundary remains. Errors include Project-relative `inputFile` and actual/limit byte metadata where the file read completed; filesystem overflow also maps to `ATTACHED_FILE_TOO_LARGE`. |
| Attached Project files, aggregate | `src/server/services/agent-run-service.ts` | Bytes, 1 MiB | Semantic/runtime | Exact limit passed and limit + 1 failed with `ATTACHED_FILES_TOO_LARGE`; no later file was silently dropped and no partial provider context was sent. | Behavior preserved, with explicit actual/limit byte metadata added. |
| Project UTF-8 text-file read/write | `src/server/stores/project-filesystem-store.ts` | UTF-8 bytes, 1 MiB | Semantic/runtime and filesystem safety | Read allocates limit + 1 and throws `PROJECT_FILE_TOO_LARGE`; write measures `Buffer.byteLength`. It never returns partial text. | Filesystem boundary intentionally unchanged. Agent callers now preserve the known size distinction for Assignment, Instructions, attachments, and pre-run input. Model-requested Project reads continue returning an explicit recoverable filesystem error rather than partial content. |
| Pre-run input JSON file | `src/server/stores/project-filesystem-store.ts`, `src/server/services/agent-run-service.ts` | UTF-8 bytes, 1 MiB Project text read boundary | Semantic/runtime | Files over the read boundary were reported as `PRE_RUN_INPUT_FILE_UNAVAILABLE`. Invalid JSON and unavailable files were already separate. | Known overflow maps to `PRE_RUN_INPUT_TOO_LARGE`; invalid JSON, outside-Project, and unavailable mappings remain separate. No partial JSON read was introduced. |
| Pre-run tool result sent in initial user content | `src/server/services/agent-run-service.ts` | Serialized JavaScript string characters, 32,000 | Semantic/runtime | Oversized JSON was replaced by a prefix wrapper and inference continued with incomplete data. | Below and exact limit are delivered byte-for-string-character complete. Limit + 1 records bounded observability, emits overflow chronology, persists `TOOL_RESULT_TOO_LARGE` with tool/call/path and actual/limit character metadata, and makes zero provider requests. |
| Ordinary model-requested tool result | `src/server/services/agent-run-service.ts` | Serialized JavaScript string characters, 32,000 | Semantic/runtime | Oversized JSON was replaced by a prefix wrapper in a `role: "tool"` message and another model round continued. | Oversized results create no provider tool message and no subsequent request. The run terminates with `TOOL_RESULT_TOO_LARGE` after preserving call/result chronology and safe metadata. |
| Selected Skill Markdown | `src/server/stores/skill-content-store.ts`, `src/server/services/skill-service.ts`, `src/server/services/agent-run-service.ts` | UTF-8 bytes, 256 KiB | Semantic/runtime | The content store rejected overflow without partial data, but SkillService converted it to persistence failure and Agent runtime reported `SKILL_UNAVAILABLE`. | Size remains fail-fast and now maps through `CONTENT_TOO_LARGE` to terminal Agent error `SKILL_TOO_LARGE`. No Skill content is sent to the provider. |
| Execution event text | `src/server/agent-execution-safety.ts` | JavaScript string characters, 32,000 | Observability-only | Redacted text was bounded with `[CONTENT TRUNCATED]`. | Intentionally unchanged. The bounded value is persisted/displayed only and is never reused as model input. |
| Execution structured arrays | `src/server/agent-execution-safety.ts` | Items, 200 | Observability-only | First 200 sanitized items plus `[ITEMS TRUNCATED]`. | Intentionally unchanged. Tests prove transcript truncation does not fail a run when the separate complete model-bound serialization is within 32,000 characters. |
| Execution structured objects | `src/server/agent-execution-safety.ts` | Entries, 200 | Observability-only | First 200 sanitized entries plus `truncated: true`. | Intentionally unchanged; not reused for inference. |
| Execution structured depth | `src/server/agent-execution-safety.ts` | Levels, 20 | Observability-only | Deeper data became `[DEPTH TRUNCATED]`. | Intentionally unchanged; preserves bounded diagnostic rendering. |
| Whole execution JSON representation | `src/server/agent-execution-safety.ts` | JavaScript string characters, 32,000 | Observability-only | Oversized sanitized JSON became a bounded `{ truncated, preview }` object. | Intentionally unchanged; the model path serializes the raw result independently before validating its semantic limit. |
| Safe error/tool/path strings | `src/server/agent-execution-safety.ts` | JavaScript string characters, 32,000 | Observability-only | Redacted and visibly bounded. | Intentionally unchanged. Oversized raw payloads are never included in safe errors. |
| Agent prompt/pre-run/result path | `src/server/agent-prompt-file.ts`, `src/server/services/agent-service.ts`, `src/server/stores/project-filesystem-store.ts` | JavaScript string characters, 2,048 | Semantic identifier validation | Invalid or oversized paths failed validation; no truncation. | Intentionally unchanged. Project path safety and Project-relative exposure remain enforced. |
| Agent name/description/model ID | `src/server/services/agent-service.ts` | JavaScript string characters: 120 / 2,000 / 500 | Semantic configuration | CRUD rejected overflow; no runtime truncation. Copy naming intentionally derives a bounded new display name. | Intentionally unchanged. Copy Agent behavior is outside model data delivery and remains unchanged. |
| Tool-schema `maxItems` | `src/server/services/agent-run-service.ts` | Schema-defined item count | Semantic validation | Invalid arguments were rejected and returned as complete recoverable tool failures. | Intentionally unchanged; no list is sliced by this validation. |
| Aggregate Agent provider message size | `src/server/services/agent-run-service.ts` | No application limit | Semantic/runtime | Complete messages were sent; no aggregate truncation. | Intentionally unchanged. No speculative aggregate limit or tool-round limit was introduced. |
| Chat tool-result serialization | `src/server/services/chat-inference-service.ts` | Existing Chat-specific character boundary | Chat semantic/runtime, outside Agent runtime | Chat has its own bounded serialization. | Intentionally unchanged as explicitly permitted; Agent serialization no longer uses this behavior. |

Tool-specific extraction contracts such as Visit Website's configured content/snippet selection were not changed. They define what that tool produces rather than truncating an already-produced Agent/model-delivery payload. Every resulting Agent tool value still passes through the complete-or-terminal 32,000-character delivery check.

## Error Codes

- Added Agent safe errors: `ASSIGNMENT_TOO_LARGE`, `INSTRUCTION_TOO_LARGE`, `PRE_RUN_INPUT_TOO_LARGE`, `TOOL_RESULT_TOO_LARGE`, `SKILL_TOO_LARGE`.
- Preserved and enriched: `ATTACHED_FILE_TOO_LARGE`, `ATTACHED_FILES_TOO_LARGE`.
- Added internal Skill service distinction: `CONTENT_TOO_LARGE`.
- Added persisted safe-error metadata fields: `actualCharacters`, `limitCharacters`, `actualBytes`, `limitBytes`.

## Runtime Behavior

### Model-Bound Tool Results

`JSON.stringify` now produces one complete serialized value. If its JavaScript string length exceeds 32,000, the runtime throws a typed overflow without constructing a prefix wrapper. Pre-run validation occurs after the safe transcript result is recorded but before initial message construction. Ordinary validation occurs after safe tool chronology is recorded but before a `role: "tool"` message is appended.

### Assignment

Inline and file content at 100,000 characters is delivered completely. Oversized content creates a terminal run with an empty persisted task rather than storing or exposing the offending payload. A Project filesystem read overflow is distinguished from file unavailable.

### Instructions

Inline instructions are runtime-checked against the existing 20,000-character configuration limit. File instructions retain the existing 1 MiB UTF-8 Project text-file boundary and are not given a new character limit. Known file overflow maps to `INSTRUCTION_TOO_LARGE`; normal inline, file, and none behavior is unchanged.

### Attached Files

The 256 KiB per-file and 1 MiB aggregate byte limits remain fail-fast. Files are accumulated only for final message composition; any failure prevents all attachment context from reaching inference. Error paths expose only sanitized Project-relative file names and numeric size metadata.

### Pre-Run Input

Project text reads remain whole-file reads. `PROJECT_FILE_TOO_LARGE` now maps to `PRE_RUN_INPUT_TOO_LARGE`; unavailable, outside-Project, malformed JSON, non-array, invalid item, and invalid arguments remain distinct.

### Project Filesystem Mapping

The store's 1 MiB UTF-8 byte boundary and `PROJECT_FILE_TOO_LARGE` code were preserved. Agent runtime performs context-specific mapping without changing ownership checks, sandboxing, path validation, decoding, or Project filesystem tool behavior.

## Files Changed

Production:
- `src/server/services/agent-run-service.ts`
- `src/server/agent-run-types.ts`
- `src/server/repositories/agent-run-repository.ts`
- `src/server/services/skill-service.ts`

Tests:
- `tests/unit/agent-run-service.test.ts`
- `tests/unit/agent-run-attached-files.test.ts`
- `tests/unit/skill-service.test.ts`

Traceability:
- `docs/executed_tasks/TASK-0146-fail-fast-on-semantic-size-overflow.md`
- `docs/executed_results/TASK-0146-fail-fast-on-semantic-size-overflow.md`

## Tests Added Or Changed

- Pre-run result below and exactly at 32,000 characters is delivered completely.
- Pre-run result above 32,000 characters fails before inference with exact metadata and no partial payload.
- Ordinary oversized tool result produces no provider tool message and no subsequent inference.
- Ordinary tool chronology records started, safe result observation, overflow failure, and terminal run failure.
- Inline/file Assignment overflow and Project filesystem Assignment overflow map explicitly with zero inference.
- Assignment exact runtime limit is delivered completely.
- Inline instruction overflow and file read overflow map explicitly with zero inference.
- Inline instruction exact limit is delivered completely.
- Pre-run input filesystem overflow remains separate from unavailable and invalid JSON.
- Attached per-file and aggregate exact/overflow behavior includes deterministic byte metadata.
- Attached Project filesystem read overflow maps to the attached-file size code.
- Selected-Skill content overflow distinction survives SkillService and Agent runtime mapping.
- Agent Runner returns its existing sanitized `Error` result while the oversized target records its own `ASSIGNMENT_TOO_LARGE` terminal run with zero target inference.
- More-than-200-item transcript truncation remains observability-only and non-fatal when semantic serialization fits.
- Existing normal tools, pre-run tools, chaining, Agent Runner, current date, reasoning display, attachments, and unbounded tool rounds remain covered by the full suite.

No external provider calls were made.

## Architecture

Size policy remains in the server application/runtime layer where complete values exist. Project filesystem limits remain in the store, with the service preserving typed infrastructure errors. Execution-safety serialization remains a separate observability path. No frontend policy, new layer, dependency, or generic truncation abstraction was introduced.

## Persistence / Database

No schema or migration changed. Existing Agent run JSON accepts four new optional numeric safe-error metadata properties through repository validation. Existing records remain compatible.

## Security

- Oversized raw values are absent from safe errors and operational metadata.
- Tool name and Project-relative input path use existing execution sanitization.
- Existing secret and absolute-path redaction remains unchanged.
- Project ownership and path sandbox checks remain unchanged.
- No stack traces, API keys, raw provider internals, or complete offending payloads are logged or persisted as errors.

## Deviations

None.

The selected-Skill overflow mapping was added because the scoped runtime audit found a semantic 256 KiB boundary whose size cause was previously lost. Chat runtime was deliberately not changed, as permitted by the task.

## Risks / Findings

- JavaScript string-character limits intentionally continue using `.length`; byte limits intentionally continue using `Buffer.byteLength` or filesystem byte counts.
- Filesystem errors cannot report the source file's full actual byte count after bounded reading, so context-specific errors omit actual/limit metadata when that information is unavailable rather than reporting an inaccurate value.
- Tool-specific extraction/projection contracts remain independent of the Agent model-delivery boundary. Their completed result cannot be silently shortened by Agent runtime.
- The worktree contained extensive pre-existing unrelated tracked and untracked changes. They were not modified or reverted.

## Verification

All required commands passed:

| Command | Result |
| --- | --- |
| `npm.cmd run build` | PASS |
| `npm.cmd run build:client` | PASS |
| `npm.cmd run typecheck:client` | PASS |
| `npm.cmd run lint` | PASS |
| `npm.cmd test` | PASS: 1,129 tests, 0 failures |

Additional focused verification passed:
- `npm.cmd run test:compile`
- `node --test .test-dist/tests/unit/agent-run-service.test.js`
- `node --test .test-dist/tests/unit/agent-run-attached-files.test.js`
- `node --test .test-dist/tests/unit/agent-run-repository.test.js`
- `node --test .test-dist/tests/unit/skill-service.test.js`
- `git diff --check`

## Diff Summary

The Agent runtime now replaces semantic truncation with complete-or-terminal serialization, maps known content-size failures to explicit safe Agent errors, persists deterministic unit-specific metadata, and retains all observability-only truncation and existing runtime architecture.
