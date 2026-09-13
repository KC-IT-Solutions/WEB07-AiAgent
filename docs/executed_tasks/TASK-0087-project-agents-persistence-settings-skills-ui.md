# TASK-0087 - Project Agent persistence, settings, Skills, and UI CRUD

Task ID: TASK-0087
Task slug: project-agents-persistence-settings-skills-ui

## Instruction

Add first-class persistent Agents owned by Projects. Users must be able to create, list, open, edit, and delete Agents from the selected Project view. This task covers configuration, persistence, scoped APIs, and plain TypeScript/DOM UI only; Agent execution is out of scope.

Each Agent stores a typed shallow configuration with name, description, instructions, saved model connection ID, model ID, `allowModelSelection` (default `false`), selected Skill IDs, and selected explicit ToolRegistry tool names. Identity, Project ownership, timestamps, credentials, Base URLs, API keys, and filesystem paths must not be stored in Agent JSON.

Add a new migration without modifying applied migrations. Use an `agents` table with a real `project_id` foreign key and valid JSON data, plus relational `agent_skills` and `agent_tools` join tables with unique relationship constraints. Project deletion must cascade to Agents, Agent deletion must cascade to both relationship tables, and Skill deletion must not leave invalid links. Agent create/update and relationship replacement must be atomic.

Preserve the dependency direction HTTP/controllers to application/services to repositories to infrastructure/database. Every operation must resolve the current user, owned Project, and Agent; client-provided ownership must never be trusted. Validate model connections through the existing saved connection boundary, Skills through the existing Skill capability, and explicit tools through ToolRegistry. Do not expose credentials or filesystem roots.

Add Project-scoped Agent CRUD endpoints equivalent to:

```text
GET    /api/projects/:projectId/agents
POST   /api/projects/:projectId/agents
GET    /api/projects/:projectId/agents/:agentId
PUT    /api/projects/:projectId/agents/:agentId
DELETE /api/projects/:projectId/agents/:agentId
```

Extend the selected Project UI with a compact Agents section, empty state, New Agent action, create/edit form, and confirmed delete. The form must include Name, Description, Instructions, Model connection, Model, Allow agent to choose model, Skills checklist, and Tools checklist. Reuse existing model discovery, Skill listing, ToolRegistry/settings APIs, modal styling, and confirmation conventions. Preserve the Project Files UI and all existing behavior.

Add deterministic migration/repository, ownership/service/API, model settings, Skill selection, tool selection, and frontend CRUD tests covering the task acceptance criteria. Do not use real providers and do not mutate global tool settings.

Run and require success from all mandatory verification commands:

```text
npm.cmd run build
npm.cmd run build:client
npm.cmd run typecheck:client
npm.cmd run lint
npm.cmd test
```

Before completion, re-read every changed range and confirm Project ownership scoping, model settings persistence, default-off model selection permission, relational Skill/tool persistence, absence of secrets/filesystem paths, no Agent execution, and actual success of every mandatory verification command.

Create the active task and result records at:

```text
docs/executed_tasks/TASK-0087-project-agents-persistence-settings-skills-ui.md
docs/executed_results/TASK-0087-project-agents-persistence-settings-skills-ui.md
```

The final response must exactly use the requested five-line Task ID, Status, Result, Verification, and Summary format.
