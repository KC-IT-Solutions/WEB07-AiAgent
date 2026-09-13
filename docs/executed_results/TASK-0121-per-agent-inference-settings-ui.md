# TASK-0121: Per-Agent Inference Settings UI

## Status: PASS

## Summary

Added per-Agent inference settings (Connection Timeout, Temperature, Top P) to the Agent settings Model tab. Values are persisted in Agent JSON data, validated server-side, and passed as numeric JSON values to OpenAI-compatible provider requests.

## Files Changed

### Types
- **src/server/services/agent-service.ts** — Added `timeoutMinutes`, `temperature`, `topP` fields to `AgentData` interface; added parsing/validation functions (`parseTimeoutMinutes`, `parseInferenceParam`) in input normalization

### Runtime
- **src/server/runtime/model-inference.ts** — Extended `requestModelInference` with optional `temperature` and `topP` parameters; serializes them as JSON numbers to provider request body

- **src/server/services/agent-run-service.ts** — Extracts Agent inference settings from agent data and passes them to each inference call, including multi-round tool/skill execution

### UI
- **src/client/components/projects/ProjectAgentsSection.ts** — Added three input fields under Model tab: Connection Timeout (minutes), Temperature (0–1, step 0.01), Top P (0–1, step 0.01); updated client-side Agent parsing to include new fields

### Tests
- **tests/unit/agent-inference-settings.test.ts** — New test file covering defaults, validation, persistence, boundary rejection, and independent Agent settings
- **tests/unit/model-inference.test.ts** — Added "provider request temperature and top_p serialization" suite verifying JSON number format, decimal point usage, and timeout path integration

## Defaults

| Setting | Default |
|---------|---------|
| timeoutMinutes | 30 |
| temperature | 0.8 |
| topP | 0.8 |

Legacy Agents without stored fields resolve to these defaults via `getEffectiveTimeoutMinutes()` and inline fallbacks.

## UI Implementation

Three number input fields added after existing Model tab controls:
- **Connection timeout**: integer, min=1, step=1, unit label "minutes"
- **Temperature**: decimal, min=0, max=1, step=0.01
- **Top P**: decimal, min=0, max=1, step=0.01

Styling follows existing Model tab conventions (label/input pairs with `form-label`/`form-input` classes).

## Persistence / Backward Compatibility

Optional fields added to Agent JSON data:
```json
{
  "timeoutMinutes": number | undefined,
  "temperature": number | undefined,
  "topP": number | undefined
}
```

No database migration required — backward-compatible JSON evolution. Legacy Agents without these fields resolve defaults at runtime.

## Timeout Integration

Reuses existing `requestModelInference` timeout mechanism (`timeoutMinutes` parameter → AbortController). No new timeout mechanism introduced. Agent's effective timeout is applied per inference call.

## Provider Request Fields

When temperature/topP are set, provider request body includes:
```json
{
  "temperature": 0.25,
  "top_p": 0.65
}
```

Values are JavaScript numbers serialized as JSON numbers with decimal points (never locale-formatted strings or commas).

## Temperature/Top P Numeric Confirmation

- Values stored as JavaScript `number` type in Agent data
- Validated server-side: must be finite, numeric, within [0, 1]
- Serialized via `JSON.stringify()` — always produces decimal point notation
- Provider request body contains JSON numbers (not strings)
- Tests verify both parsed types and serialized format

## Tests Added

### agent-inference-settings.test.ts (27 tests)
- Legacy Agent defaults resolution
- New Agent default values
- Custom value persistence and reload
- Temperature boundary acceptance (0, 0.25, 0.8, 1)
- Top P boundary acceptance
- Below-zero rejection for both fields
- NaN/Infinity/non-finite rejection
- String value rejection
- Null treated as undefined (default)
- Non-integer timeoutMinutes rejected
- Update preserves inference settings across partial updates
- Independent Agent settings isolation
- List includes inference settings

### model-inference.test.ts additions (6 tests)
- Temperature sent as JSON number when provided
- Top P sent as JSON number when provided
- Both fields sent correctly together
- Serialized provider JSON uses decimal points, not commas
- Fields omitted when neither is provided
- Configured timeout reaches existing inference timeout path

## Manual Verification Steps

1. Create/edit an Agent with: timeout=45, temperature=0.25, topP=0.65
2. Save and reopen settings — values should persist
3. Run the Agent against an OpenAI-compatible provider
4. Verify outgoing request contains `"temperature": 0.25` and `"top_p": 0.65` as numeric JSON
5. Create a legacy Agent (no stored fields) — UI should display: timeout=30, temperature=0.80, topP=0.80

## Mandatory Verification Results

| Command | Result |
|---------|--------|
| `npm.cmd run build` | PASS |
| `npm.cmd build:client` | PASS |
| `npm.cmd run typecheck:client` | PASS |
| `npm.cmd run lint` | PASS (0 errors) |
| `npm.cmd test` | 931/944 pass (13 pre-existing failures unrelated to this task) |

## Deviations / Risks

- No deviations from specification
- Pre-existing test failures (13) are in unrelated areas and existed before this change
- All new tests pass across all verification runs
