# TASK-0135: Agent tool pre-run input file

Task ID: TASK-0135
Slug: agent-tool-pre-run-input-file

## Instruction

Goal

Add an optional pre-run input file setting per Agent tool.

In Agent Settings -> Tools & Skills, each configured tool must optionally be able to reference a JSON file inside the Agent's Project.

The JSON file contains one or more argument objects for that specific tool.

When an Agent run starts, all configured pre-run calls must execute before the first model inference.

The returned information must then be added to the initial provider `user` content before the existing Agent task.

The normal model-driven tool loop must remain unchanged.

Configuration

The setting belongs to the Agent-tool configuration.

Each enabled/configured Agent tool may have:

    preRunInputFile: <project-relative path> | null

or the equivalent representation appropriate to the existing Agent-tool persistence model.

Requirements:

- optional
- defaults to no file
- existing Agents remain backward compatible
- path is Project-relative
- setting belongs to the specific Agent/tool relationship
- user can clear the setting back to None

Do not implement this as a global Agent setting.

JSON file format

The selected file contains an ordered JSON array.

Each array element contains the arguments for one invocation of the configured tool.

Example for `fred_data`:

    [
      {
        "seriesId": "ICSA",
        "years": 5
      },
      {
        "seriesId": "IC4WSA",
        "years": 5
      },
      {
        "seriesId": "PERMIT",
        "years": 5
      }
    ]

The tool itself is determined by the Agent-tool configuration.

The JSON file must NOT contain:
- tool name
- tool ID
- tool_call_id

Validation

Require:

- valid JSON
- top-level JSON value is an array
- every array element is an object
- every object is valid input for the configured tool according to the existing tool argument/schema validation semantics

An empty array is valid and means that the configured file produces zero pre-run calls.

Do not invent missing arguments.

Runtime behavior

Before the first model inference:

1. Find enabled Agent tools with a configured pre-run input file.
2. Resolve each configured file inside the Agent's Project.
3. Enforce existing Project filesystem containment/security.
4. Read the file.
5. Parse and validate the JSON.
6. Validate every argument object for the configured tool.
7. Execute the calls sequentially in JSON array order.
8. Collect each call's arguments and returned result.
9. If several tools have configured files, process the tools in a stable deterministic order.
10. Only after every configured pre-run call has completed successfully, construct the first model inference request.
11. Add the collected pre-run information before the existing Agent task in the initial provider `user` message.
12. Continue through the existing Agent runtime normally.

Calls within one file must preserve array order.

Do not mutate the stored/original Agent task.

No tool_call_id

Pre-run calls are system-initiated.

They are NOT model-requested tool calls.

Therefore pre-run calls must NOT:

- require a tool_call_id
- generate a tool_call_id
- fabricate a tool_call_id
- persist a synthetic tool_call_id
- expose a synthetic tool_call_id to the model

A tool_call_id belongs only to a tool call actually emitted by the model/provider.

Reuse existing tool argument validation and underlying tool execution infrastructure where appropriate, but do not route pre-run execution through logic that semantically requires a model-generated tool_call_id.

Normal model-requested tool calls must continue to use the provider-generated tool_call_id exactly as today.

Provider user context

Preserve the existing initial provider message shape:

    system
    user

Do not create:
- synthetic provider `tool` messages
- additional initial `user` messages
- synthetic assistant tool-call messages

When pre-run information exists, compose it into the existing single initial `user` message before the Agent task.

Conceptually:

    Tool-provided user information:

    Tool: fred_data
    Input file: <project-relative path>

    Call 1
    Arguments:
    {"seriesId":"ICSA","years":5}

    Result:
    <returned information>

    Call 2
    Arguments:
    {"seriesId":"IC4WSA","years":5}

    Result:
    <returned information>

    Agent task:

    <existing Agent task>

For several configured tools, include all tool sections in the same deterministic order used for execution.

The model must be able to unambiguously associate:
- configured tool
- call arguments
- returned result

Do not include a tool_call_id.

If no pre-run calls are configured, preserve the existing initial user content exactly.

