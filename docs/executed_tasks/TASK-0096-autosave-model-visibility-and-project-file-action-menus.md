# TASK-0096 - Autosave model visibility and compact Project file action menus

Task ID: TASK-0096
Task slug: autosave-model-visibility-and-project-file-action-menus

## Instruction

Implement two focused client interaction changes without altering backend policy or Project filesystem semantics:

1. Remove the Admin Settings `Save model visibility` button and autosave changes made through Show all, individual model checkboxes, Select all, and Clear all using the existing TASK-0095 endpoint.
2. Replace inline Project file/folder row actions with one accessible three-dot menu per row, following the existing Chat row menu pattern where practical.

Autosave must use a short debounce, coalesce rapid changes, serialize or otherwise protect the latest user intent from stale completions, show compact `Saving...`, `Saved`, and `Failed to save` states, avoid saving during initial population, and refetch authoritative configuration after failure. Preserve show-all (`filterConfigured = false`), explicit allowlists, explicit empty allowlists, stale IDs, Select all, Clear all, server enforcement, and Chat/Agent filtering.

Project menus must expose only applicable existing actions: files may show Download, Move up when nested, Rename, and Delete; folders show Rename and Delete. Reuse existing handlers and preserve confirmation/error behavior, file/folder navigation, upload/download, text editing, drag/drop, Move up, sandboxing, and SVG icons. Only one menu may be open; close it on action, outside click, Escape, rerender, or directory navigation. Controls must be semantic, labelled, keyboard accessible, and must not trigger row navigation or drag behavior.

Add deterministic frontend coverage for autosave behavior and status/failure semantics, retain server regressions from TASK-0095, and cover Project menu rendering, applicability, interaction, existing handlers, navigation, drag/drop, and accessibility. Do not redesign backend APIs, persistence, authorization, discovery, filesystem behavior, or introduce dependencies/frameworks.

Create the corresponding task and result records. Do not inspect historical task/result records. After edits, re-read every edited range. Run and require success from:

```text
npm.cmd run build
npm.cmd run build:client
npm.cmd run typecheck:client
npm.cmd run lint
npm.cmd test
```

The final response must use exactly the requested five-line TASK-0096 status format.
