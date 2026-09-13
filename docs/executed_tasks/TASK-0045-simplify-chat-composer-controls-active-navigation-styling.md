# TASK-0045 - Simplify chat composer controls and active navigation styling

Task ID: TASK-0045
Task slug: simplify-chat-composer-controls-active-navigation-styling

## Goal

Refine the Chat UI so the sidebar navigation and composer controls feel visually integrated instead of looking like separate boxed controls.

Client UI only.

## Instructions

- Run `powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\inspect-repo.ps1` before inspecting only the relevant sidebar/layout navigation, `ChatView`, `chat.css`, frontend tests, and coding standards. Do not read historical task/result files or use recursive repository listings.
- Keep the active Chat/Settings row highlight while making its SVG/icon area transparent, without a separate boxed surface. Preserve navigation behavior, hover/focus clarity, and keyboard accessibility.
- Remove persistent borders and default filled backgrounds from the semantic Attach, Export, and Send composer buttons. Preserve accessible labels/titles, visible focus, subtle hover behavior, Send behavior, and inert Attach/Export behavior. Keep the outer composer container.
- Remove visible `Model connection` and `Model` labels. Show `Select connection` and `Select model` placeholder options when unselected; placeholders must not be valid persisted selections. Preserve selection, discovery, persistence, inference, and disabled-model behavior.
- Replace fixed selector widths with content-adaptive, bounded widths that leave room for native arrows and wrap cleanly on narrow viewports. Prefer CSS/native sizing and avoid a broad layout refactor.
- Preserve all chat, message, settings, modal, backend, API, and database behavior outside this client styling task. Add no dependencies and make no backend changes.
- Add or update only focused deterministic frontend tests for the requested navigation, composer button, selector placeholder/sizing, and unchanged model/inference behavior.
- Run `npm run build`, `npm run build:client`, `npm run typecheck:client`, `npm run lint`, and `npm test`, using `npm.cmd` equivalents if needed.
- Create the corresponding task and result tracking files and report no unrelated changes.

## Acceptance criteria

- Active Chat/Settings rows retain the lighter whole-row background and SVG/icon areas share that background transparently.
- Composer icon buttons have no persistent boxed appearance while remaining semantic and accessible with visible keyboard focus.
- Empty selectors show non-persistable placeholders and visible labels are removed.
- Select widths adapt to content, remain sensibly bounded, and do not break the toolbar with long values.
- Existing model selection and inference wiring remains unchanged.
- No backend changes or dependencies are introduced, and all required verification passes.
