Task ID: TASK-0116
Slug: agent-settings-footer-and-attached-files-polish

## Goal
Make two focused UI improvements without changing Agent behavior, tab behavior, backend contracts, attached-file semantics, or ConfirmationModal behavior for unrelated dialogs.

## Part 1 — Anchor Cancel / Save to the modal bottom
On short tabs such as Context, the ConfirmationModal action row appears immediately after the editor content instead of at the visual bottom edge of the stable Agent settings modal. The layout must always be: Title ? Tab bar ? Scrollable tab content ? Error/status area ? flexible remaining space ? Cancel / Save at modal bottom.

## Part 2 — Polish Attached project files
Each attached file should render as a clean horizontal row with file path aligned left, Remove aligned right, consistent padding, subtle frame/background, and proper truncation for long paths. Remove button styled as compact secondary/destructive action. + Add file styled as intentional secondary button. Empty state: "No files attached."

## Acceptance criteria
See full task instruction for detailed acceptance criteria covering layout, styling, tests, and manual verification.
