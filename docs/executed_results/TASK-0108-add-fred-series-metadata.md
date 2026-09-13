Task ID: TASK-0108
Status: PASS

Summary:
Extended the fred_data Tool to include FRED series metadata (title, units, frequency, seasonalAdjustment, observationStart, observationEnd, lastUpdated) alongside historical observations. The tool now performs two sequential FRED API requests per execution: first fetching series metadata from /fred/series, then fetching observations from /fred/series/observations.

Repository analysis:
- Existing FredDataTool in src/server/tools/fred-data-tool.ts handles single observations request
- Tests in tests/unit/fred-data-tool.test.ts use mocked transport pattern
- FRED_API_KEY sourced server-side via process.env.FRED_API_KEY
- RecoverableToolError with FRED_DATA_FAILED code used for all failures

Files changed:
1. src/server/tools/fred-data-tool.ts - Added metadata fetching, parsing, response fields
2. tests/unit/fred-data-tool.test.ts - Updated existing tests, added 26 new metadata test cases

Tests and verification:
- npm run build: PASS
- npm run build:client: PASS
- npm run typecheck:client: PASS
- npm run lint: PASS (0 errors)
- npm test: PASS (700/700 tests pass, 48 FredData tool tests)

Production code:
- Added FredSeriesMetadata interface with 7 required string fields
- Extended FredDataResponse to include metadata fields
- Added parseFredMetadata() function validating series collection shape and required fields
- Added fredRequest() helper for shared fetch/parse/error pattern
- Updated execute() to fetch metadata first, then observations (sequential, not parallel)
- Updated tool description to mention "series metadata"
- All existing behavior preserved: years validation, observation parsing, error handling

Architecture:
- No architectural changes - smallest coherent change principle followed
- fredRequest helper avoids duplicating transport/error logic between two requests
- Metadata failure prevents observations request (avoiding unnecessary provider calls)
- Deterministic sequential request order maintained

Dependencies:
- No new dependencies added

Deviations:
- None

Risks / findings:
- None identified. All error paths produce controlled RecoverableToolError with FRED_DATA_FAILED code. API key remains absent from all responses and errors.

Diff summary:
- src/server/tools/fred-data-tool.ts: +90 lines (metadata interface, parsing, helper, execute update)
- tests/unit/fred-data-tool.test.ts: ~450 lines rewritten (dual-request mock helpers, 26 new metadata tests, existing tests adapted for two-request flow)
