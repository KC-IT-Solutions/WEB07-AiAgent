# TASK-0151: Configurable Agent runtime limits and size error details

Task ID: TASK-0151
Status: Completed

## Summary

Added globally persisted Agent semantic runtime limits to Admin Settings and made the server-owned runtime-limit policy authoritative for Admin defaults/bounds, Agent configuration validation, and Agent execution. Each new run captures one immutable limit snapshot before Assignment resolution. Size overflow remains terminal and semantic content is never truncated.

The Agent Error Log now preserves and generically renders character or byte metadata as Actual size, Limit, and a presentation-derived Exceeded by value. Existing safe Tool, Input file, Call, Stage, and Run context remains visible.

## Production Files Changed

- `src/server/runtime-limits.ts`
- `src/server/system-settings-types.ts`
- `src/server/repositories/system-settings-repository.ts`
- `src/server/services/system-settings-service.ts`
- `src/server/services/agent-service.ts`
- `src/server/services/agent-run-service.ts`
- `src/server/services/project-filesystem-service.ts`
- `src/server/stores/project-filesystem-store.ts`
- `src/server.ts`
- `src/client/components/admin-settings/AdminSettingsView.ts`
- `src/client/components/projects/ProjectAgentsSection.ts`

No execution-observability limit or truncation implementation was changed by TASK-0151. Existing concurrent worktree changes in `src/server/agent-execution-safety.ts`, Project Files UI, and associated tests were preserved.

## Tests Added Or Changed

- `tests/unit/system-settings-service.test.ts`
- `tests/unit/agent-service.test.ts`
- `tests/unit/agent-run-service.test.ts`
- `tests/unit/agent-run-attached-files.test.ts`
- `tests/unit/agent-run-persistence.test.ts`
- `tests/integration/chat-inference-api.test.ts`
- `tests/frontend/admin-settings-ui.test.ts`
- `tests/frontend/projects-ui.test.ts`

Coverage includes defaults, JSON persistence/reload, atomic sibling Settings preservation during concurrent updates, strict validation, hard boundaries, cross-field validation, Admin authorization/API behavior, reset-to-form-default semantics, configured tool/Assignment/Instructions/attachment boundaries, zero-inference overflow, automatic-chain target overflow, attachment atomicity, run snapshots, safe error metadata persistence, generic size rendering, deterministic formatting, and removal of the obsolete fixed 20,000-character Agent-editor limits.

Frontend tests follow the repository's existing source-contract test convention. They do not mount a browser DOM; the complete full test suite still passes.

## Persisted Settings Schema

The existing singleton `system_settings` row remains unchanged structurally. Its JSON `data` document evolves backward-compatibly with one optional object:

```json
{
  "level": "info",
  "applicationLogEnabled": true,
  "modelInferenceLogEnabled": true,
  "clearLogsOnStartup": false,
  "agentRuntimeLimits": {
    "toolResultCharacters": 32000,
    "assignmentCharacters": 100000,
    "inlineInstructionsCharacters": 20000,
    "attachedFileBytes": 262144,
    "attachedFilesTotalBytes": 1048576
  }
}
```

Historical rows without `agentRuntimeLimits` use code-owned defaults. Logging updates preserve runtime limits and runtime-limit updates preserve logging fields. Both updates use one repository transaction so concurrent read-modify-write operations cannot lose sibling settings. No user-controlled ownership field was added; the existing global Settings convention remains in force.

## Configurable Limits

| Setting | Default | Unit | Hard minimum | Hard maximum | Runtime consumers |
|---|---:|---|---:|---:|---|
| Tool result for model context | 32,000 | JavaScript string characters | 1,000 | 1,000,000 | Pre-run and model-requested tool result serialization |
| Effective Agent assignment | 100,000 | JavaScript string characters | 1,000 | 1,000,000 | Inline Assignment, Assignment file, and complete chain handoff task |
| Inline Agent instructions | 20,000 | JavaScript string characters | 1,000 | 1,000,000 | Agent create/update validation and run-time inline Instructions check |
| Attached Project file | 256 KiB | bytes | 1 KiB | 1 MiB | Per-file Agent attachment loading |
| Attached Project files total | 1,024 KiB | bytes | 1 KiB | 8 MiB | Aggregate Agent attachment loading |

