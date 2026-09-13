# TASK-0078 — Fix persisted API-key reuse after connection save

Task ID: TASK-0078
Task slug: fix-persisted-connection-api-key-reuse

Run first:

    powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\inspect-repo.ps1

## Reproduction

For a connection that requires an API key:

1. Open Settings → Connections.
2. Enter a valid API key.
3. Test connection.
4. Model discovery succeeds.
5. Save the connection.
6. The API-key input is cleared.
7. Test the same saved connection again without re-entering the key.
8. It now fails.
9. Chat using the same saved connection also fails.

Connections that do not require an API key continue to work.

## Goal

Fix persisted credential reuse so a saved connection automatically uses its stored API key after save.

Both of these must work without the browser resending the secret:

- testing/model discovery for an already-saved connection
- Chat model discovery and inference

Do not change working no-auth connection behavior.

## Tool rules

- Use only tools actually available in this OpenCode session.
- Do NOT call unavailable tools such as `search`, `grepjson`, or `dir`.
- Use `grep` for text lookup.
- Use `glob` only when filename discovery is required.
- Prefer narrow `read` ranges.
- After every edit, immediately re-read the edited range before continuing.
- Do not repeat searches for symbols already located.

## Context discipline

- Stay comfortably below 131072 tokens.
- Read only files required for this bug.
- Do not dump entire large files unless required.
- Do not inspect unrelated features.
- Do not read historical files under:
  - `docs/executed_tasks`
  - `docs/executed_results`
- Stop exploration once the credential flow for save, connection test/model discovery, Chat resolution, and inference is understood.

## Read relevant project rules

Inspect only relevant sections of:

    DATABASE.md
    SECURITY.md
    CODINGSTANDARDS.md
    TESTING.md

Preserve the existing architecture:

    HTTP/Controllers
        → Application/Services
        → Repositories
        → Infrastructure/Database

## Important existing behavior

TASK-0077 introduced:

- encrypted persisted model-connection credentials
- `hasApiKey`
- blank edit preserving the saved key
- server-side credential decryption
- optional Authorization for keyed connections
- no-auth support

Do not redesign this system.

Find the concrete bug in the current implementation.

## Primary investigation

Trace these paths separately.

### A. First Settings test with freshly entered key

Determine why this succeeds.

Identify whether the server is using:

    apiKey from the current request

rather than the persisted credential.

### B. Save connection

Verify that a non-empty API key is actually:

    encrypted
    persisted
    associated with the correct model connection

Verify the returned saved connection reports:

    hasApiKey: true

without exposing the key.

### C. Test an already-saved connection

When the API-key field is blank and the connection already has a persisted credential:

The server must resolve the saved credential itself.

The browser must not need to resend the API key.

### D. Chat model discovery

When Chat requests models for a saved keyed connection:

The server must resolve and use the same saved credential.

### E. Chat inference

Inference for the saved keyed connection must resolve and use the same saved credential.

## Required behavior

For an existing saved connection with `hasApiKey=true`:

    blank browser API-key input
        → preserve stored credential
        → server resolves credential
        → provider receives saved API key

This must hold for both:

    connection/model test
    Chat usage

## Do not expose secrets

Do not return the stored API key to the client.

Do not populate the Settings input with it.

Do not log:

- API key
- Authorization header
- decrypted credential
- encryption key
- ciphertext
- IV
- auth tag

## No-auth invariant

For a connection without a saved credential:

    no Authorization credential is sent

Do not make API keys mandatory.

Do not regress local no-auth OpenAI-compatible connections.

## Likely bug class

Do not assume the cause, but specifically inspect for mismatches such as:

- Settings test endpoint only using `request.body.apiKey`
- saved connection ID not passed into credential resolution
- model-discovery path bypassing `ModelConnectionService`
- Chat model loading using raw connection data instead of resolved connection credentials
- inference and discovery using different connection-resolution code
- `hasApiKey` metadata existing but not triggering server-side credential lookup
- credential saved under the wrong connection ID
- blank API-key normalization accidentally overriding resolved credentials

