# TASK-0131: Agent Current Date System Message

## Status: PASS

## Implementation location

`src/server/services/agent-run-service.ts` — `buildModelMessages()` method constructs the provider context with a current-date system message injected as the final system message before the user task.

## Clock seam

The `AgentRunService` constructor accepts an optional `testNow?: () => Date` parameter (defaults to `() => new Date()` in production). This injectable clock seam is passed through at construction time and called exactly once during initial model context building, ensuring the same date persists across all tool/inference rounds.

## Date formatting method

Uses local calendar getters (`getFullYear()`, `getMonth()`, `getDate()`) on the captured `Date` instance, with zero-padded month/day via `String().padStart(2, '0')`. Produces deterministic `YYYY-MM-DD` format (e.g., `Current date: 2026-08-30`). Mirrors the Chat implementation from TASK-0069. No UTC formatting is used.

## Exact message ordering

```
1. { role: 'system', content: '<Agent instructions>' }
2. { role: 'system', content: '<Skill context>' }             // optional, per skill
3. { role: 'system', content: '<Attached Project files>' }    // optional
4. { role: 'system', content: 'Current date: YYYY-MM-DD' }
5. { role: 'user', content: '<Agent task>' }
```

The date is always the final system message before the user task, regardless of which optional contexts are present.

## Multi-round behavior

The `modelMessages` array is built once at run initialization and extended in-place during tool rounds with assistant tool_calls and tool results. The original captured date message remains unchanged across all inference rounds. No rebuild or refresh occurs on subsequent rounds. A simulated midnight crossing does not change the date mid-run.

## Files changed

| File | Change |
|------|--------|
| `src/server/services/agent-run-service.ts` | Added current-date system message to `buildModelMessages()`; added `testNow` constructor parameter with default `() => new Date()` |
| `tests/unit/agent-run-service.test.ts` | Added 12 focused tests covering all date-related requirements including a new test for attached files ordering before date |

## Focused tests (12 total, in `tests/unit/agent-run-service.test.ts`)

| # | Test name | Requirement covered |
|---|-----------|---------------------|
| 1 | `injects exactly one current-date system message when no Skills or attachments` | Req 1: single date message with minimal context |
| 2 | `formats the current-date message as "Current date: YYYY-MM-DD"` | Req 2: exact format verification |
| 3 | `uses local calendar getters, not UTC semantics` | Req 3: local time zone behavior |
| 4 | `keeps Agent instructions as first system message` | Req 4: instruction ordering preserved |
| 5 | `places Skill context before date message` | Req 5: skill ordering preserved |
| 6 | `places Attached Project files context before date message` | Req 6: attached files ordering preserved |
| 7 | `places date as final system message before user task` | Req 7: date is last system message |
| 8 | `does not persist the current-date message into Agent configuration` | Req 8: no config pollution |
| 9 | `retains exact same captured date across multiple tool rounds` | Req 9: multi-round stability |
| 10 | `simulated midnight crossing does not change the date mid-run` | Req 10: midnight invariance |
| 11 | `ordinary Agent run behavior remains unchanged apart from provider context` | Req 11: behavioral compatibility |
| 12 | Existing chronology tests updated to include date message in assertions | Req 12: no weakened tests |

## Verification results

| Command | Result |
|---------|--------|
| `npm run build` | **PASS** — TypeScript compilation succeeded |
| `npm run build:client` | **PASS** — Client build and asset copy succeeded |
| `npm run typecheck:client` | **PASS** — No type errors |
| `npm run lint` | **PASS** — ESLint clean |
| `npm test` | **PASS** — 1046 tests, 75 suites, 0 failures |

## Summary

All requirements satisfied. The Agent now receives the same current-date provider context behavior as Chat, with proper ordering, local calendar semantics, single-capture-per-run stability, and comprehensive deterministic test coverage using an injectable clock.
