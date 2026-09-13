# TASK-0057 - Enforce model-only tool execution

Task ID: TASK-0057
Task slug: enforce-model-only-tool-execution

## Instruction

Enforce a strict tool-execution rule: the server may execute a tool only when that exact tool call was explicitly returned by the model as a valid structured `tool_call` in the immediately preceding provider response. Tool results must never trigger other tools automatically, and the server must never infer or synthesize a follow-up tool call from tool output, URLs, reasoning text, normal assistant content, or application logic.

Run `powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\inspect-repo.ps1`, then inspect only relevant files for `ChatInferenceService`, model provider parsing, `ToolRegistry`, DuckDuckGo, Visit Website, streamed inference, persisted reasoning/tool events, model-inference logging, deterministic tests, and the required architecture, security, testing, and coding standards documentation. Do not use recursive repository listing commands or read historical executed task/result files.

`ToolRegistry.execute(...)` may only be called for a concrete validated structured tool call present in the immediately preceding model/provider assistant response. The valid flow is model request, model response, execute exactly the response's validated structured tool calls if present, append tool results, and issue a new model request so only the model decides what happens next. Preserve provider order and matching IDs for multiple calls, retain inference ID, model round, provider response, call ID, name, validated arguments, and response index as execution provenance, and add a simple local defensive runtime check if needed.

Tool results and `reasoning_content` are data only and never executable. Streaming and persisted `tool_call` events must map 1:1 to provider structured calls; matching `tool_result` events must follow their calls with exact chronology and IDs. Existing inference logging must make the source model-response round and tool call ID/name traceable without unnecessary format changes.

Add deterministic tests, without LM Studio or live web access, covering: search result URLs do not trigger website visits; an explicit later `visit_website` call does; reasoning and normal content do not trigger tools; exactly two provider calls execute in order with no additions; arbitrary tool-result URLs trigger no tools; unsupported tools retain safe rejection without substitution; streaming emits no synthetic calls and preserves round chronology; persistence contains only provider calls/results; and logging proves every execution's provider provenance.

Do not add tools, planning, crawling, autonomous browsing, retries, agent orchestration, parallel execution, settings changes, logging types, context trimming, streaming redesign, dependencies, or unrelated refactors. Preserve current reasoning display/persistence and orchestration chronology.

Run:

```text
npm.cmd run build
npm.cmd run build:client
npm.cmd run typecheck:client
npm.cmd run lint
npm.cmd test
```

Acceptance requires model-only structured tool execution, no tool-result/reasoning/content-triggered tools, explicit later calls for website visits, exact ordered multiple-call execution, 1:1 streamed/persisted provider calls, preserved IDs and provenance, traceable logs, unchanged chronology, all tests passing, no new dependencies, and no unrelated changes.

Create `docs/executed_tasks/TASK-0057-enforce-model-only-tool-execution.md` and `docs/executed_results/TASK-0057-enforce-model-only-tool-execution.md`. Do not read historical task/result files. Optionally perform the described local manual verification, but do not require it for automated PASS.

The final response must contain only:

```text
Task ID: TASK-0057
Status: <PASS|FAIL|BLOCKED>
Result: docs/executed_results/TASK-0057-enforce-model-only-tool-execution.md
Summary: <one short sentence>
```
