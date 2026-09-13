# TASK-0087 Result

Task ID: TASK-0087
Status: PASS

## Summary

Added persistent Project-owned Agent configuration, scoped CRUD APIs, relational Skill/tool selections, model settings, and Project UI CRUD without Agent execution.

## Repository analysis

The existing application uses SQLite migrations, typed JSON repositories, service-owned validation/authorization, Express routes, and plain TypeScript DOM views. Projects are scoped by the current user, Skills are globally stored with admin-only management, model connections are resolved through `ModelConnectionService`, and tools are validated through `ToolRegistry`.

## Files changed

- Added Agent domain types, repository, service, Project-scoped routes, and a safe Skill-selection endpoint.
- Added migration `0010_create_project_agents` with `agents`, `agent_skills`, and `agent_tools`.
- Added `ProjectAgentsSection.ts` and integrated it after the existing Project Files section.
- Extended Project styles and deterministic migration, repository, service, API, and frontend tests.
- Added active task and result tracking documents.

## Tests and verification

- `npm.cmd run build`: PASS
- `npm.cmd run build:client`: PASS
- `npm.cmd run typecheck:client`: PASS
- `npm.cmd run lint`: PASS
- `npm.cmd test`: PASS, 535 tests passed

The first full `npm.cmd test` attempt had one transient failure in the pre-existing timing-sensitive chat inference queue timeout test while all Agent tests passed. The required full command was rerun without code changes and passed all 535 tests.

## Production code

Agent CRUD persists name, description, instructions, saved model connection ID, model ID, `allowModelSelection`, Skill relationships, and explicit tool relationships. Inputs reject unknown fields, connections, Skills, tools, duplicate selections, ownership fields, credentials, and filesystem fields.

## Architecture

HTTP routes call `AgentService`; the service validates ownership and references; `AgentRepository` owns SQL, JSON serialization, relational replacement, and transactions. Every Agent lookup and mutation is scoped by current user, Project ID, and Agent ID. Project and Skill deletion cascades preserve referential integrity.

## Dependencies

No dependencies were added.

## Deviations

None. Agent execution, model switching behavior, filesystem tools, and Agent chat/history were not implemented.

## Risks / findings

The existing model connection service currently defines connection availability through its established server-user rules; Agent validation reuses that boundary unchanged. No API key, Base URL, credential material, Project root, or filesystem path is stored in or returned by Agent configuration.

## Diff summary

The change adds one migration, three Agent backend modules, five scoped Agent routes, one safe Skill list route, one Project Agents UI module, scoped CSS, and focused tests while preserving existing Project Files, Chat, Skill administration, tools, and model connection behavior.
