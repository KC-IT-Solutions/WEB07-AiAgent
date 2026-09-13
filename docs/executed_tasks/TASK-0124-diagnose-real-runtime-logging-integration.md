# TASK-0124: Diagnose Real Runtime Logging Integration

## Task Specification

Task ID: TASK-0124
Slug: diagnose-real-runtime-logging-integration

Goal: Diagnose why logging still produces no files/entries in a real running server despite TASK-0123 passing isolated logger tests. Trace one real runtime path end-to-end and add integration tests that exercise the actual application wiring.

## Requirements

### Required investigation
- Trace server bootstrap ? StructuredLogger instance ? Admin Settings update ? application log call ? model inference log call ? resolved absolute log directory ? filesystem write
- Verify all 12 checklist items from task specification

### Integration test requirement
- Add at least one deterministic runtime/integration test that does NOT call StructuredLogger in isolation
- Test must exercise real application wiring with temp log directory
- Cover both application.log and model-inference.log creation through real events

### Absolute path diagnostics
- Make resolved log directory observable for manual verification

### Fix policy
- Smallest coherent fix once root break is identified
- Preserve existing logger API/config format
- No new logging framework, persistence model, dependencies, or Admin UI changes

## Constraints
- All five verification commands must PASS: build, build:client, typecheck:client, lint, test
