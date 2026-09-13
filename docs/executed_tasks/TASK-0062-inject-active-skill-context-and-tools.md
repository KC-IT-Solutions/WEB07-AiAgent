# TASK-0062 — Inject active Skill context and required tools into inference

Task ID: TASK-0062
Task slug: inject-active-skill-context-and-tools

## Goal

Complete Chat Skill inference integration.

For every normal Chat inference:

- load the active Skills for that Chat
- read each active Skill Markdown file
- combine Skill instructions in deterministic activation order
- prepend them to the provider request as the first system message
- keep that same Skill system context at the front of every provider round in the same inference
- add all tools required by active Skills to the effective Chat tool set

Do not change slash-command behavior from TASK-0061.

## Read first

Run:

    powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\inspect-repo.ps1

Inspect only relevant current files for:

- ChatInferenceService
- provider message types / model inference service
- current Chat history projection
- ChatSkillRepository
- SkillRepository / SkillService
- SkillToolRepository
- SkillContentStore
- ToolRegistry / tool settings
- current effective Chat tool selection
- model request logging
- DATABASE.md
- ARCHITECTURE.md
- TESTING.md
- SECURITY.md
- CODINGSTANDARDS.md

Do not use recursive repository listing commands.

Do not read historical executed task/result files.

# 1. Active Skills for inference

Before starting a normal model inference for a Chat:

    load active Skills for the Chat

Use the existing persisted `chat_skills` relation.

Preserve deterministic activation order from TASK-0061:

    chat_skills.created_at
    then stable ID tie-break where necessary

Do not alphabetically sort Skills.

Do not trust client-provided Skill IDs.

The server resolves active Skills from the Chat ID.

# 2. Read Skill Markdown

For every active Skill:

    SkillContentStore.read(skillId)

Use the existing filesystem-backed Skill content abstraction.

Do not:

- read arbitrary paths
- derive paths from command names
- bypass SkillContentStore
- store Markdown in SQLite

A missing/unreadable Skill file is an internal consistency error.

Do not silently omit a Skill whose DB relation exists but Markdown cannot be read.

Fail the inference safely and log the Skill ID/command name without logging full Markdown content.

# 3. System message construction

If one or more Skills are active, create ONE deterministic system message containing all active Skill instructions.

Conceptually:

    role: system
    content:
      Skill: news-compiler
      <contents of skill file>

      Skill: research
      <contents of skill file>

Use a stable, plain textual delimiter between Skills.

For example:

    # Skill: news-compiler

    <markdown>

    # Skill: research

    <markdown>

Exact delimiter may follow project conventions.

Do not alter the Markdown contents themselves beyond existing line-ending normalization.

Do not embed filesystem paths.

# 4. Position in provider context

The Skill system message must always be the FIRST provider message.

Required shape:

    system Skill context
    existing projected Chat history
    current user message
    current assistant/tool protocol chronology

For round 1:

    system
    prior user/assistant history
    current user

For later rounds:

    system
    prior user/assistant history
    current user
    assistant tool_calls
    tool results
    assistant tool_calls
    tool results
    ...

The existing provider chronology after the prepended system message must remain EXACTLY unchanged.

Do not sort, regroup, or reorder:

- user messages
- assistant messages
- reasoning-bearing assistant events
- tool_calls
- tool results

# 5. Same system context for every round

The active Skill system context is resolved once for the inference operation and reused unchanged across every model round in that inference.

Do not reload/reorder Skills between tool rounds.

If a Skill is toggled in another request while an inference is already running, the in-flight inference continues with the Skill set captured at inference start.

Future inference requests use the new active Skill state.

# 6. No Skill system message when none active

If the Chat has zero active Skills:

    do not add an empty system message

Provider behavior for a Chat with no Skills must remain unchanged.

# 7. Effective tools

Calculate inference tool availability as:

    effective tools =
        tools normally enabled for Chat
        UNION
        required tools from all active Skills

Use Skill tool relationships from TASK-0060.

Do not mutate persisted global/user tool settings when a Skill is activated.

Skill-required tools are contextual to the active Skill set.

# 8. Tool union semantics

Requirements:

- de-duplicate tools by canonical tool name
- preserve deterministic order
- do not create duplicate tool definitions in the provider request

