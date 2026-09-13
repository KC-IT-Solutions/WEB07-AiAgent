Task ID: TASK-0133
Status: PASS

Summary:
Implemented partial execution transcript preservation when Agent inference is cancelled. When a cancelled inference returns partial reasoning and/or content, separate `reasoning` and/or `assistant_message` execution events are now written before the existing `inference_cancelled` event.

Repository analysis:
- The cancelled-inference handler in `agent-run-service.ts` (lines 539-555) already captured partial data on the `inference_cancelled` event metadata
- Added two new execution event writes before the `inference_cancelled` event for non-empty trimmed reasoning and content
- Existing tests verifying cancelled-event metadata continue to pass unchanged

Files changed:
- src/server/services/agent-run-service.ts — added reasoning/assistant_message execution events in cancelled handler
- tests/unit/agent-run-service.test.ts — added 12 deterministic tests in new describe block

Tests and verification:
- Added 12 focused tests covering all required scenarios (reasoning-only, content-only, both, whitespace filtering, ordering, no final_result, terminal status, metadata preservation)
- All 77 agent-run-service unit tests pass
- Pre-existing failure in agent-run-attached-files.test.ts is unrelated to this change

Production code:
- Two conditional blocks added before the existing `inference_cancelled` event write
- Each checks for non-empty trimmed content before creating execution events
- No changes to cancellation semantics, tool execution, chaining, or result persistence

Architecture:
- Changes confined to AgentRunService cancelled-inference handling
- No new dependencies, types, or architectural patterns introduced
- Follows existing execution event patterns (reasoning/assistant_message) used in normal inference flow

Dependencies:
- None added

Deviations:
- None

Risks / findings:
- Pre-existing test failure in agent-run-attached-files.test.ts ("Attached files must be placed after system context") is unrelated to this change and existed before implementation

Diff summary:
- src/server/services/agent-run-service.ts: +10 lines (two conditional execution event writes)
- tests/unit/agent-run-service.test.ts: +126 lines (12 new test cases in nested describe block)

Verification results:
- npm run build: PASS
- npm run build:client: PASS
- npm run typecheck:client: PASS
- npm run lint: PASS
- npm test agent-run-service: 77/77 PASS (pre-existing failure in separate file noted above)
