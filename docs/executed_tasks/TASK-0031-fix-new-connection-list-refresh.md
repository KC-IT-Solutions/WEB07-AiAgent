# TASK-0031 - Fix new connection list refresh

Task ID: TASK-0031
Task slug: fix-new-connection-list-refresh

## Goal

Fix Settings so a newly created model connection immediately appears in Saved connections after Save.

This is a small client bugfix.

## Read first

Run:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\inspect-repo.ps1
```

Then read only relevant files for:

- SettingsView
- Settings tests
- existing model connection POST response shape
- CODINGSTANDARDS.md

Do not use recursive repository listing commands.

## Current bug

When New connection is selected and Save succeeds, `POST /api/model-connections` creates the connection correctly, but the newly created connection is not added to the Saved connections list in the UI.

The user should not need to leave/reopen Settings to see it.

## Required behavior

After a successful POST:

- use the created connection returned by the POST response
- add it to the existing in-memory saved-connections list
- add/update its option in the Saved connections selector
- make the newly created connection the selected saved connection
- keep the form populated with the saved values
- update local selected-connection state so the next Save updates the same connection using PUT
- show the existing success state

Do not make an additional `GET /api/model-connections` request if the POST response already contains all required connection data.

## Preserve existing behavior

Do not change:

- POST endpoint
- PUT endpoint
- DELETE endpoint
- database persistence
- model connection service/repository
- Test connection behavior
- API key behavior
- Settings layout

A newly created connection must still be created only once.

## Validation

Treat the POST response as untrusted server data.

Reuse the existing saved-connection validation/type guard where practical.

Do not use unchecked type assertions to trust the response.

If the POST response is invalid, show the existing save error behavior rather than adding malformed data to the list.

## Tests

Add/update only focused Settings tests.

Test at minimum:

- successful POST adds the returned connection to Saved connections
- newly created connection becomes selected
- local state switches from New connection to the created connection id
- a subsequent Save uses PUT for that new connection
- no extra `GET /api/model-connections` is required after successful POST
- malformed POST response is not added to the list
- existing update and delete behavior remains intact

Do not use LM Studio.

## Out of scope

Do not add:

- backend changes
- database changes
- API changes
- chat functionality
- connection sorting redesign
- new dependencies
- unrelated refactors

## Verification

Run:

```text
npm run build
npm run build:client
npm run typecheck:client
npm run lint
npm test
```

## Acceptance

- a newly saved connection appears immediately in Saved connections
- the new connection becomes selected
- the form remains populated
- saving again updates the same connection instead of creating a duplicate
- no full-page or Settings reload is required
- no redundant list reload is added
- existing Test/Update/Delete behavior still works
- all verification passes
- no new dependencies

## Tracking

Create:

- `docs/executed_tasks/TASK-0031-fix-new-connection-list-refresh.md`
- `docs/executed_results/TASK-0031-fix-new-connection-list-refresh.md`

Do not read historical task/result files.
