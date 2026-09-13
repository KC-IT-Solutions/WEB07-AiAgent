# TASK-0050 - Tool calling with DuckDuckGo search and chat UI refinement

Task ID: TASK-0050
Status: PASS

Summary:

Implemented persisted user-scoped DuckDuckGo tool settings, server-side OpenAI-compatible tool execution, Settings controls, and refined Chat message presentation.

Repository analysis:

- Followed the existing Express service/repository layering, ordered SQLite migration mechanism, DOM-based client components, shared confirmation modal, model inference provider, and JSONL chat message boundary.
- The worktree already contained uncommitted TASK-0044 through TASK-0049 changes, including changes in Chat, inference, persistence, and tests. Those changes were preserved and not reverted.
- The supplied `searchDuckDuckGo(1).js` reference was not present in the repository, so implementation followed the task's stated behavioral requirements directly.

Files changed:

- Added tool domain types, registry, DuckDuckGo implementation, settings repository/service, migration, and HTTP routes.
- Extended `src/services/model-inference.ts` and `src/server/services/chat-inference-service.ts` for typed OpenAI-compatible function calls and a five-round execution limit.
- Extended the shared modal and Settings UI for DuckDuckGo Chat enablement, result count, and safe-search controls.
- Refined assistant and user message CSS while preserving Markdown, plain-text user rendering, and the thinking indicator.
- Added deterministic unit, integration, and focused frontend tests.
- Added the active task and result tracking documents.

Tests and verification:

- `powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\inspect-repo.ps1` - PASS.
- `npm.cmd run build` - PASS.
- `npm.cmd run build:client` - PASS.
- `npm.cmd run typecheck:client` - PASS.
- `npm.cmd run lint` - PASS.
- `npm.cmd test` - PASS, 309 tests passed, 0 failed.
- `git diff --check` - PASS; only existing Windows line-ending warnings were emitted.
- Automated tests used injected/stubbed DuckDuckGo transport and OpenAI-compatible inference responses. No live DuckDuckGo or LM Studio request was made.

Production code:

- `duckduckgo_search` validates model-generated arguments, controls the destination host, posts to DuckDuckGo's HTML endpoint with native `fetch`, applies a project-owned User-Agent and abort timeout, extracts structured links, normalizes redirects, filters internal/ad links, deduplicates URLs, and bounds results.
- Tool settings default to disabled for Chat, five results, and moderate safe search. SQLite enforces one record per `(user_id, tool_name)` and the service always uses server-side UserId 1.
- `GET /api/tools`, `GET /api/tools/:toolName/settings`, and `PUT /api/tools/:toolName/settings` expose only registered tools and reject unknown names or invalid settings.
- Enabled tools are sent through the OpenAI-compatible function schema. Tool protocol messages remain in memory for one inference; only the current user message and final assistant response enter JSONL history.

Architecture:

- HTTP routes call `ToolSettingsService`; SQL and JSON serialization remain in `ToolSettingsRepository`.
- `ChatInferenceService` owns orchestration, `ToolRegistry` owns registered execution, the concrete tool owns DuckDuckGo behavior, and the model provider owns only provider request/response translation.
- No agent framework, generic URL fetcher, browser automation, or client-side tool execution was introduced.

Dependencies:

- No dependency was added. Native `fetch` and the repository's existing `cheerio` dependency are used.

Deviations:

- Optional search pagination was not added because the required model-facing input is fully served by the smaller query-only schema.
- The missing reference JavaScript file could not be inspected; no historical executed task/result file was read.

Risks / findings:

- DuckDuckGo's HTML structure is an external contract and may change; extraction failures return a bounded empty result list or controlled tool failure rather than exposing HTML.
- The repository remains intentionally dirty with unrelated earlier-task changes that predated TASK-0050.

Diff summary:

- Added the first registered server-side tool and persisted per-user configuration.
- Added typed provider tool calls and bounded inference orchestration.
- Added Settings modal controls and Chat message styling refinements.
- Added deterministic coverage for tool behavior, settings/API persistence, inference boundaries, and presentation.
