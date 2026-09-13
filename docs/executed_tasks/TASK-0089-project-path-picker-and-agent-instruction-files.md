# TASK-0089 - Project path picker and Agent instruction files

Task ID: TASK-0089
Task slug: project-path-picker-and-agent-instruction-files

## Instruction used for this execution

Add a reusable Project-scoped file/directory picker using the existing Project Files API and plain TypeScript DOM architecture. Apply it to Agent instruction files and final-result directories, with inline SVG browse buttons and manual Project-relative path entry retained.

Extend Agent JSON-backed configuration and DTOs with backward-compatible `instructionSource: "inline" | "file"` and `instructionFilePath` fields. Existing and new Agents default to inline, existing instructions remain preserved, inline mode uses `instructions`, and file mode requires a non-empty Project-relative `.md` or `.txt` path. Validate syntax in `AgentService` without requiring file existence and without exposing absolute paths.

Add accessible Agent source controls, show only the active instruction input mode, use file-picker filtering for `.md` and `.txt`, and add directory picking beside the existing result Directory input without adding a picker to Filename. Preserve all existing Agent settings and the wider responsive modal.

The picker must support file and directory modes, child/parent navigation bounded at Project root, Project-relative results (empty string for selected root directory), disabled unsupported files, keyboard-accessible controls, and no edit/create/delete behavior or absolute path exposure. Do not create another filesystem backend or weaken the existing filesystem sandbox.

Add deterministic persistence/service/API, picker, and Agent UI coverage for defaults, round trips, validation failures, navigation boundaries, extension filtering, relative selections, browse controls, mode restoration, form submission, and preservation of existing settings.

Do not implement Agent execution, instruction-file reads during inference, final-result writes, chaining execution, run history, filesystem tools, uploads, or a broad Project Files redesign. Record the future contract that file instructions must later be read at run time through `ProjectFilesystemService` immediately before run-context construction.

Create the matching task and result tracking files. Do not read historical tracking files. After each edit, immediately re-read the edited range. Before completion, re-read all changed ranges and run exactly: `npm.cmd run build`, `npm.cmd run build:client`, `npm.cmd run typecheck:client`, `npm.cmd run lint`, and `npm.cmd test`. Report PASS only if all five commands run and succeed, using the exact final response format required by the task.
