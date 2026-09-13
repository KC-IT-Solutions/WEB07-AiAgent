Task ID: TASK-0130
Slug: per-agent-lm-studio-unload-after-run

## Goal

Add a per-Agent setting under Agent Settings ? Model: "Unload model after Agent run" checkbox. When enabled, attempt to unload the LM Studio model after the Agent run has fully terminated (done/cancelled/error). Default: false. Non-fatal on all failures.

## Requirements Implemented

### Agent Data Field
- `unloadModelAfterRun?: boolean` in AgentData interface
- Legacy/default: false (optional field, defaults via `?? false`)
- Persisted per-Agent, independent between Agents

### UI
- Checkbox under Agent Settings ? Model panel
- Label: "Unload model after Agent run"
- Help text: "Unload the model from LM Studio when this Agent run finishes."
- Default unchecked (false)
- Persists via existing Agent save payload
- No new Save flow

### Run Lifecycle
- Only attempts unload after terminal state (done/cancelled/error)
- Never unloads between inference/tool rounds
- Non-fatal: never changes run status (done stays done, cancelled stays cancelled)
- Fires in `finally` block of launch execution promise

### LM Studio API
- Discovery: GET `<baseUrl>/api/v1/models`
- Unload: POST `<baseUrl>/api/v1/models/unload` with `{ "instance_id": <id> }`
- Uses model key matching, not Agent.modelId as instance_id

### Selection Safety
- No matching loaded model ? no-op (skipped)
- Zero loaded instances ? no-op (skipped)
- Exactly one loaded instance ? unload it
- Multiple loaded instances ? skip safely with operational event

### Provider Compatibility
- Non-LM-Studio / 404 / malformed response / network error ? non-fatal skip
- Does not break normal Agent execution

### Architecture
- Dedicated `LmStudioModelLifecycleService` class (not in generic inference)
- Injected into AgentRunService as optional dependency
- Reuses connection base URL and API key conventions

### Operational Events
- model_unload_completed: on successful unload
- model_unload_skipped: with reason metadata
- No secrets logged (no API keys, headers, paths)

## Files Changed
- src/server/agent-types.ts — Added `unloadModelAfterRun?: boolean` to AgentData
- src/server/services/lm-studio-model-lifecycle.ts — Dedicated lifecycle service
- src/server/services/agent-run-service.ts — Integration via attemptPostRunUnload in launch finally block
- src/server/repositories/agent-repository.ts — Validation and parsing of unloadModelAfterRun field
- src/client/components/projects/ProjectAgentsSection.ts — UI checkbox in Model panel

## Tests Added
- tests/unit/model-lifecycle.test.ts — Full lifecycle test suite (18+ tests)
- tests/unit/agent-persistence.test.ts — Legacy defaults, persistence, isolation, validation
- tests/frontend/projects-ui.test.ts — UI checkbox existence and binding verification
