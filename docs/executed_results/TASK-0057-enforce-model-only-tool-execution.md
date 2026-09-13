# TASK-0057 - Enforce model-only tool execution

Task ID: TASK-0057
Status: PASS

Summary:

Tool execution is fail-closed and bound to the exact validated structured call, provider response, model round, and response index that produced it; deterministic regressions confirm no tool is inferred from URLs, reasoning, content, or tool results.

Repository analysis:

The required inspection script was run after the documentation preflight. `ChatInferenceService` contains the only application call to `ToolRegistry.execute`; DuckDuckGo and Visit Website tools only process their own explicit arguments and contain no cross-tool orchestration. The prior fallback could construct an assistant tool-call message from an internal `result.calls` value when the provider assistant response was absent, so execution provenance was not strict enough.

Files changed:

- `src/server/services/chat-inference-service.ts`
- `src/services/model-inference.ts`
- `tests/unit/chat-inference-tools.test.ts`
- `docs/executed_tasks/TASK-0057-enforce-model-only-tool-execution.md`
- `docs/executed_results/TASK-0057-enforce-model-only-tool-execution.md`

Tests and verification:

- `powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\inspect-repo.ps1` - PASS
- `npm.cmd run test:compile` - PASS
- `node --test .test-dist/tests/unit/chat-inference-tools.test.js .test-dist/tests/unit/model-inference.test.js` - PASS, 22 tests
- `npm.cmd run build` - PASS
- `npm.cmd run build:client` - PASS
- `npm.cmd run typecheck:client` - PASS
- `npm.cmd run lint` - PASS
- `npm.cmd test` - PASS, 372 tests, 0 failures
- `git diff --check` - PASS; only existing line-ending conversion warnings were reported
- Optional live LM Studio/web verification was not run and is not required for automated PASS.

Production code:

Tool-call inference results now require the parsed provider assistant message and its structured calls. The orchestrator rejects absent or mismatched provider calls before persistence, retains source response/round/index/arguments with each validated call, rechecks that provenance immediately before registry execution, and records `sourceRound` and `providerResponseIndex` on the existing `tool_execution_started` log event.

Architecture:

The existing sequential inference loop and single `ToolRegistry.execute` boundary are preserved. Tool results remain `role: "tool"` provider-conversation data, and every later execution requires a new provider response with a matching structured call.

Dependencies:

No dependencies were added or changed.

Deviations:

None. Parallel tool execution, retries, crawling, settings changes, logging types, and streaming redesign remain out of scope and unchanged.

Risks / findings:

The worktree contained extensive pre-existing modified and untracked files from earlier tasks. They were preserved; this task made scoped edits only to the files listed above.

Diff summary:

Two production files enforce provider provenance, one deterministic test file covers model-only execution and chronology, and two task tracking files document the execution and result.
