Task ID: TASK-0107
Status: PASS

Summary:
Added fred_data external Tool for fetching historical economic observations from FRED (Federal Reserve Economic Data) API. Integrated through existing ToolRegistry, Tool Settings UI, Agent Tool selection, and Skill-required-tool behavior.

Repository analysis:
Inspected existing tool architecture via DuckDuckGoSearchTool and VisitWebsiteTool patterns. Identified integration points in tool-types.ts, tool-settings-repository.ts, tool-settings-service.ts, server.ts (ToolRegistry), ToolsView.ts (frontend types), and test infrastructure. Followed established conventions for transport abstraction, input validation, error handling, and settings persistence.

Files changed:
- src/server/tool-types.ts — Added FredDataSettings type, FRED_DATA_TOOL_NAME constant, DEFAULT_FRED_DATA_SETTINGS, parseFredDataSettings function
- src/server/tools/fred-data-tool.ts — New file implementing FredDataTool with FRED API integration
- src/server/repositories/tool-settings-repository.ts — Added fred_data case to settings parsing switch
- src/server/services/tool-settings-service.ts — Added fred_data defaults and import for DEFAULT_VISIT_WEBSITE_SETTINGS fix
- src/server/server.ts — Registered FredDataTool in ToolRegistry constructor
- src/client/components/tools/ToolsView.ts — Updated type guards for FredDataToolSettings in UI
- tests/unit/fred-data-tool.test.ts — New file with 27 deterministic unit tests covering all verification points
- tests/integration/tools-api.test.ts — Updated to expect 3 tools instead of 2

Tests and verification:
All mandatory commands succeeded:
- npm run build: PASS (0 errors)
- npm run build:client: PASS (0 errors, assets copied)
- npm run typecheck:client: PASS (0 errors)
- npm run lint: PASS (0 warnings/errors)
- npm test: PASS (679 tests, 62 suites, 0 failures)

Production code:
- fred_data tool follows existing transport abstraction pattern for HTTP requests
- Input validation rejects invalid seriesId, years outside 1-10, non-integer years, additional properties
- FRED_API_KEY sourced server-side from process.env, never exposed to client/results/errors
- Controlled error handling via RecoverableToolError with FRED_DATA_FAILED code
- Null and non-numeric observation values filtered out during response parsing

Architecture:
No architectural changes. fred_data integrates through existing ToolRegistry, ToolSettingsRepository, ToolSettingsService, and frontend ToolsView patterns. No new dependencies added. No AgentRunService special-casing.

Dependencies:
None added. Uses existing fetch-based transport abstraction.

Deviations:
- Fixed missing DEFAULT_VISIT_WEBSITE_SETTINGS import in tool-settings-service.ts (pre-existing gap exposed by ternary chain extension)
- Added null check in parseFredResponse to filter FRED observations with null values (Number(null) === 0 would otherwise pass validation)

Risks / findings:
None identified. Implementation follows all established patterns and conventions.

Diff summary:
7 files changed across server tool infrastructure, frontend type guards, integration test update, and new unit test file. All changes are minimal and follow existing repository conventions.
