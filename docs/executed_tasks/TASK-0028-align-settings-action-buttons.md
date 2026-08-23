# TASK-0028 - Align Settings action buttons

Task ID: TASK-0028
Task slug: align-settings-action-buttons

## Goal

Polish the Settings action buttons so Test connection, Save, and Delete align consistently and look like one coherent action row. This is a UI-only task.

## Requirements

- Keep all three existing buttons in one consistently aligned action row.
- Use consistent height and horizontal/vertical padding with reasonable spacing.
- Prevent Test connection from wrapping onto two lines.
- Preserve neutral Test connection, primary Save, and destructive Delete styling.
- Do not make Delete larger than the other buttons.
- Keep the row responsive at narrow widths.
- Prefer CSS-only changes and change Settings markup only if a small class or structure adjustment is required.
- Preserve all Test connection, Save, Delete, confirmation, connection-state, and API behavior.
- Do not add functionality, backend/API changes, dependencies, redesigns, or unrelated styling.
- Update tests only if existing structural assertions require it.

## Verification

Run `npm run build`, `npm run build:client`, `npm run typecheck:client`, `npm run lint`, and `npm test`.

## Acceptance

The three action buttons are aligned with consistent dimensions and spacing, Test connection stays on one line, visual meanings and behavior remain unchanged, narrow layouts remain usable, and all verification passes without new dependencies.
