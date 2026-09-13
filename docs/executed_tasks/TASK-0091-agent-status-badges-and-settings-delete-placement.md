# TASK-0091 - Agent status badges and settings delete placement

Task ID: TASK-0091
Task slug: agent-status-badges-and-settings-delete-placement

## Instruction

Make two focused Agent UI improvements:

1. Replace plain Agent status text with a compact graphical status badge in the Agent overview.
2. Remove the Agent Delete button from the overview row and move Agent deletion into the Agent edit/settings modal as a distinct danger-zone action.

Do not change Agent run semantics or implement new Agent execution features.

### Status badge

- Reuse the persisted/current `idle`, `running`, `paused`, `done`, `error`, and `cancelled` states returned by the existing Agent run APIs and polling loop.
- Render uppercase, compact, status-specific badges near the Agent name in the row header.
- Remove the plain `Status: Idle` presentation.
- Keep non-error badges noninteractive with visible text.
- Render the `ERROR` badge as a semantic, keyboard-accessible button labelled `View Agent error details` that opens the existing safe error-detail modal.
- Preserve lifecycle controls, Run log, Error log, row editing, responsive wrapping, and polling behavior.

### Overview deletion

- Remove Delete from the Agent overview without an empty placeholder.
- Keep only operational lifecycle and log controls in the overview.

### Settings deletion

- Add a visually separated, scoped danger-zone section near the bottom of the existing Agent edit modal's scrollable content.
- Render it only for persisted Agents, never for a new unsaved Agent.
- Include `Danger zone`, concise explanatory text, and a destructive `Delete agent` button.
- Keep the danger zone separate from the Cancel/Save footer.
- Reuse the existing Agent delete confirmation and DELETE API flow.
- Disable/prevent deletion for `running` and `paused` Agents, explain that the active run must be stopped or cancelled, and preserve authoritative server protection.
- On success, close the edit modal, refresh the Agent overview, preserve the selected Project, and avoid navigation.
- On failure, keep the settings modal stable and show a controlled safe error without raw internals.

### Existing behavior and scope

Preserve Project and Agent ownership, Agent CRUD and settings, Skills, tools, instruction source, chaining, result-file configuration, persistent runs, status polling, Start/Pause/Resume/Cancel, safe Error modal, Run log, Error log, active-run deletion protection, filesystem sandbox, Chat behavior, inference serialization, and plain TypeScript/DOM architecture.

Prefer no backend production changes. Reuse TASK-0090 APIs and do not add migrations, dependencies, realtime infrastructure, execution features, run-history redesign, or global UI/modal redesign.

### Tests

Add deterministic coverage for all six badge states; badge header placement; interactive, keyboard-accessible ERROR behavior and safe details; noninteractive non-error badges; polling updates to badge and controls; removal of overview Delete; preservation of lifecycle/log/edit controls; persisted-only danger zone placement; existing confirmation and DELETE API use; successful close/list refresh; stable controlled failure; active running/paused deletion prevention including server protection; and unchanged Cancel/Save behavior.

Avoid brittle exact pixel/color assertions.

### Mandatory verification

Run and require success from every command:

```text
npm.cmd run build
npm.cmd run build:client
npm.cmd run typecheck:client
npm.cmd run lint
npm.cmd test
```

Report PASS only if every command is executed in this session and succeeds.

### Final self-check

Re-read every changed range; confirm badges replace plain text near the name; ERROR opens safe details; overview Delete is gone; settings Delete exists only for persisted Agents and outside the footer; active Agents cannot be deleted; polling and controls remain unchanged; and all mandatory verification passed.

Create the corresponding result report at `docs/executed_results/TASK-0091-agent-status-badges-and-settings-delete-placement.md` and use the exact requested final response format.
