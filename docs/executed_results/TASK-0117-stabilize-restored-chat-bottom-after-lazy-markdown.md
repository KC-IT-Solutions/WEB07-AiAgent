Task ID: TASK-0117
Status: PASS

Summary:
Stabilized restored chat scroll position by introducing an initial-history restore lifecycle that maintains forced bottom-follow while deferred Markdown materializes, then cleanly terminates to resume normal user-scroll preservation.

Repository analysis:
The existing ChatView uses IntersectionObserver-driven lazy Markdown rendering for assistant messages during history restoration. loadChatHistory() renders shells with renderEvent(event, true), then force-scrolls via scroller.updateContent(). The IntersectionObserver callback later replaces shell content with rendered Markdown through scroller.updateContent(), but without the forceScroll flag—so when expanded Markdown pushes content beyond the near-bottom threshold (96px), the viewport stops above the conversation end.

Files changed:
- src/client/components/chat/ChatView.ts
  - Added waitForLazySettle() function that polls via rAF for observable pending lazy shells (.chat-lazy-event[aria-busy="true"] within observation range) and resolves when none remain or message area disconnects
  - Modified createEventRenderer to accept initialRestoreState parameter; IntersectionObserver callback now reads initialRestoreState.pending as duringRestore, passes it as forceScroll to scroller.updateContent(); also removes chat-lazy-event class on materialization
  - Modified loadChatHistory to accept initialRestoreState parameter; sets pending=true before rendering persisted messages; awaits waitForLazySettle after initial scroll
  - Modified createChatView to create initialRestoreState object and pass it through both call chains

- src/client/components/chat/__tests__/ChatView.test.ts
  - Added 14 new tests covering: restore state creation and passing, flag timing before render, settling wait placement, forceScroll during materialization, lazy-event class removal, observable shell tracking, disconnection handling, threshold preservation, near-bottom guard preservation, root-cause regression sequence, eager-render fallback, parameter signatures

Tests and verification:
All 867 tests pass (0 failures). New tests added for initial-history stabilization behavior.

Mandatory commands executed successfully:
- npm run build — PASS
- npm run build:client — PASS  
- npm run typecheck:client — PASS
- npm run lint — PASS
- npm test — PASS (867/867)

Production code:
Two files modified in src/client/components/chat/: ChatView.ts (production logic) and __tests__/ChatView.test.ts (test coverage). No CSS changes. No backend changes.

Architecture:
Single authoritative scroll mechanism preserved via existing ChatScroller. Initial restore state is a lightweight shared object ({ pending: boolean }) passed through createEventRenderer and loadChatHistory call chains. No parallel scroll systems introduced.

Dependencies:
No new dependencies added.

Deviations:
None. Implementation follows preferred design from task specification exactly.

Risks / findings:
- The waitForLazySettle function uses rAF polling with bounding rectangle checks to determine observable pending shells; this avoids arbitrary fixed delays while correctly handling IntersectionObserver-driven materialization timing
- chat-lazy-event class removal on materialization ensures intrinsic placeholder sizing is released, preventing stale CSS sizing from affecting layout after Markdown renders
- Initial restore state cleanly terminates when all observable lazy shells have settled or message area disconnects, preventing stale work

Diff summary:
ChatView.ts: +41 lines (waitForLazySettle function), modified createEventRenderer signature and observer callback, modified loadChatHistory signature with flag setting and settling await, modified createChatView with state creation
ChatView.test.ts: +130 lines (14 new test cases)
