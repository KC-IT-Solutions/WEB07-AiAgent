# TASK-0056 - Stream reasoning and tool activity into Chat in real time

Task ID: TASK-0056
Status: PASS

## Summary

Chat inference now streams persisted reasoning, tool calls, tool results, and assistant events as validated chronological NDJSON records, followed by a terminal `done` event.

## Repository analysis

The existing `ChatInferenceService` already owned provider chronology, JSONL persistence, and the sequential tool loop. The implementation adds one optional awaited event sink to that orchestration rather than creating a second inference path. The existing non-stream endpoint remains compatible and uses the same service.

`ChatView` already had shared persisted-event rendering and user-scoped visibility settings. The streaming client reuses that renderer, so `showReasoning` and `showToolCalls` affect presentation only while server history remains authoritative.

The worktree contained extensive pre-existing changes from earlier tasks. They were preserved and not reverted. Historical executed task/result files were not read.

## Files changed

- `src/server/services/chat-inference-service.ts`
- `src/server.ts`
- `src/client/components/chat/ChatView.ts`
- `src/client/components/chat/__tests__/ChatView.test.ts`
- `tests/frontend/chat-list-ui.test.ts`
- `tests/integration/chat-inference-api.test.ts`
- `tests/unit/chat-inference-tools.test.ts`
- `docs/executed_tasks/TASK-0056-stream-reasoning-tool-activity-chat-real-time.md`
- `docs/executed_results/TASK-0056-stream-reasoning-tool-activity-chat-real-time.md`

## Tests and verification

- `npm.cmd run build`: PASS
- `npm.cmd run build:client`: PASS
- `npm.cmd run typecheck:client`: PASS
- `npm.cmd run lint`: PASS
- `npm.cmd test`: PASS, 368 tests passed
- `git diff --check -- <TASK-0056 files>`: PASS; only existing Windows line-ending notices were reported
- Local model availability check at `http://127.0.0.1:1234/v1/models`: PASS; `qwen/qwen3.8-27b` was available
- Interactive visual verification: not run because no interactive browser session was available

An initial full test run had one test-only false positive because it searched the entire random inference ID for the malformed fixture value `42`. The assertion was narrowed to the typed public error fields, and the complete suite then passed. No production behavior changed for that correction.

## Production code

The new `POST /api/chats/:id/inference/stream` endpoint returns `application/x-ndjson` and emits structured `reasoning`, `tool_call`, `tool_result`, `assistant`, `error`, and `done` records. Every record has a strictly increasing inference-local sequence and one shared inference ID.

Persistent events are validated by existing storage boundaries, appended to JSONL, logged without reasoning content, and only then passed to the stream sink. Persistence failures terminate with a controlled safe error and do not emit the failed event.

Tool-call batches are validated before emission, retain provider order, reject duplicate call IDs, and preserve the existing assistant-tool-result provider conversation. Tool execution remains sequential as before, with each result emitted immediately after completion.

The client validates event shape, content type, size, exact sequence continuity, inference-ID consistency, and terminal `final assistant -> done` chronology. It incrementally renders visible events before the current thinking indicator, removes the indicator on final/error/done, blocks duplicate sends, and aborts stale disconnected views with `AbortController` while preventing stale rendering.

## Architecture

HTTP streaming remains in the Express route, inference orchestration remains in `ChatInferenceService`, and persistence remains behind `ChatService` and the existing JSONL message store. No WebSocket, state framework, queue, or new architectural layer was introduced.

## Dependencies

No dependencies were added.

## Deviations

Token-level streaming, WebSockets, provider chronology changes, tool semantic changes, and unrelated UI changes were not introduced. Interactive manual UI verification was not performed; deterministic service, API, client-parser, and regression tests cover the required behavior.

## Risks / findings

Client cancellation stops stale browser consumption; consistent with the task allowance, server inference may continue after disconnect so already-started authoritative persistence is not corrupted. A user who leaves and later reopens a chat can see events persisted while away.

Model/application diagnostic logging behavior from TASK-0053 was preserved. New stream correlation records log event type, sequence, inference ID, chat ID, and tool identifiers without logging private reasoning text.

## Diff summary

Added one reusable inference event sink, one NDJSON transport route, incremental validated Chat rendering, strict terminal chronology checks, stale-view cancellation, stream/persistence correlation logging, and deterministic chronology/error/visibility regression coverage.
