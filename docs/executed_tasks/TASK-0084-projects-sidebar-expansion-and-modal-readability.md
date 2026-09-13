# TASK-0084 - Projects sidebar expansion and project modal readability

Task ID: TASK-0084
Task slug: projects-sidebar-expansion-and-modal-readability

## Instruction

Improve the Projects UI without changing the existing project creation flow or redesigning the Projects management page.

### Expandable Projects sidebar

- Keep the Projects label/row navigation to `/projects` separate from an accessible chevron control that only expands or collapses the sidebar project list.
- Follow the existing Chat expansion interaction where appropriate.
- When expanded, use the existing Projects API to list only the current user's project names. Do not show descriptions, filesystem paths, files, edit/delete controls, or a Create button.
- Project entries must be keyboard-accessible and open/select the existing Projects view rather than introducing another detail implementation.
- Apply the existing active treatment where practical to the selected project; keep the Projects root active when no project is selected.
- Keep the sidebar list synchronized after project create, rename, and delete without adding a global state framework.
- Show a compact non-clickable empty state when no projects exist and a controlled non-sensitive failure state if loading fails.
- Preserve normal-user Projects visibility, Chat expansion behavior, and Settings/Admin/Skills authorization and navigation.

### Project modal readability

- Scope readable label, optional help, validation, and placeholder colors to the Project create/edit modal form.
- Keep Project modal inputs and textareas contained at narrow widths with `width: 100%`, `max-width: 100%`, and `box-sizing: border-box` or equivalent.
- Do not introduce unrelated global form styling or redesign global modals.

### Tests

Add deterministic frontend coverage for Projects visibility; separate navigation and expansion; expand/collapse; project-name-only rendering; project opening/selection; create/rename/delete synchronization; empty state; unchanged Chat expansion; and unchanged Settings/Admin/Skills navigation.

Add practical regression coverage for scoped readable Project modal labels/help/validation/placeholders, contained controls, and absence of unrelated global form selectors. Avoid brittle exact pixel assertions.

### Constraints and invariants

- Use the existing Projects API and current SPA convention; prefer no backend changes and add no dependency.
- Preserve project ownership, filesystem sandbox, CRUD, file browser, file drag/drop, credential handling, and inference serialization.
- Do not implement Agents, sidebar creation/edit/delete, descriptions, file trees, sidebar drag/drop, global navigation/modal redesign, or a new frontend framework.
- Do not inspect historical files under `docs/executed_tasks` or `docs/executed_results` beyond this task's own files.
- After every edit, immediately re-read the edited range.

### Mandatory verification

Run and require success from every command before reporting PASS:

```text
npm.cmd run build
npm.cmd run build:client
npm.cmd run typecheck:client
npm.cmd run lint
npm.cmd test
```

Before the final response, re-read every changed range and verify all stated navigation, synchronization, modal readability/containment, and Chat preservation requirements. Create and re-read the corresponding execution result at `docs/executed_results/TASK-0084-projects-sidebar-expansion-and-modal-readability.md`.
