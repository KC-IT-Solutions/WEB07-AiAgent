# TASK-0049 - Empty initial main view and persisted inference context

Task ID: TASK-0049
Status: PASS

Summary:

The initial main area now remains empty until explicit navigation, and saved chat history is supplied to model inference in chronological order without changing the client contract or storage format.

Repository analysis:

The layout already tracked a nullable active view but rendered Chat immediately. Chat message persistence already used an ownership-scoped `ChatService` and serialized JSONL `ChatMessageStore`; inference persisted the current user and successful assistant messages but sent only the current string to the provider.

Files changed:

- `src/client/components/layout.ts`
- `src/server/services/chat-inference-service.ts`
- `src/services/model-inference.ts`
- `tests/frontend/chat-list-ui.test.ts`
- `tests/integration/chat-inference-api.test.ts`
- `docs/executed_tasks/TASK-0049-empty-initial-main-view-persisted-inference-context.md`
- `docs/executed_results/TASK-0049-empty-initial-main-view-persisted-inference-context.md`

Tests and verification:

- `npm.cmd run build` - PASS
- `npm.cmd run build:client` - PASS
- `npm.cmd run typecheck:client` - PASS
- `npm.cmd run lint` - PASS
- `npm.cmd test` - PASS, 288 tests passed and 0 failed
- `git diff --check` - PASS, with existing Windows line-ending warnings only

Production code:

The nullable layout state now clears and leaves the main region unmounted until Chat, Settings, New chat, or a saved chat is explicitly selected. Inference loads complete owned-chat history before appending the current user message, builds a user/assistant provider array with the current message exactly once, and preserves successful assistant persistence and the `{ message }` response.

Architecture:

Ownership and persistence remain behind `ChatService` and `ChatMessageStore`. The application-facing model inference function now accepts provider-neutral user/assistant messages while retaining OpenAI-compatible transport details inside the existing provider module.

Dependencies:

No dependencies were added or changed.

Deviations:

None.

Risks / findings:

The worktree contained pre-existing uncommitted changes in related TASK-0047/TASK-0048 files before this task began. They were preserved and not reverted; TASK-0049 was implemented against that baseline.

Diff summary:

Added explicit empty-view rendering, widened inference input from one string to a chronological message array, loaded persisted history before append/provider invocation, and added focused frontend and deterministic HTTP-stub regression coverage including malformed history.
