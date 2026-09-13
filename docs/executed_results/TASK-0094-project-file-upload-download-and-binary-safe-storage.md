# TASK-0094 - Project file upload/download and binary-safe storage

Task ID: TASK-0094
Status: PASS

## Summary

Added bounded binary-safe Project file upload and streamed download while preserving the existing ownership, sandbox, text editor, and filesystem architecture.

## Repository analysis

The existing flow is HTTP routes in `src/server.ts` to `ProjectFilesystemService` to `FileProjectFilesystemStore`. The store already owns Project-relative path normalization, canonical root checks, parent-directory validation, symlink/junction escape rejection, listing, text reads/writes, rename, and delete. The Project Files UI uses plain TypeScript and DOM APIs, and existing frontend tests inspect deterministic source behavior.

## Files changed

- `.env.example`
- `src/server.ts`
- `src/server/services/project-filesystem-service.ts`
- `src/server/stores/project-filesystem-store.ts`
- `src/client/components/projects/ProjectFilesSection.ts`
- `tests/unit/project-filesystem-service.test.ts`
- `tests/integration/projects-api.test.ts`
- `tests/frontend/projects-ui.test.ts`
- `docs/executed_tasks/TASK-0094-project-file-upload-download-and-binary-safe-storage.md`
- `docs/executed_results/TASK-0094-project-file-upload-download-and-binary-safe-storage.md`

## Tests and verification

- `npm.cmd run build`: PASS
- `npm.cmd run build:client`: PASS
- `npm.cmd run typecheck:client`: PASS
- `npm.cmd run lint`: PASS
- `npm.cmd test`: PASS, 587 tests passed
- `git diff --check -- .env.example src/server.ts`: PASS, with only existing Git line-ending conversion warnings

One earlier full-suite invocation run concurrently with the other verification commands had a timing failure in the unrelated `releases the slot when an active inference times out` test. The suite had passed before that invocation and the required isolated final rerun passed all 587 tests.

## Production code

The upload endpoint accepts one bounded `application/octet-stream` body with Project-relative directory and filename query values. `PROJECT_FILE_UPLOAD_MAX_BYTES` defaults to 25 MiB, and the parser plus service enforce the limit. The service validates filenames and ownership, and the store writes exact bytes to a same-directory temporary file before an atomic no-overwrite hard link.

The download endpoint obtains an owned, sandboxed store stream, returns `application/octet-stream`, an exact content length, and a sanitized attachment disposition. File rows download through Blob/object URLs and always revoke them. The UI uses a native single-file input, refreshes the current directory after upload, reports controlled failures, and prevents unsupported binary extensions from entering the text editor path.

## Architecture

Preserved `HTTP route -> ProjectFilesystemService -> FileProjectFilesystemStore`. Routes contain HTTP parsing and response headers, the service owns ownership/workflow validation, and the store owns filesystem access and canonical sandbox enforcement.

## Dependencies

No dependency was added. A route-scoped raw binary body is simpler than introducing a multipart parser for this single-file Project-only operation.

## Deviations

The upload transport uses a bounded raw `application/octet-stream` body instead of multipart/form-data, with directory and filename as Project-relative query values. This avoids a new dependency and preserves raw bytes.

## Risks / findings

No known task blocker remains. Downloads are streamed and uploads are bounded in memory. Existing unrelated worktree changes were preserved.

## Diff summary

Added explicit binary store/service operations, upload/download HTTP routes, upload configuration, native upload/download UI controls, binary editor gating, and deterministic unit/integration/frontend regression coverage. No migration, binary database storage, global upload abstraction, or unrelated Agent/inference production change was introduced.
