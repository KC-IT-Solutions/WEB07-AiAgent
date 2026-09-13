# TASK-0144: Agent Last Completed Timestamp

Task ID: TASK-0144
Slug: agent-last-completed-timestamp

## Instruction

Goal: Show the date and time when an Agent's latest run last reached a terminal completed state.

In the Project Agent list, render the timestamp to the right of the existing status and token badges, for example `DONE   TOKENS 19.9k   2026-09-12 22:43` or `ERROR   2026-09-12 22:43`.

## Required Behavior

1. Use the latest Agent run's existing `completedAt` field. Do not derive it from `updatedAt`, `createdAt`, browser refresh time, or current time. The displayed timestamp must represent when the latest run actually completed.
2. Display the timestamp when the latest run has terminal status `done`, `error`, or `cancelled`. Do not display it for `running` or `paused`, an Agent that has never run, or a terminal run whose `completedAt` is null or missing. Do not independently search for an older terminal run when the latest run is active.
3. In the Project Agent row, place the timestamp directly to the right of the existing status/token area and before the Start button / overflow menu: `[STATUS] [TOKENS] [YYYY-MM-DD HH:mm] [Start] [...]`.
4. Do not redesign the Agent row. Preserve the status badge, token badge, Start control, overflow menu, Agent title/description/model metadata, and responsive row structure.
5. Display browser/client local time in exact deterministic format `YYYY-MM-DD HH:mm`, with four-digit year and two-digit month, day, hour, and minute. Do not display seconds, hard-code a timezone, or use locale-dependent output.
6. Respect existing `completedAt` type and serialization semantics. Convert its existing representation correctly in the frontend without changing persistence semantics.
7. If the latest-run endpoint already returns `completedAt`, do not add an endpoint or duplicate field. If only the client DTO/type omits it, extend only the relevant client type/parser. Modify backend/API code only if genuinely absent.
8. The timestamp must correspond to the same latest run used for status and token count. A latest active run must not show an older run's terminal timestamp.
9. Error runs show `completedAt`. Cancelled runs show it when recorded. Never fabricate a missing timestamp.
10. Update through the existing latest-run refresh/polling flow used by status and token count. Do not add a timer, polling loop, or endpoint for the timestamp.
11. Use existing Agent status/meta typography where practical. Keep the timestamp visually secondary, readable in current themes/layouts, and avoid fixed widths that break names or responsive behavior. Do not make it another badge unless that is an established convention.

## Tests

Add deterministic coverage for:

- done latest run renders `completedAt`;
- error latest run renders `completedAt`;
- cancelled latest run renders `completedAt` when present;
- running latest run renders no completion timestamp;
- paused latest run renders no completion timestamp;
- Agent with no latest run renders no timestamp;
- terminal run with missing/null `completedAt` renders no timestamp;
- timestamp uses `YYYY-MM-DD HH:mm` format and omits seconds;
- formatter uses client-local Date fields rather than locale-dependent formatting;
- timestamp renders to the right of status/token area;
- token badge behavior remains unchanged;
- status behavior remains unchanged;
- latest-run polling/refresh behavior remains unchanged.

If frontend tests mock AgentRun responses, extend fixtures minimally where required. Preserve existing tests and behavior outside this feature.

## Scope

Inspect only workflow-required files, Agent run client/API types if needed, `ProjectAgentsSection` and directly related UI/style files, and relevant frontend/API tests. Do not perform broad repository enumeration.

Do not modify Agent execution logic, model inference, Agent Runner tool behavior, copy-agent behavior, run persistence semantics, logging, Project filesystem behavior, token accounting, or current-date prompt context.

Prefer the smallest change.

## Verification

All commands must pass:

```text
npm.cmd run build
npm.cmd run build:client
npm.cmd run typecheck:client
npm.cmd run lint
npm.cmd test
```

## Documentation

After implementation and verification, create `docs/executed_results/TASK-0144-agent-last-completed-timestamp.md` recording implementation summary, repository analysis, production files changed, tests added/changed, timestamp source and serialization, formatting behavior, UI placement, architecture impact, deviations, risks/findings, and all five verification results.

Re-read this task file before finalizing. Verify implementation against every requirement and explicitly document deviations.
