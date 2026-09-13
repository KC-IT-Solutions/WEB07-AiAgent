Task ID: TASK-0139
Status: PASS

Summary:

- The Prompt tab now hides the inactive Instructions input while preserving both the inline instructions and instruction file path values.
- Task / Assignment now has `Write task` and `Use Project file` source controls, with only the selected input visible and both values preserved while switching sources or tabs.
- Added persisted `assignmentSource: "inline" | "file"` and `assignmentFilePath: string` Agent fields.
- Existing Agent JSON without the new fields loads with `assignmentSource: "inline"` and `assignmentFilePath: ""`; no database migration was required.
- File assignments are resolved from current Project file content at each run, including chained-Agent assignment resolution.

Repository analysis:

- Agents use typed, JSON-backed configuration in `AgentRepository`, so optional-field defaults provide backward-compatible evolution without a schema migration.
- `AgentService` owns API input normalization and validation.
- `AgentRunService` owns assignment resolution and existing run failure/provider chronology behavior.
- The existing Project path picker and `ProjectFilesystemService.readFile` provide the safe Project-scoped selection and read boundaries.

Files changed:

- `docs/ARCHITECTURE.md`
- `docs/executed_tasks/TASK-0139-agent-assignment-source-and-prompt-source-visibility.md`
- `docs/executed_results/TASK-0139-agent-assignment-source-and-prompt-source-visibility.md`
- `src/client/components/projects/ProjectAgentsSection.ts`
- `src/server/agent-prompt-file.ts`
- `src/server/agent-types.ts`
- `src/server/repositories/agent-repository.ts`
- `src/server/services/agent-service.ts`
- `src/server/services/agent-run-service.ts`
- `tests/frontend/projects-ui.test.ts`
- `tests/integration/agents-api.test.ts`
- `tests/unit/agent-persistence.test.ts`
- `tests/unit/agent-run-attached-files.test.ts`
- `tests/unit/agent-run-persistence.test.ts`
- `tests/unit/agent-run-repository.test.ts`
- `tests/unit/agent-run-service.test.ts`
- `tests/unit/agent-service.test.ts`
- `tests/unit/model-lifecycle.test.ts`

Tests and verification:

- Focused Agent service and persistence tests passed: 19 tests.
- Focused Agent runtime tests passed: 86 tests, including dynamic file content, safe failure, provider chronology, execution `User task`, permission independence, pre-run composition, and chained file assignment.
- Focused Agent API tests passed: 10 tests.
- Focused Projects UI tests passed: 151 tests.
- `npm.cmd run build`: PASS.
- `npm.cmd run build:client`: PASS.
- `npm.cmd run typecheck:client`: PASS.
- `npm.cmd run lint`: PASS.
- `npm.cmd test`: PASS, 1,099 tests passed with 0 failures.
- `git diff --check`: PASS; Git emitted only existing LF-to-CRLF working-copy warnings.

Production code:

- Instructions source changes immediately toggle `hidden` on the inline and file controls without changing either input value.
- Task source controls use unique radio/input IDs, existing labels, and the existing `.md`/`.txt` Project file picker.
- Create/update/load/API DTO paths preserve `instructionSource`, `instructions`, `instructionFilePath`, `assignmentSource`, `assignment`, and `assignmentFilePath`.
- `assignmentSource` rejects values other than `inline` and `file`.
- Non-empty assignment file paths must be strings containing a safe Project-relative `.md` or `.txt` path with no absolute path, traversal, backslash, colon, NUL, empty segment, or encoded traversal markers.
- File source requires a file path. Inline source retains an inactive valid file path and continues to use `assignment`.
- File assignment content is read before run launch and persisted as the run task and `user_task` execution content. The file path is never used as task content.
- Missing, unreadable, unsafe, unsupported, or empty task files produce a sanitized `ASSIGNMENT_FILE_UNAVAILABLE` terminal run before provider inference, with no inline fallback.
- Explicit assignment-file reads call the Project filesystem boundary directly and do not grant or depend on generic Agent Project `read` tool permission.

Architecture:

- No new layer or execution architecture was introduced.
- Added one shared prompt-file path predicate used by Agent API validation and runtime defense in depth.
- JSON defaults avoid a migration while preserving historical Agent rows.
- Existing instruction runtime resolution, provider message count/order, pre-run tool semantics, and generic Project filesystem permissions remain unchanged.

Dependencies:

- No dependencies added or changed.

Deviations:

- None.

Risks / findings:

- The worktree contained extensive pre-existing modified and untracked files. They were not reverted or otherwise changed for this task except for the files listed above.

Diff summary:

- Added Agent assignment source/path fields and migration-free repository defaults.
- Added shared safe `.md`/`.txt` prompt-file path validation.
- Added source-specific Prompt-tab visibility and Project file selection for Task / Assignment.
- Added runtime task-file resolution, safe pre-inference failure, resolved task persistence/provider use, and chained-Agent support.
- Added deterministic UI, persistence, API, validation, and runtime coverage.
