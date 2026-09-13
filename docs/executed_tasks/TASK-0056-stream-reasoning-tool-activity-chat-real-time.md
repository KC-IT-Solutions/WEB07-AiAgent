# TASK-0056 - Stream reasoning and tool activity into Chat in real time

Task ID: TASK-0056
Task slug: stream-reasoning-tool-activity-chat-real-time

## Instruction

Introduce a streaming inference path for normal Chat messages, preferably SSE or a streamed HTTP response compatible with the existing Express/client architecture. Do not add WebSockets, dependencies, token-level streaming, new tools, queues, agents, context trimming, pagination, log-viewer work, Admin Settings changes, or unrelated UI redesign.

For one user inference request, stream bounded structured JSON events with typed event names equivalent to `reasoning`, `tool_call`, `tool_result`, `assistant`, `error`, and `done`. Every event must carry a monotonically increasing sequence number scoped to the inference and include the inference/reference ID where practical. Sequence order is authoritative; never regroup or sort events by type or timestamp. Close cleanly after `done` or terminal error.

For persistent event types, construct and validate the event, persist it to existing JSONL history, emit it, and only then continue inference. A persistence failure must prevent emission of that persistent event, terminate safely, and be logged. Keep the existing user-message persistence flow.

Persist and stream non-empty model `reasoning_content` immediately when received, before tool execution or subsequent model rounds. Treat it only as display/history data. Persist and stream each valid structured tool call in provider order before executing it. Persist and stream each bounded tool result immediately when execution completes, including existing safe failure-result behavior. Preserve existing tool semantics, provider chronology, and provider-visible conversation ordering. Persist and stream the final assistant response, then emit `done`.

Reuse user-scoped `showReasoning` and `showToolCalls`. Hidden streamed events must still be persisted and later become visible through existing retrospective rendering. Keep assistant Markdown rendering.

Update `ChatView` to append the user message immediately, consume and validate the stream safely, render valid events incrementally in exact stream order, maintain active-chat race protection, abort stale client requests when practical, prevent stale events from rendering into another chat, block duplicate sends during active inference, and restore controls on terminal completion/error. The thinking indicator starts with inference, always appears after the latest rendered visible event while waiting, is not persisted, and disappears on final response or terminal error.

Streaming failures must expose only a typed safe browser error and preserve detailed server logging with one inference ID across stream start, provider requests/responses, persistence, emission, tools, final response, failure, and completion. Continue existing logging policy by recording reasoning presence rather than private reasoning text. Do not add a third log type.

Keep orchestration reusable and avoid separate diverging streaming/non-streaming tool loops. Preserve compatibility for existing clients/tests where required.

Add deterministic tests without LM Studio or live network access. Cover stream startup, structured JSON, monotonic sequence numbers, exact reasoning/tool/result/assistant/done chronology, provider-order multiple calls, valid follow-up tool-call IDs, multi-round chronology, safe malformed-provider and persistence failures, inference-ID consistency, persistence-before-emission, visibility controls, indicator movement/removal, final Markdown, stale-view isolation, duplicate-send blocking, and regression behavior for existing persistence, commands, tools, model settings, and logging.

Run:

```text
npm.cmd run build
npm.cmd run build:client
npm.cmd run typecheck:client
npm.cmd run lint
npm.cmd test
```

Optionally verify with the local model at `http://127.0.0.1:1234`, model `qwen/qwen3.8-27b`, recording only high-level results and no private reasoning text.

Create this task record and `docs/executed_results/TASK-0056-stream-reasoning-tool-activity-chat-real-time.md`. Do not read historical executed task/result files. The final response must contain only Task ID, PASS/FAIL/BLOCKED status, result path, and one short summary sentence.
