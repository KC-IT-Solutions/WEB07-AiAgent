# TASK-0083 - Project file drag-and-drop move and modal UI polish

Task ID: TASK-0083
Task slug: project-file-drag-drop-and-modal-polish

## Instruction

Improve the existing Projects file browser in two narrow areas without implementing Agents:

1. Allow a user to drag a file and drop it onto another directory to move the file there.
2. Fix Project file modal controls overflowing their container and improve dark-background label, helper, validation, and placeholder readability.

Preserve the existing `HTTP -> ProjectFilesystemService -> FileProjectFilesystemStore` boundary and canonical Project sandbox. Reuse the existing rename/move operation if it safely supports a source and destination relative path. Do not add client/controller filesystem access or duplicate filesystem logic.

Implement native browser drag/drop for file-to-directory moves only. Files are draggable; directories are drop targets but are not draggable. Do not add sorting, external OS drops, multi-select, copy, upload, or a drag/drop dependency. Show subtle dragging and valid-target states, clear those states after drag leave/drop/completion, refresh the listing after success, keep editor active-path state consistent, and surface failures through the controlled Project-files error UI without stale state.

Keep all source and destination paths within the owned Project root. Reject absolute Windows/POSIX paths, traversal including mixed separators, symlink/junction escapes, cross-Project moves, missing/non-directory destinations, and destination conflicts. Do not expose absolute server paths or loosen directory-name validation.

Apply the smallest Project/modal-scoped CSS changes needed so Project file modal inputs and textareas use contained width and border-box sizing without horizontal overflow. Ensure labels and helper text are readable, errors remain distinct, placeholders remain secondary but readable, and buttons/current color system remain consistent. Do not introduce unrelated global form styling or redesign the file browser/modal system.

Add deterministic filesystem coverage for successful moves, source removal, destination content preservation, missing destination rejection, conflict rejection, source/destination traversal rejection, cross-Project escape rejection, and existing symlink/junction protection. Add deterministic frontend coverage for draggable files, directory drop, correct relative move API request, successful refresh, controlled failure, no directory dragging, and cleared drag/drop state. Add practical scoped CSS regression coverage for contained controls and readable text without global styling.

Run and require success from every command:

```text
npm.cmd run build
npm.cmd run build:client
npm.cmd run typecheck:client
npm.cmd run lint
npm.cmd test
```

Before completion, re-read every changed range and confirm the requested file-to-directory-only behavior, sandbox and conflict invariants, modal containment/readability, narrow scope, no Agent functionality, and all mandatory verification results. Create the corresponding execution result at `docs/executed_results/TASK-0083-project-file-drag-drop-and-modal-polish.md` and use the exact requested final response format.