Preferred deterministic order:

    1. normally enabled Chat tools in their existing order
    2. additional Skill-required tools in active Skill order
    3. each Skill's required tools in existing persisted/deterministic order

If a Skill-required tool is already normally enabled, include it only once.

If several Skills require the same tool, include it only once.

# 9. Registered tool validation

Existing Skill CRUD already rejects unknown tools.

Still treat persisted Skill tool names as untrusted stored data at runtime.

Before exposing a Skill-required tool to the model:

    resolve it through ToolRegistry

If a persisted required tool no longer exists in the registry:

- fail inference safely as an internal consistency error
- log Skill ID, command name, and missing tool name
- do not silently remove it
- do not send an invalid tool definition to the model

# 10. Tool settings

Normal Chat tool settings continue to work as before.

A Skill-required tool must be available even when its normal:

    enabledForChat = false

because the Skill explicitly requires it.

Other per-tool configuration/settings still apply.

Example:

    visit_website enabledForChat = false
    active Skill requires visit_website

Result:

    visit_website is available for this Chat inference

Do not overwrite `enabledForChat` in SQLite.

# 11. Model-only execution invariant

Skill-required tools only become AVAILABLE.

They do not execute automatically.

Preserve the existing invariant:

    ToolRegistry.execute()
    may only occur from a concrete validated structured tool_call
    emitted by the immediately preceding provider assistant response

Never execute a tool because:

- a Skill requires it
- Skill Markdown mentions it
- application code decides it would be useful
- a URL occurs in Skill text
- reasoning mentions a tool

# 12. Provider message types

Extend provider message typing only as needed to support:

    role: "system"

Do not weaken types with `any`.

Keep system messages distinct from persisted Chat message/event types unless the architecture explicitly requires otherwise.

Skill system context is provider context, not Chat history.

# 13. Persistence

Do NOT persist the generated Skill system message into Chat JSONL history.

Do NOT persist Skill Markdown as Chat messages.

Do NOT change the independent-turn history projection.

Existing stored Chat history remains:

    user/final assistant plus existing UI events as currently defined

The Skill system message is reconstructed at inference start from:

    chat_skills
    Skill metadata
    SkillContentStore

# 14. Reasoning and tool chronology

Preserve all current behavior for:

- reasoning persistence
- reasoning streaming
- tool_call persistence
- tool_result persistence
- recoverable tool failures
- provider tool-call IDs
- providerResponseIndex
- sourceRound
- exact message chronology

The Skill system message is an additive prefix only.

# 15. Logging

Enhance existing `model_request` diagnostics with bounded Skill metadata.

Add fields such as:

    activeSkillCount
    activeSkillCommands
    skillContextBytes
    effectiveToolCount

Do not log full Skill Markdown in new dedicated fields.

The existing provider `messages` debug logging may naturally show the system message if that logging already records request messages.

Do not redact the Skill system content as reasoning.

Do not add a new logging subsystem.

On Skill load failures, log bounded diagnostic fields:

    skillId
    commandName
    stage

Do not log internal absolute file paths unless existing server diagnostics already safely do so.

# 16. Error handling

Define controlled internal error categories for:

- active Skill content missing/unreadable
- invalid persisted Skill data
- missing registered required tool

Use existing server error conventions where possible.

These are not recoverable model tool failures.

They occur before or during provider request construction and should terminate the inference safely.

Do not misclassify them as:

    MODEL_SERVER_UNREACHABLE

# 17. Existing slash commands

Do not change TASK-0061 behavior.

These remain local:

    /clear
    /new
    /skills
    /<skill-command>
    unknown slash commands

Slash commands still must never reach inference.

# 18. Tests — Skill system context

Use deterministic tests only.

No LM Studio.

No external network.

Cover:

## No Skills

Assert provider request begins exactly as before with no system message.

## One Skill

Given active Skill:

    commandName: news-compiler
    markdown: "Always compile exactly five news items."

Assert first provider message is:

    role: system

and contains:

    news-compiler
    Always compile exactly five news items.

Assert current user message follows after existing history projection.

## Multiple Skills

Activate:

    Skill A
    Skill B

Assert:

