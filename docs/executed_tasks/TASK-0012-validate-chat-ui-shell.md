# TASK-0012 — Validate Chat UI Shell

Task ID: TASK-0012
Task slug: validate-chat-ui-shell

## Goal

Validate the existing Chat UI shell. Do not add new features.

## Steps

1. Repository inspection via `scripts/inspect-repo.ps1`
2. Read project rules (AGENTS.md, docs/IGNORE.md, docs/CODINGSTANDARDS.md, docs/DEFINITION_OF_DONE.md, docs/TASK_WORKFLOW.md)
3. Read implementation files (package.json, tsconfig.json, src/client/index.html, src/client/components/layout.tsx, src/client/components/index.ts, src/client/components/chat/ChatView.tsx, src/client/components/chat/index.ts, src/client/components/chat/chat.css, src/client/components/chat/__tests__/ChatView.test.tsx, src/server.ts)
4. Validate implementation against acceptance criteria
5. Run `npm run build` and `npm run lint`
6. Create result file

## Acceptance Criteria

- permanent left sidebar
- Chat navigation item
- main content area
- separate Chat view component
- simple Chat placeholder
- modular Chat CSS
- no actual chat functionality
- no unnecessary dependency additions

## Constraints

- Do not modify production code
- Do not install or add dependencies
- Validation only
