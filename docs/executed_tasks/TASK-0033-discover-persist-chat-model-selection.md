# TASK-0033 — Discover and persist chat model selection

Task ID: TASK-0033
Task slug: discover-persist-chat-model-selection

## Goal

Allow the active chat to load all available models from its selected saved model connection, choose one, and persist that model selection on the existing chat.

Do not add real chat inference yet.

## Read first

Run:

    powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\inspect-repo.ps1

Then read only relevant files for:

- ChatView
- layout active-chat state
- model connection persistence/service
- existing Test connection/model discovery service
- chat update API/service/repository
- relevant tests
- ARCHITECTURE.md
- CODINGSTANDARDS.md

Do not use recursive repository listing commands.

## Required flow

When an active chat has a selected model connection:

    Chat UI
      ↓
    backend
      ↓
    saved model connection
      ↓
    <baseUrl>/v1/models

The browser must not call the model server directly.

## Backend

Add the smallest endpoint needed to discover models for a saved connection.

Preferred route:

    GET /api/model-connections/:id/models

Behavior:

- validate connection id
- load the connection through the existing service/repository boundary
- connection must belong to UserId 1
- use its saved baseUrl and timeoutMinutes
- request:

    <baseUrl>/v1/models

- normalize trailing slash before appending /v1/models
- return model IDs in a simple deterministic response
- unknown/wrong-user connection returns not found
- connection failure returns a safe error response
- do not expose internal stack traces

Reuse existing model-discovery / OpenAI-compatible connection logic where practical.

Do not duplicate HTTP model-discovery logic unnecessarily.

## API key

Do not change credential persistence in this task.

Saved connections currently do not persist API keys.

Therefore this endpoint must work for connections that do not require authentication.

Do not add credential storage.

Do not log API keys or authorization headers.

## Chat UI

When the user selects a saved model connection for an active chat:

- request the available models from:

    GET /api/model-connections/:id/models

- show a loading state in the Model control
- populate the Model selector with every returned model id
- enable the selector when models are available
- show a clear unavailable/error state when discovery fails

If the active chat already has a persisted modelId and that model exists in the returned list:

- keep it selected

Otherwise:

- do not silently persist a different model
- allow the user to choose one

## Persist model choice

When the user chooses a model:

- persist modelConnectionId and modelId on the existing active chat
- use the existing:

    PUT /api/chats/:id

- keep the same active chat
- do not create a duplicate chat
- no full page reload

The selected model must be restored from persisted chat data when the chat is selected again.

## Connection changes

If the user changes the active chat's model connection:

- discover models for the newly selected connection
- do not keep an invalid modelId from the previous connection
- only persist a modelId after the user selects a valid model from the new connection

Keep behavior simple and explicit.

## Automated tests

Do not use LM Studio or any live model server in automated tests.

Use deterministic mocked/stubbed model-server responses.

Test at minimum:

- saved connection model endpoint returns discovered model IDs
- endpoint is scoped to UserId 1
- unknown connection returns not found
- discovery failure returns safe error
- trailing slash base URL works
- Chat loads models after connection selection
- all returned model IDs appear in the model selector
- persisted modelId is restored when present in returned models
- changing model persists via existing chat PUT
- changing connection does not retain an invalid previous modelId
- no duplicate chat is created
- browser does not call /v1/models directly

## Live verification

After deterministic tests pass, a manual/live verification may be performed against:

    http://127.0.0.1:1234

Expected model endpoint:

    http://127.0.0.1:1234/v1/models

Live verification is optional and must not determine automated test success.

## Out of scope

Do not add:

- real chat inference
- streaming
- message persistence
- credential persistence
- chat delete
- chat rename
- authentication
- dynamic users
- inference queue
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

- selecting a connection in Chat loads its available models
- model dropdown contains all discovered model IDs
- existing persisted model is restored when valid
- user can select another model
- selected model is persisted on the active chat
- selection remains after switching away and back to the chat
- changing connection does not preserve an invalid old model
- model server is contacted only by backend
- no real inference is added
- automated tests do not depend on LM Studio
- all verification passes
- no new dependencies
- no unrelated changes

## Tracking

Create:

- docs/executed_tasks/TASK-0033-discover-persist-chat-model-selection.md
- docs/executed_results/TASK-0033-discover-persist-chat-model-selection.md

Do not read historical task/result files.

## Final response

Return only:

    Task ID: TASK-0033
    Status: <PASS|FAIL|BLOCKED>
    Result: docs/executed_results/TASK-0033-discover-persist-chat-model-selection.md
    Summary: <one short sentence>
