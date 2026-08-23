# TASK-0030 - Add chat list and create UI

Task ID: TASK-0030
Task slug: add-chat-list-create-ui

## Goal

Add UI support for:

- listing saved chats
- creating a new chat
- selecting an active chat

Use the existing chat persistence API.

Do not add real model inference.

## Read first

Run:

    powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\inspect-repo.ps1

Then read only relevant files for:

- Chat UI
- layout/sidebar
- chat API
- chat service/repository/types
- relevant client tests
- CODINGSTANDARDS.md
- ARCHITECTURE.md

Do not use recursive repository listing commands.

## Existing API

Use:

    GET /api/chats
    POST /api/chats
    GET /api/chats/:id

Do not add new backend endpoints unless a small correction is strictly required.

## Sidebar

Extend the existing Chat section in the left sidebar.

Show:

- a New chat action
- saved chats for UserId 1

Each saved chat should display its title.

Keep Settings navigation intact.

Do not redesign the whole sidebar.

## Loading chats

When the app/chat UI initializes:

- load saved chats using GET /api/chats
- display them in the sidebar
- validate server data before using it

Add minimal loading/error behavior.

Do not automatically create a chat just because none exist.

## Create chat

When the user chooses New chat:

Create a new chat through:

    POST /api/chats

Initial values:

    title = "New chat"
    modelConnectionId = null
    modelId = null

After successful creation:

- add the new chat to the visible chat list
- make it the active chat
- show its title/content area without full page reload

Do not create duplicate chats from one click.

## Select chat

When a saved chat is selected:

- make it the active chat
- visually indicate which chat is selected
- load/use that chat's persisted data
- show the active chat title in the Chat view

If the list payload already contains all required chat data, do not make a redundant GET-by-id request.

## Active chat state

Keep the active chat state client-side for now.

Do not persist "currently active chat" separately.

Do not add chat messages persistence.

## Existing chat message UI

Preserve the current ChatView behavior as much as possible.

Do not connect messages to persisted chats yet.

Do not add model inference.

The existing stub chat behavior may remain unchanged.

## Empty state

If there are no saved chats:

- show a clear empty state
- New chat must still be available

## Security / ownership

Do not expose or send userId from the client.

The existing backend remains responsible for UserId 1.

## Tests

Add/update deterministic client tests for at minimum:

- GET /api/chats loads saved chats
- saved chat titles are shown
- empty chat list state
- load failure state
- New chat sends POST /api/chats
- POST payload uses:
  - title "New chat"
  - modelConnectionId null
  - modelId null
- created chat is added to the list
- created chat becomes active
- selecting a saved chat changes active chat
- active chat is visually identifiable
- Settings navigation still exists

Do not use LM Studio in automated tests.

Do not weaken existing tests.

## Out of scope

Do not add:

- chat update/rename
- chat delete
- chat message persistence
- chat history
- model connection selector
- model selector
- real inference
- streaming
- inference queue
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

- saved chats appear in the sidebar
- New chat creates a persisted chat
- new chat becomes active
- saved chats can be selected
- active chat is visually indicated
- active chat title is shown in the Chat view
- empty/error states are handled
- Settings navigation still works
- no message persistence is added
- no real model calls are added
- UserId remains server-side
- all tests pass
- no new dependencies
- no unrelated changes

## Tracking

Create:

- docs/executed_tasks/TASK-0030-add-chat-list-create-ui.md
- docs/executed_results/TASK-0030-add-chat-list-create-ui.md

Do not read historical task/result files.

## Final response

Return only:

    Task ID: TASK-0030
    Status: <PASS|FAIL|BLOCKED>
    Result: docs/executed_results/TASK-0030-add-chat-list-create-ui.md
    Summary: <one short sentence>
