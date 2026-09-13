# TASK-0098 - Agent Skills activation, tool loop, and Project filesystem tools

Task ID: TASK-0098
Task slug: agent-skills-tool-loop-and-project-filesystem-tools

## Instruction

Upgrade Agent execution from the TASK-0090 direct-model run to a real, repeated model/tool loop while preserving the existing AgentRun lifecycle.

Implement execution-time activation of selected Agent Skills, effective tool resolution, Project-scoped filesystem tools, general structured tool-call execution, repeated model-to-tool-to-model rounds until a final assistant result, and operational Agent tool activity logging.

Run repository inspection first with:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\inspect-repo.ps1
```

Read only relevant sections of `docs/ARCHITECTURE.md`, `docs/SECURITY.md`, `docs/TESTING.md`, `docs/CODINGSTANDARDS.md`, and `docs/DATABASE.md`. Preserve dependency direction and application-facing service boundaries. Do not inspect historical files under `docs/executed_tasks` or `docs/executed_results`.

Identify and reuse the current AgentRun execution service, Chat inference/tool loop, ToolRegistry, Skill resolver and required-tool infrastructure, ProjectFilesystemService, Agent tool selections, run-event persistence, and relevant tests. Stop broad exploration after those surfaces are identified.

At run start, load current Agent configuration and instructions, resolve every selected Skill and its current content, include Skill instructions in deterministic order, and resolve Skill-required tools. Missing or unloadable selected Skills must fail with a sanitized `skill_load` error. Skill Markdown must not be copied into Agent persistence.

Calculate the execution-only effective tool union from explicitly selected registered Agent tools, tools required by selected Skills, and intrinsic Project filesystem tools. Deduplicate tools without mutating global settings or persisted Agent selections. Existing tools such as `duckduckgo_search` and `visit_website` must execute through ToolRegistry.

Add Agent-only Project tools named clearly as Project-scoped operations:

- `project_list_directory`
- `project_read_file`
- `project_write_file`
- `project_create_directory`
- `project_rename`
- `project_delete`

All Project tools must validate untrusted runtime arguments and execute exclusively through ProjectFilesystemService with server-supplied current user and Agent Project identity. Models supply only Project-relative paths. Never expose or accept user IDs, ownership identity, physical Project roots, absolute paths, traversal, cross-Project access, or unrestricted host filesystem operations. Preserve existing binary, size, root, conflict, recursive-delete, symlink, and junction protections. Project tools are intrinsic to Project Agents for this task and must not become ordinary Chat tools merely because they are registered.

Replace only the minimal direct Agent inference path with an unbounded structured tool loop. Preserve exact provider message chronology: Agent context, user task, assistant tool calls, matching tool results, then final assistant content. Do not impose an arbitrary tool-round maximum. Do not inspect or execute `reasoning_content`, hidden reasoning, or chain-of-thought, and never persist hidden reasoning.

Validate structured tool names and JSON arguments. Unknown tools and malformed or missing arguments must return safe structured recoverable failures to the model. Expected external/tool operation failures should be safe tool results that permit another model round. Only unrecoverable execution infrastructure failures should terminate the AgentRun. Bound tool result sizes using existing conventions.

Keep TASK-0090 pause and cancellation semantics with checkpoints before and after every model request and tool execution, before each next round, and before final persistence. Cancellation must prevent stale work from overwriting `cancelled`. Preserve the shared connection inference queue and acquire it only for model inference, not while tools execute.

Persist `finalResult` only from a final assistant response and mark the run `done` only then. Add safe operational events including skill loading, effective tool resolution, model requests, tool starts/completions/failures, final result receipt, and run completion. Logs must contain no hidden reasoning, credentials, API keys, or absolute filesystem paths. Existing Run log UI should display the richer events without redesign; Error log remains for fatal errors.

Preserve file-based instruction loading through ProjectFilesystemService, model discovery/visibility policy, configured default-model execution, ownership, lifecycle, ordering, log clearing, credentials, queue behavior, Chat Skills/tools, Project Files, and existing frontend behavior.

Explicitly do not implement final-result file writing, next-Agent triggering, Agent-to-Agent handoff, Agent self-directed model switching, shell/process/Git access, arbitrary host filesystem access, schedulers, memory, streaming, or a frontend/framework redesign. No migration is expected; do not edit applied migrations.

Add deterministic unit/integration/frontend regression coverage for zero/one/multiple Skills and deterministic ordering; Skill-required and explicit tools; deduplication and missing Skills; Project filesystem success and security boundaries; ToolRegistry/contextual availability; final-only and multi-round provider flows; multiple calls in one response; malformed and unknown calls; recoverable and fatal failures; pause/cancel/resume and stale completion; hidden reasoning; exact chronology; shared inference serialization and slot release during tools; operational log safety; Agent APIs and ownership; and existing controls/log/settings/ordering behavior. Do not use real providers.

After every edit, immediately re-read the edited range. Before completion, re-read every changed range and confirm all stated security, lifecycle, queue, context, logging, and out-of-scope invariants.

Run every mandatory verification command and report PASS only if each succeeds in this session:

```text
npm.cmd run build
npm.cmd run build:client
npm.cmd run typecheck:client
npm.cmd run lint
npm.cmd test
```

Create this task record and `docs/executed_results/TASK-0098-agent-skills-tool-loop-and-project-filesystem-tools.md`. The final response must contain exactly:

```text
Task ID: TASK-0098
Status: <PASS|FAIL|BLOCKED>
Result: docs/executed_results/TASK-0098-agent-skills-tool-loop-and-project-filesystem-tools.md
Verification: build=<PASS|FAIL|NOT RUN>, build:client=<PASS|FAIL|NOT RUN>, typecheck:client=<PASS|FAIL|NOT RUN>, lint=<PASS|FAIL|NOT RUN>, test=<PASS|FAIL|NOT RUN>
Summary: <one short sentence>
```
