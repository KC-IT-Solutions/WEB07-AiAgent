# TASK-0051 - Website content tool call and chat alignment polish

Task ID: TASK-0051
Task slug: website-content-tool-call-chat-alignment-polish

## Instruction

Implement the second registered model tool, `visit_website`, using the existing tool architecture and per-user settings pattern. The server-side tool must accept a required `url` and an optional, bounded `findInPage` string array; validate all model-generated arguments at runtime without `any`; permit only HTTP/HTTPS; issue a controlled GET with timeout; reject non-OK responses; safely extract normalized title, headings, bounded text, unique bounded absolute HTTP/HTTPS links, and bounded images; and prefer targeted snippets when requested. Use `visitWebsite(1).js` only as a behavioral reference, add no browser automation or live-network test dependency, and keep all fetching server-side.

Extend the existing UserId 1 tool-settings persistence, API, registry, Settings tools list, and reusable modal for Visit Website. Persist `enabledForChat` (default false), `contentLimit` (default 2000, integer 200..10000), `maxLinks` (default 10, integer 0..40), and `maxImages` (default 5, integer 0..20). Reject unknown tools. Expose `visit_website` to the OpenAI-compatible provider only when enabled, alongside DuckDuckGo when both are enabled. Resolve and execute it through the existing bounded tool-call loop, append internal tool messages only to the in-memory provider conversation, preserve the client inference contract, persist only the final assistant message, and keep the current user message exactly once.

Polish chat alignment without redesigning it: retain the centered assistant-content column, align the thinking bubble's left edge to that column while preserving its separate appearance and animation, and align the compact rounded light-blue user bubble's right edge to the same column's right boundary while retaining content-driven bounded width and plain-text rendering.

Add deterministic injected/mocked tests for URL and settings validation, fetch failures/timeouts, extraction and bounds, settings persistence/API/UI modal behavior, conditional and combined model exposure, execution-loop behavior and history persistence, and focused chat alignment styling. Do not use live network access or LM Studio.

Inspect only the relevant files identified in the task after running `powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\inspect-repo.ps1`; do not recursively list the repository or read historical executed task/result files. Follow ARCHITECTURE.md, DATABASE.md, SECURITY.md, TESTING.md, CODINGSTANDARDS.md, DEFINITION_OF_DONE.md, TASK_WORKFLOW.md, and AGENTS.md.

Run `npm.cmd run build`, `npm.cmd run build:client`, `npm.cmd run typecheck:client`, `npm.cmd run lint`, and `npm.cmd test`. Create the corresponding executed result report and return only the requested four-line final response.

## Acceptance

- Both chat alignment refinements meet the shared centered-column requirements without changing message behavior or appearance.
- `visit_website` is a validated, registered, bounded server-side webpage reader supporting only HTTP/HTTPS GET requests.
- Visit Website settings are persisted for UserId 1 and editable through the existing API and modal pattern.
- Conditional model exposure and the existing multi-round tool loop work for Visit Website and DuckDuckGo together.
- JSONL remains limited to user and final assistant messages.
- Deterministic tests and all required verification commands pass with no unrelated changes.
