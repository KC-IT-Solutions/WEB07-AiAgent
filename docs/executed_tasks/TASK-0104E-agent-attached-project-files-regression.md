## TASK-0104E: Verify complete Agent attached Project files flow

**Slug:** agent-attached-project-files-regression

### Preflight

Before repository inspection:

1. Read AGENTS.md.
2. Read docs/IGNORE.md.
3. Read docs/CODINGSTANDARDS.md.
4. Read docs/DEFINITION_OF_DONE.md.
5. Read docs/TASK_WORKFLOW.md.
6. For this task, also read:
   - docs/ARCHITECTURE.md
   - docs/TESTING.md
   - docs/SECURITY.md
   - docs/DATABASE.md
7. Confirm the active Task ID and slug.
8. Create `docs/executed_tasks/TASK-0104E-agent-attached-project-files-regression.md` containing this exact task instruction.
9. Re-read that task file before implementation.

Use scripts/inspect-repo.ps1 for repository discovery as required by docs/IGNORE.md.

### Goal

Perform a focused final regression review of the complete Agent attached Project files feature implemented in TASK-0104A through TASK-0104D.

Do not add new product functionality. Verify that persistence, Agent Settings UI, runtime context loading, permissions independence, filesystem safety, error handling, and size limits work together correctly. Only make changes if a real defect or missing required regression test is found.

### Feature Contract

An Agent has `attachedProjectFiles: string[]`. The feature must satisfy all contract requirements detailed in the task specification (items 1-8 covering persistence, UI, runtime context, permission independence, failure behavior, size limits, aggregate limits, and existing behavior preservation).

### Scope

This task is primarily verification and regression coverage. Inspect the implementation from TASK-0104A through TASK-0104D and determine whether the complete feature contract above is already satisfied. If everything is already correct: do not change production code; add tests only if an important contract item is currently untested. If a real defect is found: make the smallest coherent fix, add a focused regression test, do not refactor unrelated code.

### Out of Scope

See full list in task specification (new attachment functionality, directory attachments, UI enhancements, configurable limits, Admin settings, etc.).

### Regression Tests

Ensure deterministic coverage exists for at least 28 specified items (persistence defaults, legacy JSON, multiple paths, invalid data, UI restore/add/remove/duplicate/save, permission independence, runtime context, failure behavior, size limits, aggregate limits, partial context prevention, external tool/Skill preservation). Prefer existing tests. Do not create one oversized test file merely to duplicate existing coverage.

### Architecture Review

Check that attachment file reads use ProjectFilesystemService boundary, provider filesystem tools still use projectFilestreamPermissions, no arbitrary Node fs read was introduced, attachment context is created once before initial inference, and attachment contents are not persisted into Agent configuration. Do not perform architecture cleanup unless required for correctness.

### Verification

Run all: npm run build, npm run build:client, npm run typecheck:client, npm run lint, npm test. Report PASS only if every command succeeded.

### Final Review

Review complete diff, verify changed files are required, confirm no new product behavior introduced, create docs/executed_results/TASK-0104E-agent-attached-project-files-regression.md using TASK_WORKFLOW structure, re-read result file, re-confirm Task ID is TASK-0104E.
