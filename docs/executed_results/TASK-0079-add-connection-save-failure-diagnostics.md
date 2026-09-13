# TASK-0079 - Add safe diagnostics for connection save/update failures

Task ID: TASK-0079
Status: PASS

## Summary

Model connection create and update failures now emit the structured `model_connection_save_failed` application event with safe operation, connection ID, stage, controlled error code, and error name fields.

## Repository analysis

The POST and PUT routes delegate saves to `ModelConnectionService`. Credential encryption occurs in the service before repository create/update calls, and both route catches preserve controlled 500 response bodies. The existing `StructuredLogger.application` method is the application-log convention and already performs general field redaction.

## Files changed

- `src/server.ts`
- `src/server/services/model-connection-service.ts`
- `src/server/services/model-credential-cipher.ts`
- `tests/integration/model-connections-api.test.ts`
- `tests/unit/model-connection-credentials.test.ts`
- `docs/executed_tasks/TASK-0079-add-connection-save-failure-diagnostics.md`
- `docs/executed_results/TASK-0079-add-connection-save-failure-diagnostics.md`

## Tests and verification

- `powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\inspect-repo.ps1` - PASS
- `npm.cmd run build` - PASS
- `npm.cmd run build:client` - PASS
- `npm.cmd run typecheck:client` - PASS
- `npm.cmd run lint` - PASS
- `npm.cmd test` - PASS, 473 tests passed
- Focused unit diagnostics tests - PASS
- Focused API diagnostics test after rebuilding `dist/server.js` - PASS

An initial focused API run after only `test:compile` exercised the stale pre-task `dist/server.js` and therefore did not find the new log event. After the required server build, the focused API test and full mandatory suite passed.

## Production code

The service logs create/update failures at credential configuration, credential encryption, or repository stages and rethrows the original error. Existing validation exits log a fixed validation-stage event. Missing and invalid encryption-key configuration now use controlled `MODEL_CREDENTIAL_ENCRYPTION_KEY_MISSING` and `MODEL_CREDENTIAL_ENCRYPTION_KEY_INVALID` codes while retaining the existing error message and encryption behavior.

Only fixed diagnostic fields are logged. Request bodies, API keys, encryption-key values, raw errors, ciphertext, IVs, and auth tags are not passed to the logger. Logger failures are swallowed only within the diagnostic path so they cannot replace save errors or validation responses.

## Architecture

Existing HTTP, service, repository, cipher, and structured-logger boundaries are preserved. No credential persistence flow or HTTP response mapping was redesigned.

## Dependencies

No dependencies were added or changed for this task.

## Deviations

None.

## Risks / findings

The worktree contained extensive pre-existing changes, including changes in several target files. They were preserved. Diagnostics depend on the application log stream being enabled under the existing logging settings.

## Diff summary

Added one shared event across create/update validation and save failures, controlled credential configuration codes, safe failure classification, logger-failure isolation, and deterministic unit/integration regression coverage with unchanged HTTP failure responses.
