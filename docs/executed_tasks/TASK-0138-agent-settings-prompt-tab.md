Task ID: TASK-0138
Slug: agent-settings-prompt-tab

Preflight

Read:
- AGENTS.md
- docs/IGNORE.md
- docs/CODINGSTANDARDS.md
- docs/DEFINITION_OF_DONE.md
- docs/TASK_WORKFLOW.md
- relevant ARCHITECTURE / TESTING docs

Create and re-read:

docs/executed_tasks/TASK-0138-agent-settings-prompt-tab.md

Goal

Add a new `Prompt` tab to Agent Settings and move all prompt-related controls out of `General`.

After this change:

General:
- Name
- Description

Prompt:
- Instruction source
- Instructions
- Instruction file path / instruction file selection
- Task / Assignment

No Agent persistence, payload, validation, or runtime semantics should change.

Tab order

Use this order:

    General
    Prompt
    Model
    Context
    Tools & Skills
    Runtime
    Advanced

General tab

General must contain only:

- Name
- Description

Remove all instruction/task-related controls from General.

Do not change:
- field names
- values
- validation
- save behavior
- load behavior

Prompt tab

Add a new Agent Settings tab labeled:

    Prompt

Move the existing prompt-related controls into this tab.

This includes the existing controls for:

- instruction source
- inline instructions
- instruction file path / instruction file selection
- assignment / Agent task

Preserve all current behavior.

If existing UI conditionally shows inline instructions versus instruction-file controls based on instruction source, retain exactly that behavior inside Prompt.

Do not duplicate controls between General and Prompt.

Data semantics

Do not introduce new Agent fields.

Continue using the existing fields, including the current equivalents of:

    instructionSource
    instructions
    instructionFilePath
    assignment

The tab move is presentation-only.

Existing Agent API payloads must remain unchanged.

Existing Agents must load with their saved prompt values unchanged.

Saving from the new Prompt tab must produce the same data that saving from General produced before this task.

Unsaved Agent behavior

Preserve existing create/edit behavior for unsaved Agents.

Do not make the Prompt tab dependent on the Agent already being persisted unless an existing individual control already has such a requirement.

Advanced tab behavior remains unchanged.

UI behavior

Follow the existing Agent Settings tab implementation and visual conventions.

Requirements:

- `Prompt` appears immediately after `General`
- switching tabs must not lose unsaved field values
- changing prompt fields and then changing tabs must retain those edits
- reopening a saved Agent restores prompt values correctly
- keyboard/tab behavior should follow existing tab conventions
- no duplicate DOM IDs or labels
- no unnecessary new component architecture

Keep this a focused UI restructuring task.

Frontend

Primary implementation location is expected to be:

    src/client/components/projects/ProjectAgentsSection.ts

and existing related CSS/tests as needed.

Prefer moving the existing controls rather than reimplementing their logic.

If General and Prompt sections are currently produced by helper methods/functions, refactor minimally so ownership is clear.

Do not move unrelated controls.

Expected resulting information architecture

    General
      Name
      Description

    Prompt
      Instruction source
      Instructions / instruction file
      Task

    Model
      existing contents unchanged

    Context
      existing contents unchanged

    Tools & Skills
      existing contents unchanged

    Runtime
      existing contents unchanged

    Advanced
      existing contents unchanged

Scope

Do not change:

- Agent API routes
- database schema
- Agent repository persistence
- AgentService parsing
- instruction resolution semantics
- runtime prompt construction
- current-date injection
- skill context behavior
- attached-file behavior
- model settings
- tool settings
- pre-run behavior
- chaining
- result-file behavior
- Agent Execution
- Agent Errors

Tests

Add/update deterministic frontend tests proving:

1. Agent Settings contains a `Prompt` tab
2. tab order is:
       General
       Prompt
       Model
       Context
       Tools & Skills
       Runtime
       Advanced
3. General contains Name
4. General contains Description
5. General no longer contains instruction controls
6. General no longer contains task/assignment control
7. Prompt contains instruction source control
8. Prompt contains inline instructions control when applicable
9. Prompt contains instruction file control when applicable
10. Prompt contains task/assignment control
11. instruction-source conditional UI still works
12. switching away from Prompt and back preserves unsaved edits
13. existing saved prompt values populate correctly
14. save payload still uses the existing instruction/prompt fields unchanged
15. no duplicate prompt controls exist across tabs
16. Model tab remains unchanged
17. Context tab remains unchanged
18. Tools & Skills tab remains unchanged
19. Runtime tab remains unchanged
20. Advanced tab remains unchanged

Tests must remain deterministic.

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

docs/executed_results/TASK-0138-agent-settings-prompt-tab.md

Report:
- tab structure change
- controls moved
- confirmation that payload/data semantics are unchanged
- files changed
- focused tests
- all five verification results
- PASS/BLOCKED
