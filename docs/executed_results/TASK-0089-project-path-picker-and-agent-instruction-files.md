# TASK-0089 - Project path picker and Agent instruction files

Task ID: TASK-0089
Status: PASS

Summary:

Added backward-compatible Agent instruction sources and a reusable Project-scoped file/directory picker used by instruction-file and result-directory settings.

Repository analysis:

- Agent configuration is stored in typed JSON and supports optional-field defaults without a schema migration.
- Agent validation is owned by `AgentService`; the repository maps persisted JSON and API routes expose service DTOs.
- Project Files navigation uses `GET /api/projects/:projectId/files?path=...` through the existing `ProjectFilesystemService` sandbox.
- The frontend uses plain TypeScript DOM construction, inline SVG icons, and deterministic source/helper tests.

Files changed:

- `src/server/agent-types.ts`
- `src/server/repositories/agent-repository.ts`
- `src/server/services/agent-service.ts`
- `src/client/components/projects/ProjectPathPicker.ts`
- `src/client/components/projects/ProjectAgentsSection.ts`
- `src/client/components/projects/projects.css`
- `tests/unit/agent-persistence.test.ts`
- `tests/unit/agent-service.test.ts`
- `tests/integration/agents-api.test.ts`
- `tests/frontend/projects-ui.test.ts`
- `docs/executed_tasks/TASK-0089-project-path-picker-and-agent-instruction-files.md`
- `docs/executed_results/TASK-0089-project-path-picker-and-agent-instruction-files.md`

Tests and verification:

- `npm.cmd run build` - PASS
- `npm.cmd run build:client` - PASS
- `npm.cmd run typecheck:client` - PASS
- `npm.cmd run lint` - PASS
- `npm.cmd test` - PASS (`547` tests passed, `0` failed)
- Targeted Agent persistence/service, Agent API, and Projects frontend tests also passed before the full suite.

Production code:

- Added `instructionSource` and `instructionFilePath` to Agent data and DTOs with legacy/new defaults of `inline` and an empty path.
- Preserved legacy inline instruction text and normalized inactive fields consistently.
- Added authoritative service validation for non-empty Project-relative `.md`/`.txt` file paths, including rejection of absolute, traversal, encoded traversal/separator, duplicate-separator, and mixed-separator forms.
- Added a reusable file/directory picker that validates API listings, navigates child/parent directories without moving above root, disables unsupported files, and returns only Project-relative paths.
- Added accessible inline-SVG browse controls beside Agent instruction-file and result-directory inputs; Filename intentionally has no picker.
- Added responsive dark-modal and path-field styling without changing the existing Project Files backend or browser.

Architecture:

- No database migration was added because the fields are flexible Agent JSON configuration with repository defaults.
- The picker calls the existing Project Files listing API and does not duplicate or weaken the server filesystem boundary.
- Future execution contract: for `instructionSource = "file"`, Agent execution must read `instructionFilePath` through `ProjectFilesystemService` immediately before constructing run context; only that current `.md`/`.txt` content becomes instructions. This task does not implement that read or any Agent execution.

Dependencies:

- No dependencies added.

Deviations:

- None.

Risks / findings:

- File existence is intentionally not checked at Agent save time, as required; a missing file must be handled by future Agent execution.
- The pre-existing worktree contains many unrelated modified and untracked files; none were reverted or intentionally changed by this task.

Diff summary:

- Agent JSON/DTO/service validation extended for inline and file instruction sources.
- Reusable Project path picker and two Agent browse integrations added.
- Persistence, service, API, picker, and Agent UI coverage expanded.
