Task ID: TASK-0111
Status: PASS

Summary:
Fixed client-side Tools UI parser to recognize yahoo_finance_data as a valid Tool response. The discriminated union type and runtime type guard in ToolsView.ts were extended minimally following the fred_data pattern.

Repository analysis:
The `isToolMetadata` type guard in ToolsView.ts used a discriminated union with three tool variants (duckduckgo_search, visit_website, fred_data). When yahoo_finance_data arrived from /api/tools, it failed validation because no matching case existed, causing `payload.every(isToolMetadata)` to return false and triggering the "Failed to load tools." error state.

Files changed:
- src/client/components/tools/ToolsView.ts (4 additions)
  - Added YahooFinanceDataToolSettings interface with enabledForChat boolean
  - Extended ToolMetadata discriminated union with yahoo_finance_data variant
  - Added yahoo_finance_data case in isToolMetadata type guard (returns true after enabledForChat check, same as fred_data)
  - Updated updatedSettings type union to include YahooFinanceDataToolSettings
  - Extended post-save settings update chain: `fred_data || yahoo_finance_data`
- tests/frontend/tools-ui.test.ts (9 new test cases)
  - recognizes yahoo_finance_data as a valid ToolMetadata variant
  - accepts yahoo_finance_data with enabledForChat boolean settings
  - validates yahoo_finance_data through isToolMetadata type guard
  - rejects malformed yahoo_finance_data settings without enabledForChat
  - preserves fred_data parsing alongside yahoo_finance_data
  - preserves duckduckgo_search parsing with full settings validation
  - preserves visit_website parsing with full settings validation
  - includes yahoo_finance_data in updatedSettings type union
  - handles yahoo_finance_data in post-save settings update chain

Tests and verification:
- npm run build: PASS (0 errors)
- npm run build:client: PASS (client assets copied)
- npm run typecheck:client: PASS (0 errors)
- npm run lint: PASS (0 warnings/errors)
- npm test: PASS (779 tests, 0 failures)

Production code:
Minimal client-side parser extension. No backend changes. No new dependencies. No CSS changes. Yahoo Finance Data renders through the existing generic Tool card/settings flow with only enabledForChat checkbox.

Architecture:
No architectural changes. Follows existing fred_data pattern exactly. The yahoo_finance_data variant has minimal settings (enabledForChat only), matching fred_data's structure. No Yahoo-specific UI branching or configuration fields added.

Dependencies:
None added.

Deviations:
None.

Risks / findings:
The ToolsView.ts and tools-ui.test.ts files are untracked in git (created by previous tasks, never committed). This is consistent with repository state - these directories appear as `??` in git status. The changes integrate correctly with the existing codebase structure.

Diff summary:
- YahooFinanceDataToolSettings interface added (enabledForChat: boolean)
- ToolMetadata union extended with yahoo_finance_data variant
- isToolMetadata guard returns true for yahoo_finance_data after enabledForChat validation
- updatedSettings type includes YahooFinanceDataToolSettings
- Post-save chain handles yahoo_finance_data alongside fred_data
- 9 deterministic frontend tests added covering parsing, validation, and regression
