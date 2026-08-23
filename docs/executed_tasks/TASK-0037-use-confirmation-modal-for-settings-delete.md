# TASK-0037 - Use confirmation modal for Settings delete

Task ID: TASK-0037
Task slug: use-confirmation-modal-for-settings-delete

## Goal

Replace the native model-connection delete confirmation in Settings with the existing reusable ConfirmationModal.

This is a client-only consistency change.

## Required behavior

When Delete is selected for a saved model connection in Settings:

- do not use window.confirm
- open the existing reusable ConfirmationModal
- show the selected connection name in the message
- do not send DELETE until the user confirms

The modal meaning and buttons are:

```text
Delete connection?
"Local LM Studio" will be permanently deleted.

Cancel
Delete
```

Delete must use destructive styling.

## Confirm

On confirmation:

- use the existing DELETE /api/model-connections/:id behavior
- remove the deleted connection from Saved connections
- reset Settings to New connection
- preserve the existing form-reset behavior
- close the modal appropriately
- no full page reload

## Cancel / close

Cancel, Escape, and backdrop click must close the modal without DELETE. Restore focus where practical using the existing modal behavior.

## Reuse

Import and use the existing shared ConfirmationModal component. Do not copy modal DOM or CSS into Settings and do not create a Settings-specific modal.

## Preserve existing behavior

Do not change the DELETE API, backend, service, repository, database, model discovery, save/update behavior, API-key behavior, or chat delete behavior.

## Tests

Add or update focused deterministic tests covering:

- Settings delete no longer uses window.confirm
- Delete opens the shared ConfirmationModal
- modal includes the selected connection name
- Cancel sends no DELETE
- Escape sends no DELETE
- backdrop close sends no DELETE
- Confirm sends the existing DELETE request
- successful deletion removes the connection from the list
- successful deletion resets to New connection
- shared modal is reused rather than duplicated

Do not use LM Studio.

## Out of scope

No backend, API, database, dependency, new modal component, unrelated Settings redesign, or unrelated refactor changes.

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

- chat delete and Settings connection delete use the same reusable modal
- Settings no longer uses native confirmation
- Cancel/Escape/backdrop do not delete
- Confirm performs existing deletion
- existing Settings delete/reset behavior remains intact
- no backend changes
- all tests pass
- no new dependencies
- no unrelated changes

## Tracking

Create `docs/executed_results/TASK-0037-use-confirmation-modal-for-settings-delete.md` and do not read historical task/result files.