The character maxima bound accidental context growth while retaining intentional administrative headroom. The per-file byte maximum matches the separate code-controlled Project whole-text-file boundary, because a larger attachment setting could never be consumed. The aggregate maximum allows a bounded set of individually safe files while preventing pathological multi-file context sizes.

The Admin GET response supplies current limits, defaults, and bounds from this server-owned policy. Browser `min`, `max`, and Reset values are therefore not independently duplicated constants. Attachment inputs display integral KiB and convert exactly with `1 KiB = 1024 bytes`.

## Validation

Server validation requires an exact five-field object. Every value must be a JSON number that is finite, a safe integer, within its field's hard bounds, and nonnegative. Strings, decimals, `NaN`, infinities, missing fields, and extra fields are rejected without clamping or persistence.

`attachedFilesTotalBytes` must be greater than or equal to `attachedFileBytes`. No additional cross-field constraints are required.

Admin HTML controls use server-provided hard bounds and integer steps for usability. Server validation remains authoritative. Reset restores default form values and requires the existing explicit Save interaction.

## Runtime Snapshot Semantics

Every direct, automatically chained, or Agent-Runner-created run obtains a fresh runtime-limit snapshot before resolving its effective Assignment. The snapshot is copied, frozen, stored only in the process-local active execution, and reused for Instructions, attachments, pre-run tool results, and ordinary tool results throughout that run.

An Admin update does not change an active run. The next run obtains the updated values. Limits are not queried for each tool call.

## Runtime Behavior

### Tool Results

Pre-run and ordinary tool results are serialized completely. A result at or below the snapshot limit is delivered in full. A result above it terminates with `TOOL_RESULT_TOO_LARGE`, including configured `limitCharacters` and actual serialized `actualCharacters`. No subsequent provider request occurs and no oversized raw payload is persisted in the safe error.

### Assignment

Inline and Assignment-file content use the same configured effective Assignment limit based on trimmed JavaScript string length. Exact limit passes; limit plus one terminates with `ASSIGNMENT_TOO_LARGE` before first inference. Complete chained handoff content is also checked before target inference; an oversized handoff creates a terminal target error run without invoking the provider.

Agent create/update validation now uses the same configured Assignment policy. This removes the former hidden 20,000-character persisted-inline rejection beneath the 100,000-character runtime policy. The obsolete fixed browser `maxLength` was removed, leaving the server policy authoritative.

### Instructions

Agent create/update validation and run-time inline Instructions checks use `inlineInstructionsCharacters`. Exact limit passes; limit plus one terminates with `INSTRUCTION_TOO_LARGE` before inference. No truncation occurs.

File Instructions remain subject to the separate Project whole-text-file safety boundary. Raising the inline setting does not raise that boundary.

### Attachments

Each complete attachment read is checked against `attachedFileBytes`, then the prospective aggregate is checked against `attachedFilesTotalBytes`, before the file is appended to context. Exact boundaries pass. Overflow terminates with `ATTACHED_FILE_TOO_LARGE` or `ATTACHED_FILES_TOO_LARGE`; no partial attachment context reaches inference. Aggregate failures include the safe Project-relative file that caused the overflow.

### Project Filesystem Boundary

The Project whole-text-file limit remains code-controlled at 1 MiB and is not exposed as an Admin setting. Bounded-read failures propagate the known `limitBytes` into safe Agent size errors. The complete actual source size is not invented when unavailable.

## Error Log Rendering

The client error type/parser now preserves:

- `actualCharacters`
- `limitCharacters`
- `actualBytes`
- `limitBytes`

Rendering is metadata-driven rather than keyed to an error-code list. Character values use deterministic comma grouping and the `characters` unit. Byte values use deterministic B, KiB, or MiB display and include exact grouped bytes for KiB/MiB values.

When both values exist and `actual > limit`, presentation derives `Exceeded by = actual - limit`. No redundant field is persisted. If actual is unknown, only the known Limit is rendered; Actual size and Exceeded by are omitted.

