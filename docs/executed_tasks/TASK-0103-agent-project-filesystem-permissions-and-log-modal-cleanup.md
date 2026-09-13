# TASK-0103 — Per-Agent Project filesystem permissions and log modal cleanup

Task ID: TASK-0103
Task slug: agent-project-filesystem-permissions-and-log-modal-cleanup

Run first:

    powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\inspect-repo.ps1

## Goal

Implement the two changes discussed after TASK-0102:

1. Make the six intrinsic Project filesystem tools individually configurable per Agent.
2. Remove redundant `Cancel` buttons from read-only Agent log/viewer modals.

## Part 1 — Project filesystem permissions

The Agent currently receives these intrinsic tools:

    project_list_directory
    project_read_file
    project_write_file
    project_create_directory
    project_rename
    project_delete

Add persistent per-Agent settings for:

    List directories
    Read files
    Write files
    Create directories
    Rename / move
    Delete

Recommended defaults for new Agents:

    List directories   = enabled
    Read files         = enabled
    Write files        = disabled
    Create directories = disabled
    Rename / move      = disabled
    Delete             = disabled

Existing Agents must receive a safe backward-compatible interpretation. Preserve current behavior for existing records unless doing so would create an unsafe migration/default.

## Server authority

Permissions must be enforced server-side.

When building the Agent's effective tool set, only include Project tools explicitly enabled for that Agent.

Example:

    readFiles = false

means:

    project_read_file

must not be sent in the provider request at all.

Frontend configuration alone is not sufficient.

Keep the existing ProjectFilesystemService security boundary unchanged.

No arbitrary filesystem access.

## Agent Settings UI

Add a clear section such as:

    Project file permissions

with six individual checkboxes/toggles.

Persist and restore the values in create/edit Agent flows.

Do not merge these permissions with external Tools or Skills.

These are intrinsic Project capabilities.

## No implicit capability expansion

Treat permissions independently.

For example:

    Write files = enabled
    Create directories = disabled

must allow writing to valid existing directories but must not expose directory creation.

Do not automatically enable Delete, Rename, or other capabilities.

## Part 2 — Read-only log modals

The following Agent views are read-only:

- Execution
- Run log
- Error log

Remove the redundant:

    Cancel

button from all three.

Each should have only:

    Close

Preserve existing modal close behavior, including Escape/outside-click if currently supported.

Do not alter actual Agent run cancellation controls elsewhere.

Do not add `Cancel run` to these viewers.

## Tests

Add focused deterministic coverage for at least:

1. Agent filesystem permission settings persist.
2. create/edit UI restores all six values.
3. enabled intrinsic Project tools are exposed.
4. disabled intrinsic Project tools are absent from provider `tools`.
5. permissions are enforced server-side.
6. each capability maps to the correct Project tool.
7. no implicit permission expansion occurs.
8. existing Project filesystem sandbox protections remain intact.
9. external Tools and Skills remain unaffected.
10. Execution modal has Close and no Cancel.
11. Run log modal has Close and no Cancel.
12. Error log modal has Close and no Cancel.
13. Close still dismisses each viewer.
14. normal Agent run cancellation controls remain unchanged.

Use deterministic provider stubs.

## Out of scope

Do not change:

- Agent assignment/direct-start behavior
- Agent chaining
- result-file persistence
- model self-selection
- tool-loop semantics
- Project filesystem sandbox implementation
- Execution transcript contents
- Run/Error log semantics

## Mandatory verification

Run:

    npm.cmd run build
    npm.cmd run build:client
    npm.cmd run typecheck:client
    npm.cmd run lint
    npm.cmd test

Report PASS only if every command was actually run and succeeded.

## Tracking

Create:

    docs/executed_tasks/TASK-0103-agent-project-filesystem-permissions-and-log-modal-cleanup.md

and:

    docs/executed_results/TASK-0103-agent-project-filesystem-permissions-and-log-modal-cleanup.md

Do not read historical task/result files.

## Final response exactly

    Task ID: TASK-0103
    Status: <PASS|FAIL|BLOCKED>
    Result: docs/executed_results/TASK-0103-agent-project-filesystem-permissions-and-log-modal-cleanup.md
    Verification: build=<PASS|FAIL|NOT RUN>, build:client=<PASS|FAIL|NOT RUN>, typecheck:client=<PASS|FAIL|NOT RUN>, lint=<PASS|FAIL|NOT RUN>, test=<PASS|FAIL|NOT RUN>
    Summary: <one short sentence>
