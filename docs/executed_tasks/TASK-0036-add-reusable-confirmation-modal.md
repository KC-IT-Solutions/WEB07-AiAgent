# TASK-0036 - Add reusable confirmation modal

Task ID: TASK-0036
Task slug: add-reusable-confirmation-modal

## Goal

Replace the native chat-delete confirmation with a small reusable confirmation modal.

The modal should be reusable for similar confirmation flows later.

Do not change backend behavior.

## Read first

Run:

    powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\inspect-repo.ps1

Then read only relevant files for:

- chat actions menu
- chat delete UI logic
- client component structure
- relevant frontend tests
- CODINGSTANDARDS.md

Do not use recursive repository listing commands.

## Reusable modal

Add a small reusable client component for confirmation dialogs.

It should support:

- title
- message
- confirm label
- cancel label
- destructive confirm styling when requested
- confirm callback
- cancel/close behavior

Keep the API simple and explicit.

Do not introduce a framework or dependency.

## Chat delete

Replace the existing native confirmation used when deleting a chat.

When Delete is selected from a chat's actions menu:

- close the actions menu
- open the confirmation modal
- show the chat title in the confirmation message
- do not send DELETE until the user confirms

Example meaning:

    Delete chat?
    "My chat" will be permanently deleted.

Buttons:

    Cancel
    Delete

Delete must be visually destructive.

## Confirmation behavior

On Confirm:

- close/disable the modal appropriately while deletion proceeds
- run the existing chat delete behavior
- remove the chat from the sidebar after successful deletion
- preserve existing active-chat behavior

On Cancel:

- close the modal
- send no DELETE request

## Closing behavior

The modal must also close without confirming when:

- Escape is pressed
- user clicks the backdrop outside the dialog

Neither action may send DELETE.

## Accessibility

Use semantic dialog markup where practical.

Requirements:

- dialog has an accessible name/title
- focus moves into the modal when opened
- keyboard users can reach both actions
- Escape closes it
- focus returns to the control that opened the confirmation when closed where practical

Do not add a large focus-management library.

## Styling

Keep styling consistent with the existing dark sidebar/application design.

The modal should include:

- dimmed backdrop
- compact centered dialog
- clear title
- readable message
- Cancel action
- destructive Delete action

Do not redesign unrelated UI.

## Reuse

The modal must not be hardcoded specifically to chats.

Chat delete is the first consumer.

Structure it so future confirmation flows can reuse the same component without copying modal DOM/CSS.

Do not migrate other confirmation flows to the modal in this task.

## Preserve existing behavior

Do not change:

- DELETE /api/chats/:id
- ChatService
- ChatRepository
- database
- migrations
- chat rename
- model selection
- chat creation
- UserId behavior

No backend changes should be required.

## Tests

Add/update focused deterministic frontend tests for:

- chat delete no longer uses window.confirm
- Delete opens the confirmation modal
- modal contains the selected chat title
- Cancel closes without DELETE
- Escape closes without DELETE
- backdrop click closes without DELETE
- Confirm sends the existing DELETE request
- successful delete still removes the chat
- active-chat state behavior remains unchanged
- modal component is reusable and not hardcoded to chat deletion

Do not use LM Studio.

## Out of scope

Do not add:

- backend changes
- API changes
- database changes
- connection-delete migration to modal
- unsaved-changes dialogs
- general modal framework
- animations requiring dependencies
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

- chat deletion uses the custom confirmation modal
- native window.confirm is no longer used for chat deletion
- Cancel, Escape and backdrop click do not delete
- Confirm performs the existing deletion
- modal is reusable for future confirmation flows
- accessibility basics are preserved
- no backend behavior changes
- all tests pass
- no new dependencies
- no unrelated changes

## Tracking

Create:

- docs/executed_tasks/TASK-0036-add-reusable-confirmation-modal.md
- docs/executed_results/TASK-0036-add-reusable-confirmation-modal.md

Do not read historical task/result files.

## Final response

Return only:

    Task ID: TASK-0036
    Status: <PASS|FAIL|BLOCKED>
    Result: docs/executed_results/TASK-0036-add-reusable-confirmation-modal.md
    Summary: <one short sentence>
