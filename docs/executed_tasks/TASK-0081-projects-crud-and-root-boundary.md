# TASK-0081 - Project persistence, ownership, filesystem root, and UI CRUD

Task ID: TASK-0081
Task slug: projects-crud-and-root-boundary

## Instruction

Implement a first-class Projects feature for all users, preserving the existing layered architecture and plain TypeScript DOM frontend.

- Add a new SQLite migration for a user-owned `projects` table with relational identity, ownership, timestamps, and typed shallow JSON data containing `name` and `description`.
- Scope every project repository and service operation by the current `user_id`.
- Add deterministic server-derived project directories under configurable `PROJECTS_PATH` (default `data/projects`), with safe create cleanup and exact-boundary recursive deletion.
- Add user-scoped `GET/POST /api/projects` and `GET/PUT/DELETE /api/projects/:id` endpoints with strict input validation and safe DTO responses.
- Add a Projects sidebar destination available to normal users and a plain TypeScript CRUD view using existing modal and navigation patterns.
- Add deterministic migration, persistence, ownership, filesystem, API validation, navigation, and UI CRUD tests.
- Do not add agents, project-agent relationships, file APIs, filesystem tools, shell tools, sharing, Git integration, or broad redesigns.
- Run `npm.cmd run build`, `npm.cmd run build:client`, `npm.cmd run typecheck:client`, `npm.cmd run lint`, and `npm.cmd test`; report PASS only if all succeed.
- Create the corresponding execution result report and perform the requested ownership, path-boundary, consistency, navigation, and scope self-checks.

The complete task requirements and acceptance criteria are those supplied in the active TASK-0081 conversation instruction.
