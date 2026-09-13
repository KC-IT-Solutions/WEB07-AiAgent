Task ID: TASK-0148
Slug: overwrite-existing-project-file-on-upload

Preflight

Read:
- AGENTS.md
- docs/IGNORE.md
- docs/CODINGSTANDARDS.md
- docs/DEFINITION_OF_DONE.md
- docs/TASK_WORKFLOW.md
- relevant ARCHITECTURE / TESTING / SECURITY docs

Create and re-read:

docs/executed_tasks/TASK-0148-overwrite-existing-project-file-on-upload.md

Goal

Change Project file upload behavior so that uploading a file whose Project-relative path already exists as a file replaces the existing file instead of rejecting the upload or creating a duplicate name.

The Project-relative path remains unchanged, so any Agent configuration that references that path continues to point to the same logical Project file and automatically sees the new contents on the next run.

Required behavior

1. Upload into current directory

When a user uploads a file into the currently selected Project directory:

If no entry exists at:

<current directory>/<uploaded filename>

then:
- create the file as today.

If an existing entry at that same Project-relative path is a file:
- replace its complete contents with the newly uploaded file;
- preserve the same Project-relative path;
- do not generate a renamed duplicate such as:
  - file (1).txt
  - file-copy.txt
  - file-2.txt

If an existing entry at that same path is a directory:
- do not replace it;
- fail with a clear safe error;
- leave the directory unchanged.

2. Identity semantics

Project files are referenced by Project-relative path.

Examples:

prompts/prompt-instruction-1.5.md

tool-pre-runs/fred-pre-run-1.json

The overwrite operation must preserve that exact path.

Do not introduce:
- file IDs;
- new logical identities;
- hidden replacement records;
- upload aliases.

Any Agent configuration already referencing the path must continue working without modification.

Examples include existing path-based settings such as:
- assignment file;
- instruction file;
- pre-run input file;
- attached Project files;
- other Project filesystem references.

Do not rewrite Agent configuration when a file is replaced.

3. Full replacement semantics

Replacing a file means complete overwrite.

Required:

old file:
AAAAAA

uploaded replacement:
BB

result:
BB

Not:

BBAAAA

Use the existing safe Project filesystem write/upload implementation where possible.

Do not manually implement partial write behavior if the existing store already supports full overwrite.

4. Filesystem timestamp

After replacement, the filesystem modification time must update naturally.

The next Project Files listing must expose the new `modifiedAt`.

Do not manually set a UI-only timestamp.

The existing last-modified UI must therefore show the new date/time after the normal refresh.

5. Refresh behavior

After successful upload/overwrite:
- refresh the Project Files list through the existing flow;
- preserve the current directory;
- show the replaced file once;
- show its updated modified timestamp.

Do not add:
- polling;
- filesystem watchers;
- background refresh loops.

6. Open editor state

If the file being replaced is currently open in the Project file editor, use the smallest behavior consistent with the current UI architecture.

Preferred behavior:
- refresh/reopen the file after successful replacement so the editor does not continue showing stale old content.

Do not create an autosave or merge workflow.

If current architecture makes automatic reopening unsafe, document the limitation explicitly rather than silently preserving stale content.

7. File-vs-directory conflict

Uploading:

reports/data.json

when `reports/data.json` already exists as a directory must fail.

Do not:
- delete the directory;
- recursively replace it;
- rename the uploaded file automatically.

Use an explicit safe conflict error consistent with existing filesystem error conventions.

8. Security

Preserve all existing:
- Project ownership checks;
- Project-relative path validation;
- sandboxing;
- filename/path traversal protections;
- upload size limits;
- file type/content rules;
- filesystem error sanitization.

Do not allow an upload filename to escape the selected Project directory.

Do not expose absolute filesystem paths.

9. File-size rules

Existing upload/file-size limits remain unchanged.

If the replacement upload exceeds an existing size limit:
- fail before replacing the existing file;
- keep the existing file unchanged where the current write architecture supports this safely;
- do not partially overwrite it.

Do not raise upload limits in this task.

10. Failure safety

Review the current upload/write path for overwrite safety.

The operation should avoid leaving a partially replaced file if the write fails.

Prefer:
- existing atomic-write behavior if available;
- or the safest coherent write strategy already used by Project filesystem storage.

