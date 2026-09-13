# TASK-0054 - Persist and optionally display reasoning/tool activity with lazy chat rendering

Task ID: TASK-0054
Task slug: persist-display-reasoning-tool-activity-lazy-chat-rendering

## Instruction

Implement three related improvements without changing inference chronology or reordering/normalizing conversation events:

1. Persist model reasoning and tool activity in the existing file-based chat JSONL history.
2. Add per-user normal Chat Settings controls for showing reasoning and tool activity.
3. Improve long-chat performance by lazily rendering content far outside the viewport.

Run `powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\inspect-repo.ps1` after the required documentation preflight. Inspect only relevant chat store/history types, chat and inference services, provider responses, tool loop, Chat Settings persistence and UI, ChatView, chat CSS, history loading, relevant tests, and required architecture/database/security/testing/coding documentation. Do not read historical executed task/result files or use recursive repository listings.

### Persisted event history

- Keep history file-based and one ordered JSON object per line; do not move it to SQLite.
- Use a runtime-validated TypeScript discriminated union supporting `user`, `assistant`, `reasoning`, `tool_call`, and `tool_result`.
- Use no `any`; fail safely on malformed entries; preserve UTF-8 and exact file order without timestamp sorting.
- Existing user/assistant JSONL must remain readable without destructive migration.
- Persist each event in the exact order created during inference. File order is authoritative even when timestamps collide.
- Persist non-empty provider `reasoning_content` exactly after safe string validation, without executing/interpreting it, fabricating tool calls, or adding it to logs.
- Preserve all relevant response components when content, reasoning, and tool calls coexist, without changing their actual chronology.
- Persist valid structured tool calls in provider order with call ID, tool name, validated arguments, and timestamp.
- Persist matching bounded tool results after execution with call ID, tool name, readable structured result, timestamp, and success/failure state where needed. Preserve existing output bounds and do not persist raw unbounded HTML or stack traces.
- Continue persisting the final assistant response.
- Do not change model/tool execution semantics or reconstruct provider protocol messages incorrectly from UI events.

### Chat settings and API

- Extend existing user-scoped Chat Settings for server-side user ID 1 with `showReasoning` and `showToolCalls`, both defaulting to `false`.
- Persist through the existing Chat Settings repository/service mechanism, not browser-only state or Admin Settings.
- Add clearly labelled `Show model reasoning` and `Show tool calls` controls to Settings -> Chat, loading and saving through the existing API.
- Settings affect presentation only; all activity always persists, and changing settings must reveal already-persisted events without mutating history.
- Keep the existing history route practical and ownership-protected; return the complete ordered event stream, an empty list for missing history, no filesystem paths, and runtime-validated events.

### Rendering and design

- Render visible events in exact persisted chronology.
- Keep current user bubble styling and assistant Markdown rendering/alignment.
- Hide or show reasoning and tool call/result events based solely on the saved settings.
- Render reasoning and tool activity with a dedicated warm light beige/sand surface, dark text, wrapping, rounded corners, and subtle borders, distinct from warnings and normal bubbles.
- Label reasoning clearly and render it as plain text.
- Show concise tool names/arguments and bounded readable results; accessible compact expansion is acceptable, but do not add a component framework.

### Lazy rendering

- Implement a simple project-owned lazy/virtualized ChatView strategy without dependencies or server pagination.
- Keep visible content and a reasonable viewport buffer active; represent far-off heavy content lightly or defer its DOM.
- Preserve exact order, stable scrolling, normal current/new messages, deferred assistant Markdown work, visibility settings, keyboard access, and truthful screen-reader ordering.
- Prefer a simple robust strategy such as IntersectionObserver or `content-visibility: auto` over aggressive virtualization that harms accessibility.

### Lifecycle behavior

- `/clear` must clear every event type from the single history stream.
- Chat deletion must continue deleting the complete single history file without orphan files.

### Tests

Add deterministic tests without LM Studio or external web access covering:

- backward-compatible user/assistant JSONL reads; append/read of reasoning, tool calls, tool results, and final assistant events; exact order including multiple tool calls; malformed entries; UTF-8; and clearing all events
- inference persistence of reasoning, structured calls, matching bounded results, final assistant output, non-executable reasoning, and actual event chronology without sorting
- settings defaults, user scope, saving both booleans, invalid-value rejection, and unchanged connection/model defaults
- frontend hidden/visible and retrospective reasoning/tool activity, sand classes, unchanged user and assistant rendering, persisted DOM order, lazy rendering/deferred far-off content activation, and normal new-message append behavior

Do not add server pagination, context trimming, summaries, editing/deletion/retry UI, streaming, an agent framework, queues, tools, admin settings changes, logging UI, dependencies, or unrelated refactors.

### Verification and tracking

Run:

```text
npm.cmd run build
npm.cmd run build:client
npm.cmd run typecheck:client
npm.cmd run lint
npm.cmd test
```

Create this task record and `docs/executed_results/TASK-0054-persist-display-reasoning-tool-activity-lazy-chat-rendering.md`. Re-read both at the workflow-required stages. The final response must contain only the Task ID, PASS/FAIL/BLOCKED status, result path, and one short summary sentence.
