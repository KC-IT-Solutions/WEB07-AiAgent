# TASK-0068 - Fix Chat autoscroll runtime behavior

Task ID: TASK-0068
Task slug: fix-chat-autoscroll-runtime

## Goal

Repair the existing Chat autoscroll implementation from TASK-0067 so it works in the real browser runtime.

TASK-0067 already added:
- near-bottom detection
- a 96 px threshold
- pre-update scroll intent
- forced scroll on initial history and local submission
- live-update autoscroll helpers
- source-level/frontend unit coverage

Do NOT reimplement the feature from scratch.

The issue is that the logic appears present and tests pass, but autoscroll does not work correctly in the running client.

This task is a focused runtime/layout bug fix.

## Read first

Run:

    powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\inspect-repo.ps1

Inspect only relevant current files for:

- `src/client/components/chat/ChatView.ts`
- Chat CSS/layout files
- actual Chat scroll container
- current TASK-0067 autoscroll helpers
- streaming render paths
- Markdown/deferred rendering path
- frontend tests
- Playwright/browser test setup if already present
- TESTING.md
- CODINGSTANDARDS.md

Do not use recursive repository listing commands.

Do not read historical executed task/result files.

## 1. Treat TASK-0067 as existing behavior

Do not duplicate or add a second independent autoscroll implementation.

Inspect the current helpers and determine why they fail in browser runtime.

Keep or adjust the existing implementation as appropriate.

## 2. Verify actual scroll ownership

TASK-0067 assumed:

    .chat-message-area

is the element that owns vertical scrolling.

Verify this against the actual rendered DOM and CSS.

Check relevant properties through the layout hierarchy, especially:

    overflow-y
    height
    max-height
    min-height
    flex
    flex-grow
    flex-shrink
    min-height: 0
    position

Determine which element's:

    scrollTop
    scrollHeight
    clientHeight

actually change when Chat content grows.

If `.chat-message-area` is not the true runtime scroll container, fix the implementation to target the correct element.

Do not restructure the whole page unnecessarily.

## 3. Check flexbox containment

Pay particular attention to the common flexbox failure mode where a child intended to scroll cannot shrink because an ancestor is missing:

    min-height: 0

If that is the actual cause, make the smallest CSS correction needed.

Do not add arbitrary fixed heights merely to make scrolling work.

## 4. Verify DOM timing

Inspect whether current autoscroll executes before the browser has recalculated layout after:

- appending a message
- appending reasoning/tool events
- changing thinking state
- rendering Markdown
- replacing/updating an existing element

If:

    scrollTop = scrollHeight

runs before the new `scrollHeight` is observable, repair the timing.

Prefer the smallest browser-native scheduling mechanism.

If needed, use:

    requestAnimationFrame(...)

after the DOM mutation.

Do not use arbitrary `setTimeout` delays.

Do not introduce polling.

## 5. Preserve pre-update user intent

Keep the TASK-0067 invariant:

Before a live DOM mutation:

    determine whether user was near bottom

After the mutation/layout update:

    if previously near bottom:
        scroll to latest

    otherwise:
        preserve reading position

Do not replace this with unconditional autoscroll for passive stream events.

## 6. Forced scroll cases remain

These cases should still force bottom positioning:

- selecting/loading persisted Chat history
- local user sends a new message

If layout scheduling is required, ensure these forced scrolls happen after the rendered content has affected layout.

## 7. Streaming events

Verify runtime behavior for all current visible streamed events:

- thinking
- reasoning
- tool_call
- tool_result
- assistant content
- final assistant response
- visible inference error/status

The correct scroll container and timing must be used consistently.

Do not alter event chronology or stream semantics.

## 8. Markdown reflow

TASK-0067 already accounted for deferred Markdown reflow.

Inspect this path specifically.

If Markdown rendering changes message height after the initial append, ensure bottom-pinned Chat remains pinned after that height change.

Do not repeatedly scroll if the user has moved away from the bottom meanwhile.

Preserve user intent.

## 9. Stale response safety

Keep existing Chat identity/stale-response protection.

A delayed event from another Chat must never scroll the currently selected Chat.

