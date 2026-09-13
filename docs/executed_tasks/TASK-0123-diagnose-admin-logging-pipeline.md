## TASK-0123: Diagnose Admin Logging Pipeline

**Task ID:** TASK-0123
**Slug:** diagnose-admin-logging-pipeline

### Goal

Diagnose why Admin Settings can show logging enabled while no application/model-inference log output is created. Trace the existing pipeline and fix only the concrete break(s) found.

### Requirements

Trace complete path:
- Admin Settings UI -> save/API payload -> persisted settings -> settings load on server startup -> logger initialization/configuration -> application log sink -> model inference log sink -> filesystem output path

Verify all 12 investigation points from task specification.

### Constraints

- Do not redesign logging
- Make smallest coherent fix
- Preserve existing settings/API contracts
- Do not introduce a new logging framework
- Do not change log formats unless required
- Do not add dependencies
- Do not change unrelated Admin settings

### Acceptance Criteria

- Root cause(s) identified and fixed
- Tests added/updated for the actual root cause
- All five verification commands pass (build, build:client, typecheck:client, lint, test)
- Manual verification completed successfully