Fix the actual root cause, not a symptom.

## Preferred architecture

Where practical, use one server-side credential-resolution path for a saved connection.

Conceptually:

    saved connection
        → resolve persisted credential if present
        → construct provider connection
        → model discovery / inference

Do not duplicate decryption logic across controllers.

Do not move credential logic into the client.

## Settings behavior

After Save:

- API-key input remains blank
- `hasApiKey=true` may indicate a stored key
- Test connection must still work without re-entering the key

If the user enters a new non-empty key before testing:

- that newly entered key may be used for the test
- if saved, it replaces the stored credential

A blank field must never mean "forget the stored key".

## Tests

Use deterministic tests only.

Do NOT call:

- LM Studio
- Unsloth
- OpenAI
- external APIs

Add regression coverage for the exact bug.

At minimum cover:

1. Create/save connection with API key.
2. Confirm persisted credential exists.
3. Confirm API response does not expose the key.
4. Confirm `hasApiKey=true`.
5. Simulate a later connection-test/model-discovery request with no API key supplied by the browser.
6. Verify the provider receives the persisted API key.
7. Simulate Chat model discovery for the saved connection.
8. Verify the provider receives the persisted API key.
9. Simulate Chat inference for the saved connection.
10. Verify the provider receives the persisted API key.
11. Verify blank edit preserves the key.
12. Verify replacing the key changes what later discovery/inference receives.
13. Verify a no-auth connection sends no API key.
14. Verify secrets do not appear in API responses or structured logs.

Reuse existing fixtures/stubs.

Do not add real external calls.

## Root-cause requirement

The result file must explicitly state:

- why the first Settings test worked
- why the later saved-connection test failed
- why Chat failed
- which server-side path was corrected

Do not report only "credential reuse fixed".

## No unrelated changes

Do not change:

- Markdown
- Chat UI styling
- Skills
- DuckDuckGo
- tool protocol
- event chronology
- agent framework
- unrelated migrations
- unrelated Settings behavior

Do not add dependencies.

## Mandatory verification

Run every command:

    npm.cmd run build
    npm.cmd run build:client
    npm.cmd run typecheck:client
    npm.cmd run lint
    npm.cmd test

PASS RULE:

You may report PASS only if every command above was actually executed in this session and completed successfully.

Do not infer success.
Do not claim a command passed unless you ran it and observed success.

If any required command was skipped, failed, or could not be executed, do not report PASS.

## Final self-check

Before responding:

1. Re-read every changed range.
2. Check for duplicated lines, malformed syntax, indentation damage, and unrelated edits.
3. Confirm persisted keyed connections work without browser-resupplied secrets.
4. Confirm connection test/model discovery uses saved credentials.
5. Confirm Chat model discovery uses saved credentials.
6. Confirm Chat inference uses saved credentials.
7. Confirm no-auth connections still work.
8. Confirm no secret is returned or logged.
9. Confirm no unnecessary migration was added.
10. Confirm all mandatory verification commands passed.

## Tracking

Create:

    docs/executed_tasks/TASK-0078-fix-persisted-connection-api-key-reuse.md

and:

    docs/executed_results/TASK-0078-fix-persisted-connection-api-key-reuse.md

Do not read historical executed task/result files.

## Final response exactly

    Task ID: TASK-0078
    Status: <PASS|FAIL|BLOCKED>
    Result: docs/executed_results/TASK-0078-fix-persisted-connection-api-key-reuse.md
    Verification: build=<PASS|FAIL|NOT RUN>, build:client=<PASS|FAIL|NOT RUN>, typecheck:client=<PASS|FAIL|NOT RUN>, lint=<PASS|FAIL|NOT RUN>, test=<PASS|FAIL|NOT RUN>
    Summary: <one short sentence>
