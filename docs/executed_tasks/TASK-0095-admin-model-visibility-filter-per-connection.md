# TASK-0095 - Admin model visibility filter per connection

Task ID: TASK-0095
Task slug: admin-model-visibility-filter-per-connection

## Instruction Used

Add an Admin-controlled, server-enforced model visibility policy to every saved Model Connection. The policy applies equally to Admin and normal users, Chat model selection and inference, Agent model selection and run startup, and is the authoritative allowlist for future Agent self-directed model selection. Do not implement self-directed model switching in this task.

Preserve saved OpenAI-compatible connections, credential persistence and encryption, full provider model discovery, connection testing, Chat and Agent selection, credential resolution, and per-connection inference serialization. Preserve the architecture `HTTP -> application/service -> repository -> SQLite/infrastructure` and plain TypeScript/DOM frontend.

Persist optional connection-specific configuration as `filterConfigured: boolean` and `visibleModelIds: string[]`, preferably in the existing typed JSON data. Existing connections with no policy fields must default to no explicit filter, which exposes all currently discovered models. An explicit empty list must remain distinct and expose zero models. Normalize IDs as non-empty, exact provider-reported strings with no ambiguous duplicates. Do not duplicate connection identity in JSON or edit applied migrations; add a new migration only if required.

Only Admin may read full filter-editor data or change the policy. Validate connection existence, strict request shape, boolean mode, array shape, non-empty string IDs, duplicates, and selectable IDs. Permit retained stale IDs where safely practical, but reject arbitrary never-known IDs. Save atomically and return only safe configuration. Never expose API keys, encrypted credentials, authorization headers, encryption metadata, or raw provider payloads.

Create or reuse one central application-facing path that combines full discovered provider models with the persisted policy. Provider discovery and connection tests retain the full discovered set internally; ordinary model-selection APIs receive only effective visible models. Newly discovered models are visible in unfiltered mode and hidden in explicit mode. Missing selected models must not crash; retain them for configuration history when practical and show them as unavailable in Admin UI. Empty discovery yields an empty effective list.

Add minimal Admin model-visibility GET/PUT endpoints consistent with current model-connection routes. The Admin GET may return connection ID, policy fields, and normalized full discovered models. Normal users must be denied both full editor data and policy mutation. Base URL and credentials cannot be changed through this endpoint.

In Admin Settings, add a compact per-connection editor using server-side discovery. Clearly represent `Show all discovered models` for unfiltered mode and reveal a contained, readable checkbox list in explicit mode. Support explicit empty selection, loading, retryable controlled discovery errors, empty discovery, long IDs, save success/failure, and persisted stale unavailable IDs. Do not redesign the page or call providers directly from the browser.

Chat model lists must contain only effective visible models. Any new Chat inference request for a hidden model, including a direct API bypass, must fail with a controlled model-not-allowed error before provider inference and without fallback. Do not rewrite historical Chat metadata.

Agent create/update must verify the selected connection/model against the effective visible set. Agent selectors receive only visible models, while an existing stored hidden selection remains represented as unavailable/hidden rather than rewritten. Agent run startup must reject a newly hidden persisted model before provider inference, with no fallback. Keep `allowModelSelection` persistence-only and do not implement model switching.

Add deterministic persistence/service tests for defaults, explicit and empty policies, duplicate handling, per-connection scope, unchanged credentials, repository reload, discovery/filter semantics, new and missing models, empty discovery, and exact IDs. Add authorization/API tests for Admin access, normal-user denial, unknown connections, malformed requests, and safe DTOs. Add Chat tests for filtered lists, hidden-model rejection/bypass, visible inference, and unchanged history. Add Agent tests for selectors, save/update enforcement, unchanged stored configurations, run rejection before inference, no fallback, and unchanged `allowModelSelection` behavior. Add Admin frontend tests for controls, default and explicit modes, checklist restoration, explicit empty state, loading/errors, containment, authorization visibility, and preserved connection workflows. Use deterministic provider stubs only.

Document the strict execution rule: once hidden, a model is unavailable for new Chat inference and Agent runs, while persisted history/configuration is not rewritten. The same effective-model service is the future Agent self-selection whitelist.

Create `docs/executed_results/TASK-0095-admin-model-visibility-filter-per-connection.md`. Do not read historical task/result files. After every edit, immediately re-read the edited range. Before completion, re-read every changed range and review all invariants, security, architecture, and credentials behavior.

Run and require success from every command in this session:

```text
npm.cmd run build
npm.cmd run build:client
npm.cmd run typecheck:client
npm.cmd run lint
npm.cmd test
```

Report PASS only if all five commands were executed and succeeded. The final response must contain exactly the specified Task ID, status, result path, per-command verification statuses, and one short summary sentence.
