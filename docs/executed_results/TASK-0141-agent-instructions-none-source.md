# TASK-0141 Result: Agent Instructions None Source

Task ID: TASK-0141
Status: PASS

## Summary

Agent Instructions now supports `instructionSource: "inline" | "file" | "none"`. `none` disables only Agent-specific instructions, preserves inactive inline text and file paths, performs no instruction-file read, and leaves all other merged provider system context intact.

New Agents created through the editor or API default to `none`. Existing explicit inline/file Agents retain their source. Legacy persisted Agent JSON without `instructionSource` retains the repository fallback to `inline` and is not migrated.

## Repository Analysis

- Agent configuration is JSON-backed, so no schema migration was required.
- Agent input defaults and source-specific validation are owned by `AgentService`.
- Historical persisted JSON compatibility is owned by `AgentRepository`.
- Runtime instruction resolution and merged system-message assembly are owned by `AgentRunService`.
- Agent Prompt controls and API response parsing are owned by `ProjectAgentsSection`.
- Task / Assignment uses a separate two-value source parser and remains `inline | file`.

## Behavior

- `inline` shows and uses Inline instructions; Instruction file is hidden.
- `file` shows and safely resolves the existing Project-relative `.md` / `.txt` Instruction file; Inline instructions is hidden.
- `none` checks `Not in use`, hides both source inputs through the existing `[hidden]` behavior, and requires neither input.
- Source switching never changes either input value. Save payloads always preserve both values.
- Input validation accepts exactly `inline`, `file`, and `none`. File-path rules are unchanged for active file mode; inactive none-mode paths receive only existing safe string persistence constraints.
- Create and update persistence/API round-trip `none`, `instructions`, and `instructionFilePath` without clearing inactive values.
- None-mode runtime ignores preserved inline content, does not resolve or read the inactive instruction file, and cannot fail because that path is missing.
- Runtime still records the existing `instructions_loaded` operational event; no none-specific event was added.
- The provider still receives exactly one initial merged system message. With no Agent instructions, Skill context, attached-file context, and current date retain their existing order, with no placeholder, empty heading, or extra separator.
- Inline and file runtime behavior and file-mode safe failures remain unchanged.

## Files Changed

- `docs/ARCHITECTURE.md`
- `docs/executed_tasks/TASK-0141-agent-instructions-none-source.md`
- `docs/executed_results/TASK-0141-agent-instructions-none-source.md`
- `src/client/components/projects/ProjectAgentsSection.ts`
- `src/server/agent-types.ts`
- `src/server/repositories/agent-repository.ts`
- `src/server/services/agent-service.ts`
- `src/server/services/agent-run-service.ts`
- `tests/e2e/agent-prompt-source-visibility.spec.ts`
- `tests/frontend/projects-ui.test.ts`
- `tests/integration/agents-api.test.ts`
- `tests/unit/agent-persistence.test.ts`
- `tests/unit/agent-run-service.test.ts`
- `tests/unit/agent-service.test.ts`

## Focused Tests

- `npm.cmd run test:compile` - PASS.
- `node --test --test-concurrency=2 .test-dist/tests/unit/agent-service.test.js .test-dist/tests/unit/agent-persistence.test.js .test-dist/tests/unit/agent-run-service.test.js .test-dist/tests/frontend/projects-ui.test.js` - PASS, 259 tests.
- `npx.cmd playwright test tests/e2e/agent-prompt-source-visibility.spec.ts` - initial run found an ambiguous test-only Name locator; locator was made exact.
- `npx.cmd playwright test tests/e2e/agent-prompt-source-visibility.spec.ts` - PASS, 1 browser test.
- Tests cover exact source validation, new-Agent defaults, legacy fallback, explicit inline/file retention, UI state/visibility, value restoration, none create/update persistence and API round-trips, inactive-value preservation, no instruction-file read/failure in none mode, exact remaining merged system context, current date, Skill and attached-file context, one provider system message, and existing inline/file/Assignment behavior.
- Tests are deterministic and use stubbed local inference/routes; no external provider was called.

## Required Verification

- `npm.cmd run build` - PASS.
- `npm.cmd run build:client` - PASS.
- `npm.cmd run typecheck:client` - PASS.
- `npm.cmd run lint` - PASS.
- `npm.cmd test` - PASS, 1,102 tests across 65 top-level test groups with 0 failures.

## Production Code

- Extended Agent server/client source types and parsers with `none`.
- Added Agent-only new-input defaulting without changing Assignment defaults.
- Extended stored JSON validation while preserving the legacy missing-field fallback.
- Added the third accessible radio control and three-state visibility/save behavior.
- Made runtime effective-instruction resolution and merged system-section assembly support absent Agent instructions.

## Architecture

Existing HTTP/service/repository/runtime boundaries were preserved. The architecture documentation now identifies disabled Agent instructions. No migration or new abstraction was needed.

## Dependencies

No dependencies were added or changed for this task.

## Deviations

None from requested product behavior. The focused Playwright test required one test-locator correction after its first run; the corrected test passes.

## Risks / Findings

- The repository had extensive unrelated modified and untracked files before this task. They were not reverted or otherwise changed for this work.
- Relevant Agent implementation and test files were already untracked in the initial worktree state, so ordinary Git diffs do not provide a baseline for those files; review used targeted reads, searches, compilation, linting, focused tests, and the full suite.

## Diff Summary

The change is limited to Agent instruction-source typing/defaulting/validation/persistence, Prompt UI controls, effective runtime instruction selection, merged system-section handling, relevant architecture wording, and deterministic regression tests. Task / Assignment and unrelated Agent execution behavior remain unchanged.
