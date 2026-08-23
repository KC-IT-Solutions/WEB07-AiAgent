# TASK-0029 - Add chat persistence

Task ID: TASK-0029
Task slug: add-chat-persistence

## Goal

Add persistent chats for UserId 1.

This task adds database, repository, service, and API support for chats.

Do not add real model inference yet.

## Read first

Run:

    powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\inspect-repo.ps1

Then read only relevant files for:

- database initialization
- migrations
- model connection persistence patterns
- repository/service/API patterns
- current Chat UI
- relevant tests
- DATABASE.md
- ARCHITECTURE.md
- CODINGSTANDARDS.md

Do not use recursive repository listing commands.

## Database model

Follow DATABASE.md hybrid architecture.

Use real columns for:

- id
- user_id
- created_at
- updated_at

Use JSON `data` for flexible chat properties.

Add a new migration for:

    chats

Target structure:

    chats
      id INTEGER PRIMARY KEY
      user_id INTEGER NOT NULL
      created_at INTEGER NOT NULL
      updated_at INTEGER NOT NULL
      data TEXT NOT NULL CHECK (json_valid(data))

Do not store user_id inside JSON.

Do not create speculative indexes.

## Chat data

Define an explicit TypeScript type for chat JSON data.

Initial logical structure:

    {
      "title": "New chat",
      "modelConnectionId": 1,
      "modelId": "qwen/qwen3.6-27b"
    }

Requirements:

- title required
- modelConnectionId may be null
- modelId may be null

Do not store chat messages in this task.

## User ownership

All chat operations in this task belong to:

    UserId = 1

UserId must be enforced server-side.

The browser must not supply or override userId.

## Relationship handling

modelConnectionId represents the model connection selected for the chat.

For this task it remains part of flexible chat JSON data.

Do not add a new relational column for it unless existing DATABASE.md rules and actual query/integrity requirements clearly require one.

Do not change the model_connections schema.

## Repository

Add a ChatRepository following existing repository conventions.

Support only:

- create chat
- list chats for UserId 1
- get chat by id for UserId 1

Repository owns:

- SQL
- JSON serialization/parsing
- row mapping

Use parameterized SQL.

## Service

Add a minimal ChatService.

It must enforce UserId 1.

Support:

- createChat
- listChats
- getChatById

Service must not depend on Express request/response objects.

## API

Add:

    POST /api/chats
    GET /api/chats
    GET /api/chats/:id

POST accepts:

- title
- modelConnectionId
- modelId

Do not accept userId.

Validate all external input.

Unknown chat id must return the existing project-style not-found response.

## Chat UI

Do not redesign the Chat UI.

Do not add chat list/selection UI yet.

No client changes are required unless needed to preserve existing behavior.

## Tests

Use isolated deterministic SQLite databases.

Test at minimum:

- migration creates chats table
- created chat has user_id = 1
- data contains valid JSON
- title persists
- nullable modelConnectionId persists
- nullable modelId persists
- list returns only UserId 1 chats
- get-by-id is scoped to UserId 1
- POST creates a chat
- GET lists chats
- GET by id returns the correct chat
- unknown id returns not found
- client cannot override userId

Do not use LM Studio in automated tests.

## Out of scope

Do not add:

- chat messages persistence
- chat list UI
- chat selection UI
- update/delete chats
- real model calls
- streaming
- inference queue
- credential persistence
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

- chats persist in SQLite
- chats use the hybrid database model
- UserId 1 is enforced server-side
- chat data is stored in JSON
- modelConnectionId and modelId can be persisted
- repository boundary is respected
- HTTP uses service/application layer
- migration owns the chats schema
- automated tests use isolated databases
- no LM Studio dependency in tests
- no client chat-management UI is added
- all tests pass
- no new dependencies
- no unrelated changes

## Tracking

Create:

- docs/executed_tasks/TASK-0029-add-chat-persistence.md
- docs/executed_results/TASK-0029-add-chat-persistence.md

Do not read historical task/result files.

## Final response

Return only:

    Task ID: TASK-0029
    Status: <PASS|FAIL|BLOCKED>
    Result: docs/executed_results/TASK-0029-add-chat-persistence.md
    Summary: <one short sentence>
