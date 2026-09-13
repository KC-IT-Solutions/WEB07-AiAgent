# TASK-0085 - Simplify Projects page and add Move up for files

Task ID: TASK-0085
Status: PASS

## Summary

Removed the redundant main-page Project list and unselected placeholder, and added a file-only Move up action that safely reuses the existing Project rename/move boundary.

## Repository analysis

- The sidebar already synchronizes Project CRUD state and passes `activeProjectId` into the existing `ProjectsView` selection bridge.
- Project file drag/drop already uses `PUT /api/projects/:id/files/rename`.
- The existing backend rename path uses `ProjectFilesystemService` and `FileProjectFilesystemStore`, including ownership, traversal, root, link-escape, and no-overwrite checks.
- Existing Project filesystem tests already cover destination conflicts and preservation of the source on rejected moves.

## Files changed

- `src/client/components/projects/ProjectsView.ts`
- `src/client/components/projects/ProjectFilesSection.ts`
- `src/client/components/projects/projects.css`
- `tests/frontend/projects-ui.test.ts`
- `docs/executed_tasks/TASK-0085-simplify-projects-page-and-file-move-up.md`
- `docs/executed_results/TASK-0085-simplify-projects-page-and-file-move-up.md`

## Tests and verification

- `npm.cmd run build` - PASS
- `npm.cmd run build:client` - PASS
- `npm.cmd run typecheck:client` - PASS
- `npm.cmd run lint` - PASS
- `npm.cmd test` - PASS, 521 tests passed and 0 failed

Deterministic frontend coverage now verifies the compact Projects page, preserved sidebar selection and CRUD synchronization, exact one-level Move up destinations, root and traversal rejection, file-only action availability, existing rename API reuse, listing refresh, controlled failure state, open-editor destination handling, and preserved drag/drop behavior.

## Production code

- The unselected `/projects` view now renders only the existing toolbar/intro and `+ New project` control after loading.
- The existing detail/files section is attached only when a Project is selected.
- Nested file rows provide an accessible `Move up` action; root files and directories do not.
- Successful moves refresh the current directory while preserving `currentPath` and reopen an active moved file at its destination.
- Invalid client paths are rejected before a request, while server-side sandbox validation remains authoritative.

## Architecture

No backend or architectural changes were required. Move up reuses the same frontend move function, HTTP endpoint, service, and filesystem store as drag/drop.

## Dependencies

No dependencies were added or changed.

## Deviations

None.

## Risks / findings

No known remaining task-specific risks. The repository had extensive pre-existing uncommitted and untracked work, which was left untouched outside the active files.

## Diff summary

Removed obsolete in-page Project list markup/styles, conditionally renders the existing detail, introduced validated one-level file destination derivation, added the row action and active-editor refresh behavior, and updated deterministic frontend coverage.
