# TASK-0060 - Skill persistence, filesystem content and Admin CRUD

Task ID: TASK-0060
Status: PASS

## Summary

Implemented relational Skill identity and tool requirements, filesystem Markdown storage, server-authorized admin CRUD APIs, and a plain-TypeScript admin Skills view with dynamic tool selection and confirmation-based deletion.

## Repository analysis

- Completed the required preflight and ran `powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\inspect-repo.ps1` successfully.
- Reused the existing migration runner, SQLite repositories, `ToolRegistry`, `AuthorizationService`, structured application logger, filesystem-store safety pattern, `/api/me` capability source, Settings UI controls, and reusable confirmation modal.
- The worktree contained extensive unrelated in-progress changes before TASK-0060. They were preserved; shared files were extended without reverting those changes.

## Files changed

- Persistence and application: `src/server/migrations.ts`, `src/server/skill-types.ts`, `src/server/repositories/skill-repository.ts`, `src/server/repositories/skill-tool-repository.ts`, `src/server/stores/skill-content-store.ts`, `src/server/services/skill-service.ts`.
- Server wiring and configuration: `src/server.ts`, `.env.example`, `.gitignore`.
- Client: `src/client/components/skills/SkillsView.ts`, `src/client/components/skills/skills.css`, `src/client/components/layout.ts`, `src/client/components/index.ts`, `src/client/index.html`, `scripts/copy-client-assets.mjs`.
- Tests: `tests/unit/migrations.test.ts`, `tests/unit/skill-persistence.test.ts`, `tests/unit/skill-content-store.test.ts`, `tests/unit/skill-service.test.ts`, `tests/integration/skills-api.test.ts`, `tests/frontend/skills-ui.test.ts`.
- Tracking: `docs/executed_tasks/TASK-0060-skill-persistence-filesystem-admin-crud.md`, `docs/executed_results/TASK-0060-skill-persistence-filesystem-admin-crud.md`.

## Tests and verification

- `npm.cmd run build` - PASS.
- `npm.cmd run build:client` - PASS; client assets copied.
- `npm.cmd run typecheck:client` - PASS.
- `npm.cmd run lint` - PASS after correcting one type-only import identified by the initial lint run.
- `npm.cmd test` - PASS: 405 tests passed, 0 failed, across 40 suites.
- `git diff --check` - PASS; only existing Windows line-ending notices were emitted.
- Focused Prettier formatting was applied to the new Skill implementation and test files. A broad check could not infer parsers for `.env.example` and `.gitignore` and also reported pre-existing formatting differences in shared modified files; no unrelated broad reformat was performed.

## Production code

- Migration `0006_create_skills` adds `skills` with unique relational `command_name` and `skill_tools` with `ON DELETE CASCADE` plus unique `(skill_id, tool_name)`.
- Skill JSON is runtime-validated and contains only display metadata `{ name }`; Markdown and tool relationships are not stored in Skill JSON.
- `FileSkillContentStore` normalizes line endings, enforces a 256 KiB UTF-8 bound, accepts only positive numeric IDs, checks root containment, and atomically replaces `skill-<id>.md` through a controlled temporary file.
- Strict service validation rejects extra fields, malformed names/Markdown/tool arrays, duplicate or unknown tools, invalid command syntax, reserved commands, and duplicate commands.
- Every `/api/admin/skills` endpoint independently uses the existing server-derived authorization service and returns controlled responses without filesystem paths.
- The Skills UI is separate from Admin Settings, uses server-exposed registered tools, uses safe DOM text APIs, and contains no React/JSX.

## Architecture

- HTTP routes contain authorization, route parsing, status mapping, and service calls only.
- SQL, parameter binding, JSON serialization/parsing, row mapping, transactions, and persistence errors remain in repositories.
- Filesystem operations remain in `SkillContentStore`; orchestration remains in `SkillService`.
- Create writes Skill and tool rows in one DB transaction, then writes Markdown; a write failure explicitly deletes the newly created DB-owned state.
- Update atomically replaces Markdown first, then updates metadata and relationships in one DB transaction; a DB failure restores the previous Markdown and returns an error.
- Delete reads and removes Markdown first, then deletes the DB row and cascaded relationships; a DB failure restores the previous Markdown and returns an error. Filesystem failures leave DB state intact.

## Dependencies

No dependencies were added.

## Deviations

No task-scope deviations. Chat activation, slash commands, `chat_skills`, effective Chat tools, model-context injection, and agent integration were not implemented.

## Risks / findings

- SQLite and filesystem operations cannot be fully atomic; the implemented local compensation is explicit and logged, but a process termination during the narrow cross-store interval can still require operational diagnosis.
- Existing unrelated dirty worktree changes remain present and were not reverted or included as TASK-0060 work.

## Diff summary

Added one migration, five focused Skill backend modules, one Skills client module and stylesheet, admin API/UI wiring, configuration entries, and isolated database/filesystem/service/API/frontend coverage.
