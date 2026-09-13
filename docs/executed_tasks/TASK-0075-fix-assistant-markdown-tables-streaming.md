# TASK-0075 - Fix assistant Markdown rendering for tables and streamed responses

Task ID: TASK-0075
Task slug: fix-assistant-markdown-tables-streaming

## Instruction

Fix the frontend Chat assistant rendering bug where valid Markdown, including tables and bold text, can appear as raw source. Identify and document the concrete root cause by inspecting direct final responses, final responses after tool rounds, event-level streaming, and persisted history.

Use one existing safe rendering path for all assistant content:

```text
assistant content -> Markdown parser -> sanitizer -> safe DOM
```

Preserve meaningful Markdown line breaks. Do not render normal assistant Markdown via `textContent`, add ad hoc table parsing, add a Markdown dependency, broaden raw HTML support, or change backend inference, provider/tool chronology, APIs, persistence, event models, or streaming protocols.

Confirm the installed Marked configuration supports standard GitHub-flavored Markdown tables and update only the sanitizer's safe structural table allowlist (`table`, `thead`, `tbody`, `tr`, `th`, and `td`; `tfoot` only if naturally required). Preserve script/event-handler removal, unsafe-protocol rejection, safe HTTPS links, and external-link `target="_blank"` plus `rel="noopener noreferrer"` behavior.

Add minimal Chat-scoped table CSS only if required. Tables must fit the assistant message area or scroll horizontally within it without breaking the Chat/sidebar layout. Preserve TASK-0072's bottom-sentinel scheduled autoscroll and do not add another scrolling implementation.

Add deterministic regression coverage for direct assistant tables and ordinary bold, the existing live streamed/final path, a tool-round final response, persisted history, Markdown sanitization, links, and ordinary Markdown. Add or extend the smallest existing Playwright Chromium test to verify a real rendered `<table>` and usable narrow layout where practical. Do not invoke a real model.

Use this representative response:

```markdown
Hej! Här är några exempel:

| Vad | Hur jag hjälper |
|---|---|
| **Svara på frågor** | Fakta och förklaringar |
| **Teknisk support** | Felsökning och råd |

Och **mycket mer**.
```

Run:

```text
npm.cmd run build
npm.cmd run build:client
npm.cmd run typecheck:client
npm.cmd run lint
npm.cmd test
```

Also run the focused Playwright/Chromium regression test if one is added. Create the corresponding result report, include the actual root cause and exact verification outcomes, and preserve all stated invariants and out-of-scope constraints from the task instruction.
