Task ID: TASK-0112
Slug: fix-yahoo-finance-metadata-mapping

## Problem

yahoo_finance_data now successfully retrieves and parses Yahoo Finance chart data. However, several metadata fields are returned as null for valid Yahoo responses because the parser reads incorrect field names from the Yahoo API response.

The current parser reads `meta.exchange`, `meta.currentPrice`, `meta.previousClose` — but the real Yahoo Finance chart response uses `meta.exchangeName`, `meta.fullExchangeName`, `meta.regularMarketPrice`, `meta.chartPreviousClose`.

## Goal

Correct the Yahoo Finance metadata mapping so the existing output contract is populated from the actual Yahoo chart metadata field names. Do not redesign the output contract.

## Required Mapping

- symbol <- meta.symbol
- currency <- meta.currency
- exchange <- meta.exchangeName
- exchangeName <- meta.fullExchangeName (fallback to meta.exchangeName if fullExchangeName absent)
- instrumentType <- meta.instrumentType
- timezone <- meta.exchangeTimezoneName (fallback to meta.timezone if exchangeTimezoneName absent)
- currentPrice <- meta.regularMarketPrice
- previousClose <- meta.chartPreviousClose

## Constraints

- Preserve chart.error === null as success behavior
- Primary file: src/server/tools/yahoo-finance-data-tool.ts
- Tests: tests/unit/yahoo-finance-data-tool.test.ts
- Do not modify frontend code, Tool Settings, AgentRunService, or truncation behavior
- Make the smallest coherent change
- Do not add dependencies, change schemas, or alter public output field names

## Verification

Run all mandatory commands and confirm they pass. Update tests with realistic Yahoo metadata field names.
