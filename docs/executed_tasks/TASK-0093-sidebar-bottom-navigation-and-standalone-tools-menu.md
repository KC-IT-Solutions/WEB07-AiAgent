# TASK-0093 - Sidebar bottom navigation and standalone Tools menu

Task ID: TASK-0093
Task slug: sidebar-bottom-navigation-and-standalone-tools-menu

## Instruction

Make two focused navigation/UI changes:

1. Keep `Settings` and authorized `Admin Settings` in a structural bottom navigation region of the left sidebar, independent of Projects expansion and viewport height.
2. Move the existing Tools configuration UI out of Settings/setup into one authoritative first-class Tools sidebar page using the existing SPA routing conventions.

Preserve Chat, expandable Projects, Project Agent UI, Skills, Settings, Admin Settings authorization, responsive and keyboard-accessible navigation, existing Tools configuration behavior, Agent tool selection, ToolRegistry/backend behavior, persistence, inference, and the plain TypeScript + DOM architecture.

Add deterministic frontend coverage for sidebar grouping, authorization visibility, retained navigation, expansion stability, active states, Tools routing/click behavior, moved (not duplicated) configuration, existing settings updates, and unchanged Agent/ToolRegistry behavior. Prefer frontend-only production changes and do not redesign unrelated UI or backend semantics.

Create the matching execution result. Do not inspect historical files under `docs/executed_tasks` or `docs/executed_results`. After each edit, re-read the edited range. Before completion, re-read all changed ranges and run exactly:

```text
npm.cmd run build
npm.cmd run build:client
npm.cmd run typecheck:client
npm.cmd run lint
npm.cmd test
```

Report PASS only when every mandatory command ran successfully, and use the exact final response format specified in the active task instruction.
