Task ID: TASK-0108
Slug: add-fred-series-metadata

## Goal

Extend the existing fred_data Tool so that its result includes useful FRED series metadata in addition to observations.

## Requirements

- Add metadata fields (title, units, frequency, seasonalAdjustment, observationStart, observationEnd, lastUpdated) to FredDataResponse
- Fetch metadata from /fred/series endpoint before fetching observations
- Parse and map FRED response fields (snake_case to camelCase)
- Preserve all existing behavior for observations
- If metadata fails, do not make the observations request
- All failures produce controlled RecoverableToolError with FRED_DATA_FAILED code
- Do not expose API key in responses or errors
- Update tests to cover all new metadata behavior

## Constraints

- Do not modify AgentRunService
- Do not redesign ToolRegistry  
- Do not change fred_data tool name
- Do not change years 1-10 input contract
- No new dependencies
- No frontend changes
