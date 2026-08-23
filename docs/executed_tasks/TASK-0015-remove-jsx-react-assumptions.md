# TASK-0015 — Remove JSX/React assumptions from client

## Task ID
TASK-0015

## Task Slug
remove-jsx-react-assumptions

## Goal
Convert the existing client shell from TSX/JSX to plain TypeScript + DOM/HTML. No React assumptions should remain.

## Requirements
- Rename layout.tsx to layout.ts
- Rename ChatView.tsx to ChatView.ts
- Replace JSX with DOM creation/manipulation using browser APIs
- Preserve existing visible UI (permanent left sidebar, Chat menu item, main content area, simple Chat placeholder)
- Update imports/exports affected by renames
- Remove JSX compiler settings from TypeScript configs
- Ensure client TypeScript config validates normal .ts client files
- Update ChatView test for the .ts implementation
- Do not add dependencies

## Constraints
- Do not add chat functionality
- Do not redesign the UI
- Do not add a framework or React
- Do not add dependencies
- Do not modify backend behavior
- Do not modify README.md
- Do not refactor unrelated code

## Acceptance Criteria
- no .tsx files remain for this client shell
- no JSX remains in client code
- no "jsx" compiler option is required
- client uses plain TypeScript + DOM APIs
- existing sidebar/Chat placeholder behavior is preserved
- build passes
- client typecheck passes
- lint passes
- ChatView test passes
- no dependencies added
- no unrelated changes
