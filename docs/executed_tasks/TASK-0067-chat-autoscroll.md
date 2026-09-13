# TASK-0067 - Add Chat autoscroll for live conversation updates

Task ID: TASK-0067
Task slug: chat-autoscroll

## Goal

Add reliable autoscroll behavior to the Chat view.

When new Chat content is added during normal conversation flow, the message area should stay pinned to the latest content so the user can follow:

- user messages
- thinking/reasoning indicators
- tool calls
- tool results
- streamed assistant events
- final assistant responses

The behavior must not fight the user when they intentionally scroll upward to read older content.

This task is frontend-only and intentionally narrow. Do not change tool/network behavior.

## Requirements

1. Identify the actual Chat vertical scroll container. Do not assume `window` or `document.body`, and do not restructure the overall page unless required.
2. When the user is at or near the bottom, keep the Chat pinned as user messages, thinking state, reasoning, tool activity, assistant events, and final responses appear.
3. Do not force the user to the bottom after they scroll upward. Resume automatically when they return near the bottom.
4. Use one explicit deterministic near-bottom threshold in the approximate range 64-120 px.
5. Determine bottom intent before visible content changes, then scroll after the DOM update only when previously pinned.
6. Always scroll selected persisted Chat history to the latest message after initial render.
7. Always scroll a newly submitted local user message to the bottom and establish bottom-pinned inference flow.
8. Apply the same behavior consistently to existing event-level reasoning, tool call, tool result, thinking, assistant, final, and error rendering without token-level streaming.
9. Prefer small local helpers rather than a general scroll framework or duplicated direct scroll assignments.
10. Use immediate scrolling, not repeated smooth scrolling.
11. Preserve natural wheel, trackpad, scrollbar, and touch behavior without intercepting scrolling.
12. Tolerate viewport resize, Markdown height changes, activity elements, and long responses with the smallest reliable DOM implementation; do not add `ResizeObserver` unless needed.
13. Do not change Markdown, sanitization, reasoning/tool presentation, Chat history, or event ordering.
14. Make no backend, protocol, inference, tool, Skill, persistence, API, or migration changes.
15. Add deterministic frontend coverage for initial history scrolling to the bottom.
16. Add coverage for append while pinned.
17. Add coverage preserving an intentionally elevated scroll position.
18. Add coverage that autoscroll resumes after returning near the bottom.
19. Add a boundary test for the selected threshold.
20. Verify local user submission moves Chat to the bottom without changing send/inference behavior.
21. Preserve existing frontend regressions including selection, history, `/clear`, `/new`, Skill commands, reasoning/tool activity, Markdown, thinking, stale responses, errors, composer controls, and sidebar behavior.

## Out Of Scope

- jump-to-latest button
- unread-message badge
- per-Chat scroll persistence
- virtualized message lists
- infinite history pagination
- animations
- backend changes
- tool/network changes
- unrelated Chat redesign

## Verification

Run:

```text
npm.cmd run build
npm.cmd run build:client
npm.cmd run typecheck:client
npm.cmd run lint
npm.cmd test
```

## Acceptance Criteria

- selected Chat initially opens at the newest message
- sending a user message moves Chat to the bottom
- live streamed events keep scrolling when user is already near bottom
- scrolling upward prevents forced autoscroll
- returning near the bottom automatically resumes autoscroll
- near-bottom logic uses a deterministic threshold
- no repeated smooth-scroll animation during streaming
- existing Chat rendering/order remains unchanged
- no backend changes
- all tests pass
- no unrelated changes

## Tracking And Final Response

Create `docs/executed_results/TASK-0067-chat-autoscroll.md`, then return only:

```text
Task ID: TASK-0067
Status: <PASS|FAIL|BLOCKED>
Result: docs/executed_results/TASK-0067-chat-autoscroll.md
Summary: <one short sentence>
```
