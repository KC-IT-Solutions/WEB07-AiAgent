Task ID: TASK-0105
Slug: remove-redundant-file-folder-labels

## Goal

Remove redundant visible "File:" and "Folder:" text prefixes in the Project UI wherever an inline SVG icon already communicates whether the entry is a file or directory.

Current UI examples include:

    [file SVG] File: game.html
    [file SVG] File: review.md

and:

    [folder SVG] Folder: src

These should become:

    [file SVG] game.html
    [file SVG] review.md

and:

    [folder SVG] src

The SVG icons must remain.

## Scope

Inspect the Project-related client UI for all locations where:

- a file SVG is rendered together with visible text beginning with "File:"
- a folder/directory SVG is rendered together with visible text beginning with "Folder:"

Remove only the redundant textual type prefix.

Relevant existing implementation includes Project file/directory row rendering in:

    src/client/components/projects/ProjectFilesSection.ts

There may also be the reusable Project file/directory picker or other Project UI locations using the same SVG + textual type combination. Inspect the relevant Project client components narrowly and update all matching occurrences.

## Requirements

1. File rows - Visible file labels must contain only the file name/path intended for that row. The existing file SVG must remain unchanged.
2. Directory rows - Visible directory labels must contain only the directory name/path intended for that row. The existing folder SVG must remain unchanged.
3. Apply consistently - Update every Project UI location where both conditions are true: a file/folder SVG already identifies the entry type AND the visible adjacent label redundantly contains "File:" or "Folder:". Do not blindly remove unrelated text.
4. Accessibility - Do not remove useful semantic or accessible information. Decorative SVG behavior should remain as currently implemented. Retain aria-labels unless proven redundant.
5. Behavior - Do not change file opening, directory navigation, drag/drop, upload, download, rename, delete, Move up, three-dot menus, file picker selection, filesystem API calls, Agent attached-file behavior, or backend code.
6. Styling - Do not redesign the row layout. Only make CSS changes if removal of the prefix exposes a real spacing/alignment defect.

## Tests

Update existing deterministic frontend tests in tests/frontend/projects-ui.test.ts to reflect new labels. If another test covers Project picker/renderer with SVG + "File:"/"Folder:", update it too. Do not add broad snapshot coverage.
