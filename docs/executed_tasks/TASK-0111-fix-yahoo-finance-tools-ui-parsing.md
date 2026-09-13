# TASK-0111: fix-yahoo-finance-tools-ui-parsing

## Task ID
TASK-0111

## Slug
fix-yahoo-finance-tools-ui-parsing

## Problem
The Tools page currently renders "Failed to load tools." because the client-side parser/type guard in `src/client/components/tools/ToolsView.ts` does not recognize `yahoo_finance_data` as a valid Tool response. The backend `/api/tools` response is valid and contains all four registered tools including `yahoo_finance_data`.

## Goal
Update the Tools UI client parser so `yahoo_finance_data` is recognized as a valid Tool response and rendered through the existing generic Tools UI.

## Requirements
1. ToolsView.ts must accept `name === 'yahoo_finance_data'`
2. Settings shape `{ enabledForChat: boolean }` must be validated
3. The tool must render through the existing generic Tool card/settings flow
4. Page must no longer show "Failed to load tools." when yahoo_finance_data is present
5. Existing tools (duckduckgo_search, visit_website, fred_data) remain unchanged
6. Do not add Yahoo-specific settings fields or UI branching beyond minimum type/parser support
7. Preserve existing display name and description from API response
8. Preserve enabledForChat behavior

## Tests
Update deterministic frontend Tools UI tests to cover yahoo_finance_data parsing and rendering.

## Out of scope
Backend modifications, CSS changes (unless real defect), ToolRegistry, tool-settings-service, etc.

## Implementation discipline
Prefer changing only:
- `src/client/components/tools/ToolsView.ts`
- relevant frontend Tools UI test file
