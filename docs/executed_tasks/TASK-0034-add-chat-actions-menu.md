# TASK-0034 — Add chat actions menu with rename and delete

Task ID: TASK-0034
Task slug: add-chat-actions-menu

## Goal

Add a contextual actions menu for each saved chat in the sidebar.

The menu must support:

- Rename
- Delete

Use a three-dot `...` trigger shown at the right side of a chat row on hover/focus.

## Read first

Run:

    powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\inspect-repo.ps1

Then read only relevant files for:

- chat sidebar/list UI
- layout active-chat state
- chat API/service/repository/types
- relevant chat tests
- ARCHITECTURE.md
- CODINGSTANDARDS.md

Do not use recursive repository listing commands.

## UI behavior

For every saved chat row:

- show a three-dot `...` actions button on hover or keyboard focus
- keep it aligned at the far right of the chat row
- clicking the actions button opens a small contextual menu for that chat
- clicking the actions button must not also select/change the active chat
- only one chat actions menu may be open at a time

Menu actions:

- Rename
- Delete

The menu should be visually compact and anchored near the three-dot button.

Delete must be visually destructive.

## Accessibility

The actions trigger must be a real button.

Provide an accessible label such as:

    Chat actions

Menu actions must be keyboard accessible.

Pressing Escape should close the open menu.

Clicking outside the menu should close it.

Do not use clickable div elements for interactive controls.

## Rename

Use the existing chat update endpoint:

    PUT /api/chats/:id

Rename must update only the chat title while preserving:

- modelConnectionId
- modelId

Use the smallest browser-compatible interaction for entering the new name.

A native prompt is acceptable for this task.

Requirements:

- prefill the existing chat title
- trim the entered title
- reject empty/whitespace-only title
- cancelling must do nothing
- successful rename updates the visible sidebar title immediately
- if the renamed chat is active, its title in ChatView must update immediately
- no full page reload

Do not create a duplicate chat.

## Delete backend

Add:

    DELETE /api/chats/:id

Follow existing architecture:

    HTTP
      ↓
    ChatService
      ↓
    ChatRepository
      ↓
    SQLite

Repository delete must:

- use parameterized SQL
- delete by chat id AND userId
- return deleted/not-found result
- remain generic

ChatService must enforce:

    UserId = 1

The browser must not send userId.

Unknown or wrong-user chat id must return not found.

Do not change the chat schema.

Do not add a migration.

## Delete UI

Require confirmation before deletion.

Use the smallest browser-compatible approach.

A native confirm dialog is acceptable.

On successful deletion:

- remove the chat from the sidebar immediately
- close the actions menu
- do not reload the page

If the deleted chat was active:

- clear the active chat
- show the existing no-active-chat state

Do not automatically delete or modify any other chat.

If the deleted chat was not active:

- keep the current active chat unchanged

Cancelling confirmation must send no DELETE request.

## Styling

Keep the existing sidebar design.

Add only the minimum styling required for:

- right-aligned three-dot trigger
- hover/focus visibility
- contextual menu
- normal Rename action
- destructive Delete action

Do not redesign the sidebar.

The actions button should not take significant width away from the chat title.

Long chat titles must remain usable with the existing sidebar width.

## Tests

Use deterministic tests and isolated SQLite databases.

Test at minimum:

- repository deletes UserId 1 chat
- repository cannot delete another user's chat
- service enforces UserId 1
- DELETE /api/chats/:id deletes an existing chat
- DELETE unknown id returns not found
- DELETE wrong-user chat returns not found
- invalid route id is rejected
- actions trigger exists per saved chat
- clicking actions does not select the chat
- only one menu is open at a time
- Escape closes menu
- outside click closes menu
- Rename sends PUT for selected chat
- Rename preserves modelConnectionId and modelId
- successful Rename updates sidebar title
- active chat title updates after Rename
- cancelled/empty Rename does not send PUT
- Delete requires confirmation
- cancelled Delete sends no DELETE
- successful Delete removes chat from sidebar
- deleting active chat clears active state
- deleting inactive chat preserves active chat

Do not use LM Studio in automated tests.

## Out of scope

Do not add:

- custom modal framework
- chat message persistence
- real inference
- streaming
- bulk delete
- undo
- soft delete
- authentication
- dynamic users
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

- three-dot actions appear at the right side of chat rows on hover/focus
- actions menu opens without changing active chat
- Rename works and persists
- Delete works and persists
- active chat state stays correct after rename/delete
- UserId 1 remains server-side
- chat schema is unchanged
- no full page reload
- existing chat/model-selection behavior still works
- all tests pass
- no new dependencies
- no unrelated changes

## Tracking

Create:

- docs/executed_tasks/TASK-0034-add-chat-actions-menu.md
- docs/executed_results/TASK-0034-add-chat-actions-menu.md

Do not read historical task/result files.

## Final response

Return only:

    Task ID: TASK-0034
    Status: <PASS|FAIL|BLOCKED>
    Result: docs/executed_results/TASK-0034-add-chat-actions-menu.md
    Summary: <one short sentence>
