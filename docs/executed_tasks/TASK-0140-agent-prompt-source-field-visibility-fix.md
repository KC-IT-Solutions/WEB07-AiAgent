# TASK-0140: Agent Prompt Source Field Visibility Fix

Task ID: TASK-0140
Slug: agent-prompt-source-field-visibility-fix

## Instruction

Preflight

Read:
- AGENTS.md
- docs/IGNORE.md
- docs/CODINGSTANDARDS.md
- docs/DEFINITION_OF_DONE.md
- docs/TASK_WORKFLOW.md
- relevant ARCHITECTURE / TESTING docs

Create and re-read:

docs/executed_tasks/TASK-0140-agent-prompt-source-field-visibility-fix.md

Goal

Fix Agent Settings -> Prompt so only the field belonging to the selected source is visibly rendered.

Current runtime behavior is incorrect:

Instructions:
- `Write instructions` and `Use Project file` radio choices work
- but both Inline instructions and Instruction file remain visible

Task / Assignment:
- `Write task` and `Use Project file` radio choices work
- but both Task / Assignment textarea and Task file remain visible

The existing frontend already contains source-update functions and change listeners.

Investigate why the existing `hidden` assignments do not result in actual visual hiding in the rendered UI.

Do not assume the TypeScript source-update logic is missing.

Required behavior

Instructions

When:

    Write instructions

is selected:

- show Inline instructions
- hide Instruction file completely

When:

    Use Project file

is selected:

- hide Inline instructions completely
- show Instruction file

Task / Assignment

When:

    Write task

is selected:

- show Task / Assignment textarea
- hide Task file completely

When:

    Use Project file

is selected:

- hide Task / Assignment textarea completely
- show Task file

"Hide" means the inactive settings-form group must not occupy visible space in the layout.

Value preservation

Do not clear inactive values.

Switching:

    inline -> file -> inline

must preserve the previous inline text.

Switching:

    file -> inline -> file

must preserve the previously selected file path.

This applies independently to Instructions and Task / Assignment.

Existing implementation

The current frontend already conceptually performs:

    inlineInstructionsField.hidden = usesFile
    instructionFileField.hidden = !usesFile

and:

    assignmentField.hidden = usesFile
    assignmentFileField.hidden = !usesFile

It also already registers change listeners and invokes the update functions during editor setup.

Determine why those hidden states are not visually effective.

Inspect the relevant CSS and DOM behavior.

Likely areas include:

    src/client/components/projects/ProjectAgentsSection.ts

and the stylesheet(s) defining:

    .settings-form-group
    .project-agent-editor
    .project-agent-tab-panel
    [hidden]

Fix the underlying conflict rather than adding duplicate source-state logic.

Preferred behavior

Continue using the native `hidden` property if practical.

If project CSS currently overrides native hidden behavior, correct the CSS so hidden elements remain hidden.

Prefer a general safe rule where appropriate, for example preserving native semantics for elements carrying the `hidden` attribute.

Do not add inline `style.display` mutations unless necessary.

Do not add two independent visibility mechanisms that can drift out of sync.

Initial render

Visibility must be correct immediately when opening Agent Settings.

For a saved Agent with:

    instructionSource = inline

only Inline instructions must initially be visible.

For:

    instructionSource = file

only Instruction file must initially be visible.

Likewise:

    assignmentSource = inline
    -> only Task / Assignment textarea visible

    assignmentSource = file
    -> only Task file visible

Interactive behavior

Changing a radio button must update visibility immediately without:

- Save
- closing the modal
- changing tabs
- reopening Agent Settings

Switching Prompt -> another tab -> Prompt must retain both:
- selected source
- correct visibility
- unsaved values

Scope

This is a frontend visibility regression fix.

Do not change:

- Agent data model
- `instructionSource`
- `instructions`
- `instructionFilePath`
- `assignmentSource`
- `assignment`
- `assignmentFilePath`
- save payload
- API
- persistence
- AgentService
- AgentRunService
- file resolution
- Project file picker behavior
- runtime prompt construction
- General/Prompt tab structure
- other Agent Settings tabs

Tests

Update/add deterministic frontend coverage proving actual visibility semantics, not merely that source code contains `.hidden =`.

Verify:

1. Instructions inline source makes inline field visible
2. Instructions inline source makes file field hidden
3. Instructions file source makes inline field hidden
4. Instructions file source makes file field visible
5. changing Instructions source updates visibility
6. changing Instructions source preserves both values
7. Task inline source makes assignment field visible
8. Task inline source makes task-file field hidden
9. Task file source makes assignment field hidden
10. Task file source makes task-file field visible
11. changing Task source updates visibility
12. changing Task source preserves both values
13. saved inline states render correctly on editor open
14. saved file states render correctly on editor open
15. tab switching does not break source visibility
16. inactive fields occupy no visible layout space
17. existing save payload remains unchanged
18. no persistence/runtime behavior changes

If existing tests only assert source text such as:

    field.hidden = ...

strengthen them sufficiently to catch the real regression that currently passes tests while both fields remain visible in the browser.

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

docs/executed_results/TASK-0140-agent-prompt-source-field-visibility-fix.md

Report:
- root cause
- exact frontend/CSS fix
- Instructions visibility behavior
- Task / Assignment visibility behavior
- confirmation that inactive values remain preserved
- why previous tests missed the browser-visible regression
- tests added/updated
- files changed
- all five verification results
- PASS/BLOCKED
