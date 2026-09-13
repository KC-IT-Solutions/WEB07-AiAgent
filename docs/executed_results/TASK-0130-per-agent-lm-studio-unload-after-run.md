Task ID: TASK-0130
Status: PASS

Summary:
Implemented per-Agent "Unload model after Agent run" setting for LM Studio provider-specific model lifecycle management. Feature was already implemented in the codebase; verified all layers, fixed one lint issue (unused import), and confirmed all verifications pass.

Repository analysis:
- Agent field `unloadModelAfterRun?: boolean` already present in agent-types.ts with optional/legacy-default-false semantics
- LmStudioModelLifecycleService class fully implemented with discovery, matching, safety checks, and unload flow
- AgentRunService integration via attemptPostRunUnload() in launch() finally block — fires after run terminal state persisted
- Repository validation and parsing handles the field correctly with ?? false default
- UI checkbox placed in Model panel of Agent Settings with proper label and help text
- Comprehensive test coverage across lifecycle, persistence, UI, and operational events

Files changed:
- tests/unit/model-lifecycle.test.ts — Removed unused StreamedModelInferencePartialResult import (lint fix)

Existing implementation files (no changes needed):
- src/server/agent-types.ts — unloadModelAfterRun field in AgentData
- src/server/services/lm-studio-model-lifecycle.ts — Dedicated lifecycle service with discovery/unload
- src/server/services/agent-run-service.ts — attemptPostRunUnload integration in launch finally block
- src/server/repositories/agent-repository.ts — Validation and parsing of unloadModelAfterRun field
- src/client/components/projects/ProjectAgentsSection.ts — UI checkbox in Model panel

Tests and verification:
All 18 required test scenarios covered across existing test files:
1. Legacy Agent defaults unloadModelAfterRun=false ? (agent-persistence.test.ts)
2. Create/update persistence ? (agent-persistence.test.ts)
3. Per-Agent isolation ? (agent-persistence.test.ts)
4. UI checkbox exists in Model tab and persists ? (projects-ui.test.ts)
5. false ? no model-management requests ? (model-lifecycle.test.ts)
6. done + true ? discovery + unload attempted ? (model-lifecycle.test.ts)
7. cancelled + true ? unload attempted after terminal cancellation ? (model-lifecycle.test.ts)
8. error + true ? unload attempted after terminal error ? (model-lifecycle.test.ts)
9. No loaded instance ? safe no-op ? (model-lifecycle.test.ts)
10. Exactly one matching loaded instance ? correct instance_id posted ? (model-lifecycle.test.ts)
11. Multiple matching loaded instances ? skip, no arbitrary unload ? (model-lifecycle.test.ts)
12. Non-LM-Studio/404 discovery ? non-fatal ? (model-lifecycle.test.ts)
13. Malformed discovery response ? non-fatal ? (model-lifecycle.test.ts)
14. Unload HTTP failure ? non-fatal ? (model-lifecycle.test.ts)
15. Successful run remains done after unload failure ? (model-lifecycle.test.ts)
16. Cancelled run remains cancelled after unload failure ? (model-lifecycle.test.ts)
17. No unload occurs between multi-round tool inference calls ? (model-lifecycle.test.ts)
18. Operational events contain no secrets ? (model-lifecycle.test.ts)

Verification results:
- npm run build: PASS
- npm run build:client: PASS
- npm run typecheck:client: PASS
- npm run lint: PASS (after fixing unused import in test file)
- npm test: PASS (1036 tests, 74 suites, 0 failures)

Production code:
No production code changes required — feature was already fully implemented. Only fix was removing an unused type import from a test file to satisfy lint rules.

Architecture:
- Dedicated LmStudioModelLifecycleService class handles all LM Studio model lifecycle operations
- Injected as optional dependency into AgentRunService constructor
- Unload attempted in launch() finally block, after run terminal state is persisted
- Non-fatal: never changes run status or propagates errors to execution flow

Dependencies:
No new dependencies added. Uses existing undici Dispatcher and fetch infrastructure.

Deviations:
None. Feature was already implemented per specification.

Risks / findings:
The implementation correctly follows all requirements including the multiple-instance safety policy, non-fatal error handling, and operational event logging without secrets.
