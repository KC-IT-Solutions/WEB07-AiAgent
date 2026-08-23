# TASK-0041 — Move model controls into chat composer

Task ID: TASK-0041
Task slug: move-model-controls-into-chat-composer

## Goal

Move the active chat's Model connection and Model controls from the top of ChatView into the message composer at the bottom.

Keep existing behavior unchanged.

This is a client UI/layout task.

## Read first

Run:

    powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\inspect-repo.ps1

Then read only relevant files for:

- ChatView
- chat.css
- active chat/model selection behavior
- relevant frontend tests
- CODINGSTANDARDS.md

Do not use recursive repository listing commands.

## Target layout

The composer should have two visual rows.

Upper row:

- message input area

Lower row:

- Model connection selector
- Model selector
- Send button aligned at the right

Conceptually:

    ┌───────────────────────────────────────────────────────┐
    │ Message input                                         │
    │                                                       │
    ├───────────────────────────────────────────────────────┤
    │ Connection      Model                         Send    │
    └───────────────────────────────────────────────────────┘

Do not place model controls in the chat header anymore.

## Message row

Preserve the existing message input behavior.

Requirements:

- message field remains the primary visual element
- Enter/send behavior remains unchanged
- existing pending/disabled behavior remains unchanged
- existing Thinking state remains unchanged

Do not change inference requests.

## Model controls row

Move the existing:

- Model connection
- Model

controls into the lower composer row.

Requirements:

- reuse the existing controls and behavior
- do not duplicate model selectors
- connection selector should remain compact
- model selector may use more available width than connection selector
- Send stays at the far right
- selectors and Send should align vertically
- labels may be visually compact if needed, but accessibility labels must remain available

Keep the row usable at narrower widths.

It may wrap cleanly if necessary, but should remain one row at normal desktop width.

## Preserve model behavior

Do not change:

- loading saved model connections
- enabled-only connection selection
- model discovery
- persisted modelConnectionId
- persisted modelId
- PUT /api/chats/:id behavior
- model discovery endpoint
- no-active-chat behavior

Changing connection/model must work exactly as before.

## No active chat

Preserve the existing behavior when no persisted chat is active.

Model controls and Send/input should remain unavailable as appropriate.

## Markdown

Do not change assistant Markdown rendering introduced in TASK-0040.

Do not modify MarkdownRenderer unless strictly required, which is not expected.

## Styling

Adjust only Chat-specific CSS.

Requirements:

- composer should look like one coherent control surface
- upper message row and lower toolbar row should be visually grouped
- avoid excessive borders or nested cards
- selectors should not dominate the composer
- Send button should remain easy to identify
- preserve existing application styling
- no unrelated redesign

## Tests

Update focused frontend tests only where required.

Test at minimum:

- model controls are no longer rendered in the top chat configuration block
- Model connection exists in the composer
- Model exists in the composer
- Send exists in the lower composer row
- existing model selection behavior remains wired
- existing inference behavior remains wired
- no duplicate model selectors are introduced
- Markdown rendering remains unchanged

Do not use LM Studio.

## Out of scope

Do not add:

- backend changes
- API changes
- model-selection behavior changes
- message persistence
- streaming
- new inference behavior
- attachments
- extra composer actions
- new dependencies
- unrelated refactors

## Verification

Run:

    npm run build
    npm run build:client
    npm run typecheck:client
    npm run lint
    npm test

## Acceptance

- top model-selection block is removed
- message composer contains two rows
- upper row contains the message input
- lower row contains connection, model, and Send
- selectors remain fully functional
- Send/inference behavior is unchanged
- no duplicate controls exist
- Markdown rendering still works
- all tests pass
- no backend changes
- no new dependencies
- no unrelated changes

## Tracking

Create:

- docs/executed_tasks/TASK-0041-move-model-controls-into-chat-composer.md
- docs/executed_results/TASK-0041-move-model-controls-into-chat-composer.md

Do not read historical task/result files.

## Final response

Return only:

    Task ID: TASK-0041
    Status: <PASS|FAIL|BLOCKED>
    Result: docs/executed_results/TASK-0041-move-model-controls-into-chat-composer.md
    Summary: <one short sentence>
