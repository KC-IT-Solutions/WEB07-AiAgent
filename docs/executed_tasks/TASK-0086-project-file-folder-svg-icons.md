# TASK-0086 — Add file and folder SVG icons to Project Files

Task ID: TASK-0086
Task slug: project-file-folder-svg-icons

Run first:

    powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\inspect-repo.ps1

## Goal

Improve visual clarity in the existing Project Files browser by adding small inline SVG icons immediately before file and folder labels.

Current rows conceptually look like:

    Folder: data
    Folder: docs
    File: agent.md

Change them to visually appear like:

    [folder icon] Folder: data
    [folder icon] Folder: docs
    [file icon]   File: agent.md

This is a small frontend-only cosmetic task.

## Tool/context rules

- Use only tools actually available in this OpenCode session.
- Do not call unavailable tools such as `search`, `grepjson`, or `dir`.
- Use `grep` for text lookup.
- Use `glob` only when filename discovery is needed.
- Prefer narrow `read` ranges.
- Stay comfortably below 131072 tokens.
- Do not read historical files under:
  - docs/executed_tasks
  - docs/executed_results
- Stop exploration once the Project Files row rendering, scoped CSS, and relevant frontend tests are identified.
- After every edit, immediately re-read the edited range before continuing.

## Existing behavior to preserve

Project Files already supports:

- directory browsing
- breadcrumbs/up navigation
- create text file
- create directory
- edit/save text files
- rename
- delete
- file drag-and-drop into directories
- file-only Move up
- secure Project filesystem sandbox

Do not change any of those behaviors.

TASK-0085 already removed the redundant main-page Project list and added file Move up.

Do not revisit those changes.

## SVG icons

Use inline SVG created through the existing plain TypeScript + DOM style.

Do not use:

- Unicode file/folder glyphs
- emoji
- external SVG/image files
- icon packages
- new dependencies

Create:

1. one simple folder icon
2. one simple file/document icon

The SVGs should visually match the simple icon style already used elsewhere in the client where practical.

## Folder icon

Folder rows should receive a small folder-shaped SVG immediately before:

    Folder:

Example structure:

    [folder-svg] Folder: docs

Keep the icon simple and recognizable.

Use:

    currentColor

for stroke/fill where appropriate so the icon follows existing text/UI color.

## File icon

File rows should receive a small document/file-shaped SVG immediately before:

    File:

Example:

    [file-svg] File: agent.md

Keep the icon simple and visually distinct from the folder icon.

## Existing text remains

Do NOT replace:

    Folder:
    File:

with icon-only UI.

The text labels remain visible.

The SVG is an additional visual identifier only.

## Accessibility

Because the existing text already identifies the entry as:

    Folder
    File

the icons should be decorative.

Use the existing decorative SVG accessibility pattern, for example:

    aria-hidden="true"

Do not cause screen readers to announce duplicate:

    folder folder
    file file

## Icon size

Keep icons compact.

Suggested approximate size:

    15–18 px

Do not substantially increase file-row height.

## Alignment

Icon and text should be vertically aligned.

Use the smallest scoped layout adjustment, such as an existing flex row or a small inline-flex wrapper.

Maintain a modest gap between SVG and text.

Do not redesign the file-row layout.

## Interaction boundary

The SVG must not interfere with existing row behavior.

Preserve:

- directory click/open
- file click/open
- drag source behavior
- directory drop target behavior
- Move up
- Rename
- Delete
- keyboard/focus behavior

The icon should behave as part of the existing entry label, not as a separate control.

## Drag-and-drop

File rows must remain draggable exactly as before.

Folder rows must remain valid drop targets exactly as before.

Do not attach drag/drop handlers to the SVG itself unless they naturally bubble through the existing row implementation.

No drag behavior should change because of the icon.

## Styling

Add only minimal Project-files scoped CSS if necessary.

Possible concepts:

    display: inline-flex
    align-items: center
    gap: ...

Do not add global SVG styling.

Do not affect:

- sidebar icons
- Chat icons
- Settings
- Skills
- Admin

## Reuse

Avoid duplicating large SVG-construction blocks for every row if a tiny local helper makes the code clearer.

For example, a small local function may create:

    createProjectFileIcon(type)

where:

    type = "file" | "directory"

Do not create a generic application-wide icon framework.

## Tests

Add/update deterministic frontend coverage for at least:

1. Folder rows create/render an SVG icon.
2. File rows create/render an SVG icon.
3. Folder SVG appears before the visible `Folder:` label.
4. File SVG appears before the visible `File:` label.
5. SVGs are marked decorative with `aria-hidden="true"`.
6. Existing `Folder:` text remains.
7. Existing `File:` text remains.
8. Folder and file icons are structurally distinguishable.
9. File rows remain draggable.
10. Directory rows remain valid drop targets.
11. Move up behavior remains intact.
12. Existing file open/directory navigation behavior remains intact.

Avoid brittle assertions against exact SVG coordinate values unless the existing test style requires them.

## No backend changes

Do not change:

- Project APIs
- ProjectFilesystemService
- filesystem store
- database
- migrations
- ownership
- path validation

Frontend-only.

## Important invariants

Preserve:

- Projects sidebar dropdown
- Project selection
- compact Projects page from TASK-0085
- Project CRUD
- filesystem sandbox
- drag/drop move
- Move up
- file editor
- modal readability
- plain TypeScript + DOM architecture

## Out of scope

Do not implement:

- Agents
- file-type-specific icons by extension
- icons for every action button
- thumbnail previews
- MIME detection
- binary file support
- global icon system
- icon library
- global UI redesign
- new dependency

## Mandatory verification

Run every command:

    npm.cmd run build
    npm.cmd run build:client
    npm.cmd run typecheck:client
    npm.cmd run lint
    npm.cmd test

PASS RULE:

Report PASS only if every command above was actually executed in this session and succeeded.

Never infer verification success.

## Final self-check

Before responding:

1. Re-read every changed range.
2. Confirm folders have a folder SVG.
3. Confirm files have a file SVG.
4. Confirm icons appear before the existing text.
5. Confirm visible Folder/File labels remain.
6. Confirm icons are decorative for accessibility.
7. Confirm drag/drop remains unchanged.
8. Confirm Move up remains unchanged.
9. Confirm no backend or filesystem-security code changed.
10. Confirm all mandatory verification commands passed.

## Tracking

Create:

    docs/executed_tasks/TASK-0086-project-file-folder-svg-icons.md

and:

    docs/executed_results/TASK-0086-project-file-folder-svg-icons.md

Do not read historical task/result files.

## Final response exactly

    Task ID: TASK-0086
    Status: <PASS|FAIL|BLOCKED>
    Result: docs/executed_results/TASK-0086-project-file-folder-svg-icons.md
    Verification: build=<PASS|FAIL|NOT RUN>, build:client=<PASS|FAIL|NOT RUN>, typecheck:client=<PASS|FAIL|NOT RUN>, lint=<PASS|FAIL|NOT RUN>, test=<PASS|FAIL|NOT RUN>
    Summary: <one short sentence>
