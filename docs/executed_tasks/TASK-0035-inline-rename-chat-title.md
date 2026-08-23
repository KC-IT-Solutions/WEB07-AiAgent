# TASK-0035 - Inline rename chat title

Task ID: TASK-0035
Task slug: inline-rename-chat-title

## Instruction

Replace the native rename prompt with inline editing of the existing chat title in the sidebar. This is a client-only UX change.

When Rename is chosen from a chat's actions menu, close the menu and replace that row's visible title with a compact, aligned text input prefilled with the current title and focused immediately. Only one chat may be in rename mode. Editing must not select or change another chat, and other rows must remain usable.

Save on blur or Enter through the existing `PUT /api/chats/:id`, trimming surrounding whitespace. Prevent duplicate requests, including Enter followed by blur. On success, update local chat state, the sidebar title, and the active ChatView title without a reload. On failure, retain the persisted title, leave edit mode, and use the existing minimal client error state.

Escape cancels without a PUT, restores the original title, exits edit mode, and returns focus to the row or actions trigger where practical. Empty or whitespace-only titles are invalid and must exit edit mode without a PUT.

Do not use a native prompt. Preserve the backend API, ChatService, ChatRepository, database schema, migrations, Delete behavior, model selection, chat creation, and UserId behavior. Add no backend changes, API changes, custom modal, message persistence, inference, streaming, dependency, or unrelated refactor.

Add or update focused deterministic frontend tests covering removal of native prompt, inline mode and prefilled title, blur and Enter saves, Enter/blur request deduplication, Escape cancellation, invalid title rejection, sidebar and active-title updates, menu closure, and single-row edit mode.

Run:

```text
npm run build
npm run build:client
npm run typecheck:client
npm run lint
npm test
```

Create `docs/executed_results/TASK-0035-inline-rename-chat-title.md` and report the required terminal outcome.
