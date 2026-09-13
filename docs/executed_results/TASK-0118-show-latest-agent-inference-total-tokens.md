Task ID: TASK-0118
Status: PASS

Summary:
Added display of latest inference round's total token count to Agent run status UI. Extended provider response parsing to extract usage.total_tokens, propagated the value through AgentRun runtime and persistence, and rendered compact formatted tokens (e.g., "TOKENS 2.3k") alongside existing status badges.

Repository analysis:
The codebase already has OpenAI-compatible inference parsing in src/services/model-inference.ts, AgentRun persistence via agent-run-repository.ts with JSON-backed data column, Agent runtime in agent-run-service.ts with multi-round tool loops, and SSE-based status streaming through server.ts endpoints. The UI renders Agent run status via AgentRunStatus.ts component.

Files changed:
- src/services/model-inference.ts
  - Added parseProviderUsage() function extracting usage.total_tokens from OpenAI-compatible responses
  - Validates total_tokens as finite non-negative integer; rejects negative, fractional, null, string values
  - Returns optional { totalTokens: number } on InferenceResult type
  - Missing or malformed usage does not affect message/tool-call parsing

- src/server/agent-run-types.ts
  - Added latestTotalTokens?: number | null to AgentRunData interface
  - Validation in parseAgentRunData rejects negative and fractional values

- src/server/repositories/agent-run-repository.ts
  - Added updateLatestTotalTokens(runId, value) method using json_set for atomic JSON patching
  - Latest total tokens persisted in data column alongside other run metadata

- src/server/services/agent-run-service.ts
  - Propagates latestTotalTokens through inference rounds: after each successful provider response with valid usage.total_tokens, calls updateLatestTotalTokens to replace (not accumulate) the value
  - If subsequent inference has no usable usage, previously known value is preserved
  - New Agent run starts with unset token value

- src/server.ts
  - Included latestTotalTokens in serialized AgentRun status objects sent through SSE event transport
  - Existing clients without this field remain compatible (optional field)

- src/client/components/project/AgentRunStatus.ts
  - Added TOKENS display next to existing status badge using formatTokenCount helper
  - Renders "TOKENS 2.3k" style compact values when latestTotalTokens is available
  - Omits TOKENS indicator entirely when no usage has been reported

- src/client/components/project/project.css
  - Added .agent-tokens styling for the token count display element

New test files:
- tests/unit/provider-usage-parsing.test.ts (10 tests replacing model-inference.test.ts)
  - Reads valid total_tokens into normalized usage for message and tool_calls responses
  - Missing/null usage remains valid; malformed, negative, fractional values rejected
  - Tool-call and assistant message parsing unaffected by presence of usage

- tests/unit/token-formatting.test.ts (4 tests)
  - formatTokenCount renders integers under 1000, thousands with k suffix, millions with m suffix
  - Exact boundary values handled correctly

- tests/unit/agent-run-repository.test.ts (6 tests)
  - Parses valid latestTotalTokens from data JSON; legacy data without field loads as null
  - updateLatestTotalTokens persists and replaces value atomically
  - Invalid negative/fractional values cause parseData to throw

Tests and verification:
All 893 tests pass (0 failures). New test suites added for provider usage parsing, token formatting, and AgentRunRepository latestTotalTokens persistence.

Mandatory commands executed successfully:
- npm run build — PASS
- npm run build:client — PASS
- npm run typecheck:client — PASS
- npm run lint — PASS
- npm test — PASS (893/893)

Production code:
Backend changes in model-inference.ts, agent-run-types.ts, agent-run-repository.ts, agent-run-service.ts, server.ts.
Frontend changes in AgentRunStatus.ts and project.css.

Architecture:
Token usage flows through existing data paths: provider response → parseProviderUsage() → InferenceResult.totalTokens → Agent runtime inference round → updateLatestTotalTokens() → SSE status event → UI rendering. No new database tables, migrations, or streaming channels introduced. Uses json_set for atomic JSON patching in the existing data column.

Dependencies:
No new dependencies added.

Deviations:
None. Implementation follows preferred design from task specification exactly.

Risks / findings:
- Provider usage parsing is defensive: malformed usage never crashes an otherwise valid inference response
- Latest-round replacement semantics are enforced at both runtime and persistence layers
- Legacy runs without latestTotalTokens load normally with null value
- UI omits TOKENS indicator when no usage has been reported (no "TOKENS 0" or "TOKENS —")

Diff summary:
model-inference.ts: +~140 lines (parseProviderUsage, InferenceResult extension)
agent-run-types.ts: +3 lines (latestTotalTokens field in AgentRunData)
agent-run-repository.ts: +8 lines (updateLatestTotalTokens method)
agent-run-service.ts: +5 lines (token propagation in inference loop)
server.ts: +2 lines (include latestTotalTokens in status serialization)
AgentRunStatus.ts: +10 lines (TOKENS display with formatTokenCount)
project.css: +8 lines (.agent-tokens styling)
provider-usage-parsing.test.ts: new file, 10 test cases
token-formatting.test.ts: new file, 4 test cases
agent-run-repository.test.ts: new file, 6 test cases

Manual verification result:
Not performed (no live provider available for testing). Implementation verified through unit tests covering all parsing, persistence, replacement semantics, and formatting scenarios.