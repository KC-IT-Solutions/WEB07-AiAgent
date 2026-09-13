# TASK-0099 - Agent execution transcript with optional reasoning

Task ID: TASK-0099
Task slug: agent-execution-transcript-with-optional-reasoning

## Instruction

Add an `Execution` view for Agent runs that shows the actual executed flow in chronological order.

The view must show, when available, the user task, explicit provider `reasoning_content`, assistant messages, structured tool calls, structured tool results, and the final assistant result. Existing Run log and Error log remain separate.

Reasoning is display-only. It must never trigger tools or be interpreted as a structured command. Only structured provider `tool_calls` may execute. Do not invent or reconstruct reasoning when the provider does not return it.

Extend Agent-run persistence with a safe typed chronological execution representation supporting `user_task`, `reasoning`, `assistant_message`, `tool_call`, `tool_result`, and `final_result`. Preserve exact execution order. Do not persist credentials, Authorization headers, absolute Project roots, or raw unrestricted provider payloads. Tool arguments and results may be shown only in safe structured form and must use bounded rendering.

Add the smallest Project/Agent/run-scoped read API for the latest run transcript, preserving current-user to owned-Project to Agent to AgentRun ownership. Add an `Execution` button near Run log and Error log. Open the latest transcript in a reasonably large, chat-like modal or panel that clearly distinguishes all event types. While a run is active, refresh through the existing polling approach without WebSockets, SSE, or a second aggressive polling architecture.

The first version needs only the latest run. Do not implement next-Agent chaining, final-result file writes, Agent model switching, historical run browsing, token streaming, WebSockets/SSE, or reconstructed hidden reasoning.

Add focused deterministic coverage for persistence and display of user task, optional reasoning, structured-tool-only execution authority, chronology, final result, bounded and sanitized tool data, ownership scoping, the Execution button and active refresh, unchanged Run/Error logs, and existing lifecycle/tool-loop behavior.

Run and require success from:

```text
npm.cmd run build
npm.cmd run build:client
npm.cmd run typecheck:client
npm.cmd run lint
npm.cmd test
```

Create the corresponding execution result report and use the exact requested final response format.
