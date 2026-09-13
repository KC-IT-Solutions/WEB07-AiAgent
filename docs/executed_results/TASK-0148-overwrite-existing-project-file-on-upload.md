Task ID: TASK-0148
Status: Completed

Summary:

- Project binary uploads now create a new file or completely replace an existing regular file at the same Project-relative path.
- Same-path directories are rejected with the existing safe `PROJECT_FILE_CONFLICT` response and remain unchanged.
- A successfully replaced text file that is open in the Project Files editor is reloaded through the existing render/open flow.
- Project-relative path identity remains unchanged; no file IDs, aliases, replacement records, or Agent configuration rewrites were introduced.

Repository analysis:

- The existing HTTP route accepts one `application/octet-stream` request and delegates to `ProjectFilesystemService.uploadFile`.
- The service performs owned-Project lookup, strict uploaded-filename validation, directory/path composition, Buffer validation, and upload-size validation before calling `ProjectFilesystemStore.writeBinaryFile`.
- The store already wrote uploads to a unique same-directory temporary file with exclusive creation, complete-buffer write, file sync, and close. Its final hard-link operation intentionally rejected an existing destination.
- Text writes already used same-directory temporary-file rename for complete replacement. Binary upload now uses that coherent existing replacement strategy.
- The frontend already refreshes by rerendering and loading the selected `currentPath`; listings are authoritative filesystem results and rows render the returned `modifiedAt`.
- Agent assignments are resolved by Project-relative path through `ProjectFilesystemService.readFile` for every run.

Files changed:

Production files:

- `src/server/stores/project-filesystem-store.ts`
- `src/client/components/projects/ProjectFilesSection.ts`

Tests:

- `tests/unit/project-filesystem-service.test.ts`
- `tests/integration/projects-api.test.ts`
- `tests/frontend/projects-ui.test.ts`
- `tests/unit/agent-run-service.test.ts`

Task documentation:

- `docs/executed_tasks/TASK-0148-overwrite-existing-project-file-on-upload.md`
- `docs/executed_results/TASK-0148-overwrite-existing-project-file-on-upload.md`

Tests added/changed:

- Filesystem/service coverage verifies new binary file creation, same-path replacement, exact relative-path preservation, complete short-over-long replacement without trailing bytes, one listing entry, natural mtime replacement, directory conflict, retained directory child content, oversized replacement rejection before mutation, and existing traversal/ownership/link protections.
- API coverage verifies first and second same-name uploads both return `201`, the second response retains the path, the listing contains one replaced file, listing `modifiedAt` equals filesystem mtime, download returns only replacement bytes, directory collision returns sanitized `409` / `PROJECT_FILE_CONFLICT`, and oversized replacement retains prior content.
- Frontend coverage verifies the existing single-file control and endpoint remain in use, successful replacement rerenders without changing `currentPath`, the authoritative row list and returned timestamp rendering remain in use, directory conflict has a clear message, existing action-menu/open behavior remains connected, and an active same-path file is reopened.
- Agent runtime coverage verifies the configured assignment path remains `tasks/current.txt` while two subsequent runs resolve first and replacement content from that same path without a provider network call.

Current upload flow analysis:

`POST /api/projects/:id/files/upload` -> `ProjectFilesystemService.uploadFile` -> `FileProjectFilesystemStore.writeBinaryFile`.

- The endpoint and one-request upload contract are unchanged.
- The frontend does not delete or rename an existing file and does not issue a second request.
- The service remains responsible for ownership, filename, Buffer, path, and size checks.
- The store owns collision type checks and replacement semantics.

Overwrite behavior:

- A missing destination is created at the requested Project-relative path.
- An existing regular file is replaced by renaming the complete synced temporary file onto the same lexical path.
- No duplicate name is generated and the returned `relativePath` is unchanged.
- A shorter replacement fully replaces a longer file because the old inode/content is not opened for partial writing.

File-vs-directory conflict behavior:

- Before writing a temporary upload, the store resolves an existing destination through the sandbox boundary and checks its filesystem type.
- A destination that is not a regular file, including a directory, produces `PROJECT_FILE_CONFLICT`.
- The API maps this existing controlled error to HTTP `409` without absolute paths or internals.
- The frontend reports `A directory with that name already exists.`
- Tests verify the directory remains a directory and retained child content is unchanged.

Failure/atomicity semantics:

- Upload size is validated in the service before the store is called, so an oversized replacement cannot touch the existing destination.
- The store creates a unique temporary file in the destination directory with `wx`, writes the complete Buffer, syncs and closes it, then performs one same-filesystem rename onto the destination.
- Any failure before rename leaves the existing destination unchanged. Temporary files are removed in `finally`.
- The rename is the replacement commit point and avoids a partially truncated destination under normal local-filesystem rename guarantees.
- This retains the repository's existing atomic text-write strategy rather than introducing a transaction abstraction. Durability and atomic rename guarantees ultimately depend on the host filesystem; the parent directory is not separately synced, matching existing text-write behavior.
- A concurrent destination type change between the explicit type check and rename can cause a controlled generic filesystem failure; no destination is manually deleted or recursively modified.

