# TASK-0094 - Project file upload/download and binary-safe storage

Task ID: TASK-0094
Task slug: project-file-upload-download-and-binary-safe-storage

## Instruction

Extend the existing Project Files browser without redesigning its architecture. Preserve the HTTP route to `ProjectFilesystemService` to `FileProjectFilesystemStore` boundary, Project ownership checks, and filesystem sandbox.

Implement one-file-at-a-time browser upload into the currently browsed Project-relative directory using the native file input and a binary-safe request. Add an explicit configurable server-side upload limit with a safe default of 25 MiB, authoritative safe-filename validation, bounded request handling, atomic no-overwrite storage, controlled conflicts, and exact preservation of arbitrary and zero-byte file contents. Do not expose or accept absolute Project roots and do not store file contents in SQLite.

Keep directory listing behavior intact. Keep the existing editor text-only: supported text files remain editable, while arbitrary binary files must not be decoded into the editor and must remain downloadable.

Add a Project-scoped authenticated download endpoint and a Download action for every file row, but not directories. Enforce ownership and Project-relative sandbox rules, reject missing files and directories cleanly, preserve exact bytes, return safe attachment headers, keep the SPA in place, report controlled failures, and clean up object URLs if used.

Uploaded files must immediately retain existing rename, delete, Move up, drag/drop, path-picker, and text-edit behavior where applicable. Reject traversal, absolute paths, mixed separators, canonical escapes, symlink/junction escapes, cross-Project access, cross-user access, unsafe names, oversized requests, and overwrite attempts.

Add deterministic store/service/API/frontend regression tests for binary round trips, nested and root uploads, zero-byte files, conflicts, path and ownership rejection, size bounds, attachment responses, upload refresh/state, download behavior, binary editor protection, text editor preservation, and existing file actions.

Create the matching execution result file. Re-read every changed range, review the complete diff, and run all mandatory commands:

```text
npm.cmd run build
npm.cmd run build:client
npm.cmd run typecheck:client
npm.cmd run lint
npm.cmd test
```

Report PASS only if every command is executed in this session and succeeds. The final response must use exactly the requested five-line Task ID, Status, Result, Verification, and Summary format.
