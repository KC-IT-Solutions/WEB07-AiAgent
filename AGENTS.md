# AI Working Rules

Start here for every task.

## Documentation Loading

Read only documentation relevant to the active task.

Always read:
- `docs/CODINGSTANDARDS.md`
- `docs/DEFINITION_OF_DONE.md`
- `docs/IGNORE.md` before repository inspection

For non-trivial development tasks, also read and follow:
- `docs/TASK_WORKFLOW.md`

Read when relevant:
- `docs/ARCHITECTURE.md` — structure, modules, dependencies, or cross-feature changes
- `docs/TESTING.md` — added or changed behavior; integration, browser, API, auth, or end-to-end testing
- `docs/SECURITY.md` — auth, permissions, external input, secrets, sessions, APIs, or sensitive data
- `docs/DATABASE.md` — schema, persistence, repositories, SQL, JSON structures, migrations, indexes, or database changes

Prefer local documentation closest to the code being modified.

Do not load unrelated documentation.

## Preflight

Before any repository inspection:

1. Read `AGENTS.md`.
2. Read `docs/IGNORE.md`.
3. Read other required task documentation.
4. Confirm the active Task ID.
5. Only then inspect the repository.

Do not run repository-discovery commands before this preflight is complete.

## Rule Priority

If rules conflict:
1. More specific rules override general rules.
2. Local module rules override root-level general rules.
3. Security rules must never be weakened.

## Task Workflow

Use `docs/TASK_WORKFLOW.md` for non-trivial tasks.

A task is non-trivial when it involves any of:
- new or changed behavior
- multiple modules
- architecture or dependency decisions
- database or persistence changes
- authentication or authorization
- external integrations
- meaningful test changes
- uncertainty about scope or implementation approach

For trivial isolated changes, the full workflow is optional, but all applicable project rules still apply.

When uncertain, prefer the simplest solution consistent with the existing codebase.
