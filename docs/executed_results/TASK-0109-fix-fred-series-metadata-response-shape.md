Task ID: TASK-0109
Status: PASS

Summary:
Fixed parseFredMetadata() to read `data.seriess` instead of `data.series`, matching the actual FRED API response shape. This was a single-character property name mismatch causing all valid series lookups (GDP, GDPC1, etc.) to fail with "Unexpected response from the economic data provider."

Repository analysis:
The parseFredMetadata() function at src/server/tools/fred-data-tool.ts:119 accessed `data.series` but FRED's /fred/series endpoint returns the series array under the property name `seriess`. All test fixtures also used the incorrect `series:` shape and needed updating.

Files changed:
- src/server/tools/fred-data-tool.ts (line 119: `.series` -> `.seriess`)
- tests/unit/fred-data-tool.test.ts (updated mock fixtures + added regression tests)

Tests and verification:
- Added 7 new regression tests covering: wrong property rejection, missing seriess, malformed seriess, GDP mapping, GDPC1 mapping, metadata-success-proceeds-to-observations, metadata-failure-prevents-observations
- Updated existing test fixtures from `series:` to `seriess:` (mockSeriesMetadata + inline mocks)
- All 707 tests pass (55 FredData tool tests including 7 new ones)

Production code:
Single-line change in parseFredMetadata(): changed `(data as Record<string, unknown>).series` to `.seriess`

Architecture:
No architectural changes. Parser now matches the actual provider contract.

Dependencies:
None added or changed.

Deviations:
None.

Risks / findings:
The test fixture `mockSeriesMetadata` and inline mocks used the wrong property name (`series`) which masked this bug in all existing tests. The fix corrects both production code and test fixtures to match the real FRED API contract.

Diff summary:
- src/server/tools/fred-data-tool.ts: 1 line changed (property name)
- tests/unit/fred-data-tool.test.ts: ~6 fixture lines updated + ~90 new regression test lines
