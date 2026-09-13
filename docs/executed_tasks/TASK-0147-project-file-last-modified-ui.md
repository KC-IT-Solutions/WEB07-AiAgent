# TASK-0147: Project File Last Modified UI

## Instruction

Task ID: TASK-0147

Slug: project-file-last-modified-ui

### Preflight

Read:

- `AGENTS.md`
- `docs/IGNORE.md`
- `docs/CODINGSTANDARDS.md`
- `docs/DEFINITION_OF_DONE.md`
- `docs/TASK_WORKFLOW.md`
- relevant ARCHITECTURE / TESTING / SECURITY docs

Create and re-read:

`docs/executed_tasks/TASK-0147-project-file-last-modified-ui.md`

### Goal

Show each Project file's last-modified date/time in the Project Files list.

The displayed value must come from the file's actual filesystem modification timestamp, so it updates correctly whether the file is:

- uploaded by the user;
- created as a new text file;
- edited manually;
- overwritten or updated by an Agent;
- changed through any existing Project filesystem write path.

Do not maintain a separate UI-only timestamp.

### Required UI behavior

For every file row in the Project Files list, render the last-modified timestamp to the right of the filename and before the existing overflow `...` control.

Conceptually:

`prompt-instruction-1.5.md        2026-09-13 11:42        ...`

Do not redesign the Files section.

Preserve the existing:

- file icon;
- filename;
- row click/open behavior;
- overflow menu;
- breadcrumb;
- upload/new-file/new-directory controls;
- responsive layout.

### Timestamp format

Use the browser/client local timezone.

Render exactly:

`YYYY-MM-DD HH:mm`

Example:

`2026-09-13 11:42`

Do not display seconds.

Do not use locale-dependent formatting that changes order based on browser language.

Use explicit local Date fields:

- `getFullYear()`
- `getMonth()`
- `getDate()`
- `getHours()`
- `getMinutes()`

with zero-padding.

### Source of truth

Use the actual filesystem modification timestamp.

Prefer the existing Project filesystem stat/listing metadata, using `mtimeMs`, `mtime`, or equivalent filesystem-native modified timestamp, depending on the current implementation.

Expose this through the Project filesystem API as a stable field, for example `modifiedAt`.

Use the smallest representation consistent with existing API conventions: epoch milliseconds, epoch seconds, or ISO string, but document which format is chosen.

Do not derive modified time from upload time stored only in frontend state, current browser time, API response time, Agent run time, or file creation time when a later modification exists.

### Upload semantics

Immediately after a newly uploaded file appears in the Project Files list, its displayed modified time should correspond to the actual filesystem timestamp of the written file.

No special upload-specific timestamp field is needed if the filesystem timestamp is available.

### New text file semantics

A newly created text file should display its creation/write timestamp as its initial last-modified value.

If the user later edits and saves the file, the displayed timestamp should update to the new filesystem modification time.

### Agent update semantics

If an Agent writes to or overwrites a Project file using existing Project filesystem tools:

- no special Agent-side timestamp logic should be added;
- the filesystem modification timestamp should change naturally;
- the next normal Project Files refresh/listing should show the updated time.

Do not couple this feature to Agent run metadata.

### Directories

Scope this task to files.

For directory rows:

- do not show a modified timestamp unless the current Files UI already treats directory metadata uniformly and adding it is trivial and consistent;
- do not add directory-specific timestamp behavior just for this task.

### Backend / API

Inspect the Project filesystem listing response.

If file entries currently lack modified metadata, extend the relevant server/store/service/API types minimally.

Each file entry returned to the client should include the modification time.

Prefer obtaining this from the same filesystem `stat` / directory-entry inspection already used to determine file vs directory, size, and path.

Do not introduce a second filesystem traversal if the existing listing logic already has stat information available.

If a stat call is required per file, keep the implementation deterministic and scoped to the current directory listing.

Do not introduce filesystem watchers.

### Refresh behavior

Use the existing Project Files refresh/reload flow.

Do not add polling specifically for modified time, timers, websocket behavior, or background watchers.

Whenever the existing file list is refreshed, the timestamp should reflect current filesystem metadata.

This is sufficient for Agent-updated files.

### Client types

Extend the relevant client file-entry type with the modified timestamp field.

Preserve backward compatibility where practical, but because this is an internal same-version API/client pair, do not add unnecessary fallback complexity.

If the field is absent unexpectedly:

- render no timestamp;
- do not render `Invalid Date`;
- do not break the Files list.

### Formatting helper

Add a small deterministic formatter near the relevant Project Files UI code or shared date helper if one already exists.

Valid filesystem timestamps format as `2026-09-13 11:42`. Invalid or missing timestamps render no timestamp.

Avoid `toLocaleString()` because output varies by locale.

### Styling

The timestamp should be visually secondary metadata.

Place it to the right of the filename, before the overflow `...`, and vertically aligned with the file row.

Use existing muted/meta text styles where available. Do not use a badge.

Avoid fixed widths that cause filenames to truncate unnecessarily on normal layouts.

The filename should remain the primary row content.

For narrow layouts, allow the metadata area to shrink/wrap according to existing responsive conventions and do not break the overflow control.

### Security

Do not expose absolute filesystem paths, filesystem owner/group data, permissions/mode, inode values, or any metadata beyond what is required for this feature.

Only expose the modification timestamp in addition to existing safe file metadata.

Project sandboxing and ownership checks must remain unchanged.

### Tests

Add deterministic coverage for at least:

Backend/filesystem:

- file listing includes modified timestamp for files;
- modified timestamp comes from filesystem metadata;
- newly created text file receives modified timestamp;
- uploaded file receives modified timestamp;
- rewriting an existing file changes modified timestamp;
- Agent-style Project filesystem write path results in a changed timestamp on the next listing;
- no absolute path is exposed.

API/types:

- modified timestamp is serialized correctly;
- existing file metadata remains unchanged.

Frontend:

- file row renders timestamp;
- timestamp appears before the `...` overflow control;
- exact format is `YYYY-MM-DD HH:mm`;
- seconds are not shown;
- local Date fields are used rather than locale-dependent formatting;
- missing/invalid timestamp renders no broken value;
- filename/open/menu behavior remains unchanged;
- directory row behavior remains unchanged according to chosen scope.

Use deterministic filesystem fixtures and controlled mtimes where possible.

Do not rely on real wall-clock timing differences such as sleeping between writes.

Prefer setting or mocking file timestamps explicitly in tests.

### Scope discipline

Do not perform broad repository enumeration.

Inspect only required docs, Project filesystem store/service/types, Project Files API route/types, relevant Project Files frontend component, directly related styles, and directly related tests.

Do not modify Agent runtime logic, Agent execution, model inference, Agent Runner, Project file permission semantics, logging, upload content limits, file size limits, or attachment behavior.

### Required verification

Run all five formal verification commands:

1. `npm.cmd run build`
2. `npm.cmd run build:client`
3. `npm.cmd run typecheck:client`
4. `npm.cmd run lint`
5. `npm.cmd test`

All five must pass.

### Documentation

After implementation and verification, create:

`docs/executed_results/TASK-0147-project-file-last-modified-ui.md`

Record implementation summary, production files changed, tests added/changed, filesystem timestamp source, API serialization format, frontend formatting behavior, UI placement, upload/new-file behavior, Agent-write behavior, architecture impact, security impact, deviations, risks/findings, and verification results for all five required commands.

Re-read `docs/executed_tasks/TASK-0147-project-file-last-modified-ui.md` before finalizing.

Verify the implementation against every requirement and explicitly document any deviation.
