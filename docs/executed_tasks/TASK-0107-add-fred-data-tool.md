# TASK-0107: add-fred-data-tool

## Task ID
TASK-0107

## Slug
add-fred-data-tool

## Goal
Add a new external Tool named `fred_data` that fetches observation data for a known FRED series ID from the Federal Reserve Economic Data API.

## Requirements
- Tool name: fred_data
- Input schema: { seriesId: string, years: number }
- seriesId is required, must be non-empty after trimming
- years is required, integer between 1 and 10 inclusive
- Reject additional properties per repository conventions
- Use FRED observations endpoint: https://api.stlouisfed.org/fred/series/observations
- Calculate observation_start as current date minus requested years
- API key from process.env.FRED_API_KEY (server-side only)
- Return structured data with seriesId and observations array
- Exclude non-numeric FRED values
- Never expose API key in results, errors, or logs

## Integration points
- Register in ToolRegistry
- Add to tool-types.ts types
- Update tool-settings-repository.ts parsing
- Update tool-settings-service.ts defaults
- Register in server.ts
- Update ToolsView.ts frontend type guard
- Appear in Tools UI with enabled/disabled toggle
- Selectable by Agents through existing mechanism
- Required by Skills through requiredTools

## Error handling
- Missing FRED_API_KEY fails safely
- Invalid seriesId produces controlled failure
- Network failures produce RecoverableToolError
- Non-2xx responses produce controlled failure
- Malformed JSON handled gracefully

## Tests
- Unit tests covering all 22 verification points
- No live API calls in tests
- Deterministic time handling
