# TASK-0083 - Project file drag-and-drop move and modal UI polish

Task ID: TASK-0083
Status: PASS

Summary:

Added native file-to-directory moves through the existing sandboxed rename boundary and scoped Project file modal containment/readability fixes.

Repository analysis:

- The existing `PUT /api/projects/:id/files/rename` route already delegates through `ProjectFilesystemService.renameEntry` to `FileProjectFilesystemStore.renameEntry`.
- The store validates both paths as relative Project descendants, resolves the owned canonical Project root, requires an existing canonical destination directory, rejects conflicts, and protects symlink/junction escapes.
- The Project Files UI and its deterministic frontend tests are contained in the existing Projects component area.

Files changed:

- `src/client/components/projects/ProjectFilesSection.ts`
- `src/client/components/projects/projects.css`
- `tests/unit/project-filesystem-service.test.ts`
- `tests/frontend/projects-ui.test.ts`
- `docs/executed_tasks/TASK-0083-project-file-drag-drop-and-modal-polish.md`
- `docs/executed_results/TASK-0083-project-file-drag-drop-and-modal-polish.md`

Tests and verification:

- `npm.cmd run build` - PASS
- `npm.cmd run build:client` - PASS
- `npm.cmd run typecheck:client` - PASS
- `npm.cmd run lint` - PASS
- `npm.cmd test` - PASS (513 tests, 51 suites)
- Focused `node --test .test-dist/tests/unit/project-filesystem-service.test.js .test-dist/tests/frontend/projects-ui.test.js` - PASS (18 tests)

Production code:

- File list entries are draggable only when their parsed type is `file`.
- Directory entries accept only an internally tracked file drag and invoke the existing rename API with Project-relative source and destination paths.
- Successful moves re-render and refresh the current listing; open editor path state is safely cleared by the refresh.
- Failed moves retain the existing listing, show the controlled Project-files error status, and clear drag/drop styling and state.
- Dragged files and valid directory targets receive scoped visual feedback.
- Project file dialog forms, form groups, inputs, and textareas are constrained to the modal content width with border-box sizing.
- Project file dialog labels, status/error text, and placeholders use scoped readable colors for the existing dark modal.

Architecture:

- Preserved `HTTP -> ProjectFilesystemService -> FileProjectFilesystemStore`.
- No direct filesystem access was added to the client or controller.
- No API, service, or store production changes were necessary.

Dependencies:

- None added.

Deviations:

- None.

Risks / findings:

- Frontend regression coverage follows the repository's existing deterministic source-inspection style rather than adding a browser-only drag simulation.
- Existing unrelated dirty and untracked workspace changes were left untouched.

Diff summary:

- Added native file-to-directory drag/drop behavior and state cleanup.
- Added scoped Project file drag feedback and modal readability/containment CSS.
- Added move sandbox and UI/CSS regression coverage.
- Added TASK-0083 traceability records.
