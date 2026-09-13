# TASK-0061 - Chat Skill commands and strict slash routing

Task ID: TASK-0061
Status: PASS

Summary:

Implemented persistent Chat Skill toggles, strict server-side slash routing with typed local results, `/skills`, unknown-command handling, and the Skill editor modal containment fix.

Repository analysis:

- The Chat client previously intercepted only exact `/clear` and `/new` inputs; all other messages used the inference stream endpoint.
- Both JSON and stream inference routes previously accepted any non-empty message and invoked `ChatInferenceService`.
- Chat ownership is enforced by `ChatService` through fixed server-side UserId 1 repository calls.
- Skills already persisted command names relationally and exposed CRUD through `SkillService`; Skill Markdown remains filesystem-backed.
- Existing migrations use ordered SQL entries, SQLite foreign-key enforcement, lifecycle timestamps, and JSON validity checks.
- The Skill editor reused settings controls whose sizing was not constrained to the modal content box.

Files changed:

- `docs/executed_tasks/TASK-0061-chat-skill-commands-strict-slash-routing.md`
- `docs/executed_results/TASK-0061-chat-skill-commands-strict-slash-routing.md`
- `src/server/migrations.ts`
- `src/server/chat-types.ts`
- `src/server/skill-types.ts`
- `src/server/repositories/chat-skill-repository.ts`
- `src/server/repositories/skill-repository.ts`
- `src/server/services/chat-command-service.ts`
- `src/server/services/skill-service.ts`
- `src/server.ts`
- `src/client/components/chat/ChatView.ts`
- `src/client/components/chat/chat.css`
- `src/client/components/chat/__tests__/ChatView.test.ts`
- `src/client/components/skills/skills.css`
- `tests/unit/migrations.test.ts`
- `tests/unit/chat-skill-repository.test.ts`
- `tests/unit/chat-command-service.test.ts`
- `tests/integration/chat-inference-api.test.ts`
- `tests/frontend/skills-ui.test.ts`

Tests and verification:

- `powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\inspect-repo.ps1` - PASS.
- `npm.cmd run build` - PASS.
- `npm.cmd run build:client` - PASS.
- `npm.cmd run typecheck:client` - PASS.
- `npm.cmd run lint` - PASS.
- `npm.cmd test` - PASS, 413 tests passed, 0 failed.
- `git diff --check` - PASS; Git emitted only existing LF-to-CRLF working-copy warnings.
- Added isolated SQLite coverage for migration integrity, uniqueness, foreign keys, both cascade directions, repository add/remove/list/toggle behavior, duplicate prevention, and deterministic activation order.
- Added command-service and HTTP coverage for `/clear`, `/new`, `/skills`, Skill enable/disable, unknown commands, ownership, persistence, no model requests, no command history writes, stream endpoint guarding, and ordinary text containing `/`.
- Added client coverage for strict slash detection, typed result validation, command endpoint routing before inference UI, local result rendering, no command thinking indicator, modal sizing constraints, and continued non-React DOM implementation.

Production code:

- Added migration `0007_create_chat_skills` with relational parent IDs, lifecycle metadata, valid JSON, uniqueness, and `ON DELETE CASCADE` for Chat and Skill ownership.
- Added `ChatSkillRepository` with parameterized SQL and transaction-backed toggle behavior.
- Added `ChatCommandService`, which verifies Chat ownership before built-ins, listing, dynamic Skill lookup, or relationship changes.
- Added `POST /api/chats/:id/commands` and guards in both inference endpoints before inference setup or stream headers.
- Updated Chat UI to send every trimmed slash-prefixed input to the typed local command endpoint and reserve streaming/thinking UI for normal inference.
- Added contained, plain-text local command result styling.
- Constrained Skill editor groups, controls, textarea, and fieldset to the modal content width with narrow-view behavior retained.

Architecture:

- HTTP routes validate and map responses, `ChatCommandService` owns command workflows, repositories own SQL, and existing services provide Chat authorization and Skill command lookup.
- Dynamic command lookup uses persisted `command_name`; built-ins retain precedence.
- No Skill Markdown is read for Chat command lookup or inference.
- No Skill-required tools are added to inference availability.
- Provider chronology, tool execution behavior, JSONL history format, and streaming protocol for normal inference are unchanged.

Dependencies:

- No dependencies added or changed for this task.

Deviations:

- Active Skill lines use ` - ` as the separator rather than a Unicode dash; behavior and deterministic order match the specified concept.
- `/new` is validated through the server command endpoint and then reuses the existing client Chat creation callback, preserving existing Chat-list state management.

Risks / findings:

- The worktree contained substantial pre-existing modified and untracked files from earlier tasks. They were not reverted or otherwise changed outside files required by TASK-0061.
- No remaining acceptance blocker was found.

Diff summary:

- Added one migration, one repository, one command service, typed command results, strict inference-route guards, Chat local-command UI behavior, modal containment CSS, and focused unit/integration/frontend regressions.
