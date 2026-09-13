# TASK-0147: Project File Last Modified UI

Task ID: TASK-0147

Status: Completed

## Summary

Project file rows now show the file's filesystem last-modified time in client-local `YYYY-MM-DD HH:mm` format between the filename/open control and the existing overflow control. Directory rows remain unchanged. Uploads, new text files, editor saves, and Agent filesystem writes all use the existing Project Files listing as the source of truth.

## Repository Analysis

- The Project filesystem listing already obtained one `stat()` result per entry for type and size and exposed `modifiedAt` from `Math.trunc(metadata.mtimeMs)` when this task was inspected.
- The listing route already serialized the service result directly, so no additional route mapping or traversal was needed.
- The client type and parser knew about `modifiedAt`, but no row rendered it and the parser rejected the entire listing when the metadata was absent or invalid.
- The existing upload and new-file flows already called `render()` after writes. The editor save flow required the same refresh and now reopens the saved file through `pendingOpenPath`.
- The worktree had extensive pre-existing changes. The scoped Project production and test files were already untracked; unrelated files were not modified or reverted.

## Files Changed

Production files changed for this execution:

- `src/client/components/projects/ProjectFilesSection.ts`
- `src/client/components/projects/projects.css`

Tests changed for this execution:

- `tests/unit/project-filesystem-service.test.ts`
- `tests/integration/projects-api.test.ts`
- `tests/frontend/projects-ui.test.ts`

Task records created:

- `docs/executed_tasks/TASK-0147-project-file-last-modified-ui.md`
- `docs/executed_results/TASK-0147-project-file-last-modified-ui.md`

Existing production source used without modification in this execution:

- `src/server/stores/project-filesystem-store.ts`
- `src/server/services/project-filesystem-service.ts`
- `src/server.ts`
- `src/server/tools/project-filesystem-tools.ts`

## Implementation Details

### Filesystem Timestamp Source

The source is Node filesystem `Stats.mtimeMs`, read by the existing per-entry `stat()` in `FileProjectFilesystemStore.listDirectory()`. It is truncated to an integer with `Math.trunc()` and exposed as `modifiedAt`. No UI timestamp, upload timestamp, creation timestamp override, Agent-run timestamp, watcher, timer, or polling mechanism was added.

### API Serialization Format

`modifiedAt` is an epoch-millisecond JSON number. Existing safe fields remain `name`, Project-relative `relativePath`, `type`, and file `size`. Deterministic API tests verify the exact filesystem mtime serialization and unchanged metadata shape.

### Frontend Formatting

`formatProjectFileModifiedAt()` constructs a browser-local `Date` from epoch milliseconds and explicitly uses `getFullYear()`, `getMonth()`, `getDate()`, `getHours()`, and `getMinutes()` with zero-padding. It returns exactly `YYYY-MM-DD HH:mm`, omits seconds, and does not use locale-dependent formatting.

Missing, non-finite, or invalid timestamps return `null`. The client parser retains otherwise valid entries while omitting invalid timestamp metadata, preventing `Invalid Date` and avoiding a broken list.

### UI Placement And Styling

File row order is the unchanged filename/open button, a muted `<time>` element, then the unchanged `...` overflow area. The timestamp has secondary text color and size, no badge, and no fixed width. It can shrink within the existing flex row; the existing narrow-layout wrapping and non-shrinking overflow control remain in effect. Directory rows do not render a timestamp.

### Write And Refresh Behavior

- Upload: the successful upload calls the existing `render()` flow, whose next listing reads the written file's filesystem mtime.
- New text file: creation calls the existing `render()` flow and opens the new file; its first listing includes the write mtime.
- Manual editor save: success now sets `pendingOpenPath` and calls `render()`, refreshing the listing timestamp and reopening the editor.
- Agent write: the existing `project_write_file` tool continues through `ProjectFilesystemService.writeFile()` with no Agent-specific timestamp logic. The next normal listing reads the resulting filesystem mtime.

## Tests Added Or Changed

- Backend/filesystem coverage creates text and binary upload files, compares listing values to actual `stat().mtimeMs`, rewrites a controlled old-mtime file through the service, rewrites it through the real Agent Project filesystem tool, and confirms no absolute root is serialized.
- API coverage sets deterministic file and upload mtimes, verifies exact epoch-millisecond serialization, and verifies all existing file metadata fields.
- Frontend coverage verifies exact local formatting, omission of seconds, explicit local Date field usage, no locale formatter, invalid/missing handling, file-only rendering, DOM source order before `...`, non-fixed-width muted styling, editor-save refresh, and preservation of existing open/menu behavior through the existing regression suite.
- Tests use `utimes()` and direct `stat()` comparisons; no sleeps or wall-clock timing differences are used.

## Architecture

No new layer, dependency, traversal, watcher, background process, or Agent coupling was introduced. Filesystem metadata remains owned by the filesystem store and passes through the existing service and HTTP route. Presentation formatting remains local to the Project Files component.

## Security

Only the modification timestamp is exposed in addition to existing safe metadata. Absolute paths, owner/group, mode, inode, and other filesystem metadata are not returned. Existing ownership validation, Project-relative path validation, sandbox resolution, and filesystem permission semantics are unchanged. Tests verify the listing does not expose the Project root.

## Dependencies

No dependencies were added or changed.

## Deviations

None. The backend `modifiedAt` field and filesystem source were already present at inspection, so the implementation reused them rather than making an unnecessary backend production edit. Directory timestamps remain absent from the Files UI as required by the chosen file-only scope.

## Risks / Findings

- Filesystem timestamp precision is intentionally represented as integer epoch milliseconds, consistent with the existing listing implementation.
- The repository has substantial unrelated pre-existing worktree changes, and the scoped Project files are untracked. This execution did not alter or revert unrelated changes.
- No residual functional or security issue was found in the scoped implementation after verification.

## Tests And Verification

Focused verification:

- `npm.cmd run test:compile` - PASS
- `node --test .test-dist/tests/unit/project-filesystem-service.test.js` - PASS, 10 tests
- `node --test .test-dist/tests/frontend/projects-ui.test.js` - PASS, 161 tests

Required formal verification:

- `npm.cmd run build` - PASS
- `npm.cmd run build:client` - PASS
- `npm.cmd run typecheck:client` - PASS
- `npm.cmd run lint` - PASS
- `npm.cmd test` - PASS, 1133 tests, 76 suites, 0 failures

## Diff Summary

The effective change adds tolerant client timestamp parsing, deterministic local formatting, file-row timestamp rendering and muted styling, editor-save listing refresh, and deterministic filesystem/API/frontend regression coverage. No unrelated production behavior was changed.
