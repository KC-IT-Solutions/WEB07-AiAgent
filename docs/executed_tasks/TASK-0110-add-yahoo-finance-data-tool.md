Task ID: TASK-0110
Slug: add-yahoo-finance-data-tool

## Goal

Add a new external Tool named `yahoo_finance_data` that fetches daily historical market data from Yahoo Finance for a known instrument symbol.

## Requirements

- Tool name: yahoo_finance_data
- Display name: Yahoo Finance Data
- Provider endpoint: https://query2.finance.yahoo.com/v8/finance/chart/<symbol>
- Input: { symbol: string, years: number } with validation
- Output: metadata + OHLCV observations with adjustedClose
- Error code: YAHOO_FINANCE_DATA_FAILED
- Follow existing tool architecture (FredDataTool pattern)
- No API key required
- Deterministic tests with mocked transport

## Out of scope

Symbol search, dividends, splits, earnings, intraday data, caching, persistence, retries, provider auth.
