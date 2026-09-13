# TASK-0072 - Fix Chat autoscroll with bottom sentinel

Task ID: TASK-0072
Status: PASS

Summary:

Chat now follows a persistent bottom sentinel through coalesced, stale-safe animation frames while preserving manual reading position, and the behavior is covered by real overflowing Chromium layout.

Repository analysis:

- `.chat-message-area` is the actual vertical scroll owner. It is bounded by the height-constrained `.chat-view-container` flex column and has `flex: 1`, `min-height: 0`, and `overflow-y: auto`.
- `.chat-main-content` remains an outer overflow container, but the Chromium regression confirms it does not overflow while Chat is active; `.chat-message-area` has actual overflow and owns the changing `scrollTop`.
- The prior implementation assigned `scrollTop = scrollHeight` from a shared update helper. It deferred once but did not reliably account for browser layout and lazy event reflow.
- Native scroll anchoring was disabled only on `.chat-message-area` with `overflow-anchor: none` so it cannot compete with explicit follow intent.
- Chromium verification proved that `content-visibility: auto` on activity events caused additional intrinsic-size changes after forced scrolling. That optimization was removed only from activity events; lazy persisted Markdown still uses the existing IntersectionObserver and the shared sentinel scheduler.

Files changed:

- `src/client/components/chat/ChatView.ts`
- `src/client/components/chat/chat.css`
- `src/client/components/chat/__tests__/ChatView.test.ts`
- `tests/frontend/chat-list-ui.test.ts`
- `tests/e2e/chat-autoscroll.spec.ts`
- `docs/executed_tasks/TASK-0072-chat-autoscroll-bottom-sentinel.md`
- `docs/executed_results/TASK-0072-chat-autoscroll-bottom-sentinel.md`

Tests and verification:

- `powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\inspect-repo.ps1` - PASS.
- `npm.cmd run build` - PASS.
- `npm.cmd run build:client` - PASS.
- `npm.cmd run typecheck:client` - PASS.
- `npm.cmd run lint` - PASS.
- `npm.cmd test` - PASS, 445 tests passed.
- `npx.cmd playwright test tests/e2e/chat-autoscroll.spec.ts` - PASS, 1 Chromium browser test passed.
- The browser test verifies real overflow before assertions, initial history at bottom, a persistent final sentinel, the true scroll container and bounded outer main area, forced local-send scrolling, pinned streamed reasoning/tool-call/tool-result/assistant updates, manual upward-scroll preservation, automatic near-bottom resume, visible error following, and `overflow-anchor: none`.
- During implementation, the browser test first exposed bottom-padding alignment and then post-scroll activity-event layout changes. The final implementation and final browser run pass without weakening the one-pixel bottom tolerance.
- `git diff --check -- src/client/components/chat/ChatView.ts src/client/components/chat/chat.css src/client/components/chat/__tests__/ChatView.test.ts tests/frontend/chat-list-ui.test.ts tests/e2e/chat-autoscroll.spec.ts docs/executed_tasks/TASK-0072-chat-autoscroll-bottom-sentinel.md` - PASS; only line-ending conversion warnings were reported.

Production code:

- Added one persistent, invisible `.chat-scroll-anchor` as the final message-area child and preserved it across history rendering and Chat clearing.
- Replaced production direct-scroll assignment with `scrollAnchor.scrollIntoView({ block: 'end', behavior: 'auto' })`; `auto` is the standards-compatible non-smooth behavior used by the project's DOM typing.
- Captures the 96 px near-bottom decision before passive DOM mutation.
- Forces following after selected history and local user submission.
- Coalesces rapid updates to one pending animation frame, permits bounded layout-settle passes when followed content joins an already pending frame, and uses no timeout, polling, MutationObserver, or ResizeObserver for scrolling.
- Rechecks active Chat identity, DOM connection, and user scroll movement before every deferred scroll. A one-pixel movement tolerance handles browser fractional-pixel rounding without weakening the 96 px intent threshold.
- Uses the same scheduler for deferred Markdown replacement.

Architecture:

- The change is local to the Chat view and its component CSS/tests.
- Stream chronology, stale-response handling, Markdown sanitization, persistence, commands, and inference behavior are unchanged.
- No server, API, database, tool, Skill, or streaming-protocol code changed.

Dependencies:

- No dependencies added or changed.

Deviations:

- None. The requested non-smooth `scrollIntoView` behavior uses `behavior: 'auto'` rather than the preferred `instant` value.

Risks / findings:

- Activity events no longer use `content-visibility: auto`; this trades that local rendering optimization for stable, correct Chat scroll geometry. Existing deferred Markdown rendering remains in place.
- The workspace contained extensive pre-existing uncommitted changes. They were preserved and not reverted.

Diff summary:

- One sentinel-based Chat scrolling mechanism replaces the competing direct-scroll mechanism.
- Focused source tests and the existing real-browser Chat autoscroll regression were updated.
- Frontend-only runtime and layout changes; no unrelated UI redesign or backend change.
