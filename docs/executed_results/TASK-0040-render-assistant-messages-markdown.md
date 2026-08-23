# TASK-0040 - Render assistant messages as Markdown

Task ID: TASK-0040
Status: PASS

Summary:

Assistant messages now render the required Markdown subset through safe, allowlisted DOM construction while user messages remain plain text and inference behavior is unchanged.

Repository analysis:

- ChatView previously rendered every message through a text-only `span`.
- The project already depended on `marked` and `sanitize-html`.
- The browser client is compiled as unbundled ES modules. `marked` can be exposed through an import map, while `sanitize-html` is Node-oriented and is unnecessary because the implementation never creates HTML from strings.
- Existing ChatView tests use Node's test runner and verify frontend source behavior without LM Studio.

Files changed:

- `src/client/components/chat/MarkdownRenderer.ts`
- `src/client/components/chat/ChatView.ts`
- `src/client/components/chat/chat.css`
- `src/client/components/chat/__tests__/ChatView.test.ts`
- `src/client/index.html`
- `scripts/copy-client-assets.mjs`
- `docs/executed_tasks/TASK-0040-render-assistant-messages-markdown.md`
- `docs/executed_results/TASK-0040-render-assistant-messages-markdown.md`

Tests and verification:

- `powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\inspect-repo.ps1` - passed.
- `npm.cmd run build` - passed.
- `npm.cmd run build:client` - passed; client assets and the existing Marked ESM distribution were copied.
- `npm.cmd run typecheck:client` - passed.
- `npm.cmd run lint` - passed.
- `npm.cmd test` - passed: 251 tests, 22 suites, 0 failures.
- Focused ChatView run `node --test .test-dist/src/client/components/chat/__tests__/ChatView.test.js` - passed: 30 tests, 0 failures.
- Initial direct `npm run typecheck:client` and `npm run test:compile` attempts were blocked by the machine's PowerShell script execution policy; the equivalent `npm.cmd` commands passed.
- `git diff --check` reported a pre-existing trailing whitespace line in the unrelated modified `README.md`; TASK-0040 did not change that file.

Production code:

- Uses Marked's lexer to recognize paragraphs, headings, emphasis, lists, inline code, fenced code, blockquotes, and links.
- Converts parser tokens into an explicit internal node model and creates DOM nodes with `createElement`, `createTextNode`, and `textContent` only.
- Renders raw Markdown HTML as visible text and converts unsafe links into non-link spans.
- Allows only HTTP, HTTPS, mailto, and relative links.
- Keeps user and error messages on the existing plain-text path.
- Adds minimal scoped Markdown styles, including bounded horizontally scrolling code blocks.

Architecture:

- Markdown parsing and rendering are isolated in `MarkdownRenderer.ts`; ChatView only selects it for assistant messages.
- The existing unbundled client receives Marked through an import map and the existing client asset-copy build step.
- No backend, API, inference, persistence, or chat-switching code changed.

Dependencies:

- No dependency was added or updated.
- Reused the existing `marked` dependency.
- Did not use `sanitize-html` in browser code because safe DOM construction avoids HTML string insertion entirely.

Deviations:

- Required npm scripts were invoked as `npm.cmd` rather than `npm` because PowerShell blocks `npm.ps1` on this machine; script behavior is identical.

Risks / findings:

- The unrelated worktree already contains many untracked files and a modified `README.md`; none were reverted or altered for this task.
- No remaining TASK-0040 acceptance risk was identified.

Diff summary:

- Added one isolated safe Markdown renderer.
- Integrated assistant-only rendering and scoped Markdown styles.
- Exposed the existing parser to the unbundled browser build.
- Added deterministic coverage for all required formatting and security cases while preserving inference request assertions.
