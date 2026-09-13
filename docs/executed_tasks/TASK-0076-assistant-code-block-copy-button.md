# TASK-0076 — Copy button for assistant code blocks

**Task ID:** TASK-0076
**Task slug:** assistant-code-block-copy-button

## Goal

Add a small `Copy` button to fenced code blocks rendered in assistant Markdown.

## Requirements

- Button must be a real `<button>` with `type="button"`
- Button text: `Copy`
- Copies only the code block's plain code text (no Markdown fences)
- Uses `navigator.clipboard.writeText(...)`
- Clipboard failure must not crash rendering
- Apply only to assistant fenced code blocks (not inline code, not user messages)
- Preserve all existing Markdown behavior
- No new dependencies
- Frontend-only change

## Files Changed

- `src/client/components/chat/MarkdownRenderer.ts` — Added Copy button to codeBlock rendering
- `src/client/components/chat/chat.css` — Added scoped styles for wrapper and copy button
- `src/client/components/chat/__tests__/ChatView.test.ts` — Added 7 new tests for Copy button behavior
