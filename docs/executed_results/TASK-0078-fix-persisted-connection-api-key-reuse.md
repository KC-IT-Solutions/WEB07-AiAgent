# TASK-0078 — Fix persisted API-key reuse after connection save

Task ID: TASK-0078
Status: PASS

Summary:

Saved Settings tests now identify the connection so the server can reuse its encrypted API key, while Chat discovery and inference continue through the same credential-aware service and no-auth requests remain unauthenticated.

Repository analysis:

- The first Settings test worked because `POST /api/model-connections/test` passed `request.body.apiKey` directly to the provider request.
- Save already trimmed, encrypted, and transactionally persisted a non-empty key under the newly created model-connection ID. Returned create, get, list, and update representations exposed only `hasApiKey: true`, not the key.
- The later saved-connection Settings test failed because the API-key input was intentionally cleared and the browser posted an empty `apiKey` without the saved connection ID. The test endpoint therefore had no way to resolve the persisted credential.
- In the inspected current tree, Chat model discovery and inference were already credential-aware: both reached `ModelConnectionService.getConnectionForInference`, which loads the owned connection, reads its credential, and decrypts it server-side. The reported Chat failure was not reproducible in those server paths; deterministic provider-capture tests confirm both receive the saved key. The stale inference-timeout test also demonstrated that Chat now resolves through `getConnectionForInference`, not `getConnectionById`.
- The corrected server-side path is `POST /api/model-connections/test` to `ModelConnectionService.testConnection` to `getConnectionForInference` when the request key is blank. A non-empty request key remains an unsaved test override.
- Saved discovery (`GET /api/model-connections/:id/models`) and Chat inference continue to use `getConnectionForInference`, so persisted decryption remains centralized in the service rather than controllers.

Files changed:

- `src/client/components/settings/SettingsView.ts`
- `src/client/components/settings/__tests__/SettingsView.test.ts`
- `src/server.ts`
- `src/server/services/model-connection-service.ts`
- `tests/integration/model-connections-api.test.ts`
- `tests/integration/chat-inference-api.test.ts`
- `tests/unit/chat-inference-tools.test.ts`
- `docs/executed_tasks/TASK-0078-fix-persisted-connection-api-key-reuse.md`
- `docs/executed_results/TASK-0078-fix-persisted-connection-api-key-reuse.md`

Tests and verification:

- `powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\inspect-repo.ps1` — PASS.
- `npm.cmd run build` — PASS on the final tree.
- `npm.cmd run build:client` — PASS on the final tree.
- `npm.cmd run typecheck:client` — PASS on the final tree.
- `npm.cmd run lint` — PASS on the final tree.
- `npm.cmd test` — PASS on the final tree: 470 passed, 0 failed.
- An earlier full test run found one stale timeout test patching `getConnectionById` after Chat moved to credential-aware `getConnectionForInference`; the test was corrected to patch the active resolver, then all mandatory commands were rerun successfully.
- `git diff --check` — PASS; only existing line-ending warnings were emitted.

Production code:

- Settings includes the selected saved connection ID only as a credential lookup reference; it never receives or resends the stored secret.
- The test endpoint validates the optional connection ID and delegates provider testing to `ModelConnectionService`.
- The service prefers a newly entered non-empty key, otherwise resolves the saved key for the owned connection, and sends no key when no credential exists.

Architecture:

- HTTP validation remains in `src/server.ts`.
- Credential selection and decryption remain in `ModelConnectionService`.
- Credential lookup remains in `ModelConnectionRepository`.
- Provider transport receives only the resolved optional key.

Dependencies:

- None added.

Deviations:

- None. No external provider was called; tests used local deterministic HTTP stubs.

Risks / findings:

- The repository was already heavily dirty with TASK-0077 and unrelated work. Those pre-existing changes were preserved.
- No migration was added.
- API keys, authorization headers, decrypted credentials, encryption material, and encrypted fields are not returned or logged.

Diff summary:

- Added saved-connection identification to Settings tests.
- Added service-side fallback from blank request key to persisted credential.
- Added regression coverage for initial request keys, saved Settings tests, Chat model discovery, Chat inference, blank preservation, replacement, no-auth behavior, response secrecy, and structured-log secrecy.
