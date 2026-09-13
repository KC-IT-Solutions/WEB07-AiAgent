# TASK-0071 - Add configurable DuckDuckGo pacing and cooldown

Task ID: TASK-0071
Status: PASS

Summary:

Added configurable, process-shared DuckDuckGo request pacing and HTTP 202 cooldown with abortable FIFO scheduling, Settings UI controls, backward-compatible defaults, and deterministic coverage.

Repository analysis:

- DuckDuckGo settings use the existing UserId 1-scoped `tool_settings.data` JSON and are resolved before inference tool execution.
- The production registry creates one DuckDuckGo tool instance; its default scheduler is module-shared so all production DuckDuckGo executions use one gate.
- Existing primary/fallback requests, structural response classification, browser-profile selection, recoverable failures, and inference-scoped cancellation were retained.
- No SQLite transaction spans scheduler waiting, and JSON evolution required no database migration.

Files changed:

- `src/server/tool-types.ts`
- `src/server/tools/duckduckgo-search-tool.ts`
- `src/client/components/settings/SettingsView.ts`
- `src/client/components/settings/__tests__/SettingsView.test.ts`
- `tests/unit/duckduckgo-search-tool.test.ts`
- `tests/unit/tool-settings-service.test.ts`
- `tests/integration/tools-api.test.ts`
- `docs/executed_tasks/TASK-0071-duckduckgo-configurable-pacing.md`
- `docs/executed_results/TASK-0071-duckduckgo-configurable-pacing.md`

Tests and verification:

- `powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\inspect-repo.ps1` passed.
- Initial `npm.cmd test` exposed explicit null being defaulted and then a stale `dist` integration server; validation was corrected to default only absent fields and the server was rebuilt.
- Final `npm.cmd run build` passed.
- Final `npm.cmd run build:client` passed.
- Final `npm.cmd run typecheck:client` passed.
- Final `npm.cmd run lint` passed.
- Final `npm.cmd test` passed: 446 tests, 43 suites, 0 failures.
- `git diff --check` passed with only existing line-ending warnings.
- Manual live DuckDuckGo verification was not run; it was optional.

Production code:

- Added integer millisecond settings `requestDelayMs` and `cooldownAfter202Ms` with defaults `1500` and `8000`.
- Added strict finite safe-integer, non-negative validation while applying defaults only when older JSON omits the fields.
- Added existing-modal numeric controls with millisecond labels, minimum 0, step 1, current values, blank/unsafe integer rejection, and existing API persistence.
- Added a DuckDuckGo-specific FIFO scheduler using monotonic `performance.now()`, an injectable wait seam, one active transport start gate, shared cooldown state, and prompt queued abort handling.
- Every primary and fallback transport request passes through the scheduler. HTTP 202 extends the global cooldown at response time; non-202 unusable responses apply normal pacing only.
- Added bounded `requestDelayMs`, `cooldownAfter202Ms`, and `pacingWaitMs` diagnostics.

Architecture:

- Scheduling remains local to the DuckDuckGo tool; no generic queue or HTTP abstraction was introduced.
- The deterministic mixed-settings rule is that each queued request's captured delay governs spacing from the previous global request start, while any established global HTTP 202 cooldown can only be extended and never weakened.
- Existing settings resolution and JSON repository boundaries remain unchanged.

Dependencies:

- No dependencies added or changed for TASK-0071.

Deviations:

- None.

Risks / findings:

- Pacing reduces burst behavior but cannot guarantee DuckDuckGo will never return HTTP 202.
- The worktree contained substantial pre-existing modified and untracked files; they were preserved and not reverted.

Diff summary:

- Extended DuckDuckGo settings types, defaults, parsing, Settings UI, and API expectations.
- Added a shared abortable FIFO pacing/cooldown gate around both existing HTTP attempts.
- Added deterministic scheduler, fallback, cross-execution, cancellation, validation, compatibility, API, and frontend coverage without real multi-second sleeps.
