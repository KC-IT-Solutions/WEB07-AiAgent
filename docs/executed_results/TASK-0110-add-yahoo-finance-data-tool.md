## Task ID

TASK-0110

## Status

PASS

## Summary

Added a new external Tool named `yahoo_finance_data` that fetches daily historical market data from Yahoo Finance for known instrument symbols. The Tool integrates through the existing Tool architecture including ToolRegistry, Tool Settings, Agent Tool selection, Skill requiredTools, and external Tool execution flow. No special-casing in AgentRunService.

## Repository analysis

Inspected existing external Tools (fred_data, DuckDuckGo, Visit Website) to understand:
- RegisteredTool interface patterns
- ToolRegistry registration conventions
- Tool Settings system integration
- Transport abstraction with AbortSignal support
- RecoverableToolError error handling patterns
- Input schema validation with additionalProperties rejection
- Test structure following fred-data-tool.test.ts conventions

## Files changed

### New files
- `src/server/tools/yahoo-finance-data-tool.ts` — Yahoo Finance Data Tool implementation (506 lines)
- `tests/unit/yahoo-finance-data-tool.test.ts` — 63 deterministic unit tests (920 lines)
- `docs/executed_tasks/TASK-0110-add-yahoo-finance-data-tool.md` — Task instruction record

### Modified files
- `src/server/tool-types.ts` — Added YahooFinanceDataTool types, settings schema, error code constant
- `src/server/repositories/tool-settings-repository.ts` — Added yahoo_finance_data parser for empty settings shape
- `src/server/services/tool-settings-service.ts` — Added yahoo_finance_data handling in defaults and validation
- `src/server/server.ts` — Registered YahooFinanceDataTool in ToolRegistry
- `tests/integration/tools-api.test.ts` — Updated tool count from 3 to 4, added yahoo_finance_data assertions

## Tests and verification

### Tests added
- 63 unit tests covering all required test cases:
  - Input validation (symbol required, empty rejected, years bounds, non-integer rejection)
  - Request construction (URL encoding, interval=1d, includePrePost=false, useYfid=true, lang=en-US)
  - Date range calculation (period1/period2 with deterministic time handling)
  - Metadata mapping (symbol, currency, exchange, exchangeName, instrumentType, timezone, currentPrice, previousClose)
  - OHLCV parsing by index (open, high, low, close, volume, adjustedClose)
  - Null preservation (OHLC nulls, volume nulls, adjustedClose nulls remain null)
  - Invalid/non-finite close row filtering
  - Observation ordering preservation
  - Error handling (network failure, timeout, non-2xx, malformed JSON, malformed chart shape, empty result, Yahoo structured error)
  - Signal abort support
  - No live provider calls in tests

### Verification results
All mandatory commands succeeded:
- `npm run build` — PASS (tsc compilation clean)
- `npm run build:client` — PASS (client assets copied)
- `npm run typecheck:client` — PASS (no TypeScript errors)
- `npm run lint` — PASS (eslint clean)
- `npm test` — PASS (770 tests, 63 suites, 0 failures)

## Production code

### Tool implementation (`yahoo-finance-data-tool.ts`)
- Implements RegisteredTool interface with name `yahoo_finance_data`
- Display name: "Yahoo Finance Data"
- Input schema validates symbol (required string), years (integer 1-10 inclusive), rejects additional properties
- Uses Yahoo Finance chart endpoint at `https://query2.finance.yahoo.com/v8/finance/chart/<symbol>`
- URLSearchParams for query parameters with encoded symbol path segment
- Calculates period1 (current date minus years) and period2 (current date) as UNIX seconds
- Parses Yahoo response structure: chart.result[0].meta, timestamp[], indicators.quote[0], indicators.adjclose[0]
- Maps metadata fields from provider response to output contract
- Builds observations by index pairing timestamps with OHLCV data arrays
- Filters out rows without valid finite close values
- Preserves null values for optional fields (never converts null to 0)
- Uses Yahoo timezone metadata for timestamp-to-date conversion via UTC offset calculation
- Returns recoverable RecoverableToolError for all failure scenarios
- Supports injectable transport for deterministic testing

### Integration points
- Registered in ToolRegistry alongside existing external Tools
- Settings shape: `{ enabledForChat: boolean }` (minimal, no API key or Yahoo-specific fields)
- Error code: `YAHOO_FINANCE_DATA_FAILED`
- Follows existing tool-settings-repository parsing conventions
- Appears through Tools UI via generic registration

## Architecture

No architectural changes. The Tool follows the exact same patterns as fred_data and other external Tools:
- RegisteredTool interface implementation
- Generic transport abstraction with RequestInit signature
- RecoverableToolError for controlled failure handling
- Input schema validation with zod-style additionalProperties rejection
- Settings integration through existing tool-settings-service system

## Dependencies

No new dependencies added. Uses only Node.js built-in modules (http, https, URL) and existing project types.

## Deviations

None. All requirements implemented as specified.

## Risks / findings

- Yahoo Finance endpoint is not an official public API with guaranteed stability
- Response parsing relies on chart.result[0] structure which may vary by symbol type
- Timezone handling uses UTC offset calculation from provider timezone metadata for deterministic date conversion
- No caching or retry logic implemented (out of scope per task requirements)

## Diff summary

~1500 lines added across 7 files:
- ~506 lines production code (new tool implementation)
- ~920 lines test coverage (63 tests)
- ~80 lines type definitions, settings integration, and registration
- No deletions or modifications to existing behavior
