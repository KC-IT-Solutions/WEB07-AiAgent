# TASK-0141: Agent Instructions None Source

Task ID: TASK-0141
Slug: agent-instructions-none-source

## Instruction

Add a third Instructions source option in Agent Settings named `Not in use`.

Extend Agent `instructionSource` from `inline | file` to `inline | file | none`. Inline uses `instructions`; file safely reads the Project-relative `instructionFilePath` at runtime; none supplies no Agent-specific instructions and must not read or validate an inactive file at runtime.

For new Agents created through the editor/API, default `instructionSource` to `none`. Existing Agents with explicit `inline` or `file` sources must remain unchanged, and older persisted data that omits the field must retain the repository/API's existing backward-compatible fallback unless correctness requires otherwise.

In Agent Settings -> Prompt, show radio choices `Write instructions`, `Use Project file`, and `Not in use`. Inline mode shows only Inline instructions, file mode shows only Instruction file, and none mode hides both. Continue using shared `[hidden]` behavior and do not render empty placeholders for inactive inputs.

Switching sources must preserve both `instructions` and `instructionFilePath`, including transitions through `none`. Save/create/update/load/API persistence must round-trip all three source values and preserve inactive values rather than normalizing them to empty strings.

Input validation must accept exactly `inline`, `file`, and `none`. Preserve current source-specific inline validation and existing `.md` / `.txt` Project-relative path validation for file mode. None mode must not require either value and must not validate inactive content more strictly than safe persistence requires.

Runtime effective instructions must use inline content for `inline`, current safely resolved Project-file content for `file`, and no Agent-specific content for `none`. None must not fall back to preserved inactive values, read a file, or fail because an inactive path is missing. Preserve file-mode safe failures and inline behavior.

None disables only the Agent's own Instructions section. Preserve Skill context, attached-file context, current date, and all other provider system context. Continue sending exactly one merged initial system message, with no placeholder, empty Instructions heading, or extra provider message. Preserve remaining section order and Agent Execution chronology; add no none-specific execution event.

Do not change Task / Assignment source semantics or UI. Do not change Prompt placement, General, Model, Context, Tools & Skills, Runtime, Advanced, pre-run tools, provider tool exposure, tool-call IDs, chaining, result files, cancellation, Agent Execution, Agent Errors, generic filesystem permissions, or current-date behavior. Do not add a database migration unless strictly necessary.

Primary frontend implementation is expected in `src/client/components/projects/ProjectAgentsSection.ts`; update client type/parser, controls, new-Agent state, visibility, and save payload. Update only required backend type, service validation/default, repository parsing/persistence, runtime resolution, API, and test layers.

Add deterministic, provider-free tests proving:

1. `instructionSource` accepts `none`.
2. Invalid values are rejected.
3. New Agent default is `none`.
4. New UI checks only `Not in use` and hides both source inputs.
5. Existing inline/file Agents retain and display their source.
6. Inline, file, and none visibility is correct.
7. Source switching through all modes preserves/restores inline text and file path.
8. Save payload supports `none`.
9. None create/update persistence/API round-trips, preserving both inactive values.
10. Runtime none ignores inline text, does not read or fail on inactive file paths, and omits Agent-specific provider context.
11. Remaining system sections, current date, Skill context, attached-file context, and exactly one merged initial system message remain correct without placeholders or empty headings.
12. File mode still reads current Project content and preserves failures.
13. Inline behavior, Task / Assignment behavior, existing Prompt visibility, and existing Agent compatibility remain unchanged.

Run and require all five verification commands to pass:

```text
npm.cmd run build
npm.cmd run build:client
npm.cmd run typecheck:client
npm.cmd run lint
npm.cmd test
```

Before the final response, create and re-read `docs/executed_results/TASK-0141-agent-instructions-none-source.md`. Report semantics, default, compatibility, UI visibility, value preservation, validation/persistence, runtime and provider behavior, changed files, focused tests, all five verification results, and PASS/BLOCKED status.
