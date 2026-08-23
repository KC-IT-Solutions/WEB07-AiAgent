Task ID: TASK-0021
Status: PASS

## Summary

Extended the Settings view with timeout in minutes (default 30), Test connection button, and model selector.

## Repository analysis

- SettingsView.ts: existing form with name, baseUrl, apiKey, timeout (ms)
- settings.css: existing styles for form inputs and save button
- SettingsView.test.ts: 12 existing tests, added 7 new tests
- No backend changes required (UI only)

## Files changed

- `src/client/components/settings/SettingsView.ts` — timeout ms→minutes, Test connection button, model selector
- `src/client/components/settings/settings.css` — styles for test button and button row
- `src/client/components/settings/__tests__/SettingsView.test.ts` — 7 new tests

## Tests and verification

- `npm run build` — PASS
- `npm run build:client` — PASS
- `npm run typecheck:client` — PASS
- `npm run lint` — PASS
- SettingsView tests: 19/19 PASS

## Production code

- Timeout changed from milliseconds to minutes with default value 30
- Base URL placeholder updated to not include /v1
- Test connection button added (enabled when name + base URL valid, no network request)
- Model selector added (disabled initially, no hardcoded models)
- API key remains password input
- No network requests, no persistence, no new dependencies

## Architecture

No architectural changes. UI-only modifications to existing SettingsView component.

## Dependencies

No new dependencies added.

## Deviations

None.

## Risks / findings

None.

## Diff summary

- SettingsView.ts: +65 lines (timeout unit change, test button, model selector, validation)
- settings.css: +28 lines (test button and button row styles)
- SettingsView.test.ts: +35 lines (7 new tests)
