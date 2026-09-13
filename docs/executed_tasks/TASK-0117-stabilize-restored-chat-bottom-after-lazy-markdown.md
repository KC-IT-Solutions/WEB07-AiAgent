Task ID: TASK-0117
Slug: stabilize-restored-chat-bottom-after-lazy-markdown

## Problem

When a saved Chat context/history is reopened, the complete persisted assistant response appears to be present in the DOM, but the visible message area can stop above the true end of the conversation. The chat history loads, scrolls near the bottom, then assistant Markdown content expands through IntersectionObserver-driven lazy rendering, pushing the final portion below the viewport.

## Root Cause

`loadChatHistory()` renders persisted messages with deferred Markdown rendering via `renderEvent(event, true)`, creating `.chat-assistant-message.chat-lazy-event` shells. It then force-scrolls using ChatScroller. The IntersectionObserver later replaces these shells with fully rendered Markdown. Because the initial scroll occurs before the final Markdown layout height is known, and because lazy Markdown expansion can exceed the near-bottom threshold, the viewport stops above the true conversation end.

## Goal

When a saved Chat is initially restored, keep the message area anchored to the true bottom until the initial deferred Markdown layout has settled, then return to normal user-scroll behavior.

## Implementation Approach

1. Create `initialRestoreState` object in `createChatView` to track whether initial history restoration is still settling
2. Pass it to both `createEventRenderer` and `loadChatHistory`
3. In `loadChatHistory`, set `pending = true` before rendering, then await `waitForLazySettle()` after the initial scroll
4. In `createEventRenderer`, check `initialRestoreState.pending` during IntersectionObserver callbacks; pass it as `forceScroll` to `scroller.updateContent()` so markdown materialization during restore forces bottom-follow
5. Remove `chat-lazy-event` class on materialization to release intrinsic placeholder sizing
6. `waitForLazySettle` polls via rAF, checking for remaining observable pending shells (`.chat-lazy-event[aria-busy="true"]` within observation range), resolves when none remain or area disconnects

## Files Changed

- src/client/components/chat/ChatView.ts — added waitForLazySettle, modified createEventRenderer and loadChatHistory signatures and behavior
- src/client/components/chat/__tests__/ChatView.test.ts — added 14 new tests for initial-history stabilization

## Constraints Observed

- No arbitrary fixed delays (setTimeout) used as primary correctness mechanism
- IntersectionObserver lazy rendering preserved
- CHAT_NEAR_BOTTOM_THRESHOLD unchanged at 96
- Normal user-scroll preservation maintained after restore settles
- No backend/API changes
- No CSS layout changes
- chat-scroll-anchor anchor element reused
