# TASK-0049 - Empty initial main view and persisted inference context

Task ID: TASK-0049
Task slug: empty-initial-main-view-persisted-inference-context

## Instruction Used

Implement two related behaviors:

1. On full page load, leave the main content area visually empty with no active navigation item and without mounting Chat, Settings, a composer, a placeholder, or a default Chat title. Preserve the visible sidebar, its collapsed Chat section, expand/collapse behavior, chat list, New chat, Settings, SVG icons, accessibility behavior, and active styling after an explicit selection. Explicit selection of Chat, Settings, a saved chat, or New chat must mount and activate the corresponding view; saved-chat and New-chat selection activate Chat. Do not add a default route or filler view.
2. For `POST /api/chats/:id/inference`, keep the client request as `{ "message": "current user message" }`, validate ownership/model/message through existing behavior, load the chat's complete persisted JSONL user/assistant history before appending the accepted current user message, persist that message through the existing flow, send the provider an OpenAI-compatible chronological messages array containing previous history plus the current user message exactly once, persist only successful assistant responses, and preserve the existing `{ message }` response. Do not change history storage.

Malformed persisted history must prevent model invocation and return a controlled safe server error. Inference failure may leave the accepted user message persisted but must not persist an assistant/error message or retry. Do not add context trimming, summarization, system prompts unless already required, new roles, streaming, tools, agents, queues, attachments, exports, message editing/deletion, database message storage, migrations, authentication changes, dependencies, or unrelated refactors. Keep provider-specific behavior behind the existing abstraction and retain per-file serialization.

Add focused deterministic frontend and backend tests covering the stated initial navigation/mounting behavior, preserved sidebar behavior, complete ordered user/assistant context, one occurrence of the current message, malformed-history failure without provider invocation, persistence success/failure behavior, ownership, request/response contracts, and the existing deterministic OpenAI-compatible HTTP stub without LM Studio.

Run:

```text
npm.cmd run build
npm.cmd run build:client
npm.cmd run typecheck:client
npm.cmd run lint
npm.cmd test
```

Create and report:

- `docs/executed_tasks/TASK-0049-empty-initial-main-view-persisted-inference-context.md`
- `docs/executed_results/TASK-0049-empty-initial-main-view-persisted-inference-context.md`

Do not read historical task/result files. The final response must contain only Task ID, PASS/FAIL/BLOCKED status, result path, and one short summary sentence.
