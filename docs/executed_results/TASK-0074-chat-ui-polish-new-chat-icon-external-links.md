# TASK-0074 - Chat UI polish: New chat icon and external links

Task ID: TASK-0074
Status: PASS

Summary:

Added a decorative plus SVG to the upper sidebar New chat button and secured assistant Markdown links to open in a new browsing context.

Repository analysis:

- The upper New chat button is created in `src/client/components/layout.ts` and already owns the existing chat creation click handler.
- Assistant content is rendered by `src/client/components/chat/MarkdownRenderer.ts` through explicit DOM nodes. `safeLinkHref` rejects unsupported protocols, and raw model HTML is emitted as text rather than injected.
- Existing client SVGs use the SVG namespace, `aria-hidden="true"`, `focusable="false"`, and CSS `currentColor` strokes.
- The worktree contained substantial pre-existing changes, including changes in shared target files. Those changes were preserved.

Files changed:

- `src/client/components/layout.ts` - added the decorative two-line plus SVG and retained New chat label inside the existing upper button.
- `src/client/components/chat/chat.css` - added compact, button-scoped flex alignment and current-color SVG styling.
- `src/client/components/chat/MarkdownRenderer.ts` - added `target="_blank"` and `rel="noopener noreferrer"` when creating validated assistant Markdown anchors.
- `tests/frontend/chat-list-ui.test.ts` - added deterministic coverage for SVG structure, label order, styling, and retained click wiring.
- `src/client/components/chat/__tests__/ChatView.test.ts` - added assistant anchor attribute assertions and `data:` URL rejection coverage while retaining Markdown regressions.
- `docs/executed_tasks/TASK-0074-chat-ui-polish-new-chat-icon-external-links.md` - recorded the execution instruction.
- `docs/executed_results/TASK-0074-chat-ui-polish-new-chat-icon-external-links.md` - recorded this result.

Tests and verification:

- `powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\inspect-repo.ps1` - passed.
- `npm.cmd run typecheck:client` - passed.
- `npm.cmd run test:frontend` - passed after implementation and again after final test refinement; 56 tests passed.
- `node --test .test-dist/src/client/components/chat/__tests__/ChatView.test.js` - passed; 64 tests passed.
- `npm.cmd run build` - passed.
- `npm.cmd run build:client` - passed; client static assets copied.
- `npm.cmd run lint` - passed after implementation and again after final test refinement.
- `npm.cmd test` - passed; 452 tests passed, 0 failed.
- `git diff --check` - passed with line-ending conversion warnings only and no whitespace errors.
- `npx.cmd prettier --check src/client/components/layout.ts src/client/components/chat/MarkdownRenderer.ts src/client/components/chat/chat.css src/client/components/chat/__tests__/ChatView.test.ts tests/frontend/chat-list-ui.test.ts docs/executed_tasks/TASK-0074-chat-ui-polish-new-chat-icon-external-links.md` - reported pre-existing style drift in four already-modified shared files. No broad formatting rewrite was applied because it would modify unrelated concurrent work; the task's additions were manually reviewed for local consistency.
- Regression test failed before fix: no; additive deterministic coverage was introduced with the implementation.

Production code:

- Frontend-only changes.
- Existing New chat behavior, sidebar expansion, selection, SPA navigation, and server APIs are unchanged.
- Assistant Markdown links use normal anchor behavior rather than JavaScript click handlers.
- Unsafe protocols and raw HTML remain non-clickable/non-executable through the existing safe renderer.

Architecture:

- No architecture changes.
- Link behavior remains scoped to assistant Markdown rendering.

Dependencies:

- No dependencies added or changed.

Deviations:

- No browser E2E test was added or run; the repository's existing deterministic frontend and component contract suites directly cover these narrow DOM construction changes.
- The optional Prettier check was not globally repaired because affected files contained unrelated pre-existing edits. Required build, client build, typecheck, lint, and test commands all passed.

Risks / findings:

- No known functional or security regression.
- Existing relative and `mailto:` assistant Markdown links also receive the requested new-window attributes because the requirement applies to assistant-rendered links generally.

Diff summary:

- Added one compact decorative plus SVG and scoped alignment styles to the upper New chat button.
- Added two security-conscious attributes to validated assistant Markdown anchors.
- Added deterministic positive, behavior-preservation, and unsafe-URL regression assertions.
