Task ID: TASK-0118
Slug: show-latest-agent-inference-total-tokens

## Task Instruction (verbatim)

Goal: Show how many total tokens the Agent's latest model inference processed.

The OpenAI-compatible provider response already exposes usage like:
```json
"usage": { "prompt_tokens": 704, "completion_tokens": 1643, "total_tokens": 2347 }
```

For this task, the only value we want to surface is `usage.total_tokens`.

Example Agent UI: `RUNNING    TOKENS 2.3k`

The number represents the latest completed inference round for the current Agent run.

### Semantics
- TOKENS means provider response usage.total_tokens from the latest inference round
- Does NOT mean accumulated tokens, prompt/context only, completion only, etc.
- For multi-round Agent runs, displayed value should be replaced after every completed inference round (not summed)

### Provider parsing
- Extend normalized inference result with optional usage representation for totalTokens
- Read usage.total_tokens when present; require finite non-negative integer
- Malformed usage must not crash valid inference
- Absence of usage must remain supported
- Do not parse/store unnecessary fields unless existing normalized usage abstraction exists

### Agent runtime
- Propagate latest totalTokens through Agent runtime
- After each successfully parsed provider inference response with valid total-token usage: current AgentRun latest token value = response usage.total_tokens
- A later inference round replaces the previous value (do NOT accumulate)
- If subsequent valid inference has no usable usage.total_tokens, leave previously known value unchanged
- At start of new Agent run, token usage must begin unset

### AgentRun/status model
- Extend existing AgentRun/status representation with optional latestTotalTokens field
- Optional/null when not yet reported
- Persisted only if consistent with current architecture (no new DB table)
- Legacy runs without the field must continue loading normally

### Streaming/status transport
- Use existing status/event transport, no separate token streaming endpoint
- Existing clients remain compatible

### Agent UI
- Display token usage next to existing Agent run status: `RUNNING    TOKENS 2.3k`
- If no token usage reported, show only status (no "TOKENS —" or "TOKENS 0")
- Formatting: under 1000 -> integer; 1k-1m -> one decimal + k; 1m+ -> one decimal + m

### Requirements
See full task spec for all requirements including test cases and verification steps.