Do not introduce a broad filesystem transaction abstraction solely for this feature.

If true atomic replacement is not supported by the current architecture, document the exact failure semantics in the result file.

11. API behavior

Use the existing Project upload endpoint if possible.

Do not add a second "replace file" endpoint unless the current endpoint cannot coherently support overwrite semantics.

The API should treat same-path file replacement as a normal successful upload.

Do not require the frontend to:
- delete the old file first;
- issue two requests;
- rename the old file.

The replacement should be handled server-side in one logical upload operation.

12. Frontend behavior

The existing Upload file control should require no extra user workflow.

User selects:

example.json

If `example.json` already exists in the current Project directory:
- upload succeeds;
- old content is replaced;
- the row remains named `example.json`;
- modified timestamp updates.

Do not add a confirmation dialog in this task unless the current product already has a mandatory overwrite-confirmation convention.

The requested behavior is direct replace-on-collision.

13. Agent compatibility

Add regression coverage proving path-based Agent references remain valid.

At minimum verify conceptually that:

configured path before overwrite:
prompts/task.md

same configured path after overwrite:
prompts/task.md

and subsequent Agent runtime file resolution reads the new content.

Do not alter Agent configuration or create a new file reference.

This test can be placed at the appropriate filesystem/service/runtime boundary without requiring a live model provider.

14. Tests

Add deterministic coverage for at least:

Filesystem/service:
- upload new file creates it;
- upload same filename over existing file replaces complete contents;
- replacement preserves same Project-relative path;
- replacement does not create a duplicate file;
- short replacement over longer file leaves no trailing old bytes;
- modified timestamp changes after replacement using deterministic mtime control where possible;
- replacing a directory path fails;
- failed directory conflict leaves directory unchanged;
- oversized replacement obeys existing size limit;
- failed oversized replacement does not partially replace existing content if architecture supports pre-write validation;
- traversal/path protections remain intact.

API:
- first upload succeeds;
- second upload with same filename succeeds;
- listing contains exactly one file with that name;
- downloaded/read content is the second upload;
- modifiedAt corresponds to replaced filesystem file;
- directory collision returns safe error.

Frontend:
- existing Upload file flow accepts same-name replacement;
- successful replacement triggers normal list refresh;
- no duplicate UI row appears;
- updated modified timestamp renders;
- existing menu/open behavior remains unchanged;
- current directory remains selected.

Agent path compatibility:
- an Agent/path-based configuration referring to an existing Project-relative file does not change during overwrite;
- subsequent file resolution reads replacement content.

No external provider calls.

15. Architecture

Preserve the existing structure:

HTTP/controller
→ Project filesystem service
→ filesystem store

Keep overwrite semantics in the filesystem/server layer, not in frontend-only logic.

Do not implement replacement as:

frontend delete
→ frontend upload

The server operation should own same-path replacement semantics.

16. Scope discipline

Do not perform broad repository enumeration.

Inspect only:
- required docs;
- Project upload route;
- Project filesystem service/store/types;
- Project Files frontend component;
- directly related tests;
- Agent file-resolution test boundary only if needed for the path-compatibility regression.

Do not modify:
- Agent runtime behavior;
- Agent settings schema;
- Agent file path configuration;
- last-modified formatting;
- logging;
- model inference;
- Agent Runner;
- Project filesystem permission semantics;
- existing size limits.

Required verification

Run all five formal verification commands:

npm.cmd run build
npm.cmd run build:client
npm.cmd run typecheck:client
npm.cmd run lint
npm.cmd test

All five must PASS.

Documentation

After implementation and verification, create:

docs/executed_results/TASK-0148-overwrite-existing-project-file-on-upload.md

Record:
- implementation summary;
- production files changed;
- tests added/changed;
- current upload flow analysis;
- overwrite behavior;
- file-vs-directory conflict behavior;
- failure/atomicity semantics;
- filesystem timestamp behavior;
- API behavior;
- frontend refresh behavior;
- Agent path-reference compatibility;
- architecture impact;
- security impact;
- deviations;
- risks/findings;
- verification results for all five required commands.

Re-read:

docs/executed_tasks/TASK-0148-overwrite-existing-project-file-on-upload.md

before finalizing.

Verify the implementation against every requirement and explicitly document any deviation.
