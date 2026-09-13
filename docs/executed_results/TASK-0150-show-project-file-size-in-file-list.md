# TASK-0150: Show Project File Size in File List

Task ID: TASK-0150

Status: Completed

## Summary

Project file rows now render the filesystem-listed byte size as deterministic B, KB, or MB metadata immediately before the existing modified timestamp. Directory rows and rows with absent or invalid size metadata render no size.

## Repository Analysis

- The existing `ProjectFileEntry.size` field is optional and already reaches the client in the Project Files listing.
- `FileProjectFilesystemStore.listDirectory` obtains each entry from the filesystem with `stat` and serializes `metadata.size` only when `metadata.isFile()` is true.
- The client already declared `size?: number`, but `parseEntry` rejected the complete listing when any file size was absent or invalid.
- Existing upload, same-name replacement, editor-save, and Agent-write flows already refresh or expose data through the normal authoritative filesystem listing boundary.
- Existing integration coverage already verifies that API listing size equals the replacement file's filesystem byte length; focused unit coverage verifies that directories omit size.

## Files Changed

Production:

- `src/client/components/projects/ProjectFilesSection.ts`
- `src/client/components/projects/projects.css`

Tests:

- `tests/frontend/projects-ui.test.ts`
- `tests/unit/project-filesystem-service.test.ts`

Task documentation:

- `docs/executed_tasks/TASK-0150-show-project-file-size-in-file-list.md`
- `docs/executed_results/TASK-0150-show-project-file-size-in-file-list.md`

## Implementation

- Added `formatProjectFileSize`, a frontend presentation formatter that accepts only non-negative safe-integer byte counts.
- Values from 0 through 1023 render as integer bytes with `B`.
- Values from 1024 through 1048575 use base-1024 KB and round to one decimal place.
- Values from 1048576 upward use base-1024 MB and round to one decimal place.
- Numeric string interpolation removes unnecessary trailing `.0`, producing values such as `1 KB`, `1.5 KB`, `24.3 KB`, `1 MB`, and `2.4 MB`.
- The formatter does not use `Intl`, `toLocaleString`, or another locale-dependent formatter.
- Missing, negative, fractional, non-finite, and otherwise invalid values return `null` and produce no size element.
- `parseEntry` continues to require and validate `name`, `relativePath`, and `type`, while treating size as optional metadata in the same tolerant style as `modifiedAt`.
- A muted `.project-file-size` span is appended after the existing flexible filename/open button and before the unchanged modified `<time>` and overflow action control.
- Size shares the existing secondary metadata styling and has no fixed width or badge styling.
- Directory entries never call the formatter and never render a size element.

## Refresh Behavior

- No refresh calls were added or changed.
- New uploads and same-name replacements continue to call the existing single `render()` refresh, which obtains a fresh listing.
- Editor saves continue to set `pendingOpenPath` and call the existing `render()` refresh.
- Agent writes remain independent of frontend state; the next normal listing reads the resulting size from the filesystem.

## Tests Added Or Changed

- Formatter coverage includes 0 B, 1 B, 512 B, 1023 B, 1 KB, 1.5 KB, 24.3 KB, below-1-MiB KB behavior, 1 MB, 1.5 MB, 2.4 MB, trailing-zero removal, and missing/negative/fractional/NaN/infinite rejection.
- Frontend source-boundary coverage verifies file-only size rendering, filename -> size -> modified timestamp -> overflow order, unchanged filename/open and overflow behavior, optional metadata tolerance, muted non-fixed-width styling, and absence of locale-dependent formatting.
- Frontend source-boundary coverage connects the existing upload and editor-save refresh paths to row rendering of the freshly listed formatted size.
- Filesystem service coverage now verifies actual listed byte sizes after text creation, binary upload, manual text rewrite, and Agent-tool rewrite.
- Filesystem service coverage explicitly verifies that directory entries omit size.
- Existing unit and integration overwrite coverage continues to verify that a normal listing reports replacement byte length.
- Existing API serialization coverage continues to verify actual filesystem byte size and modified timestamp representation; focused service coverage verifies directory size semantics.
- No external provider calls were added or used.

## Backend / API Impact

- No backend production code, API field, endpoint, filesystem limit, overwrite behavior, permission, or modified timestamp behavior changed.
- The existing filesystem-owned `size` value remains authoritative.
- The only contract adjustment is client-side tolerance for malformed optional size metadata; required entry identity validation remains strict.

## Architecture

- Formatting remains in the frontend presentation layer.
- Filesystem metadata ownership remains in `FileProjectFilesystemStore.listDirectory`.
- No database metadata, cache, watcher, frontend-derived filesystem size, Agent coupling, dependency, or architectural layer was introduced.

## Deviations

None.

## Risks / Findings

- Very large files continue to display in MB because the requested format defines only B, KB, and MB tiers.
- The workspace contained unrelated TASK-0149 edits in `src/server/agent-execution-safety.ts`, `tests/unit/agent-run-service.test.ts`, `tests/unit/agent-execution-safety.test.ts`, and a separate section of `tests/frontend/projects-ui.test.ts`; those changes were left intact. TASK-0150 only added its own focused changes to the shared frontend test file.
- No security, persistence, authorization, Agent runtime, logging, inference, or token-accounting impact was found.

## Verification

All required commands passed:

- `npm.cmd run build` - PASS (`tsc -p tsconfig.json`)
- `npm.cmd run build:client` - PASS (`tsc -p tsconfig.client.json`; client static assets copied)
- `npm.cmd run typecheck:client` - PASS (`tsc -p tsconfig.client.json --noEmit`)
- `npm.cmd run lint` - PASS (`eslint .`)
- `npm.cmd test` - PASS (`1138` tests passed, `0` failed, `0` skipped)

Additional final check:

- `git diff --check` - PASS

## Diff Summary

The task adds one small formatter/validator, one optional metadata render element, one shared muted-style selector, and focused frontend/filesystem assertions. Backend production behavior and existing refresh paths are unchanged.
