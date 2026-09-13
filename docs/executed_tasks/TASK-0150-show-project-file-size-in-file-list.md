# TASK-0150: Show Project File Size in File List

Task ID: TASK-0150

Slug: show-project-file-size-in-file-list

## Preflight

Read:

- `AGENTS.md`
- `docs/IGNORE.md`
- `docs/CODINGSTANDARDS.md`
- `docs/DEFINITION_OF_DONE.md`
- `docs/TASK_WORKFLOW.md`
- relevant ARCHITECTURE / TESTING docs

Create and re-read:

`docs/executed_tasks/TASK-0150-show-project-file-size-in-file-list.md`

## Goal

Show each Project file's size in the Project Files list, alongside the existing last-modified timestamp.

The file row should display:

`filename        size        YYYY-MM-DD HH:mm        ...`

Example:

`prompt-instruction-1.5.md        24.3 KB        2026-09-13 17:31        ...`

## Scope

This is a small Project Files UI enhancement.

Use the existing file `size` metadata already returned by the Project filesystem listing.

Do not add a new backend field or endpoint unless inspection proves the client currently cannot access the existing size value.

## Required behavior

### 1. File rows

For each file row, show:

- filename;
- formatted file size;
- existing last-modified timestamp;
- existing overflow `...` control.

Required order:

filename
-> size
-> modified timestamp
-> ...

Conceptually:

`[filename]    [24.3 KB]    [2026-09-13 17:31]    [...]`

Do not redesign the Project Files section.

### 2. Directory rows

Do not display a file size for directories.

Keep existing directory row behavior unchanged.

Do not invent directory aggregate sizes.

### 3. Source of size

Use the existing filesystem-backed file size already returned by the Project Files listing.

The value must reflect the current file contents.

Do not derive size from:

- filename;
- editor contents in frontend state;
- upload payload retained in client memory;
- Agent run metadata.

After a file is:

- uploaded;
- overwritten by upload;
- edited manually;
- updated by an Agent;

the next normal Project Files refresh should show the current size from the filesystem listing.

### 4. Formatting

Add a small deterministic file-size formatter.

Required formatting rules:

0-1023 bytes:

- show bytes

Examples:

`0 B`
`1 B`
`512 B`
`1023 B`

1024 bytes up to less than 1 MiB:

- show KB
- use base 1024
- show one decimal place when useful

Examples:

`1024 bytes -> 1 KB`
`1536 bytes -> 1.5 KB`
`24900 bytes -> 24.3 KB`

1 MiB and above:

- show MB
- use base 1024
- show one decimal place when useful

Examples:

`1048576 bytes -> 1 MB`
`1572864 bytes -> 1.5 MB`
`2516582 bytes -> 2.4 MB`

Avoid unnecessary trailing `.0`.

Preferred examples:

`1 KB`
`1.5 KB`
`24.3 KB`
`1 MB`
`2.4 MB`

Do not use locale-dependent number formatting if it could change separators or output unpredictably.

Use a deterministic formatter.

### 5. Invalid/missing values

If file `size` is unexpectedly:

- missing;
- negative;
- non-finite;
- otherwise invalid;

render no size metadata for that row.

Do not render:

- NaN;
- undefined;
- negative sizes;
- broken placeholders.

Do not break the Project Files listing because one entry has invalid size metadata.

### 6. UI placement

The size should be visually secondary metadata.

Place it immediately before the existing modified timestamp.

Example:

`report.md    142 KB    2026-09-13 16:58    ...`

The existing modified timestamp must remain unchanged.

Use existing muted/meta styling where practical.

Do not render size as a badge.

Do not give the size a large fixed width.

### 7. Alignment/responsive behavior

Preserve the current flex layout.

The filename remains the primary flexible element.

The metadata area should contain:

size
modifiedAt
overflow control

Do not make long filenames unusable.

On narrower layouts, preserve current wrapping/shrinking conventions.

The overflow `...` control must remain usable.

