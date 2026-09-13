# TASK-0137: Decouple Agent pre-run from model tool access

## Instruction

Decouple Agent pre-run tool configuration from model tool access.

A tool must be able to have a configured pre-run input file even when that tool is not enabled for model-requested tool calls. This allows deterministic tool data to be loaded into the Agent's initial user context while preventing the model from invoking that tool itself.

### Required semantics

`toolNames` and `toolConfigurations` represent independent concerns:

- `toolNames` defines only which tools the model/provider may call during normal inference, retains its existing semantics, and continues to control normal model-requested tool availability.
- `toolConfigurations` defines optional pre-run configuration per tool, may reference tools absent from `toolNames`, must not grant model access, and is used for system-initiated pre-run execution.

This configuration must be valid and round-trip unchanged:

```json
{
  "toolNames": [],
  "toolConfigurations": [
    {
      "toolName": "fred_data",
      "preRunInputFile": "tool-pre-runs/fred-pre-run.json"
    }
  ]
}
```

Its pre-run calls execute before first inference, returned information is added before the Agent task in initial provider user context, `fred_data` is not exposed in provider tools, and the model cannot call it unless it is also in `toolNames`.

All combinations must work independently: neither enabled; model access only; pre-run only; and both model access plus pre-run.

### Persistence and compatibility

- Preserve relationship-owned Agent-tool persistence. Do not add a global Agent setting.
- Do not require a database migration unless strictly necessary.
- Existing Agents remain backward compatible.
- Do not remove or discard `toolConfigurations` entries absent from `toolNames` during save/load.
- If `toolConfigurations` is omitted, existing Agents continue to load/save and `toolNames` behavior remains unchanged.
- A pre-run configuration never automatically enables model access.

### Validation

Remove identical-length and membership coupling between `toolNames` and `toolConfigurations`.

`toolNames` remains an array of unique names, every name resolves through ToolRegistry, and it controls only model access.

`toolConfigurations` is optional and must be an array when present. Each entry is a non-null object with only `toolName` and `preRunInputFile`; `toolName` is a non-empty unique string and resolves through ToolRegistry; `preRunInputFile` uses existing Project-relative JSON path validation. A configured tool need not be in `toolNames` and must not infer model access.

### UI and save payload

Update Agent Settings > Tools & Skills so each tool independently provides an "Allow model to use this tool" control and a pre-run input file selector.

- The selector remains available when model access is off.
- Selecting a file does not enable model access.
- Disabling model access does not clear a file.
- Clearing a file does not alter model access.
- Reopening settings restores both values independently.
- Pre-run-only tools can be configured.
- Save `toolNames` from model-enabled tools only and persist pre-run `toolConfigurations` independently.
- A model-enabled tool without a file may retain the existing normalized configuration representation where appropriate.

### Runtime and provider behavior

Keep the primary runtime in `src/server/services/agent-run-service.ts` unless the existing design requires otherwise. Resolve configured pre-run tools independently from model-exposed tools.

For each non-null configured pre-run file, use the existing ToolRegistry/effective tool/settings path, load and validate the Project JSON file, execute calls in deterministic tool and array order, fail fast, preserve observability, collect successful arguments/results, and prepend them before the existing Agent task.

Normal provider tools remain derived only from `toolNames`. A pre-run-only tool is not included in provider definitions. A tool present in both supports pre-run and later model-requested execution.

Preserve the initial provider message shape of one `system` message and one `user` message. Do not create synthetic assistant tool calls, provider tool messages, extra initial user messages, or synthetic tool-call IDs. Preserve the existing formatted "Tool-provided user information" followed by "Agent task" structure. If no pre-run calls execute, user content remains exactly unchanged.

System-initiated pre-run calls do not create, require, persist, or expose `tool_call_id`. Normal model calls continue using provider-generated IDs.

Preserve `pre_run_tool_call` and `pre_run_tool_result` events. Pre-run failures remain in Agent Errors with `stage: pre_run_initialization` and safe diagnostics. Pre-run-only tools have identical observability to model-enabled tools.

Any pre-run failure stops remaining pre-runs, prevents first inference and partial provider context, and avoids final result, chaining, and result-file output. Do not skip failures because model access is disabled.

Preserve Project-relative validation and containment. The configured pre-run file remains readable independently of generic Read files permission without broadening filesystem access.

### Scope constraints

Do not change pre-run JSON format, deterministic ordering, fail-fast behavior, filesystem containment, generic Read files independence, normal provider inference behavior, provider-generated `tool_call_id` handling, model tool-call/result correlation, the unbounded model-driven tool loop, cancellation, chaining, result files, attached files, provider message shape, or execution/error event semantics.

### Tests

Add or update deterministic, provider-free tests proving:

1. `toolNames` and `toolConfigurations` are independent.
2. Pre-run configuration is accepted for a tool absent from `toolNames`.
3. Pre-run-only configuration persists and loads unchanged.
4. Legacy Agents remain compatible.
5. Duplicate configurations are rejected.
6. Unknown configured tools are rejected.
7. Existing pre-run path validation is unchanged.
8. UI selector is exposed with model access off.
9. Selecting pre-run does not enable model access.
10. Disabling model access does not clear pre-run.
11. Clearing pre-run does not change model access.
12. Reopening restores both independently.
13. Model-off plus pre-run saves `toolNames: []` and the independent configuration.
14. That payload round-trips unchanged.
15. Pre-run-only executes before first inference.
16. Its results precede the Agent task in initial user context.
17. It is absent from provider tools.
18. Model-only remains available without pre-run.
19. Both-enabled supports both behaviors.
20. Pre-run-only emits `pre_run_tool_call`.
21. Pre-run-only emits `pre_run_tool_result`.
22. Pre-run-only failures remain visible in Agent Errors.
23. Pre-run-only creates no synthetic `tool_call_id`.
24. Normal model calls retain provider IDs.
25. Deterministic multi-tool/multi-call order remains unchanged.
26. A later failure prevents first inference and partial context.
27. No-pre-run behavior remains unchanged.
28. The normal model tool loop remains unchanged.

### Verification and report

Run and require all five to pass:

```text
npm.cmd run build
npm.cmd run build:client
npm.cmd run typecheck:client
npm.cmd run lint
npm.cmd test
```

Before the final response, create and re-read `docs/executed_results/TASK-0137-decouple-agent-pre-run-from-model-tool-access.md`. Report persistence/model changes, validation changes, UI changes, independent save/load semantics, runtime resolution, provider exposure and user-context behavior, observability, tool-call-ID behavior, changed files, focused tests, all verification results, and PASS/BLOCKED.
