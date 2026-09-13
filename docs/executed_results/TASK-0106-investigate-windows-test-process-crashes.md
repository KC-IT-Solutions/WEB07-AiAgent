# TASK-0106: Investigate Windows Test Process Crashes

Task ID: TASK-0106
Status: PASS

Summary:
Windows test worker crashes (exit code 3221225477 / 0xC0000005) were caused by Node.js test runner spawning too many concurrent worker processes, triggering a race condition in better-sqlite3 native module DLL loading on Windows. Fixed by adding --test-concurrency=2 to all node --test invocations in package.json.

Repository analysis:
- Three failing test files identified from prior run: tools-api.test.js, agent-run-persistence.test.js, model-connection.test.js
- All three pass individually and together when run alone
- Crashes are non-deterministic but reliably reproduce under default concurrency (CPU-count workers)
- Different test files crash on different runs, confirming systemic concurrency issue with better-sqlite3 native bindings
- With --test-concurrency=2, all tests pass consistently across multiple runs

Files changed:
- package.json: Added --test-concurrency=2 to 6 npm scripts (test, test:unit, test:integration, test:frontend, test:system, test:live)

Tests and verification:
- Each originally crashing file passes individually
- Three originally crashing files pass together across 3 consecutive runs
- Full test suite (652 tests, 61 suites) passes with --test-concurrency=2 across multiple runs
- npm run build: PASS
- npm run build:client: PASS
- npm run typecheck:client: PASS
- npm run lint: PASS
- npm run test: PASS (all 652 tests pass, 0 failures)

Production code:
No production code changes. Only package.json test script configuration modified.

Architecture:
No architecture changes. Test runner concurrency setting adjusted to avoid native module race condition.

Dependencies:
No dependency changes. better-sqlite3 remains unchanged.

Deviations:
None. Fix follows the investigation order specified in task instructions.

Risks / findings:
- The crash is a known class of issue with better-sqlite3 on Windows when multiple Node.js processes load the native SQLite DLL concurrently during rapid process spawning
- Concurrency=2 provides sufficient parallelism while avoiding the race condition; concurrency=1 was verified to work but would significantly slow the test suite (~9.5s vs ~5s)
- Different test files crash on different runs, confirming the issue is with worker spawn timing rather than specific test content
- Exit codes observed: 3221225477 (0xC0000005 STATUS_ACCESS_VIOLATION) and 3221225501 (0xC0000095 STATUS_STACK_BUFFER_OVERRUN), both consistent with native module loading race conditions

Diff summary:
package.json: Added --test-concurrency=2 flag to all node --test invocations in test, test:unit, test:integration, test:frontend, test:system, and test:live scripts.
