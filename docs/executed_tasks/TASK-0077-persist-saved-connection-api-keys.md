# TASK-0077 - Persist and reuse API keys for saved model connections

Task ID: TASK-0077
Task slug: persist-saved-connection-api-keys

## Instruction

Persist and automatically reuse optional API keys entered under Settings -> Connections for saved model connections. Credentials must survive server restarts, remain optional for no-auth OpenAI-compatible endpoints, and never be returned to the browser.

Editing semantics:

- A new non-empty API key replaces the saved credential.
- A blank API-key field preserves an existing credential.
- No credential deletion UX is added.
- Existing connections without credentials remain valid.

Persistence and security requirements:

- Persist credentials server-side in a new relationally owned structure, not in connection `data` JSON, chat history, logs, or API responses.
- Use a new migration and do not modify applied migrations.
- Use Node's built-in crypto with AES-256-GCM.
- Read and validate a 32-byte base64 master key from `MODEL_CREDENTIAL_ENCRYPTION_KEY`.
- Never store the master key in SQLite.
- Store only encrypted credential material required for decryption.
- Delete credentials with their owning model connection and leave no orphans.
- Missing or invalid encryption configuration must fail safely when encrypted credential operations are required.

Inference requirements:

- Resolve and decrypt the saved connection credential server-side when inference resolves a connection.
- Pass the credential through the existing OpenAI-compatible provider/client API-key mechanism.
- Send `Authorization: Bearer <api-key>` only when a credential exists.
- Preserve unauthenticated inference when no credential exists.
- Keep the implementation provider-neutral.

API and UI requirements:

- Never send a saved or decrypted API key to the browser.
- Existing-connection API-key inputs remain blank.
- A safe `hasApiKey` indicator may be exposed.
- Creating with a key, editing without losing a key, replacing a key, and preserving all other settings must work without redesigning Settings.

Logging requirements:

- Never log API keys, Authorization headers, decrypted credentials, the master key, ciphertext, IVs, or authentication tags.
- Preserve request redaction and ensure errors do not contain secret values.

Deterministic test coverage must include:

1. Saving a non-empty key persists an encrypted credential.
2. Plaintext is absent from connection JSON and credential database fields.
3. Stored material decrypts to the original key.
4. Re-instantiated repository/service instances resolve the same credential, equivalent to a server restart.
5. Blank edits preserve credentials and non-empty edits replace them.
6. API responses never expose the key and any `hasApiKey` indicator is correct.
7. Keyed inference passes the resolved key to the provider; unkeyed inference remains no-auth.
8. Deleting a connection deletes its credential.
9. Existing uncredentialed connections remain compatible.
10. Missing or invalid encryption configuration fails safely when credential operations require it.
11. Tested structured logs do not contain secret values.
12. Settings UI regressions are covered for create, edit-blank, replacement, blank display, and unchanged non-secret settings.

Do not call external model providers. Do not change unrelated chat chronology, skills, tools, DuckDuckGo, Markdown rendering, the agent framework, unrelated Settings UI, or unrelated database structures. Preserve the HTTP/controller -> application/service -> repository -> database architecture and do not put SQL or credential handling directly in controllers or client code.

Create this task record and `docs/executed_results/TASK-0077-persist-saved-connection-api-keys.md`. Do not read historical executed task/result files.

Run and observe all mandatory verification commands:

```text
npm.cmd run build
npm.cmd run build:client
npm.cmd run typecheck:client
npm.cmd run lint
npm.cmd test
```

Report PASS only if every mandatory command executes successfully. Before responding, re-read all changed ranges, review the complete diff, verify security and behavior requirements, confirm the migration is new, and re-read the result file.

The final response must be exactly:

```text
Task ID: TASK-0077
Status: <PASS|FAIL|BLOCKED>
Result: docs/executed_results/TASK-0077-persist-saved-connection-api-keys.md
Verification: build=<PASS|FAIL|NOT RUN>, build:client=<PASS|FAIL|NOT RUN>, typecheck:client=<PASS|FAIL|NOT RUN>, lint=<PASS|FAIL|NOT RUN>, test=<PASS|FAIL|NOT RUN>
Summary: <one short sentence>
```
