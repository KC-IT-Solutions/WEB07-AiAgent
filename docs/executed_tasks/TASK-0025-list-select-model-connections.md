# TASK-0025 — List and select saved model connections

Task ID: TASK-0025
Task slug: list-select-model-connections

## Goal

Extend Settings so saved model connections for UserId 1 can be listed and selected.

Do not add edit or delete yet.

## Read first

Run:

    powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\inspect-repo.ps1

Then read only relevant files for:

- Settings view
- model connection API
- model connection service
- repository
- relevant tests
- CODINGSTANDARDS.md
- ARCHITECTURE.md

Do not use recursive repository listing commands.

## Requirements

Use the existing:

    GET /api/model-connections
    GET /api/model-connections/:id

When Settings opens:

- load saved model connections
- show them in a simple selectable list or select control
- show connection name as the primary label
- show base URL as secondary information if the existing UI structure supports it cleanly

When the user selects a saved connection:

- fetch or use the selected connection data
- populate the existing Settings form with:
  - name
  - baseUrl
  - timeoutMinutes
  - modelId
  - enabled

Do not populate API key.

API key field must remain empty when loading a saved connection.

## New connection

Provide a simple way to switch back to a new unsaved connection form.

For example:

    New connection

When chosen:

- clear saved connection selection
- reset form to defaults
- timeoutMinutes = 30
- enabled = true
- model selector returns to its normal unloaded state

Do not redesign the Settings page.

## Model state

A persisted modelId may be displayed as the current selected model.

Do not automatically call /v1/models when merely loading a saved connection.

The existing Test connection button remains responsible for refreshing available models.

If necessary, the currently saved modelId may be shown as the only current model option until Test connection loads the live model list.

## API key

Do not change credential behavior.

- API key is not returned by persistence API
- API key field stays empty when selecting a saved connection
- do not persist API keys
- do not log API keys

## Loading and errors

Add minimal user-visible states for:

- loading saved connections
- failure to load saved connections

Do not add elaborate retry infrastructure.

## Out of scope

Do not add:

- update API
- delete API
- edit persistence
- auto-save
- credential persistence
- authentication
- dynamic users
- chat inference
- chat persistence
- inference queue
- new dependencies
- unrelated refactors

## Tests

Add/update deterministic Settings tests for:

- saved connections load from GET /api/model-connections
- connection names are displayed
- selecting a connection populates the form
- timeoutMinutes is restored
- modelId is restored
- enabled is restored
- API key remains empty
- New connection resets the form
- load failure shows an error

Do not use LM Studio in automated tests.

Preserve existing backend tests unless behavior actually changes.

## Verification

Run:

    npm run build
    npm run build:client
    npm run typecheck:client
    npm run lint
    npm test

## Acceptance

- Settings lists saved connections for UserId 1
- a saved connection can be selected
- selected connection populates the existing form
- API key is never restored from persistence
- New connection resets the form
- no update/delete behavior is introduced
- existing Test connection behavior still works
- all tests pass
- no new dependencies
- no unrelated changes

## Tracking

Create:

- docs/executed_tasks/TASK-0025-list-select-model-connections.md
- docs/executed_results/TASK-0025-list-select-model-connections.md

Do not read historical task/result files.

## Final response

Return only:

    Task ID: TASK-0025
    Status: <PASS|FAIL|BLOCKED>
    Result: docs/executed_results/TASK-0025-list-select-model-connections.md
    Summary: <one short sentence>