Failure behavior

Pre-run initialization is fail-fast.

The first model inference must NOT execute if any configured pre-run operation fails.

Fail the Agent run with a clear execution/runtime error for at least:

- configured file does not exist
- configured file cannot be read
- path escapes the Agent's Project
- invalid JSON
- top-level JSON is not an array
- array element is not an object
- tool arguments fail validation
- configured tool cannot execute
- any individual pre-run tool invocation fails

If earlier calls succeeded and a later call fails:

- do not continue executing the Agent
- do not perform first model inference
- do not send partial pre-run information to the model

Do not silently skip failed calls.

Project file permissions

The configured pre-run input file is an explicitly user-selected Agent configuration.

Reading that specific configured file for this feature must work independently of the Agent's generic `Read files` permission.

Existing Project containment/security rules still apply.

Do not broaden filesystem access beyond the explicitly configured file.

UI

In Agent Settings -> Tools & Skills, add an optional control for each configured tool:

    Pre-run input file

Behavior:

- default: None
- only files from the Agent's current Project may be selected
- display/save the Project-relative path
- existing saved value is restored when reopening Agent settings
- selection can be cleared back to None

Add concise help text explaining that:

- the file contains an ordered JSON array of argument objects for this tool
- each entry runs once before the Agent's first model request
- returned information is added to the user context before the Agent task

Do not expose or request a tool_call_id in the UI.

Execution visibility

If pre-run work is represented in Agent Execution/runtime observability, represent it accurately as system-initiated pre-run execution.

Do not render or persist it as though the model requested the call.

If the existing execution representation cannot represent pre-run execution without a tool_call_id, introduce only the smallest directly related representation required.

Do not fabricate an ID to fit the existing model-requested tool-call representation.

Scope

Do not modify unrelated behavior.

In particular, do not change:

- normal model-requested tool-call semantics
- provider-generated tool_call_id handling
- normal tool-call/result correlation
- the unbounded multi-round Agent tool loop
- attached-file behavior
- normal Agent task semantics
- chaining
- result files
- cancellation behavior
- Project ownership/security semantics

Tests

Add/update deterministic tests proving:

1. optional pre-run input file persists per Agent tool
2. existing Agents without the setting remain compatible
3. setting can be cleared to None
4. saved Project-relative path is restored in Agent settings
5. only files within the Agent's Project are accepted
6. Project path traversal/outside-Project access is rejected
7. configured file can be read independently of generic Read files permission
8. missing file fails before first inference
9. unreadable file fails before first inference
10. invalid JSON fails before first inference
11. non-array top-level JSON fails
12. non-object array element fails
13. empty array is valid and executes zero calls
14. one argument object executes one pre-run call
15. multiple objects execute multiple calls for the same tool
16. calls preserve JSON array order
17. multiple configured tools execute in stable deterministic tool order
18. existing tool argument validation is applied
19. a later pre-run call failure prevents first inference
20. partial successful pre-run results are not sent after a later failure
21. collected arguments and results are added before the Agent task
22. original Agent task is unchanged
23. provider still receives exactly one initial system message and one initial user message
24. no-pre-run configuration preserves existing provider user content
25. pre-run calls do not create or require tool_call_id
26. no synthetic provider tool messages are created for pre-run calls
27. normal model-requested tool calls continue to use provider-generated tool_call_id
28. existing normal multi-round tool execution remains unchanged

Use existing project testing conventions.

Tests must be deterministic and must not call external providers.

Verification

Run:

    npm.cmd run build
    npm.cmd run build:client
    npm.cmd run typecheck:client
    npm.cmd run lint
    npm.cmd test

All five must PASS.

Before final response

Create:

docs/executed_results/TASK-0135-agent-tool-pre-run-input-file.md

Report:
- persistence/model location
- UI implementation location
- Project file selection behavior
- JSON format and validation
- pre-run execution location
- deterministic execution ordering
- initial user-context composition
- failure behavior
- tool_call_id handling
- files changed
- focused tests
- all five verification results
- PASS/BLOCKED
