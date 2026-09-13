Task ID: TASK-0112
Status: PASS

Summary:
Fixed Yahoo Finance metadata mapping so response fields are populated from actual Yahoo API field names. The parser previously read incorrect field names (exchange, currentPrice, previousClose) that do not exist in real Yahoo chart responses, causing null values for valid data.

Repository analysis:
The yahoo-finance-data-tool.ts parseYahooResponse function reads meta fields using getStringField/getNumberField helpers. The field names passed to these helpers did not match the actual Yahoo Finance API response structure. Real Yahoo responses use exchangeName (not exchange), fullExchangeName, regularMarketPrice (not currentPrice), chartPreviousClose (not previousClose), and exchangeTimezoneName (not timezone).

Files changed:
1. src/server/tools/yahoo-finance-data-tool.ts — 8 lines modified in metadata mapping section (lines 139-146)
2. tests/unit/yahoo-finance-data-tool.test.ts — Updated mock fixture to realistic Yahoo field names, updated assertions, added 7 new focused tests

Tests and verification:
- npm run build: PASS
- npm run build:client: PASS
- npm run typecheck:client: PASS
- npm run lint: PASS
- npm test: PASS (785/785 tests pass, 0 failures)

Production code:
Changed metadata mapping in parseYahooResponse() from incorrect Yahoo field names to correct ones:
  - exchange: getStringField('exchange') -> getStringField('exchangeName')
  - exchangeName: getStringField('exchangeName') -> getStringField('fullExchangeName') ?? getStringField('exchangeName')
  - timezone: getStringField('timezone') -> getStringField('exchangeTimezoneName') ?? getStringField('timezone')
  - currentPrice: getNumberField('currentPrice') -> getNumberField('regularMarketPrice')
  - previousClose: getNumberField('previousClose') -> getNumberField('chartPreviousClose')

Architecture:
No architectural changes. Only field name corrections in the parser. Output contract unchanged. No new dependencies, schemas, or public API changes.

Dependencies:
None added.

Deviations:
None. All task requirements met exactly as specified.

Risks / findings:
The existing chart.error === null handling was preserved without modification. The test mock fixture (createMockYahooResponse) was updated to use realistic Yahoo field names, which exposed that two existing tests ("accepts years=1", "accepts years=10") asserted against the old mock symbol value — these were corrected to match the new realistic fixture.

Diff summary:
- yahoo-finance-data-tool.ts: 8 lines changed (lines 141-146 metadata field mappings)
- yahoo-finance-data-tool.test.ts: ~130 lines modified/added (mock fixture update, assertion updates, 7 new focused tests covering fallback behaviors and error handling with realistic field names)
