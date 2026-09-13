# TASK-0069 - Add current date as final system message

Task ID: TASK-0069
Task slug: current-date-system-message

## Instruction

Always include the server's current calendar date in every Chat inference provider context as its own final system message, after all deterministic Skill system context and before ordinary conversation chronology.

Required message:

```ts
{
  role: "system",
  content: "Current date: YYYY-MM-DD",
}
```

Capture the date once at the start of each Chat inference and reuse it for every provider round, including tool rounds. Add the smallest existing-style clock seam with production default `() => new Date()` so tests use fixed dates. Convert the captured date deterministically using one consistent server/runtime calendar basis and no date library.

The message is provider-only context. Do not persist or stream it, alter Chat history projection, reorder non-system chronology, modify Skill behavior or representation, add logging, or change frontend, APIs, database, JSONL, provider abstraction, timeout, cancellation, tools, or slash commands.

Add deterministic regression coverage for zero Skills, active Skills, multiple provider rounds, midnight crossing with one clock capture, unchanged chronology, and absence from persisted/streamed events. Preserve combined or multiple Skill context as currently implemented and ensure the date remains the last system message in every round.

Inspect only relevant current files for `ChatInferenceService`, provider message construction, Skill system context, model request types, history projection, inference tests, active-Skill tests, and the required project documentation. Do not read historical execution records.

Run:

```text
npm.cmd run build
npm.cmd run build:client
npm.cmd run typecheck:client
npm.cmd run lint
npm.cmd test
```

Create this task record and `docs/executed_results/TASK-0069-current-date-system-message.md`. Acceptance requires the exact date content, one capture per inference, all-round reuse, final-system ordering after Skills, zero-Skill coverage, exact ordinary chronology, no persistence or streaming, deterministic tests, all verification passing, and no unrelated changes.