| Agent size error | Available safe metadata | Error Log rendering |
|---|---|---|
| `TOOL_RESULT_TOO_LARGE` | `actualCharacters`, `limitCharacters`, Tool; Input file and Call for pre-run | Character Actual size, Limit, Exceeded by, plus context |
| `ASSIGNMENT_TOO_LARGE` from complete content | `actualCharacters`, `limitCharacters` | Character Actual size, Limit, Exceeded by |
| `ASSIGNMENT_TOO_LARGE` from bounded file read | Input file and `limitBytes` when supplied by the real filesystem boundary | Byte Limit only, plus file; no fabricated actual/exceeded value |
| `INSTRUCTION_TOO_LARGE` from inline content | `actualCharacters`, `limitCharacters` | Character Actual size, Limit, Exceeded by |
| `INSTRUCTION_TOO_LARGE` from bounded file read | Input file and `limitBytes` when supplied by the real filesystem boundary | Byte Limit only, plus file; no fabricated actual/exceeded value |
| `PRE_RUN_INPUT_TOO_LARGE` | Tool, Input file, and filesystem `limitBytes` when supplied | Context plus Byte Limit; no fabricated actual/exceeded value |
| `SKILL_TOO_LARGE` | No compatible size metadata currently supplied | Existing safe message remains unchanged |
| `ATTACHED_FILE_TOO_LARGE` after complete read | Input file, `actualBytes`, `limitBytes` | Byte Actual size, Limit, Exceeded by, plus file |
| `ATTACHED_FILE_TOO_LARGE` from bounded file read | Input file and filesystem `limitBytes` when supplied | Byte Limit only, plus file |
| `ATTACHED_FILES_TOO_LARGE` | Input file that crossed aggregate, `actualBytes`, `limitBytes` | Byte Actual size, Limit, Exceeded by, plus file |

Non-size errors and existing diagnostics remain unchanged.

## Architecture Impact

The existing layering is preserved:

```text
Admin Settings UI
-> admin HTTP routes
-> SystemSettingsService
-> SystemSettingsRepository
-> existing system_settings JSON

AgentService / AgentRunService
-> AgentRuntimeLimitsProvider (SystemSettingsService in production)
```

Runtime consumers do not access the repository or database directly. The focused `runtime-limits.ts` value/policy module prevents editable semantic constants from being duplicated across services.

## Database And Migration Impact

No schema migration was added. The existing valid-JSON singleton Settings column supports the optional nested object, and old rows retain existing behavior through defaults.

## Security Impact

- Admin GET/PUT routes retain server-side Admin authorization.
- Admin values are treated as untrusted and strictly validated before persistence.
- No automatic limit increase is available from Error Log.
- No oversized raw payload is added to safe errors or returned by the error API.
- Safe Project-relative paths are retained; absolute paths are not introduced.
- Existing ownership isolation, execution redaction, and secret handling remain unchanged.
- The complete-or-terminal rule remains intact; configurability changes only the permitted maximum.

## Dependencies

No dependency was added.

## Deviations

- No optional Error Log navigation link to Admin Settings was added.
- Frontend verification uses the repository's established source-contract tests rather than a mounted browser DOM test.
- `SKILL_TOO_LARGE` continues to have no numeric metadata because the current Skill service boundary does not provide compatible actual/limit fields. The generic renderer will display them if that boundary supplies them later.

These deviations do not change required runtime or rendering behavior for metadata that exists.

## Risks And Findings

- Very high configured character limits can exceed a selected model's context capacity even though they remain within application hard caps; Admins must choose values appropriate to their models.
- Project-file Instructions and Assignments can still fail at the independent 1 MiB filesystem boundary before a character count is available.
- Existing unrelated worktree changes were present before TASK-0151 and were intentionally not reverted.

## Verification

All required commands passed after the final implementation:

| Command | Result |
|---|---|
| `npm.cmd run build` | PASS |
| `npm.cmd run build:client` | PASS (`Client static assets copied.`) |
| `npm.cmd run typecheck:client` | PASS |
| `npm.cmd run lint` | PASS |
| `npm.cmd test` | PASS: 1,158 tests, 78 suites, 0 failed |

Focused runtime, Settings, frontend, persistence, and integration suites also passed before formal verification. No external provider calls were made.

## Diff Summary

The task adds one authoritative runtime-limit policy, backward-compatible global Settings persistence/API/UI, coherent Agent configuration and run-time consumption with per-run snapshots, safe filesystem limit metadata propagation, generic Error Log size presentation, and deterministic boundary coverage. It does not alter observability-only limits or semantic truncation behavior.
