# TASK-0040 - Render assistant messages as Markdown

Task ID: TASK-0040
Task slug: render-assistant-messages-markdown

## Goal

Render assistant messages in ChatView with safe Markdown formatting instead of plain text.

Do not change inference behavior.

## Read first

Run:

    powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\inspect-repo.ps1

Then read only relevant files for:

- ChatView
- chat message styling
- package.json
- existing frontend tests
- CODINGSTANDARDS.md
- SECURITY.md

Do not use recursive repository listing commands.

## Dependency check

First inspect existing dependencies.

If the project already contains a suitable Markdown parser and sanitizer, reuse them.

If no suitable dependency exists:

- do not add a new npm dependency in this task
- implement only a small, explicit Markdown renderer for the supported subset below
- keep it isolated from ChatView
- do not attempt full CommonMark/GFM compatibility

Do not introduce a large generic parser.

## Supported Markdown

Assistant messages should support at minimum:

- paragraphs
- headings
- bold
- italic
- unordered lists
- ordered lists
- inline code
- fenced code blocks
- blockquotes
- links

Support fenced code blocks such as:

    ```typescript
    const value = 1;
    ```

Language names may be preserved as metadata/class information, but do not add syntax-highlighting dependencies in this task.

## Security

Model output is untrusted.

Do not directly inject raw model output with innerHTML.

Raw HTML embedded in Markdown must not execute or render as arbitrary HTML.

Examples that must remain harmless:

    <script>alert(1)</script>

    <img src=x onerror=alert(1)>

Links must not create unsafe javascript: URLs.

Prefer constructing safe DOM nodes directly if implementing the renderer locally.

Do not use unchecked HTML insertion.

## User messages

Keep user-authored messages rendered as plain text.

Markdown rendering applies only to assistant messages.

## ChatView integration

Replace assistant plain-text rendering with the Markdown renderer.

Preserve:

- existing inference requests
- loading behavior
- error behavior
- chat switching behavior
- text of user messages
- no message persistence

Do not modify backend inference.

## Styling

Add minimal Markdown-specific styling for assistant messages.

Support readable:

- paragraphs
- headings
- lists
- blockquotes
- links
- inline code
- code blocks

Code blocks should:

- preserve whitespace
- support horizontal scrolling when necessary
- not overflow the chat container

Do not redesign ChatView.

## Tests

Add focused deterministic tests for at minimum:

- assistant paragraph rendering
- heading rendering
- bold text
- italic text
- unordered list
- ordered list
- inline code
- fenced code block
- blockquote
- safe link
- javascript: link is rejected or rendered harmlessly
- raw script/HTML cannot execute
- user messages remain plain text
- inference behavior remains unchanged

Do not use LM Studio.

Do not weaken existing tests.

## Out of scope

Do not add:

- message persistence
- conversation history
- streaming
- syntax-highlighting libraries
- copy-code buttons
- LaTeX
- Mermaid
- raw HTML support
- backend changes
- API changes
- new dependencies unless a suitable one already exists in package.json
- unrelated refactors

## Verification

Run:

    npm run build
    npm run build:client
    npm run typecheck:client
    npm run lint
    npm test

## Acceptance

- assistant messages render supported Markdown
- user messages remain plain text
- code blocks render correctly
- Markdown cannot execute arbitrary HTML or JavaScript
- unsafe link schemes are blocked
- existing inference behavior still works
- no backend changes
- no message persistence
- all tests pass
- no unnecessary dependency added
- no unrelated changes

## Tracking

Create:

- docs/executed_tasks/TASK-0040-render-assistant-messages-markdown.md
- docs/executed_results/TASK-0040-render-assistant-messages-markdown.md

Do not read historical task/result files.

## Final response

Return only:

    Task ID: TASK-0040
    Status: <PASS|FAIL|BLOCKED>
    Result: docs/executed_results/TASK-0040-render-assistant-messages-markdown.md
    Summary: <one short sentence>
