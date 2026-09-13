# TASK-0080 - Serialize inference per model connection

Task ID: TASK-0080
Task slug: serialize-inference-per-model-connection

## Instruction

Prevent concurrent model inference against the same saved model connection while allowing different saved connection IDs to infer concurrently.

Preserve the existing `HTTP -> ChatInferenceService -> provider/model integration` architecture. Implement a small dependency-free application/service-level keyed FIFO queue using the saved connection ID. The acquired slot must cover the complete inference lifecycle, including every provider round, tool call, tool execution, final response, failure, timeout, and cancellation. It must never be released between model rounds.

Waiting requests must respect their existing `AbortSignal`. A request cancelled before acquisition must be removed or skipped safely, must never reach provider inference, and must not block later requests. Cancellation after acquisition, provider/tool failures, timeouts, and unexpected errors must always release the slot in `finally`. Remove idle per-connection state when there is no active inference and no waiter.

Do not move queue logic into the client, hardcode LM Studio behavior, add distributed locking, add provider rate limiting, create a global tool queue, add dependencies, or refactor unrelated behavior. Preserve provider chronology, tool-call provenance, reasoning safety and context exclusions, recoverable tool-error handling, inference-wide timeout, abort propagation, streaming, credential resolution, no-auth connections, and API behavior.

Add deterministic tests, without external providers or sleep-based race synchronization, covering:

1. Same-connection provider execution does not overlap.
2. Same-connection FIFO order.
3. A second inference waits for the first complete inference.
4. Multi-round tool inference holds the slot through all provider/tool rounds.
5. Different connections can run concurrently.
6. Active failure releases the slot.
7. Active timeout/cancellation releases the slot.
8. A queued request cancelled before acquisition never reaches the provider.
9. Cancelling one queued request does not block later requests.
10. Idle queue state is cleaned up.
11. Existing single-inference behavior remains unchanged.

Run and require success from every mandatory verification command:

```text
npm.cmd run build
npm.cmd run build:client
npm.cmd run typecheck:client
npm.cmd run lint
npm.cmd test
```

Before responding, re-read all changed ranges, confirm every required serialization/cancellation/cleanup invariant, review provider/context/tool chronology, and create and re-read `docs/executed_results/TASK-0080-serialize-inference-per-model-connection.md`.

The final response must be exactly:

```text
Task ID: TASK-0080
Status: <PASS|FAIL|BLOCKED>
Result: docs/executed_results/TASK-0080-serialize-inference-per-model-connection.md
Verification: build=<PASS|FAIL|NOT RUN>, build:client=<PASS|FAIL|NOT RUN>, typecheck:client=<PASS|FAIL|NOT RUN>, lint=<PASS|FAIL|NOT RUN>, test=<PASS|FAIL|NOT RUN>
Summary: <one short sentence>
```
