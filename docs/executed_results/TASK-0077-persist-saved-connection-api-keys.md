# TASK-0077 - Persist and reuse API keys for saved model connections

Task ID: TASK-0077
Status: PASS

Summary:

Saved connection API keys are encrypted with AES-256-GCM, persisted in connection-owned SQLite rows, safely reused for model discovery and inference, and never returned to the browser.

Repository analysis:

- Connection HTTP routes are in `src/server.ts` and delegate to `ModelConnectionService`.
- Connection persistence is owned by `ModelConnectionRepository` and SQLite migrations.
- Settings connection create/edit behavior is in `src/client/components/settings/SettingsView.ts`.
- Saved connection inference resolution is in `ChatInferenceService`, with provider requests in `src/services/model-inference.ts`.
- The worktree contained substantial pre-existing changes; they were preserved.

Files changed:

- `.env.example`
- `src/client/components/settings/SettingsView.ts`
- `src/client/components/settings/__tests__/SettingsView.test.ts`
- `src/server.ts`
- `src/server/migrations.ts`
- `src/server/model-connection-types.ts`
- `src/server/repositories/model-connection-repository.ts`
- `src/server/services/chat-inference-service.ts`
- `src/server/services/model-connection-service.ts`
- `src/server/services/model-credential-cipher.ts`
- `src/services/model-inference.ts`
- `tests/integration/chat-inference-api.test.ts`
- `tests/integration/model-connections-api.test.ts`
- `tests/unit/chat-settings-service.test.ts`
- `tests/unit/migrations.test.ts`
- `tests/unit/model-connection-credentials.test.ts`
- `docs/executed_tasks/TASK-0077-persist-saved-connection-api-keys.md`
- `docs/executed_results/TASK-0077-persist-saved-connection-api-keys.md`

Tests and verification:

- `npm.cmd run build` - PASS
- `npm.cmd run build:client` - PASS
- `npm.cmd run typecheck:client` - PASS
- `npm.cmd run lint` - PASS
- `npm.cmd test` - PASS, 469 tests passed
- Focused credential, migration, Settings, model inference, connection API, and chat inference tests also passed before the mandatory full run.
- `git diff --check` reported no whitespace errors; it emitted only existing Windows line-ending warnings.

Production code:

- Added lazy validation of `MODEL_CREDENTIAL_ENCRYPTION_KEY` as a canonical 32-byte base64 key.
- Added AES-256-GCM encryption using Node's built-in crypto with random 12-byte IVs and authentication tags.
- Added optional `apiKey` write input and safe `hasApiKey` response metadata.
- Blank API-key updates preserve existing credentials; non-empty updates encrypt and replace them.
- Saved keys are decrypted only in the server-side connection resolution path and passed to the OpenAI-compatible provider transport.
- Provider requests add `Authorization: Bearer <api-key>` only when a saved key exists.
- Settings sends newly entered keys for persistence, never receives stored keys, and clears the input and retained client state after save or selection.

Architecture:

- HTTP validation remains in the controller layer.
- Encryption and credential workflow remain in the application service layer.
- SQL and transactional credential persistence remain in the repository layer.
- Migration `0008_create_model_connection_credentials` owns credentials through a foreign key with `ON DELETE CASCADE`.

Dependencies:

- No dependencies added; encryption uses `node:crypto`.

Deviations:

- None.

Risks / findings:

- Deployments that save or use encrypted credentials must provide the same valid `MODEL_CREDENTIAL_ENCRYPTION_KEY` across restarts.
- Existing connections without credentials remain usable without configuring the encryption key.

Diff summary:

- Added encrypted relational credential persistence and safe connection metadata.
- Connected persisted credentials to model discovery and inference while preserving no-auth behavior.
- Added deterministic persistence, restart, API secrecy, UI, inference header, cascade, configuration failure, and logging coverage.
