Task ID: TASK-0113
Status: PASS

Summary:
Reduced the public yahoo_finance_data observation output from OHLCV (open/high/low/close/volume + adjustedClose) to date-only close-price observations. This simplifies the Tool output contract and materially reduces payload size for model analysis context.

Repository analysis:
- Primary file: src/server/tools/yahoo-finance-data-tool.ts
- Test file: tests/unit/yahoo-finance-data-tool.test.ts
- No other files reference YahooFinanceObservation externally beyond these two files

Files changed:
1. src/server/tools/yahoo-finance-data-tool.ts — Updated YahooFinanceObservation interface, simplified parseYahooResponse parser, updated tool description
2. tests/unit/yahoo-finance-data-tool.test.ts — Rewrote test suite for new observation contract (date + close only)

Tests and verification:
- All 784 tests pass (68 YahooFinanceData-specific tests)
- npm run build: PASS
- npm run build:client: PASS
- npm run typecheck:client: PASS
- npm run lint: PASS
- npm test: PASS (0 failures, 0 skipped)

Production code:
- YahooFinanceObservation interface reduced from 7 fields to 2 fields (date + close)
- Removed parsing of open/high/low/volume arrays and adjclose indicator
- Simplified close value extraction with inline loop (no getFieldArray helper needed for single field)
- Added validation that close array exists in quote data (throws if missing)
- Updated tool description from "OHLCV history" to "close-price history"

Architecture:
- No architectural changes. Single-file modification within existing Tool boundary.
- Metadata parsing unchanged (TASK-0112 preserved).
- Request URL, parameters, and error handling unchanged.

Dependencies:
- No new dependencies added.

Deviations:
- None. All task requirements met exactly as specified.

Risks / findings:
- The parser now validates that close array exists in quote data (previously relied on getFieldArray returning empty array). This is a stricter but correct validation since observations without close data are meaningless.
- Manual verification with live Yahoo Finance endpoint was not performed during automated testing; the mock-based test coverage confirms correctness of parsing logic and filtering behavior.

Diff summary:
Before observation shape: { date, open?, high?, low?, close, adjustedClose?, volume? } (7 fields)
After observation shape: { date, close } (2 fields)
Parser lines removed: ~30 lines of OHLCV field extraction and adjclose parsing
Tests rewritten: 68 tests covering new contract, metadata preservation, error handling, and edge cases