Filesystem timestamp behavior:

- The replacement temporary file receives its filesystem mtime naturally. Rename carries that file and mtime to the stable destination path.
- Directory listings continue to read `stat().mtimeMs` and expose its truncated value as `modifiedAt`.
- No timestamp is synthesized or set in the UI.
- Tests set the original mtime to 2001, replace the file, and verify the new listing value differs and exactly matches the replaced filesystem file.

API behavior:

- The existing upload endpoint is unchanged and handles create and replacement in one request.
- Both create and replacement return HTTP `201` with the same `{ relativePath, size }` response shape.
- Same-path directory conflict returns HTTP `409` with `PROJECT_FILE_CONFLICT`.
- Existing read, download, list, ownership, content-type, body-size, and error-sanitization behavior remains intact.

Frontend refresh behavior:

- Successful upload/replacement calls the existing `render()` flow, which reloads the current directory and rebuilds the list once from the API response.
- `currentPath` is not changed by upload, so the selected directory and breadcrumb remain in place.
- The stable filename appears once because the server listing has one filesystem entry and the old DOM is replaced.
- The row renders the listing's filesystem-backed `modifiedAt` through the unchanged formatter.
- If the uploaded path equals `activeFilePath`, the existing `pendingOpenPath` flow reopens the file after the refreshed listing loads, avoiding stale editor content.
- No polling, watcher, background refresh, confirmation dialog, autosave, or merge workflow was added.

Agent path-reference compatibility:

- No Agent runtime, settings schema, file-path configuration, repository, or persistence code changed.
- Agent references continue to store and resolve the same Project-relative string.
- Runtime regression coverage verifies `tasks/current.txt` remains unchanged and a later run reads replacement content from that exact path.
- The filesystem and API coverage separately proves upload replacement preserves that path, so no configuration rewrite or new logical identity is required.

Production code:

- Replaced binary upload's collision-producing hard-link commit with the existing complete-file rename commit.
- Added an existing-destination regular-file check so directories fail before temporary upload creation.
- Added minimal frontend active-file path detection before the existing refresh.
- Removed the now-unused `link` import.

Architecture:

- Preserved `HTTP/controller -> Project filesystem service -> filesystem store`.
- Overwrite semantics reside in the filesystem store, not frontend-only logic.
- No endpoint, layer, dependency, file identity abstraction, database record, or transaction framework was added.

Security:

- Existing owned-Project lookup remains before upload path processing.
- Existing strict filename validation, normalized Project-relative path validation, lexical/canonical sandbox checks, traversal rejection, symlink escape rejection, upload/body limits, and controlled error mapping remain unchanged.
- Existing destinations are resolved through the same canonical sandbox check before type inspection.
- No absolute filesystem path is returned or logged.
- Upload limits were not changed, and oversized replacement is rejected before store mutation.

Dependencies:

- No dependencies added or changed.

Deviations:

- None.

Risks / findings:

- Atomic replacement and crash durability inherit host-filesystem rename semantics and the existing text-write design; the parent directory is not explicitly synced.
- The unchanged last-modified formatter displays minute precision, so two replacements within the same displayed minute can render the same text even though the underlying `modifiedAt` value changed.
- The worktree contained extensive pre-existing modified and untracked files. They were not reverted or modified for this task outside the scoped files listed above.

Tests and verification:

Focused checks performed before formal verification:

- `npm.cmd run test:compile` - PASS.
- `node --test .test-dist/tests/unit/project-filesystem-service.test.js` - PASS, 10 tests.
- `node --test .test-dist/tests/frontend/projects-ui.test.js` - PASS, 161 tests at that run.
- `node --test .test-dist/tests/unit/agent-run-service.test.js` - PASS, 101 tests.
- `node --test .test-dist/tests/integration/projects-api.test.js` - PASS, 6 tests.

Required formal verification, final run after all implementation and test edits:

- `npm.cmd run build` - PASS.
- `npm.cmd run build:client` - PASS; client static assets copied.
- `npm.cmd run typecheck:client` - PASS.
- `npm.cmd run lint` - PASS.
- `npm.cmd test` - PASS; 1,133 tests, 76 suites, 0 failures, 0 skipped.

Diff summary:

- Two production files changed.
- Four directly related test files changed.
- One execution task record and this execution result record added.
- No Agent runtime behavior, schemas, path configuration, last-modified formatting, logging, model inference, Agent Runner, filesystem permission semantics, upload limits, API endpoint, or dependency changes.
