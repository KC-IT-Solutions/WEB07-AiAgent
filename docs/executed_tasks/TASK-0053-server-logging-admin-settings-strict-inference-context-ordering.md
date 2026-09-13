# TASK-0053 - Server logging, Admin Settings, and strict inference context ordering

Task ID: TASK-0053
Task slug: server-logging-admin-settings-strict-inference-context-ordering

## Instruction

Implement three related improvements:

1. Add dependency-free structured server-side logging with separate application and model-inference JSONL streams under a controlled, non-static server log root. Support ordered `error`, `warn`, `info`, `debug`, and `trace` levels, safe redaction, append behavior, startup clearing of only managed logs, correlation IDs, chronological sequence numbers, diagnostic application events, complete diagnostic provider requests, safe provider responses, and bounded tool execution traces.
2. Add a server-authorized Admin Settings page and navigation item for global SQLite-backed logging settings. User ID 1 is currently admin, but authorization must use an extensible server-side capability boundary. Add a safe current-user capability API and admin-only read/update logging APIs with strict runtime validation. Logging-level changes should apply immediately where practical, and clear-on-startup remains enabled until changed.
3. Enforce strict chronological inference context ordering. Persisted user/final-assistant history remains unchanged. During inference, append each complete provider assistant message at the exact point produced, retain mixed `content`, `reasoning_content`, and `tool_calls` as one event, then append matching tool results, without role grouping, sorting, replacement, or protocol-message persistence.

Inspect only relevant bootstrap, HTTP error handling, inference/provider/tool loop, registry/tools, message store, settings/navigation, persistence/migrations, and tests after running `scripts/inspect-repo.ps1`. Do not inspect historical executed task/result files.

Add deterministic isolated tests for logger filtering, files, append, JSON structure, redaction, startup clearing safety, inference correlation/sequence/tracing/failures, exact one- and multi-tool chronology, mixed assistant messages, matching tool-call IDs, persisted history order, authorization, APIs, global persistence, immediate logger behavior, and admin-only navigation. Automated tests must not use LM Studio, external web access, production logs, or production data.

Use existing architecture and conventions, no unnecessary dependencies or unrelated refactors. Logs must never expose secrets or be statically served. HTTP handlers must not issue SQL. Client errors remain safe and may include a reference ID if compatible.

Run `npm.cmd run build`, `npm.cmd run build:client`, `npm.cmd run typecheck:client`, `npm.cmd run lint`, and `npm.cmd test`. Separately attempt optional local-provider verification with `http://127.0.0.1:1234` and `qwen/qwen3.8-27b` if available, and report the inference/reference ID, stage, round ordering, request observability, tool traceability, and any corruption without recording private reasoning text.

Create the required result file at `docs/executed_results/TASK-0053-server-logging-admin-settings-strict-inference-context-ordering.md`. The final response must contain only the task ID, PASS/FAIL/BLOCKED status, result path, and one short summary sentence.
