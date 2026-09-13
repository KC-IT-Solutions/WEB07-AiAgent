# TASK-0079 - Add safe diagnostics for connection save/update failures

Task ID: TASK-0079
Task slug: add-connection-save-failure-diagnostics

## Instruction

Add safe server-side structured diagnostics for failures when creating or updating model connections in Settings -> Connections. This is diagnostic only: do not fix or redesign credential persistence unless logging requires a minimal supporting change.

Cover both the POST create route and the update route. Prefer one structured event such as `model_connection_save_failed`. Include safe fields where available: `operation` (`create` or `update`), `connectionId` (number or null), `stage`, `errorCode`, and `errorName`. The event must distinguish validation, credential encryption/configuration, repository/database, and unexpected failures. Reuse existing controlled credential error codes, including missing/invalid encryption-key codes where available, rather than introducing a competing error architecture.

Never log raw request bodies, API keys, authorization headers, decrypted credentials, `MODEL_CREDENTIAL_ENCRYPTION_KEY`, ciphertext, IV, auth tags, full write payloads, or raw error objects that may contain sensitive data. Include a sanitized message only if it cannot contain secret material. Preserve existing client-visible HTTP behavior and do not expose encryption configuration details to the browser. A logging failure must not replace or mask the original connection error and must follow existing logger conventions.

Add deterministic regression coverage that verifies create and update failure events, operation values, safe stage/error code fields, secret redaction, unchanged HTTP failure behavior, and logging-failure isolation where an injectable seam exists. If practical, cover a credential-configuration failure. Do not call external providers.

Do not change credential encryption algorithms, credential schema/migrations, chat inference, model discovery, Settings layout, Markdown, Skills, tools, DuckDuckGo, or event chronology. Add no dependencies and avoid broad refactors.

Follow the repository preflight and task workflow. Run first after preflight: `powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\inspect-repo.ps1`. Read only relevant security, coding, testing, route, service, logger, and test code; do not read historical executed task/result files. Use available tools only, use `grep` for text lookup and `glob` only for filename discovery, prefer narrow reads, re-read every edited range immediately, and do not repeat resolved searches.

Mandatory verification commands, all of which must execute successfully for PASS:

```text
npm.cmd run build
npm.cmd run build:client
npm.cmd run typecheck:client
npm.cmd run lint
npm.cmd test
```

Create this task record and `docs/executed_results/TASK-0079-add-connection-save-failure-diagnostics.md`. Before responding, re-read every changed range, review the complete diff for scope and secret safety, confirm both operations and credential-configuration diagnosis, confirm unchanged HTTP behavior and credential logic, and report the exact required four-line final response.
