Task ID: TASK-0058
Status: PASS

Summary:

Recoverable DuckDuckGo and website failures now become bounded persisted and streamed tool results that preserve the provider tool-call ID and allow the model to continue, while unclassified and persistence failures remain terminal.

Repository analysis:

- Ran the required `scripts/inspect-repo.ps1` discovery after the documentation preflight.
- Traced `ChatInferenceService`, `ToolRegistry`, both external tools, OpenAI-compatible model messages, typed JSONL events, streaming delivery, logging, Chat rendering, and relevant deterministic tests.
- The existing failure path persisted a generic failed result and then always raised `TOOL_EXECUTION_FAILED`, preventing provider follow-up.
- The worktree contained extensive pre-existing changes from earlier tasks; they were preserved and not reverted.

Files changed:

- `src/server/tool-types.ts`
- `src/server/tools/duckduckgo-search-tool.ts`
- `src/server/tools/visit-website-tool.ts`
- `src/server/services/chat-inference-service.ts`
- `src/client/components/chat/ChatView.ts`
- `tests/unit/chat-inference-tools.test.ts`
- `tests/unit/duckduckgo-search-tool.test.ts`
- `tests/unit/visit-website-tool.test.ts`
- `src/client/components/chat/__tests__/ChatView.test.ts`
- `docs/executed_tasks/TASK-0058-return-recoverable-tool-failures-to-model.md`
- `docs/executed_results/TASK-0058-return-recoverable-tool-failures-to-model.md`

Tests and verification:

- `powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\inspect-repo.ps1` - PASS.
- `npm.cmd run test:compile` - PASS.
- Targeted tool orchestration, concrete tool, and ChatView tests - PASS.
- `npm.cmd run build` - PASS.
- `npm.cmd run build:client` - PASS.
- `npm.cmd run typecheck:client` - PASS.
- `npm.cmd run lint` - PASS.
- `npm.cmd test` - PASS: 379 tests, 0 failures.
- `git diff --check` - PASS; only existing Windows line-ending warnings were reported.
- No LM Studio or live network verification was run; it is optional and not required for PASS.

Production code:

- Added a small `RecoverableToolError` with stable codes, safe messages, and constrained `status`/`reason` metadata.
- Classified DuckDuckGo and Visit Website HTTP, network, timeout, extraction, and unreadable-content failures at the concrete tool boundary.
- Converted only classified failures into `{ success: false, error: ... }` tool results.
- Persisted and streamed failed `tool_result` events, appended matching `role: "tool"` messages, and continued the model loop in provider order.
- Preserved successful sibling tool results and successful tool behavior.
- Kept unsupported tools, unknown runtime errors, serialization errors, and persistence failures terminal.
- Logged recoverable execution failures with `recoverable: true` and `errorCode`, followed by `tool_result`; successful completion still logs `inference_completed` without `inference_failed`.
- Rendered failed tool results in the existing sand activity flow as `Failed: <safe message>` without creating a generic red inference error.

Architecture:

- The error classification remains in the existing tool domain types, concrete tools classify external failures, and `ChatInferenceService` owns orchestration and persistence.
- Existing model-only structured tool-call validation and provider chronology are unchanged.
- Existing typed JSONL `tool_result` events and streaming protocol are reused without a new persistence or logging type.

Dependencies:

- No dependencies added or changed.

Deviations:

- None.

Risks / findings:

- The optional live LM Studio scenario was not exercised; deterministic tests cover the required behavior without external network access.
- Existing unrelated dirty-worktree changes make the repository-wide Git diff larger than this task's edits.

Diff summary:

- Added explicit recoverable tool failure classification and safe external-tool mappings.
- Continued inference with ordered failed tool messages while retaining terminal internal failure behavior.
- Added deterministic regression coverage for recovery, mixed results, chronology, streaming, persistence, logging, terminal exceptions, and UI presentation.
