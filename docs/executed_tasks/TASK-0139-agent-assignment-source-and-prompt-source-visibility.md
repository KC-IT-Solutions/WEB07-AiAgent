Task ID: TASK-0139
Slug: agent-assignment-source-and-prompt-source-visibility

Preflight

Read:
- AGENTS.md
- docs/IGNORE.md
- docs/CODINGSTANDARDS.md
- docs/DEFINITION_OF_DONE.md
- docs/TASK_WORKFLOW.md
- relevant ARCHITECTURE / TESTING / SECURITY / DATABASE docs

Create and re-read:

docs/executed_tasks/TASK-0139-agent-assignment-source-and-prompt-source-visibility.md

Goal

Improve the Agent Settings -> Prompt tab so only the active source field is shown for Instructions, and add the same inline/file source behavior for Task / Assignment.

Instructions and Task / Assignment should both support:

- inline text
- Project file

The selected source controls which input is visible in the UI.

Instructions UI behavior

Keep the existing instruction source choices:

    Write instructions
    Use Project file

When `Write instructions` is selected:

- show the inline instructions textarea
- hide the instruction file path/browser controls

When `Use Project file` is selected:

- show the instruction file path/browser controls
- hide the inline instructions textarea

The inactive control must be hidden, not merely disabled.

Switching source must NOT clear the inactive value.

Example:

1. user enters inline instructions
2. switches to Project file
3. selects a file
4. switches back to Write instructions

The original inline instructions must still be present.

Existing instruction persistence and runtime semantics remain unchanged.

Task / Assignment source

Add equivalent source selection for Task / Assignment.

Add a new persisted source field:

    assignmentSource

Allowed values:

    inline
    file

Default for existing Agents:

    inline

Add a new persisted file path field:

    assignmentFilePath

Keep the existing:

    assignment

as the inline Task / Assignment text field.

Resulting data model:

    assignmentSource: "inline" | "file"
    assignment: string
    assignmentFilePath: string

Backward compatibility

Existing Agents that do not have `assignmentSource` must load as:

    assignmentSource = "inline"

Existing `assignment` values must continue to work unchanged.

Existing Agents must not require migration unless strictly necessary.

If persistence already uses JSON-backed Agent data that supports optional fields, prefer backward-compatible evolution without migration.

Task / Assignment UI

Add source choices conceptually equivalent to Instructions:

    Task / Assignment

    (o) Write task
    ( ) Use Project file

When `Write task` is selected:

- show the existing Task / Assignment textarea
- hide the task file path/browser controls

When `Use Project file` is selected:

- show the task file path/browser controls
- hide the Task / Assignment textarea

The inactive value must remain preserved when switching.

Do not clear:
- `assignment` when switching to file
- `assignmentFilePath` when switching to inline

Task file selector

The Task / Assignment file selector should follow the existing Instruction file UI and Project file browser conventions.

Requirements:

- Project-relative path
- use the same safe Project file selection mechanism
- allow `.md`
- allow `.txt`
- reject unsupported extensions using the same style as instruction-file validation
- do not expose arbitrary filesystem browsing outside the Project
- current file contents are read at runtime

Use clear UI labels such as:

    Task source

    Write task
    Use Project file

and:

    Task file

The exact wording may follow existing UI style, but must be unambiguous.

Prompt tab layout

The resulting Prompt tab should conceptually be:

    Instructions

    ( ) Write instructions
    ( ) Use Project file

    [only active Instructions input]

    Task / Assignment

    ( ) Write task
    ( ) Use Project file

    [only active Task input]

Do not show both source inputs at the same time for either section.

Persistence

Update Agent persistence/model as needed to support:

    assignmentSource
    assignmentFilePath

Do not change existing instruction persistence fields.

Existing Agent save/load must preserve:

    instructionSource
    instructions
    instructionFilePath
    assignmentSource
    assignment
    assignmentFilePath

The fields must round-trip through:
- create
- update
- repository persistence
- API response
- Agent Settings reopen

Do not silently discard the inactive source's value.

Validation

Add validation for `assignmentSource`.

Allowed values only:

    inline
    file

Invalid values must fail using existing Agent input validation conventions.

Validate `assignmentFilePath` using the same Project-relative path safety rules as instruction files.

Requirements:

- string
- Project-relative
- no absolute paths
- no path traversal
- no unsafe separators/encoded traversal according to existing conventions
- `.md` or `.txt` only

Source-specific validation should follow the existing instruction-source model where appropriate.

If `assignmentSource === "inline"`:
- runtime uses `assignment`
- file path may remain persisted but is inactive

If `assignmentSource === "file"`:
- a valid `assignmentFilePath` must be present
- runtime reads the current Project file content

Do not clear inactive values during validation/normalization.

Runtime

Resolve an effective Agent task before the run proceeds.

If:

    assignmentSource === "inline"

then:

    effectiveAssignment = assignment

If:

    assignmentSource === "file"

then:

1. resolve `assignmentFilePath` within the Agent's Project
2. read the current file contents
3. use that content as `effectiveAssignment`

The file must be read at run time, not copied into persistence when selected.

This allows edits to the Project file to affect later Agent runs without resaving the Agent.

Filesystem semantics

