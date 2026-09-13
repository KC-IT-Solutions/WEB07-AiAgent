# TASK-0072 - Fix Chat autoscroll with bottom sentinel

Task ID: TASK-0072
Task slug: chat-autoscroll-bottom-sentinel

## Instruction

Replace the unreliable browser Chat autoscroll implementation with a frontend-only bottom-anchor implementation.

- Verify from current DOM and CSS which bounded element owns vertical Chat scrolling, including overflow, height, max-height, min-height, and flex containment. Make only the smallest required layout correction and add no arbitrary fixed height.
- Add one persistent, invisible bottom sentinel after all visible messages and events in the actual message scroll container. Do not recreate it per event.
- Replace normal `scrollTop = scrollHeight` scrolling with non-smooth `scrollAnchor.scrollIntoView({ block: "end", behavior: "instant" })`, or the closest project-typed standards-compatible behavior.
- Run scrolls after layout updates with `requestAnimationFrame`, without timeouts or polling.
- Coalesce to one pending animation frame and guard callbacks against stale Chat identity, render generation, and obsolete inference work.
- Force a post-layout sentinel scroll after rendering selected persisted history and after normal local user submission.
- For passive thinking, reasoning, tool-call, tool-result, assistant, status, and error updates, capture whether the actual scroll container is within 96 px of the bottom before mutation and only schedule following when it was.
- Respect manual upward scrolling, automatically resume on the next passive event after the user returns near bottom, and do not intercept normal browser input.
- Keep bottom-following Markdown/reflow pinned through the same scheduled sentinel mechanism. Do not add observers unless inspection proves they are required, and do not pull the user down if intent changes before execution.
- Inspect native browser scroll anchoring and apply `overflow-anchor: none` only to the Chat scroll container if appropriate; document the decision.
- Preserve chronology, Chat switching, stale-response protection, Markdown sanitization, persistence, event-level streaming, Skill commands, and inference behavior.
- Remove or simplify obsolete direct-scroll helpers so sentinel scrolling is the sole normal live-scroll mechanism; measurements remain allowed for near-bottom detection.
- Add the smallest practical Playwright regression using existing infrastructure and real overflowing browser layout. Cover initial history at bottom, passive append while pinned, manual scroll-up preservation, resume near bottom, forced local-send following, and the streamed event sequence where practical.
- Update deterministic unit/source tests as needed, but do not treat mocked layout measurements as sufficient runtime verification.
- Make no backend, API, inference, tool, persistence, protocol, unrelated UI, styling, or redesign changes.
- Do not read historical executed task/result files.

## Required verification

Run:

```text
npm.cmd run build
npm.cmd run build:client
npm.cmd run typecheck:client
npm.cmd run lint
npm.cmd test
```

Also run the narrow Playwright/browser command required for the new runtime regression. If existing browser infrastructure cannot reasonably exercise Chat without broad infrastructure, perform and accurately document the strongest available runtime verification.

## Tracking and terminal response

Create `docs/executed_results/TASK-0072-chat-autoscroll-bottom-sentinel.md`, re-read it before responding, and return only:

```text
Task ID: TASK-0072
Status: <PASS|FAIL|BLOCKED>
Result: docs/executed_results/TASK-0072-chat-autoscroll-bottom-sentinel.md
Summary: <one short sentence>
```
