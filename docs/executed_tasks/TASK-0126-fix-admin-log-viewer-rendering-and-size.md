# TASK-0126: Fix Admin Log Viewer Rendering and Size

## Goal

Fix Admin Settings ? Logging ? View log.

Observed live behavior:
- Downloaded Application/Model inference logs contain formatted content.
- View log modal opens but displays no log content.
- Modal is too small for practical log inspection.

Do not change server-side JSONL storage or download behavior unless required by the concrete root cause.

## Part 1 — Fix empty viewer

Trace the frontend path:
    View log menu action ? fetch /api/admin/logs/:stream/readable ? response.text() ? modal content element ? ConfirmationModal rendering lifecycle

Find why downloaded content exists while the viewer renders blank.

Verify specifically:
- readable endpoint returns non-empty text
- frontend reads response as text, not JSON
- fetched content is assigned to the actual visible <pre>/content node
- modal rendering does not replace/remove that node afterward
- ConfirmationModal content ownership/lifecycle is respected
- whitespace/CSS is not hiding text
- loading/empty/error states cannot overwrite successful content

Fix the actual root cause; do not add delays or polling hacks.

## Part 2 — Larger log modal

Make the log viewer substantially larger than a normal confirmation modal.

Target behavior:
- desktop width approximately 75–85vw
- sensible max-width around 1100–1400px
- height approximately 70–80vh
- main log area fills available modal space
- log content scrolls internally
- header and Close action remain visible
- responsive on smaller screens
- monospace log text remains readable
- preserve existing modal accessibility and Escape behavior

Prefer a dedicated log-viewer modifier/class rather than globally enlarging ConfirmationModal.

## Tests

Add/update tests covering all specified scenarios.

## Verification

Run: npm run build, npm run build:client, npm run typecheck:client, npm run lint, npm run test
All five must PASS.
