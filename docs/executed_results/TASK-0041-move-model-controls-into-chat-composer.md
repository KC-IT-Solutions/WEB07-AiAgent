Task ID: TASK-0041
Status: PASS

Summary:
Moved the existing model connection and model selectors into a two-row chat composer with Send in the lower toolbar.

Repository analysis:
The model controls, model discovery, selection persistence, and inference composition were contained in `ChatView.ts`; the layout required moving the existing controls instance rather than changing its behavior. Relevant styling was contained in `chat.css`, and focused source-level frontend coverage existed in `ChatView.test.ts` and `chat-list-ui.test.ts`.

Files changed:
- `src/client/components/chat/ChatView.ts`
- `src/client/components/chat/chat.css`
- `src/client/components/chat/__tests__/ChatView.test.ts`
- `docs/executed_tasks/TASK-0041-move-model-controls-into-chat-composer.md`
- `docs/executed_results/TASK-0041-move-model-controls-into-chat-composer.md`

Tests and verification:
- `npm run build` could not start because PowerShell blocked the `npm.ps1` shim under the system execution policy.
- `npm.cmd run build` passed.
- `npm.cmd run build:client` passed.
- `npm.cmd run typecheck:client` passed.
- `npm.cmd run lint` passed.
- `npm.cmd test` passed with 254 tests passing and no failures, skips, or cancellations.

Production code:
The top chat card now contains only the chat title. The composer contains an upper message-input row and a lower wrapping toolbar with the single existing model-controls instance followed by Send at the far right.

Architecture:
No architecture, backend, API, persistence, model discovery, inference, or Markdown rendering changes were made.

Dependencies:
No dependencies were added or changed.

Deviations:
The required npm scripts were invoked through `npm.cmd` after the PowerShell npm shim was blocked; the underlying package scripts were unchanged.

Risks / findings:
Layout coverage is source-level and the required build and test suite passed; no browser visual test was added for this CSS-only repositioning.

Diff summary:
Reused `createModelControls` in the composer toolbar, added responsive Chat-specific composer styling, and added focused assertions for header removal, composer containment, accessibility labels, Send placement, and selector uniqueness. The repository files were already untracked, so `git diff` had no tracked baseline; all task-touched files were reviewed directly and unrelated worktree content was not modified.
