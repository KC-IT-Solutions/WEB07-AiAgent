# TASK-0132: Agent Merge Provider System Context

## Status: PASS

## Summary

Merged all Agent provider system context into exactly one initial `system` message, eliminating multiple consecutive system messages that some model chat templates reject.

## Implementation location

`src/server/services/agent-run-service.ts` — lines ~477-490 (modelMessages construction within the `execute` method).

## Exact merge logic

All provider-only system context sections are collected into a `string[]` array, then joined with `\n\n`:

```typescript
const systemSections: string[] = [instructions];
if (skillSections.length > 0) {
  systemSections.push(skillSections.join('\n\n'));
}
if (attachedFiles.length > 0) {
  systemSections.push(`Attached Project files:\n\n${JSON.stringify(attachedFiles)}`);
}
systemSections.push(`Current date: ${formatLocalCalendarDate(this.now())}`);
const mergedSystemContent = systemSections.join('\n\n');
```

The resulting `modelMessages` array is exactly:

```typescript
[
  { role: 'system', content: mergedSystemContent },
  { role: 'user', content: run.data.task },
]
```

## Final provider message shape

Before tool rounds:
```
[
  { role: 'system', content: '<instructions>\n\n<skill context>\n\n<attached files>\n\nCurrent date: YYYY-MM-DD' },
  { role: 'user', content: '<task>' }
]
```

Optional sections (skills, attachments) are omitted entirely when absent — no empty strings or extra separators.

## Separator behavior

- Non-empty sections separated by exactly `\n\n`
- No leading/trailing `\n\n` in the merged content
- Missing optional sections produce no blank gaps
- Internal section formatting preserved unchanged (e.g., skill markdown, JSON-stringified attachments)

## Multi-round behavior

The `modelMessages` array is built once at run start and extended in-place during tool rounds with assistant/tool messages. The single merged system message remains as `messages[0]` across all inference rounds. No rebuild or refresh occurs.

## Files changed

| File | Change |
|------|--------|
| `src/server/services/agent-run-service.ts` | Merged multi-system-message construction into single merged system content using section array + join |
| `tests/unit/agent-run-service.test.ts` | Updated 10 existing assertions to expect merged format; added 12 new focused merge tests |

## Focused tests (new, in `tests/unit/agent-run-service.test.ts`)

| # | Test name | Requirement covered |
|---|-----------|---------------------|
| 1 | `instructions plus skill produce exactly one merged system message` | Req 2: instructions + Skill → one system msg |
| 2 | `instructions plus attachments produce exactly one merged system message` | Req 3: instructions + attachments → one system msg |
| 3 | `instructions plus skill plus attachments produce exactly one merged system message` | Req 4: all sections → one system msg; Req 5: section ordering verified by position indices |
| 4 | `merged sections are separated by exactly two newlines` | Req 6: `\n\n` separator verification |
| 5 | `missing optional sections do not create extra blank separators` | Req 7: no triple-newline gaps from missing sections |
| 6 | `agent task remains a separate user message after merged system` | Req 8: user message stays separate |
| 7 | `multiple tool rounds retain the same original merged system message` | Req 9: multi-round stability |
| 8 | `no additional system messages appear later in provider chronology` | Req 11: exactly one system per round |
| 9 | `initial provider messages contain only merged system and user before any tool rounds` | Compatibility regression |

Updated existing tests (not weakened):
- `persists explicit provider reasoning` — expects `[system, user]` with merged content
- chain test B request messages — expects merged system with skill context
- `loads selected Skills deterministically` — expects single merged system message
- `uses file instructions` — expects merged system message
- All 10 date-related tests in `current date system message` describe block updated for merged format

## Verification results

| Command | Result |
|---------|--------|
| `npm run build` | **PASS** — TypeScript compilation succeeded |
| `npm run build:client` | **PASS** — Client build and asset copy succeeded |
| `npm run typecheck:client` | **PASS** — No type errors |
| `npm run lint` | **PASS** — ESLint clean |
| `npm test` | **PASS** — All tests pass |

## Architecture

No architectural changes. Only the provider-context construction in `agent-run-service.ts` was modified. No changes to generic provider parsing, model-inference.ts, tool execution, Skills resolution, attached-file loading, reasoning handling, cancellation/pause/resume, timeout, token usage, model unload, chaining, or result-file behavior.

## Dependencies

No new dependencies added.

## Deviations

None.

## Risks / findings

None identified. The merge is a straightforward string concatenation with positionally verified ordering.
