# TASK-0075 - Fix assistant Markdown rendering for tables and streamed responses

Task ID: TASK-0075
Status: PASS

## Summary

Assistant GitHub-flavored Markdown tables now render as safe semantic DOM through the same renderer used by direct streamed responses, post-tool final responses, and persisted history.

## Repository analysis

- `ChatView.ts` already routes direct assistant events, final events after tool activity, and persisted assistant history through `createEventRenderer` and `createAssistantMarkdown`.
- Normal assistant content was not assigned through `textContent`, and inference/history parsing preserved the original newlines.
- Marked 18.0.10 already lexed standard GFM table syntax into a `table` token without additional configuration.
- Root cause: `MarkdownRenderer.ts` did not handle Marked's `table` token. Its default branch converted `token.raw` into one text node, displaying the complete table delimiter/source and preventing inline cell tokens such as `**C**` from rendering.
- The assistant renderer does not use `sanitize-html` or HTML strings. Its sanitization boundary is the existing explicit Marked-token-to-DOM mapping: only fixed safe elements are created, raw model HTML becomes text nodes, and links pass through `safeLinkHref`.

## Files changed

- `src/client/components/chat/MarkdownRenderer.ts`: added safe table, row, and cell token mapping and semantic `table`/`thead`/`tbody`/`tr`/`th`/`td` DOM rendering.
- `src/client/components/chat/chat.css`: added minimal Chat-scoped table borders, spacing, and local horizontal overflow.
- `src/client/components/chat/__tests__/ChatView.test.ts`: added deterministic table, bold-cell, shared rendering-path, and scoped-overflow regression coverage.
- `tests/e2e/chat-autoscroll.spec.ts`: extended the existing Chromium fixture for persisted tables, direct event-level final responses, post-tool final responses, security/link behavior, layout containment, and autoscroll.
- `docs/executed_tasks/TASK-0075-fix-assistant-markdown-tables-streaming.md`: recorded the active task instruction.
- `docs/executed_results/TASK-0075-fix-assistant-markdown-tables-streaming.md`: recorded this result.

## Tests and verification

- Reproduction before implementation: `npx.cmd tsx -e "...parseAssistantMarkdown(table)..."` returned one `text` node containing the complete raw table source.
- Reproduction after implementation returned one structured `table` node with header cells, body cells, and a nested `strong` node.
- `npm.cmd run build`: PASS.
- `npm.cmd run build:client`: PASS.
- `npm.cmd run typecheck:client`: PASS.
- `npm.cmd run lint`: PASS.
- `npm.cmd test`: PASS, 455 tests passed.
- Focused Chat test after test compilation: PASS, 67 tests passed.
- `npx.cmd playwright test tests/e2e/chat-autoscroll.spec.ts`: PASS, 1 Chromium test passed.
- `git diff --check -- <changed tracked frontend files>`: PASS; only existing line-ending warnings were reported.
- `npx.cmd prettier --check <task files>`: informational check reported formatting differences in the already-modified working files. The repository has no configured formatting-check script, and running a whole-file rewrite would alter unrelated pre-existing work; ESLint and all required checks pass.
- Initial `npx.cmd playwright test tests/e2e/chat-autoscroll.spec.ts --project=chromium`: not run because the repository config has no named projects. The focused test was rerun successfully using the config's global `browserName: 'chromium'` setting.

## Production code

- Table parsing reuses Marked's installed GFM lexer and preserves cell-level inline Markdown.
- Rendering continues to create DOM nodes without `innerHTML`; code block `textContent` remains intentional plain text.
- Raw scripts and event-handler HTML remain inert text.
- `javascript:` and `data:` links remain non-links; HTTPS links retain `target="_blank"` and `rel="noopener noreferrer"`.
- Table overflow is contained by `.chat-markdown-table`, so wide tables do not expand the application layout.

## Architecture

- The existing single assistant rendering path remains unchanged in `ChatView.ts`.
- Direct stream events, final responses after tool rounds, lazy persisted history, and non-lazy assistant events all call the same safe renderer.
- The existing bottom sentinel, scheduled layout-settle scrolling, stale-response protection, event chronology, and event-level stream protocol were preserved.

## Dependencies

- No dependencies added or changed.
- No second Markdown parser or regex table parser introduced.

## Deviations

- No `sanitize-html` table allowlist was changed because repository inspection confirmed that assistant rendering does not use `sanitize-html`; introducing an HTML-string sanitizer would create a second rendering architecture and unnecessary risk.
- No backend, API, provider, tool, persistence, or event-model files were changed for TASK-0075.

## Risks / findings

- The relevant Chat files contained substantial uncommitted work before TASK-0075. Those changes were preserved; this task made only additive table-rendering, CSS, test, and tracking changes.
- Marked's exported `Token` union includes a generic fallback that prevents TypeScript narrowing in the table switch case, so the implementation uses Marked's specific `Tokens.Table` type at that package boundary.

## Diff summary

- Added explicit safe support for GFM table structure and inline Markdown inside cells.
- Added locally scrollable, readable Chat table presentation.
- Added deterministic unit/source coverage and real Chromium coverage for all requested assistant delivery paths and security invariants.
