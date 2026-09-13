# TASK-0100 — Save Agent final result to configured Project file

Task ID: TASK-0100
Task slug: agent-final-result-file-write

Run first:

    powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\inspect-repo.ps1

## Goal

Activate the existing Agent setting:

    Save final result to Project file

When enabled, a successful Agent run must write only its final assistant result to the configured Project-relative file.

Do not implement next-Agent chaining yet.

## Existing configuration

Agents already persist:

    saveResultToFile
    resultDirectory
    resultFilename

The UI and path validation already exist.

Reuse them.

## Execution order

On a successful Agent run:

    model/tool loop
        ↓
    final assistant result
        ↓
    save final result to configured Project file, if enabled
        ↓
    mark run done

If saving is disabled:

    final result
        ↓
    mark run done

## Content

Write only:

    finalResult

Do NOT write:

- reasoning
- reasoning_content
- tool calls
- tool results
- Execution transcript
- Run log
- system/developer instructions
- provider payloads

The file should contain the final assistant text as-is.

## Filesystem boundary

The write must go through:

    ProjectFilesystemService

using the Agent run's server-owned Project identity.

Never expose or construct an unrestricted host filesystem path.

Destination is:

    resultDirectory + resultFilename

Examples:

    directory = ""
    filename = "result.md"
    → result.md

    directory = "reports/daily"
    filename = "result.md"
    → reports/daily/result.md

All existing Project traversal/root/symlink protections remain authoritative.

## Directory behavior

If the configured target directory does not exist:

Prefer creating the configured directory path safely inside the Project before writing, if this can be done through the existing Project filesystem service without weakening validation.

If existing service semantics intentionally require directories to exist, fail safely instead and document the behavior.

Do not create anything outside Project root.

## Existing file

The previously agreed behavior is:

    replace/update the configured output file

A new successful run may overwrite the previous final-result file.

Use the existing safe Project text-write semantics.

Do not append.

## Failure semantics

If final-result persistence fails:

    run → error

Do not mark the run `done`.

Persist a safe error with a stage such as:

    result_file_write

The Agent's generated `finalResult` may remain stored on the AgentRun for diagnostics, but the lifecycle must clearly indicate that configured completion failed.

Do not expose absolute paths or stack traces.

## Pause / cancel

Preserve current lifecycle behavior.

Do not begin the result-file write while paused.

If cancellation wins before final persistence:

- do not write the result file
- status remains cancelled

A stale async completion must not overwrite cancelled.

## Execution transcript / Run log

Add safe operational visibility.

Execution transcript should retain the final result as it already does.

Run log may add events such as:

    result_file_write_started
    result_file_written

or equivalent.

Do not duplicate file contents into Run log.

Do not expose absolute paths.

## Tests

Add focused deterministic coverage for at least:

1. disabled setting performs no file write
2. enabled setting writes finalResult
3. Project-root destination works
4. nested directory destination works
5. existing output file is replaced
6. only finalResult is written
7. reasoning/tool transcript is not written
8. write uses ProjectFilesystemService
9. Project boundary cannot be escaped
10. write failure makes run error
11. safe error stage identifies result-file persistence
12. cancelled run does not write
13. successful write occurs before run becomes done
14. existing Agent tool loop remains intact
15. Execution/Run/Error logs remain safe

Do not use real providers.

## Out of scope

Do not implement:

- next-Agent triggering
- Agent-to-Agent handoff
- model self-selection
- append/history filenames
- timestamp templates
- binary result output
- shell access

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

    docs/executed_tasks/TASK-0100-agent-final-result-file-write.md

and:

    docs/executed_results/TASK-0100-agent-final-result-file-write.md

Do not read historical task/result files.

## Final response exactly

    Task ID: TASK-0100
    Status: <PASS|FAIL|BLOCKED>
    Result: docs/executed_results/TASK-0100-agent-final-result-file-write.md
    Verification: build=<PASS|FAIL|NOT RUN>, build:client=<PASS|FAIL|NOT RUN>, typecheck:client=<PASS|FAIL|NOT RUN>, lint=<PASS|FAIL|NOT RUN>, test=<PASS|FAIL|NOT RUN>
    Summary: <one short sentence>
