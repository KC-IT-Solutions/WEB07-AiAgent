# TASK-0060 - Skill persistence, filesystem content and Admin CRUD

Task ID: TASK-0060
Task slug: skill-persistence-filesystem-admin-crud

## Instruction

Implement the first Skills foundation with SQLite-owned Skill identity, metadata, lifecycle, and Skill-to-required-tool relationships; filesystem-owned Markdown content; admin-only CRUD API; and an admin-only Skills navigation/view for listing, creating, editing, deleting, and selecting registered required tools.

Follow `DATABASE.md` strictly. Add a new migration without modifying prior migrations. Use a `skills` table with integer identity, unique relational `command_name`, timestamps, and validated JSON `data` containing only `{ "name": string }`. Use a relational `skill_tools` child table with a foreign key, explicit cascade deletion, unique `(skill_id, tool_name)`, timestamps, and valid JSON data. Validate tool names against the actual `ToolRegistry`; do not add a persistent tools table.

Store Markdown as UTF-8 text under a controlled server root in `skill-<numeric-id>.md`, with an environment override consistent with existing filesystem stores. Paths must derive only from validated server-owned numeric IDs and remain inside the root. Validate string type, bounded size, and line endings. Never store Markdown, tool names, paths, or chat IDs in Skill JSON.

Keep SQL, parameter binding, row mapping, JSON serialization/parsing, validation of stored JSON, and persistence errors in repositories. Coordinate repositories and `SkillContentStore` in an application service. Use database transactions for related writes and explicit local compensation for cross-database/filesystem create, update, and delete failures. Do not expose paths or log Markdown.

Validate create/update bodies strictly. Command names must match `^[a-z][a-z0-9_-]*$`, omit the leading slash, be unique, and reject `clear`, `new`, and `skills`. Reject malformed input, duplicate required tools, unknown tools, and non-string or oversized Markdown with controlled responses.

Add server-authorized admin endpoints equivalent to `GET/POST /api/admin/skills` and `GET/PUT/DELETE /api/admin/skills/:id`, reusing the existing authorization service. Return complete camelCase Skill objects with `id`, `commandName`, `name`, `markdown`, `requiredTools`, `createdAt`, and `updatedAt`, never internal paths.

Add a top-level Skills navigation item visible only when `/api/me` reports admin capability. Implement a compact plain-TypeScript DOM Skills view, separate from Admin Settings, with list, editor fields for name/command/Markdown/required-tool checkboxes populated from the server-exposed registered tool list, and reusable-modal delete confirmation. Do not use React/JSX or browser-native `confirm()`.

Add isolated database, filesystem, service consistency, authorization/API, and deterministic frontend tests covering the success, validation, integrity, compensation, authorization, navigation, editor, tool selection, and confirmation requirements in the task specification. Tests must use temporary SQLite databases and filesystem roots.

Do not implement Chat Skill activation, `/skills`, dynamic Skill commands, `chat_skills`, effective Chat tools, model-context injection, Skill execution, agent integration, Markdown preview, import/export, uploads, version history, filesystem browsing, or permissions beyond admin management.

Run `npm.cmd run build`, `npm.cmd run build:client`, `npm.cmd run typecheck:client`, `npm.cmd run lint`, and `npm.cmd test`. Create and re-read the corresponding result report, and return only the prescribed four-line final response.
