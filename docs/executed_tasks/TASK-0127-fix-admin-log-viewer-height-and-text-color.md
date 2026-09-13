# TASK-0127: Fix Admin Log Viewer Height and Text Color

## Goal
Fix the Admin log viewer presentation only.

## Observed Issues
1. Modal width is now correct.
2. Log content area needs a fixed usable height (approximately 60vh).
3. Overflowing log content must scroll inside the viewer.
4. Log text has effectively the same/light color as its background and is hard to read.

## Scope
Only adjust the dedicated Admin log viewer styling in settings.css.

Do not change: logging backend, formatter, endpoints, download behavior, ordinary ConfirmationModal styling, other Admin Settings UI.

## Required CSS Changes
- .admin-log-viewer-content: height ~60vh with sensible min/max, overflow: auto
- <pre> / log content area fills available viewer height
- Header and Close button remain visible outside scrolling log area
- Explicit dark foreground color on log text (NOT color: inherit)
- Monospace styling and whitespace formatting preserved

## Tests Required
Update frontend/CSS tests to verify all required behaviors.

## Verification Commands
npm run build
npm run build:client
npm run typecheck:client
npm run lint
npm test