Do not weaken existing checks.

## 10. Runtime/browser verification

Source-level tests alone are not sufficient for this bug.

Use an existing browser-capable test setup if the repository already has one.

The project already has Playwright as a development dependency, but do not introduce a new test framework or broad E2E suite.

Add the smallest practical browser/runtime regression test that verifies actual scroll behavior if the existing test infrastructure supports it cleanly.

If no suitable browser test harness is currently wired for this component, document that explicitly and add the strongest deterministic DOM/runtime coverage available without introducing broad infrastructure.

## 11. Browser test - initial history

Where practical, verify in a real browser/layout environment:

    Chat contains content taller than viewport
    persisted Chat is rendered
    -> scrollTop is at bottom

## 12. Browser test - live append while pinned

Verify:

    Chat is at/near bottom
    new visible event increases scrollHeight
    -> scroll position follows new bottom

This test should exercise actual layout values, not mocked constants, if browser infrastructure permits.

## 13. Browser test - manual scroll up

Verify:

    user scrolls clearly upward
    live event arrives
    -> current reading position is not forced to bottom

## 14. Browser test - resume

Verify:

    user returns near bottom
    another event arrives
    -> autoscroll resumes

## 15. Browser test - local send

Verify:

    user is scrolled upward
    user sends a new message
    -> Chat moves to bottom

## 16. No smooth-scroll loop

Continue to prefer immediate scroll positioning.

Do not introduce repeated smooth-scroll animations for streamed events.

## 17. No observers unless necessary

Do not add:

- MutationObserver
- ResizeObserver
- polling loops

unless repository/runtime inspection proves they are required.

Prefer:

    DOM mutation
    -> requestAnimationFrame if needed
    -> scroll adjustment

## 18. No backend changes

Do not change:

- server
- inference
- tools
- Skills
- SQLite
- JSONL
- API routes
- stream protocol

Frontend-only fix.

## 19. Preserve rendering

Do not change:

- Markdown semantics
- sanitization
- reasoning UI
- tool UI
- message styling
- Chat history format
- event ordering

Only fix autoscroll/runtime layout behavior.

## 20. Regression coverage

Ensure existing tests remain green for:

- Chat selection
- history loading
- user send
- thinking
- reasoning
- tool events
- Markdown
- `/clear`
- `/new`
- `/skills`
- Skill toggles
- stale-response protection
- errors
- composer behavior
- sidebar Chat behavior

## Important diagnostic requirement

In the result file, state the actual root cause found.

Examples:

    wrong scroll container
    missing flex min-height: 0
    scroll executed before layout
    later render overwrote position
    Markdown height reflow
    combination of the above

Do not report merely:

    autoscroll fixed

without identifying the runtime cause.

## Out of scope

Do not implement:

- jump-to-latest button
- unread counter
- persisted scroll position
- virtualization
- history pagination
- UI redesign
- backend changes
- unrelated CSS refactor
- tool/network changes

## Verification

Run:

    npm.cmd run build
    npm.cmd run build:client
    npm.cmd run typecheck:client
    npm.cmd run lint
    npm.cmd test

Also run the narrow browser/runtime regression test if one is added.

## Acceptance

- actual runtime scroll container is verified
- root cause of TASK-0067 failure is identified
- initial Chat history opens at bottom
- local user submission scrolls to bottom
- live events follow the bottom when user is near it
- manual upward scrolling is respected
- returning near bottom resumes autoscroll
- layout timing/reflow is handled correctly
- stale responses cannot scroll another Chat
- no arbitrary timers/polling
- frontend-only fix
- all tests pass
- result file documents the concrete runtime cause
- no unrelated changes

## Tracking

Create:

    docs/executed_tasks/TASK-0068-fix-chat-autoscroll-runtime.md

and:

    docs/executed_results/TASK-0068-fix-chat-autoscroll-runtime.md

Do not read historical executed task/result files.

## Final response

Return only:

    Task ID: TASK-0068
    Status: <PASS|FAIL|BLOCKED>
    Result: docs/executed_results/TASK-0068-fix-chat-autoscroll-runtime.md
    Summary: <one short sentence>
