# TASK-0085 - Simplify Projects page and add Move up for files

Task ID: TASK-0085
Task slug: simplify-projects-page-and-file-move-up

## Instruction

Make two focused improvements to Projects:

1. Remove the redundant `My projects` list and the adjacent unselected-project placeholder from the main Projects page, while preserving the top Projects intro, `+ New project`, sidebar project selection, Project details/files, and Project CRUD synchronization.
2. Add a file-only `Move up` action to Project Files that moves a file exactly one directory toward the Project root by reusing the existing secure rename/move API. Root files must not offer the action, conflicts must use existing controlled failure behavior, successful moves must refresh the current listing without changing the current directory, and an open editor must update to the destination or safely clear.

Preserve the Projects sidebar dropdown, creation flow, edit/delete behavior, file browser, drag-and-drop moves, confirmation behavior, Project ownership, filesystem sandbox guarantees, modal readability, plain TypeScript/DOM architecture, and unrelated navigation/application behavior. Do not implement Agents, directory Move up, copy, multi-select, upload, sidebar file trees, sidebar project creation, redesigns, dependencies, migrations, backend redesign, shell/terminal, or Git functionality.

Add or update deterministic coverage for the compact unselected Projects page, sidebar selection and CRUD synchronization, existing Project detail/files behavior, both nested Move up examples, root boundaries, destination conflict, use of the existing move API with Project-relative non-traversal paths, refresh and error behavior, editor state, file-only behavior, and preservation of drag-and-drop moves.

Run and require success from:

```text
npm.cmd run build
npm.cmd run build:client
npm.cmd run typecheck:client
npm.cmd run lint
npm.cmd test
```

Create and re-read the matching execution result, perform the requested final self-check, and return exactly the specified five-line Task ID, Status, Result, Verification, and Summary response.
