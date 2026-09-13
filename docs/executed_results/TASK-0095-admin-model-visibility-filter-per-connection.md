# TASK-0095 Execution Result

Task ID: TASK-0095
Status: Completed

Summary:
Implemented Admin-managed model visibility policies per saved model connection. The server now persists backward-compatible unfiltered defaults, exposes protected visibility configuration endpoints, filters ordinary model discovery, and enforces the same policy for Chat defaults, Chat selection and inference, Agent configuration, and Agent runs. The Admin UI supports show-all, explicit allowlists, explicit-empty policies, stale IDs, retry states, and accessible disclosure controls. Persisted hidden selections remain visible as disabled unavailable options and are never silently replaced.

Repository analysis:
The existing application follows HTTP to service to repository boundaries and stores connection-specific properties in `model_connections.data`. The visibility policy therefore belongs in the existing connection JSON rather than a new relational table or migration. Existing provider discovery, credential resolution, Chat selection, Agent validation, and inference boundaries were reused. The worktree contained extensive unrelated changes before this task; they were preserved.

Files changed:
- `docs/ARCHITECTURE.md`
- `docs/executed_tasks/TASK-0095-admin-model-visibility-filter-per-connection.md`
- `src/server.ts`
- `src/server/model-connection-types.ts`
- `src/server/repositories/model-connection-repository.ts`
- `src/server/repositories/chat-repository.ts`
- `src/server/repositories/chat-settings-repository.ts`
- `src/server/services/model-connection-service.ts`
- `src/server/services/chat-service.ts`
- `src/server/services/chat-settings-service.ts`
- `src/server/services/chat-inference-service.ts`
- `src/server/services/agent-service.ts`
- `src/server/services/agent-run-service.ts`
- `src/client/components/admin-settings/AdminSettingsView.ts`
- `src/client/components/settings/settings.css`
- `src/client/components/chat/ChatView.ts`
- `src/client/components/projects/ProjectAgentsSection.ts`
- `tests/unit/model-connection-persist.test.ts`
- `tests/unit/model-connection-service.test.ts`
- `tests/unit/agent-service.test.ts`
- `tests/unit/agent-run-service.test.ts`
- `tests/unit/chat-settings-service.test.ts`
- `tests/unit/chat-inference-tools.test.ts`
- `tests/unit/chat-inference-skills.test.ts`
- `tests/unit/chat-inference-queue.test.ts`
- `tests/integration/model-connections-api.test.ts`
- `tests/integration/chats-api.test.ts`
- `tests/integration/chat-inference-api.test.ts`
- `tests/integration/agents-api.test.ts`
- `tests/integration/agent-runs-api.test.ts`
- `tests/frontend/admin-settings-ui.test.ts`
- `tests/frontend/projects-ui.test.ts`
- `docs/executed_results/TASK-0095-admin-model-visibility-filter-per-connection.md`

Tests and verification:
- `npm.cmd run build`: passed.
- `npm.cmd run build:client`: passed.
- `npm.cmd run typecheck:client`: passed.
- `npm.cmd run lint`: passed.
- `npm.cmd test`: passed with 597 tests, 59 suites, and zero failures.
- Focused model visibility unit, API, Chat inference, Agent, Agent run, and frontend suites passed during implementation.
- `git diff --check`: passed; Git emitted only existing LF-to-CRLF working-copy warnings.
- One full-suite run observed a transient failure in the pre-existing 60 ms Chat inference queue timeout test while 596 other tests passed. The exact `npm.cmd test` command was rerun without code changes and all 597 tests passed, so unrelated queue behavior was not modified.

Production code:
Added `filterConfigured` and `visibleModelIds` to connection JSON with safe legacy defaults and atomic scoped persistence. Added Admin-only GET/PUT endpoints with strict shape, duplicate, blank, unavailable-model, and authorization validation. Ordinary connection DTOs omit policy internals. Central discovery preserves exact nonblank provider IDs, applies explicit allowlists, and rejects explicitly hidden IDs locally even if provider discovery is unavailable. Chat and Agent paths reject hidden models before provider inference with controlled errors and no fallback. Exact provider model IDs are preserved through Chat, Chat defaults, and Agent persistence.

Architecture:
Preserved the existing HTTP to application/service to repository to SQLite/infrastructure dependency direction. Policy authority is centralized in `ModelConnectionService`; callers do not independently reimplement allowlist semantics. No migration was needed because policy state is connection-owned JSON. The strict execution behavior and allowlist authority are documented in `docs/ARCHITECTURE.md`.

Dependencies:
No dependencies were added or changed for TASK-0095.

Deviations:
None.

Risks / findings:
Frontend coverage follows the repository's existing source-inspection test style rather than browser-driven interaction tests. Important server-side policy success and failure paths are covered by unit and integration tests. Provider discovery remains required to execute an allowed or unfiltered model so stale allowed IDs cannot be inferred accidentally; explicitly hidden IDs fail closed locally.

Diff summary:
Added one coherent per-connection visibility policy spanning persistence, central service enforcement, protected Admin APIs, Admin editing controls, Chat and Agent selectors, architecture documentation, and regression coverage. No migration or new dependency was introduced, and unrelated dirty-worktree changes were left untouched.
