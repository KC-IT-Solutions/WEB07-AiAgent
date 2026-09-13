# TASK-0074 - Chat UI polish: New chat icon and external links

Task ID: TASK-0074
Task slug: chat-ui-polish-new-chat-icon-external-links

## Instruction

Make two narrow frontend-only UI improvements without changing backend behavior:

1. Add a compact inline SVG plus icon before the visible `New chat` label in the upper button inside the expanded sidebar Chat section. Preserve its text, click behavior, creation/selection logic, border, radius, and section behavior. Use the client's existing SVG conventions, `currentColor`, no fill, one horizontal and one vertical line, and hide the decorative icon from assistive technology. Add only minimal flex alignment/gap CSS.
2. Make anchors rendered from assistant/model Markdown open in a new tab by adding `target="_blank"` and `rel="noopener noreferrer"` within the existing safe Markdown rendering flow. Do not globally modify links, use `window.open()`, allow raw HTML to bypass safe rendering, or weaken URL protocol validation.

Add deterministic frontend coverage for the upper button's SVG plus structure, retained label, and retained click wiring. Add coverage that `[Example](https://example.com)` renders an anchor with the expected href, target, and rel, and retain regression coverage for rejected unsafe URLs and ordinary Markdown rendering.

Do not redesign unrelated UI, add dependencies, modify backend code, or alter other navigation links.

Run:

- `npm.cmd run build`
- `npm.cmd run build:client`
- `npm.cmd run typecheck:client`
- `npm.cmd run lint`
- `npm.cmd test`

Run a narrow frontend/browser command too if one cleanly covers this behavior. Create and re-read this task record before implementation, then create and re-read the corresponding result record before the final response.

Final response must contain only the Task ID, terminal status, result path, and one short summary sentence in the requested format.
