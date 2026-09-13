# TASK-0061 - Chat Skill commands and strict slash routing

Task ID: TASK-0061
Task slug: chat-skill-commands-strict-slash-routing

## Instruction

Implement Chat-side Skill activation and strict slash-command handling, plus fix the Skill editor modal overflow.

Required behavior:

- Add `chat_skills` persistence through a new migration, with relational `chat_id` and `skill_id` foreign keys, lifecycle timestamps, valid JSON `data`, a unique `(chat_id, skill_id)` constraint, and intentional cascade deletion from either parent.
- Add a focused repository abstraction owning SQL, mapping, relationship persistence, and race-safe toggle behavior.
- Authorize all Chat Skill operations using the existing server-side Chat ownership pattern and fixed server-side user ID behavior.
- Treat every Chat input whose trimmed content begins with `/` as a local command enforced server-side. Slash commands must never start inference, call a model provider, execute tools, or persist as normal Chat history messages.
- Preserve `/clear` and `/new` behavior.
- Add `/skills`, listing active Skills for the current Chat in deterministic activation order (`created_at`, then stable ID), or `No skills active in this chat.` when empty.
- Resolve `/<skill-command>` dynamically through existing Skill persistence/service state using stored `command_name`, with built-ins `clear`, `new`, and `skills` taking precedence. Toggle the Chat-Skill relationship and return a local enabled/disabled result.
- Return a controlled local `Command not found: /<command>` result for unknown slash commands.
- Use a typed local command response protocol distinguishable from provider inference responses, without a new transport framework.
- Update Chat UI so slash commands use only the local command path, show local results without model reasoning/thinking/streaming, and normal messages still use inference.
- Keep slash commands out of normal JSONL Chat history. Persist active state only in `chat_skills`.
- Do not inject Skill Markdown into model context and do not modify inference tool availability.
- Fix Create/Edit Skill modal overflow using component-scoped width, max-width, and box-sizing constraints while preserving narrow viewport usability and existing design.

Testing requirements:

- Use isolated temporary SQLite databases to cover migration structure, foreign keys, uniqueness, cascades, add/remove/list, deterministic activation order, and duplicate activation.
- Add deterministic service/API tests for `/clear`, `/new`, `/skills`, valid Skill toggles, unknown commands, no provider/inference/tool/history effects for slash commands, persisted toggle state, and `/skills` ordering/content.
- Protect normal inference behavior for ordinary messages and text containing a slash.
- Add deterministic frontend tests for local slash routing/results, no inference stream, normal inference, modal containment, and no React/JSX.

Constraints:

- Follow `DATABASE.md`, `ARCHITECTURE.md`, `TESTING.md`, `SECURITY.md`, and `CODINGSTANDARDS.md`.
- Do not modify existing migrations or add speculative indexes/dependencies.
- Do not hardcode Skill commands or trust client-supplied user IDs.
- Do not change provider chronology, model-only tool execution, recoverable tool failures, reasoning persistence, inference streaming, OpenAI-compatible transport, model timeout handling, Chat JSONL format, Skill Markdown storage, admin Skill CRUD, or registered tool settings.
- Do not implement effective Skill tools, Skill context injection, Skill execution, ordering, parameters, autocomplete, suggestions, or unrelated refactors.
- Do not read historical executed task/result files.

Verification commands:

```text
npm.cmd run build
npm.cmd run build:client
npm.cmd run typecheck:client
npm.cmd run lint
npm.cmd test
```

Acceptance requires every slash-prefixed input to be handled locally, valid Skill toggles and `/skills` persistence to work, cascades to prevent orphan relationships, existing built-ins and normal inference to remain correct, modal overflow to be fixed, all verification to pass, and no unrelated changes.

Create `docs/executed_results/TASK-0061-chat-skill-commands-strict-slash-routing.md` and return only the requested four-line final response.
