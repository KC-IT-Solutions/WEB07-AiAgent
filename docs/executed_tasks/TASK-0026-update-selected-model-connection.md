# TASK-0026 — Update selected model connection

Task ID: TASK-0026
Task slug: update-selected-model-connection

## Goal

Allow an existing saved model connection to be updated from Settings.

Do not add delete behavior.

## Read first

Run:

    powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\inspect-repo.ps1

Then read only relevant files for:

- Settings view
- model connection API
- model connection service
- repository
- model connection types
- relevant tests
- DATABASE.md
- ARCHITECTURE.md
- CODINGSTANDARDS.md

Do not use recursive repository listing commands.

## Behavior

Save must behave differently depending on Settings state.

When "New connection" is active:

    POST /api/model-connections

When an existing saved connection is selected:

    PUT /api/model-connections/:id

Do not create a duplicate row when updating an existing connection.

## Update data

Allow updating:

- name
- baseUrl
- timeoutMinutes
- modelId
- enabled

Do not allow updating:

- id
- userId
- createdAt

UserId must remain enforced server-side as:

    user_id = 1

updated_at must change when persistent connection data changes.

created_at must remain unchanged.

## Database architecture

Keep the existing hybrid model unchanged:

    id
    user_id
    created_at
    updated_at
    data

Connection properties remain inside JSON data.

Do not add new columns.

Do not add a migration unless a real schema change is required.

## Repository

Add the smallest required repository operation for updating a connection.

Requirements:

- update by connection id AND UserId
- parameterized SQL
- update data JSON
- update updated_at
- preserve created_at
- return the updated connection or a clear not-found result

Repository must remain generic and receive userId from the service.

## Service

Add update behavior to ModelConnectionService.

The service must enforce UserId 1.

HTTP must call the service, not the repository directly.

## API

Add:

    PUT /api/model-connections/:id

Validate:

- route id
- name
- baseUrl
- timeoutMinutes
- modelId
- enabled

Do not accept userId.

Do not accept apiKey.

If the connection does not exist for UserId 1, return an appropriate not-found response.

Preserve existing response conventions.

## API key

Do not change credential behavior.

- API key is not persisted
- API key is not accepted by the update endpoint
- API key is not returned
- API key is not logged

The existing Test connection flow may still use the API key in memory.

## Settings

When a saved connection is selected, Save must update that connection rather than create another one.

After successful update:

- keep the same selected connection
- update the visible saved connection label/data if necessary
- show a simple success state

When "New connection" is selected, Save must continue creating a new connection through POST.

Do not redesign Settings.

## Tests

Use deterministic tests and isolated SQLite databases.

Test at minimum:

- repository updates existing connection for UserId 1
- repository cannot update another user's connection through UserId 1
- updated_at changes
- created_at stays unchanged
- JSON data is updated correctly
- API PUT updates an existing connection
- API PUT returns not found for unknown/wrong-user id
- client cannot override userId
- apiKey is not persisted or accepted
- Settings Save uses PUT when a saved connection is selected
- Settings Save still uses POST for New connection
- updating does not create a duplicate connection

Do not use LM Studio in automated tests.

## Out of scope

Do not add:

- delete API
- delete UI
- credential persistence
- authentication
- dynamic users
- chat inference
- chat persistence
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

- existing connection can be updated
- update uses the same row/id
- no duplicate row is created
- UserId 1 remains enforced server-side
- created_at is preserved
- updated_at changes
- JSON connection data is updated
- Settings uses POST for new connections
- Settings uses PUT for selected saved connections
- API key remains unpersisted
- architecture boundaries remain intact
- all tests pass
- no new dependencies
- no unrelated changes

## Tracking

Create:

- docs/executed_tasks/TASK-0026-update-selected-model-connection.md
- docs/executed_results/TASK-0026-update-selected-model-connection.md

Do not read historical task/result files.

## Final response

Return only:

    Task ID: TASK-0026
    Status: <PASS|FAIL|BLOCKED>
    Result: docs/executed_results/TASK-0026-update-selected-model-connection.md
    Summary: <one short sentence>
