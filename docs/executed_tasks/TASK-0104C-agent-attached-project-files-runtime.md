# Task Instruction

Task ID: TASK-0104C
Slug: agent-attached-project-files-runtime

## Goal

When an Agent run starts, load the Agent's configured:

    attachedProjectFiles: string[]

from the owning Project and provide their current contents to that Agent as explicit run context.

The persisted paths and Settings UI already exist from previous tasks.

This task is server/runtime only.

## Requirements

1. Read current file contents

At Agent run start, for every path in:

    attachedProjectFiles

read the current contents of that Project file.

Do not persist file contents in Agent configuration.

If a file changes after the Agent Settings were saved, the next run must receive the new current contents.

2. Project security boundary

Read attached files through the existing Project filesystem security boundary.

Reuse the existing ProjectFilesystemService or the existing approved Project-file read mechanism used by Agent execution.

Do not use arbitrary Node filesystem access with paths from Agent configuration.

Do not expose or resolve arbitrary absolute filesystem paths.

3. Project-relative paths

Treat attachedProjectFiles entries as Project-relative paths.

All existing Project sandbox/path safety behavior must remain authoritative.

Do not weaken or bypass Project filesystem validation.

4. Independent from generic Read files permission

Attached files are explicit user-configured Agent context.

They must be loadable even when:

    projectFilesystemPermissions.read === false

This is intentional.

Example:

    attachedProjectFiles = [\"docs/spec.md\"]
    projectFilesystemPermissions.read = false

Required behavior:

- docs/spec.md content is included in the Agent's initial context
- project_read_file is NOT exposed to the provider
- the Agent cannot use this attachment to gain generic read access to other Project files

Do not change filesystem permission resolution.

5. Deterministic ordering

Process attached files in the exact order stored in:

    attachedProjectFiles

Do not sort them.

6. Context format

Provide attached files as a clearly delimited context block.

Use this semantic structure:

    Attached Project files:

    --- docs/spec.md ---
    <current file contents>

    --- context/domain.txt ---
    <current file contents>

Paths must be Project-relative.

Preserve file order.

Do not invent summaries or modify file contents.

7. Context placement

Attached file content is contextual input for the current Agent run.

Add it to the initial inference context before provider inference.

Do not insert it into later tool-round chronology repeatedly.

Do not add it as provider reasoning.

Do not represent it as a tool result.

Do not alter persisted execution transcript semantics merely to display attachment contents.

Preserve the existing Agent instructions, assignment/task, provider messages, reasoning, tool-call, tool-result, and final-result chronology.

If the current runtime has a central function responsible for constructing initial Agent inference context, integrate there rather than duplicating context construction.

8. No attachments

If:

    attachedProjectFiles = []

Agent runtime behavior must remain unchanged.

Do not add an empty attachment message/block.

9. Read failure

Do not silently omit a configured attached file if it cannot be read.

A failed attached-file read must prevent provider inference for that run and flow through the existing Agent run failure/error mechanism.

Do not design new detailed public error taxonomy in this task.

More precise missing-file/limit semantics will be handled separately.

10. Provider tools

Do not add attached files as provider tools.

Do not alter the Project filesystem tool list except as already controlled by:

    projectFilesystemPermissions

In particular, attaching a file must not cause:

    project_read_file

to be exposed when Read files permission is disabled.

## Out of scope

Do NOT implement:

- Agent Settings UI changes
- persistence changes
- database migrations
- upload behavior
- attachment previews
- directory attachments
- file size limits
- aggregate attachment size limits
- token/context limits
- truncation
- automatic summarization
- path deduplication
- path sorting
- detailed new missing-file error messages
- new filesystem permissions
- changes to Skills
- changes to external Tools
- changes to Agent chaining/handoff semantics
- broad AgentRunService refactoring
- unrelated architecture cleanup

## Architecture constraint

Agent runtime is already a broad area.

Before adding substantial new responsibility directly to an existing broad service, follow ARCHITECTURE.md and assess whether the repository already has a focused place for:

- initial context construction
- Project-file instruction loading
- Project filesystem access

Prefer extending an existing cohesive mechanism.

Do not perform a broad service split as part of this task.

If implementing this requirement would require a meaningful architecture change, stop and report BLOCKED.

## Focused tests

Follow docs/TESTING.md.

Add the smallest deterministic tests necessary to prove this task's behavior.

At minimum verify:

1. One attached file is loaded into initial Agent context.
2. Multiple attached files are included in stored order.
3. File contents used are the current contents at run time.
4. attachedProjectFiles=[] leaves existing context behavior unchanged.
5. Attached file loading works with projectFilesystemPermissions.read=false.
6. With read=false, project_read_file remains absent from provider tools.
7. An attached-file read failure prevents provider inference rather than silently omitting the file.
8. Existing Project sandbox/path enforcement remains in effect.
9. External Tools and Skills behavior is unchanged.

Tests must be deterministic.

Do not make real external provider calls.

## Implementation discipline

Make the smallest coherent change.

Reuse existing Project filesystem and Agent context mechanisms.

Do not refactor unrelated code.

Do not weaken existing tests.

Do not broaden Agent filesystem authority.
