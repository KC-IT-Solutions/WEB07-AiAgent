# TASK-0129: Fix Agent Run API Streaming Cancel Regressions

## Task ID
TASK-0129

## Slug
fix-agent-run-api-streaming-cancel-regressions

## Goal
Resolve the 5 failing integration tests in `tests/integration/agent-runs-api.test.ts` that remain after TASK-0128. Investigate root cause, determine whether defect is production code or stale test infrastructure, and fix accordingly while preserving all TASK-0128 cancellation semantics.

## Requirements
- Inspect only the failing tests and the runtime path they exercise
- Determine exact expected vs actual state for each failure
- Verify SSE format matches the new streamed transport
- Check whether mock provider returns correct OpenAI-compatible SSE
- If tests are stale relative to production transport, update mock provider
- If production code is at fault, fix smallest runtime defect
- Do not increase arbitrary test timeouts as primary fix
- Preserve all TASK-0128 cancellation behavior

## Verification Commands
npm.cmd run build; npm.cmd run build:client; npm.cmd run typecheck:client; npm.cmd run lint; npm.cmd test
