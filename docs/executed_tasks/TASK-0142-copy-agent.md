# TASK-0142: Copy agent

## Instruction

Task ID: TASK-0142
Slug: copy-agent

Preflight

Read:
- AGENTS.md
- docs/IGNORE.md
- docs/CODINGSTANDARDS.md
- docs/DEFINITION_OF_DONE.md
- docs/TASK_WORKFLOW.md
- relevant ARCHITECTURE / TESTING / SECURITY / DATABASE docs

Create and re-read:

docs/executed_tasks/TASK-0142-copy-agent.md

Goal

Add a "Copy agent" action to each Agent's existing ... menu.

Copying an Agent creates a new Agent in the same Project as a snapshot of the currently persisted Agent configuration.

The copy must be a new independent Agent definition. It must not copy runtime state, runs, errors, execution history, or other historical run data.

Required behavior

1. Frontend

Add a menu item named exactly:

Copy agent

to the existing Agent overflow / ... menu.

When selected:
- call the backend copy endpoint for that Agent;
- after a successful response, refresh/reload the Project Agent list using the existing UI flow;
- do not require a confirmation modal;
- do not copy unsaved editor state.

The persisted server-side Agent is the authoritative source for the copy.

Do not introduce a separate client-side cloning implementation.

2. API

Add an Agent copy endpoint consistent with the existing Project Agent HTTP routes.

Expected route:

POST /api/projects/:projectId/agents/:agentId/copy

The endpoint must:
- verify the Project/Agent through the existing ownership and service boundaries;
- invoke AgentService rather than performing persistence directly in the HTTP layer;
- return the newly created Agent using the existing Agent response shape;
- use the existing API error conventions.

3. Copy semantics

The new Agent must:
- belong to the same Project as the source Agent;
- receive a new Agent id;
- copy the persisted Agent definition/configuration from the source;
- be independent from the source after creation.

Copy all persisted Agent configuration that semantically belongs to the Agent definition, including where applicable:

- description
- instructionSource
- instructions
- instructionFilePath
- assignmentSource
- assignment
- assignmentFilePath
- modelConnectionId
- modelId
- allowModelSelection
- saveResultToFile
- resultDirectory
- resultFilename
- projectFilesystemPermissions
- attachedProjectFiles
- timeoutMinutes
- temperature
- topP
- unloadModelAfterRun
- Skills / skillIds
- model tool access / toolNames
- toolConfigurations
- preRunInputFile configuration
- other persisted Agent-definition fields present in the current model

Use the existing Agent types and persistence rules rather than maintaining an independent manual schema if the current architecture provides a safer way to clone the persisted definition.

Do not copy:
- Agent runs
- run status
- run records
- execution events
- operational events
- error history
- latest token usage
- chain history
- triggered run relationships
- any other runtime/history records

4. Chaining safety

The copied Agent must not inherit the source Agent's outgoing next-Agent relationship.

Set:

nextAgentId = null

Do not duplicate the source Agent's nextAgentId.

For triggerNextAgent:
- preserve it only if triggerNextAgent=true with nextAgentId=null is valid under the existing domain validation;
- otherwise set triggerNextAgent=false.

Follow the existing Agent invariants rather than weakening validation.

The copy operation must not modify the source Agent's chaining configuration.

5. Copy name

Generate a deterministic unique name within the same Project.

For a source named:

3.1.Sector rotation

the first copy should be:

3.1.Sector rotation copy

If that name already exists:

3.1.Sector rotation copy 2

then:

3.1.Sector rotation copy 3

and so on.

Name collision checks are scoped to Agents in the same Project.

Use the existing Agent name validation and normalization rules.

Do not overwrite or rename an existing Agent.

6. Ordering

Insert the copied Agent immediately after the source Agent in the Project's Agent ordering.

Example:

Before:

A
B
C
D

Copy B:

A
B
B copy
C
D

Preserve the relative ordering of all other Agents.

Adjust sortOrder deterministically through the existing Agent service/repository ordering conventions.

Do not implement ordering by arbitrary client-side rewriting.

The operation must leave valid, deterministic Agent ordering after repeated copies.

7. Architecture

Preserve the existing architecture:

HTTP / controller
→ AgentService
→ AgentRepository
→ existing persistence/database infrastructure

Responsibilities should remain in their current layers.

The frontend should only initiate the operation and update the rendered Agent list.

The HTTP layer should validate/route and delegate.

AgentService should own copy-domain behavior such as:
- locating the persisted source Agent;
- deriving copy semantics;
- unique-name selection;
- chaining reset;
- ordering coordination.

Repository changes should be limited to persistence/ordering operations required by the service.

Do not introduce unnecessary abstractions or database migrations if the existing Agent persistence model can support the feature directly.

8. Project isolation and security

Copying must remain scoped to the current Project and current user ownership model.

An Agent from another Project must not be readable or copied through manipulated route ids.

All Project-file references in copied configuration remain references only.

Do not read, duplicate, move, or rewrite referenced Project files as part of copying the Agent.

Examples:
- instruction file paths remain the same Project-relative paths;
- assignment file paths remain the same;
- attached Project file paths remain the same;
- pre-run input file paths remain the same.

No filesystem content is duplicated by this feature.

9. Tests

Add deterministic coverage for the copy behavior.

Cover at least:

- copying an Agent creates a new Agent with a different id;
- the new Agent belongs to the same Project;
- persisted configuration fields are copied correctly;
- instructionSource none/inline/file values remain correct;
- Assignment inline/file configuration is copied correctly;
- attached Project files are copied as configuration;
- filesystem permissions are copied;
- Skills are copied;
- toolNames are copied;
- toolConfigurations and preRunInputFile values are copied;
- model/runtime/result settings are copied;
- nextAgentId is null;
- triggerNextAgent follows the existing valid invariant;
- no runs/history/errors/execution events are copied;
- the source Agent remains unchanged;
- the copy is inserted immediately after the source;
- following Agents retain their relative order;
- repeated copies leave deterministic valid sortOrder;
- first generated name ends in " copy";
- subsequent collisions produce " copy 2", " copy 3", etc.;
- name uniqueness is Project-scoped;
- attempts involving an unavailable/wrong-Project Agent follow existing safe API behavior;
- POST copy endpoint returns the created Agent;
- frontend ... menu contains exactly "Copy agent";
- frontend action calls the copy route and refreshes the Agent list;
- existing Agent edit/create/delete/reorder behavior remains unchanged.

Tests must remain deterministic and must not call external providers.

10. Scope discipline

Do not perform broad unrelated repository enumeration.

Inspect only the files required by the documented workflow and the relevant Agent HTTP/service/repository/frontend/test paths.

Do not refactor unrelated Agent functionality.

Do not change model inference, Agent execution, pre-run execution, Prompt semantics, Project filesystem permissions, or logging behavior except where strictly required for this copy feature.

Do not modify existing Agent records as a migration.

Required verification

Run all five formal verification commands:

npm.cmd run build
npm.cmd run build:client
npm.cmd run typecheck:client
npm.cmd run lint
npm.cmd test

All five must PASS.

Documentation

After implementation and verification, create the corresponding result record:

docs/executed_results/TASK-0142-copy-agent.md

Record:
- implementation summary;
- repository analysis;
- production files changed;
- tests added/changed;
- architecture impact;
- persistence/database impact;
- security/project-isolation considerations;
- deviations;
- risks/findings;
- verification results for all five required commands.

Re-read the executed task before finalizing and verify the implementation against every requirement.
