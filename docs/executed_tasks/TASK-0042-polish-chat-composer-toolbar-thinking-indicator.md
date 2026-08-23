# TASK-0042 - Polish chat composer toolbar and thinking indicator

Task ID: TASK-0042
Task slug: polish-chat-composer-toolbar-thinking-indicator

## Goal

Polish the Chat composer toolbar using the SVG controls from the provided page-chat.html reference, remove the now-redundant top chat info box, and replace the current Thinking text with an animated three-dot indicator bubble.

Do not change normal user or assistant message styling. This is a client UI task only.

## Requirements

- Run `powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\inspect-repo.ps1`, then inspect only relevant ChatView, chat CSS, composer, inference loading, page-chat.html reference, frontend tests, and coding standards files.
- Remove the redundant white content card that repeats the active chat title, while preserving the layout-shell title, sidebar chat list, and message area.
- Reuse inline SVG paths from page-chat.html where available for Attach, Export/download, and Send controls without adding dependencies.
- Render Attach and Export as real accessible buttons with labels/titles, but no network request, file picker, download, or state-changing behavior.
- Preserve Send behavior while replacing its text with a paper-plane SVG.
- Keep the two-row composer: message input above; Attach, model connection, model, Export, and Send below, with Send toward the right and clean narrow-width wrapping.
- Do not duplicate model controls.
- Replace visible `Thinking...` with three visible dot elements inside a dedicated compact assistant-side loading bubble.
- Animate the dots vertically in a subtle repeating staggered 1-2-3 CSS wave without an external library.
- Apply loading bubble styling only to the thinking indicator, not normal user or assistant messages, and preserve Markdown presentation.
- Preserve inference API calls, duplicate-send protection, active-chat handling, late-response protection, model controls/discovery, persistence, and rename/delete behavior.
- Add only Chat-specific CSS needed for toolbar icons, interaction appearance, alignment, loading bubble, and dot animation. Do not modify shared modal styling.

## Tests

Add or update focused deterministic frontend tests covering:

- redundant top chat info box removal
- SVG Send, Attach, and Export buttons
- inert placeholder behavior and accessible icon labels
- retained composer model connection and model controls
- replacement of Thinking text with animated `...`
- dedicated loading/bubble class and three animated dot elements
- unchanged assistant Markdown and user message styling
- preserved inference wiring

Do not use LM Studio.

## Out of scope

Do not add attachment/export functionality, file input, Markdown export, voice input, new sessions, message redesign, backend/API changes, dependencies, or unrelated refactors.

## Verification

Run:

    npm run build
    npm run build:client
    npm run typecheck:client
    npm run lint
    npm test

## Acceptance

- The redundant top chat info box is removed.
- Composer contains accessible inline-SVG Attach, connection, model, Export, and working Send controls.
- Attach and Export remain inert placeholders.
- Inference loading displays three animated dots in a dedicated bubble only.
- Normal messages and Markdown rendering remain unchanged.
- All verification passes with no backend, dependency, or unrelated changes.

## Tracking

Create:

- `docs/executed_tasks/TASK-0042-polish-chat-composer-toolbar-thinking-indicator.md`
- `docs/executed_results/TASK-0042-polish-chat-composer-toolbar-thinking-indicator.md`

Do not read historical task/result files.

## Final response

Return only:

    Task ID: TASK-0042
    Status: <PASS|FAIL|BLOCKED>
    Result: docs/executed_results/TASK-0042-polish-chat-composer-toolbar-thinking-indicator.md
    Summary: <one short sentence>
