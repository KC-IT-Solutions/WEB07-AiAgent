Task ID: TASK-0113
Slug: reduce-yahoo-finance-output-to-close-only

## Goal

Reduce the public yahoo_finance_data observation output to only `date` and `close`, removing `open`, `high`, `low`, `adjustedClose`, and `volume`. Keep existing metadata fields unchanged.

## Requirements

- Update `YahooFinanceObservation` interface to contain only `date: string` and `close: number`
- Simplify `parseYahooResponse` to no longer construct public open/high/low/adjustedClose/volume fields
- Remove unnecessary parsing code for those arrays (open, high, low, adjustedClose, volume) from the parser
- Parser must still parse timestamps, parse quote[0].close, preserve timestamp/close index alignment
- Skip rows where close is null, missing, non-numeric, NaN, or non-finite
- Preserve provider observation order
- Format dates exactly as before
- Do not change metadata parsing from TASK-0112
- Do not regress `chart.error === null` success handling
- Do not change Yahoo request URL or request semantics

## Tests Required

Update tests to prove:
1. observations contain only date and close
2. open/high/low/adjustedClose/volume are NOT present
3. valid close values preserved
4. timestamps and close values correctly paired by index
5. null/non-numeric/non-finite close rows skipped
6. provider ordering preserved
7. metadata mapping unchanged
8. chart.error === null accepted
9. Yahoo error objects rejected

## Out of Scope

Do NOT modify: frontend ToolsView, Tool Settings, AgentRunService, ToolRegistry, FRED, DuckDuckGo, Visit Website, result truncation infrastructure, generic Tool result-size limits, database schema, settings persistence, Yahoo metadata fields, Yahoo request parameters. Do not introduce a configurable "fields" parameter.

## Verification

Run: npm.cmd run build, npm.cmd run build:client, npm.cmd run typecheck:client, npm.cmd run lint, npm.cmd test