Task-file reading is an explicit Agent configuration input, equivalent in principle to instruction-file reading.

It must be readable independently of generic Agent Project filesystem `read` permission.

Do not grant the Agent broader file access.

Only the explicitly configured Project-relative task file may be read through this configuration path.

Failure behavior

If `assignmentSource === "file"` and the configured file:

- is missing
- is unreadable
- escapes the Project
- has invalid path/extension
- cannot otherwise be safely loaded

the Agent run must fail before first model inference.

Use the existing safe Agent run failure/error infrastructure.

Do not fall back silently to the persisted inline `assignment`.

Do not send partial prompt context to the provider after failure.

Execution semantics

The resolved effective task must be used everywhere the Agent task is currently used.

This includes:

- persisted/displayed `User task` execution event
- initial provider user content
- pre-run context composition
- chaining behavior where the Agent's own assignment is used
- any other existing runtime path that currently consumes `assignment`

Do not display the task file path as the User task.

Execution should show the resolved task content.

Instructions runtime

Do not change instruction resolution semantics beyond UI visibility.

Existing behavior remains:

    instructionSource === "inline"
    -> use inline instructions

    instructionSource === "file"
    -> read current Project instruction file at runtime

Prompt construction

Preserve existing provider shape and chronology.

The effective task must continue to participate in the existing provider user message construction.

If pre-run tool information exists, preserve:

    Tool-provided user information
    ...
    Agent task:

    <effective task content>

Do not introduce extra provider messages.

UI state behavior

Switching source controls must update visibility immediately.

Requirements:

- no save/reopen required to update visibility
- switching tabs must preserve unsaved values
- switching source must preserve both inline and file values
- reopening a saved Agent restores the correct selected source and visible input
- no duplicate IDs
- no duplicate labels
- keep existing tab keyboard/accessibility conventions

Frontend

Primary implementation location is expected to be:

    src/client/components/projects/ProjectAgentsSection.ts

Reuse the existing instruction-source visibility logic where practical.

Prefer a small shared helper if it clearly reduces duplicated inline/file toggle logic, but do not introduce unnecessary component architecture.

Backend / service

Update only the layers required for the new Task / Assignment source fields and runtime resolution.

Likely areas include:

- Agent types/model
- AgentService parsing/validation
- AgentRepository persistence
- AgentRunService effective task resolution
- API serialization if explicit mapping exists

Follow existing architecture boundaries.

Scope

Do not change:

- Prompt tab placement
- General tab contents
- model settings
- context settings
- Tools & Skills behavior
- pre-run tool semantics
- provider tool exposure
- tool_call_id behavior
- result-file behavior
- cancellation
- Agent error architecture
- Agent execution architecture except use of resolved task content
- generic Project filesystem permissions
- instruction runtime semantics

Tests

Add/update deterministic tests proving:

1. Instructions inline source shows inline textarea
2. Instructions inline source hides instruction file controls
3. Instructions file source hides inline textarea
4. Instructions file source shows instruction file controls
5. switching Instructions source preserves inline value
6. switching Instructions source preserves file path
7. Task / Assignment has source controls
8. Task inline source shows assignment textarea
9. Task inline source hides task file controls
10. Task file source hides assignment textarea
11. Task file source shows task file controls
12. switching Task source preserves assignment text
13. switching Task source preserves assignment file path
14. existing Agents default `assignmentSource` to `inline`
15. `assignmentSource: inline` persists and loads
16. `assignmentSource: file` persists and loads
17. `assignmentFilePath` persists and loads
18. create API round-trips new fields
19. update API round-trips new fields
20. invalid assignmentSource is rejected
21. invalid absolute task file path is rejected
22. traversal task file path is rejected
23. unsupported task file extension is rejected
24. `.md` task file is accepted
25. `.txt` task file is accepted
26. inline runtime uses persisted `assignment`
27. file runtime reads current task file content
28. task file content changes are reflected on later runs without Agent resave
29. missing task file fails before first inference
30. unreadable/unsafe task file fails before first inference
31. file-source failure does not fall back to inline assignment
32. resolved task content is persisted/displayed as `User task`
33. resolved task content appears in initial provider user context
34. task file path itself is not used as provider task content
35. pre-run tool context still appears before resolved Agent task
36. no extra provider messages are introduced
37. explicit task-file read works independently of generic Project read permission
38. existing instruction-file runtime behavior remains unchanged
39. existing Agent save/load remains backward compatible
40. existing Prompt/Model/Context/Tools & Skills/Runtime/Advanced behavior remains unchanged

Tests must be deterministic and must not call external providers.

Verification

Run:

    npm.cmd run build
    npm.cmd run build:client
    npm.cmd run typecheck:client
    npm.cmd run lint
    npm.cmd test

All five must PASS.

Before final response

Create:

docs/executed_results/TASK-0139-agent-assignment-source-and-prompt-source-visibility.md

Report:
- Instructions visibility change
- Task / Assignment source UI
- new Agent fields
- backward compatibility/default behavior
- validation
- persistence round-trip
- runtime task resolution
- explicit Project file access behavior
- execution/provider use of resolved task
- files changed
- focused tests
- all five verification results
- PASS/BLOCKED