- one system message
- A appears before B
- activation order is preserved
- Markdown appears exactly once each

## Later provider rounds

Simulate:

    model -> tool_call -> tool_result -> model

Assert every model request begins with the identical Skill system message.

Assert chronology after system is unchanged.

# 19. Tests — effective tools

Cover:

## Normal tool only

No active Skills:
existing enabled Chat tool behavior remains unchanged.

## Skill-required disabled tool

Set:

    enabledForChat = false

but active Skill requires the tool.

Assert provider request includes the tool.

## Union

Normal enabled tools:

    duckduckgo_search

Skill requires:

    visit_website

Assert both are available.

## Duplicate

Normal enabled:

    visit_website

Skill A requires:

    visit_website

Skill B requires:

    visit_website

Assert provider request contains one `visit_website` definition.

## Multiple Skills

Assert deterministic effective tool ordering.

## Missing registered tool

Simulate a persisted Skill tool relation whose tool no longer exists in ToolRegistry.

Assert:

- inference fails before provider call
- clear internal classification
- no tool execution
- no malformed provider tool list

# 20. Tests — Skill filesystem failures

Simulate active Skill with missing `.md` file.

Assert:

- provider is not called
- inference fails safely
- full Markdown/path is not leaked to client
- bounded diagnostic metadata is logged

Simulate unreadable Skill content similarly.

# 21. Regression tests

Ensure existing tests continue to pass for:

- strict slash routing
- Chat Skill toggling
- `/skills`
- normal inference
- provider chronology
- tool-only model execution
- recoverable tool failures
- reasoning
- Chat JSONL persistence
- inference streaming
- model transport timeout handling
- admin Skill CRUD

# 22. Optional manual verification

After deterministic tests, optionally verify with:

    http://127.0.0.1:1234
    qwen/qwen3.8-27b

Example:

    activate /news-compiler
    then send:
    Sammanställ ekonominyheter.

Verify model log round 1 begins with:

    {"role":"system", ...skill markdown...}
    {"role":"user","content":"Sammanställ ekonominyheter."}

If tools are required by the Skill, verify they appear in the provider `tools` array even if normally disabled for Chat.

If multiple tool rounds occur, verify the same system message remains first in each request.

Manual verification is optional and must not be required for automated PASS.

# Important invariants

Do not change:

- exact provider chronology after the new system prefix
- slash command routing
- Chat history JSONL format
- model-only tool execution
- recoverable tool failure behavior
- tool-call IDs
- reasoning handling
- streaming event protocol
- model timeout handling
- Skill filesystem location
- Skill CRUD authorization
- Tool settings persistence

# Out of scope

Do not implement:

- agent Skill attachment
- agent inference
- Skill parameters
- Skill ordering UI
- Skill inheritance
- nested Skills
- Skill versioning
- Skill Markdown preview
- prompt templating
- context trimming
- automatic Skill selection
- tool auto-execution
- new dependencies
- unrelated refactors

# Verification

Run:

    npm.cmd run build
    npm.cmd run build:client
    npm.cmd run typecheck:client
    npm.cmd run lint
    npm.cmd test

# Acceptance

- active Skill Markdown is loaded from filesystem
- active Skill context is one system message
- system message is first in every provider round
- multiple Skills preserve activation order
- existing provider chronology remains unchanged after the system prefix
- no system message is added when no Skills are active
- Skill system context is not persisted to Chat JSONL
- Skill-required tools are added to effective Chat tools
- normally disabled tools can be enabled contextually by an active Skill
- tool definitions are de-duplicated
- persisted missing tools fail safely
- missing Skill Markdown fails safely
- Skills never directly execute tools
- slash command behavior remains unchanged
- logging includes bounded Skill/effective-tool metadata
- all tests pass
- no unrelated changes

# Tracking

Create:

    docs/executed_tasks/TASK-0062-inject-active-skill-context-and-tools.md

and:

    docs/executed_results/TASK-0062-inject-active-skill-context-and-tools.md

Do not read historical executed task/result files.

# Final response

Return only:

    Task ID: TASK-0062
    Status: <PASS|FAIL|BLOCKED>
    Result: docs/executed_results/TASK-0062-inject-active-skill-context-and-tools.md
    Summary: <one short sentence>