### 8. Existing modified timestamp behavior

Do not change:

- filesystem `mtimeMs` source;
- `modifiedAt` API representation;
- local `YYYY-MM-DD HH:mm` formatter;
- file-only timestamp behavior;
- refresh semantics.

This task only adds file size rendering next to the existing timestamp.

### 9. Upload/overwrite behavior

No special upload logic is required.

The existing Project Files refresh after:

- new upload;
- same-name replacement;
- editor save;

should naturally render the updated size.

Do not add a second refresh.

Do not alter overwrite semantics.

### 10. Agent-write behavior

No Agent-specific size tracking should be added.

If an Agent changes a Project file:

- the Project filesystem determines the resulting byte size;
- the next normal Files listing should expose the new size;
- UI renders that value.

Do not couple the UI to Agent run state.

### 11. Backend/API

Inspect the current Project filesystem listing contract.

If `size` is already present for files:

- reuse it;
- do not change backend production code unnecessarily.

If the client parser currently rejects missing/invalid size values:

- make parsing tolerant enough that one malformed optional metadata value does not invalidate the entire listing, if consistent with existing modifiedAt handling.

Do not weaken validation for required identity fields such as:

- name;
- relativePath;
- type.

### 12. Tests

Add deterministic coverage for at least:

Formatter:

- 0 B;
- 1 B;
- 1023 B;
- 1024 bytes -> 1 KB;
- 1536 bytes -> 1.5 KB;
- values below 1 MiB format as KB;
- 1 MiB -> 1 MB;
- values above 1 MiB format as MB;
- unnecessary `.0` is removed;
- invalid/non-finite/negative input renders no size.

Frontend:

- file row renders size;
- size appears before modified timestamp;
- modified timestamp still appears before `...`;
- directory row renders no size;
- filename/open behavior remains unchanged;
- overflow menu remains unchanged;
- missing/invalid size does not break the row;
- no locale-dependent formatter is used.

Refresh/regression:

- uploaded file displays listed size;
- overwritten file displays replacement size after normal refresh;
- editor-save refresh still works;
- Agent-style filesystem rewrite is reflected by listing size where existing test boundary permits;
- existing modifiedAt rendering remains unchanged.

Backend/API:

- if no production backend change is needed, preserve existing size serialization tests;
- verify file listing size corresponds to actual filesystem byte size;
- directory size semantics remain unchanged.

No external provider calls.

### 13. Architecture

Keep formatting in the frontend presentation layer.

Filesystem size ownership remains in the Project filesystem store/listing.

Do not create:

- database-backed file-size metadata;
- cached size records;
- frontend-computed filesystem size;
- background file watchers.

### 14. Scope discipline

Do not perform broad repository enumeration.

Inspect only:

- required docs;
- Project Files frontend component;
- directly related styles;
- relevant client parser/type;
- Project filesystem listing/API only as needed to confirm existing `size`;
- directly related tests.

Do not modify:

- Agent runtime;
- Agent Runner;
- upload overwrite behavior;
- last-modified backend behavior;
- filesystem limits;
- Project permissions;
- logging;
- model inference;
- token accounting.

## Required verification

Run all five formal verification commands:

`npm.cmd run build`
`npm.cmd run build:client`
`npm.cmd run typecheck:client`
`npm.cmd run lint`
`npm.cmd test`

All five must PASS.

## Documentation

After implementation and verification, create:

`docs/executed_results/TASK-0150-show-project-file-size-in-file-list.md`

Record:

- implementation summary;
- production files changed;
- tests added/changed;
- existing size source;
- formatter behavior;
- byte/KB/MB thresholds;
- UI placement;
- directory behavior;
- refresh behavior;
- backend/API impact;
- architecture impact;
- deviations;
- risks/findings;
- verification results for all five required commands.

Re-read:

`docs/executed_tasks/TASK-0150-show-project-file-size-in-file-list.md`

before finalizing.

Verify the implementation against every requirement and explicitly document any deviation.
