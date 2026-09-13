# TASK-0054 - Persist and optionally display reasoning/tool activity with lazy chat rendering

Task ID: TASK-0054
Status: PASS

Summary:

Implemented ordered typed JSONL chat events, retrospective user display settings, chronological sand-styled activity rendering, and viewport-buffered assistant Markdown rendering.

Repository analysis:

- The existing history boundary was a per-user/per-chat JSONL file store with strict runtime validation for legacy `role`-based user and assistant records.
- The provider response already retained `reasoning_content` and structured tool calls, while the inference service discarded them after each in-memory tool round.
- Chat Settings already used a user-scoped SQLite JSON repository/service and therefore required no schema migration for optional display fields.
- ChatView previously created all assistant Markdown synchronously while loading the complete history.
- The worktree contained extensive pre-existing uncommitted changes in relevant files; those changes were preserved and not reverted.

Files changed:

- `src/server/chat-types.ts`
- `src/server/stores/chat-message-store.ts`
- `src/server/services/chat-inference-service.ts`
- `src/server/chat-settings-types.ts`
- `src/server/repositories/chat-settings-repository.ts`
- `src/server/services/chat-settings-service.ts`
- `src/server.ts`
- `src/client/components/settings/SettingsView.ts`
- `src/client/components/settings/settings.css`
- `src/client/components/chat/ChatView.ts`
- `src/client/components/chat/chat.css`
- `tests/unit/chat-message-store.test.ts`
- `tests/unit/chat-inference-tools.test.ts`
- `tests/unit/chat-settings-service.test.ts`
- `tests/unit/chat-service.test.ts`
- `tests/integration/chats-api.test.ts`
- `tests/integration/chat-inference-api.test.ts`
- `tests/frontend/chat-list-ui.test.ts`
- `src/client/components/chat/__tests__/ChatView.test.ts`
- `src/client/components/settings/__tests__/SettingsView.test.ts`
- `docs/executed_tasks/TASK-0054-persist-display-reasoning-tool-activity-lazy-chat-rendering.md`
- `docs/executed_results/TASK-0054-persist-display-reasoning-tool-activity-lazy-chat-rendering.md`

Tests and verification:

- `powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\inspect-repo.ps1` - PASS.
- `npm.cmd run build` - PASS.
- `npm.cmd run build:client` - PASS; client static assets copied.
- `npm.cmd run typecheck:client` - PASS.
- `npm.cmd run lint` - PASS.
- `npm.cmd test` - PASS: 358 tests, 34 suites, 0 failures.
- `git diff --check` - PASS; only existing Windows line-ending warnings were reported.

Production code:

- Added a `type`-discriminated event union for `user`, `assistant`, `reasoning`, `tool_call`, and `tool_result` records with JSON-safe arguments/results.
- Kept one JSON object per line and exact append/read order; no timestamp sorting or event grouping was introduced.
- Runtime-validates every event and safely maps historical `role`-based user/assistant lines into typed events without a destructive migration.
- Persists non-empty provider reasoning exactly, structured tool calls in provider order, bounded structured success/failure results with matching IDs, and final assistant output.
- Returns newly persisted inference events additively while retaining the existing `message` response field.
- Keeps UI-only reasoning/tool events out of later provider context and excludes tool-call-associated assistant display text from standalone assistant replay.
- Added `showReasoning` and `showToolCalls` to existing user-scoped Chat Settings with false defaults for missing historical values and strict API validation.
- Added normal Chat Settings controls and loads the saved values when rendering complete history, so changing settings reveals previously persisted events.
- Renders reasoning and tool call/result activity at its persisted location using plain-text, accessible sand/beige blocks and bounded expandable tool payloads.
- Uses an IntersectionObserver with an 800px buffer and intrinsic-size shells so far-off assistant Markdown is not eagerly created; current inference events render immediately.
- Existing history deletion continues to remove the single complete file, so `/clear` and chat deletion remove every event type.

Architecture:

- History remains file-based JSONL; no SQLite message storage or server pagination was added.
- Chat Settings remain in the existing repository/service JSON persistence flow.
- In-memory OpenAI-compatible assistant/tool protocol ordering remains unchanged during inference.
- The persisted UI event stream is explicitly projected to the prior user/final-assistant provider context behavior for later requests.

Dependencies:

- No dependencies added or changed.

Deviations:

- None.

Risks / findings:

- Lazy-rendering coverage verifies the project-owned observer mechanism and deferred Markdown path deterministically; no separate browser pixel or scroll-position test was added.
- Existing unrelated and prerequisite worktree changes remain present and were intentionally not modified or reverted beyond the files required by this task.

Diff summary:

- Added backward-compatible typed chat event persistence and inference activity capture.
- Added user display preferences and normal Settings UI controls.
- Added chronological activity rendering, sand styling, and deferred assistant Markdown.
- Updated persistence, inference, API, settings, clear-history, and frontend tests.
