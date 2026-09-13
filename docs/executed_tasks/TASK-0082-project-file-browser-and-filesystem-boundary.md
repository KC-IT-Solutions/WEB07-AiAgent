# TASK-0082 - Project file browser and secure filesystem boundary

Task ID: TASK-0082
Task slug: project-file-browser-and-filesystem-boundary

## Instruction

Add secure project-scoped file management through the existing Project UI and API architecture. Every operation must derive the root from the current user and owned Project ID, accept only Project-relative paths, canonicalize and verify targets within the canonical Project root, and block traversal and symlink/junction escapes on Windows and other supported platforms.

Implement a reusable Project filesystem service with directory listing, UTF-8 text reading/writing with documented size limits, directory creation, same-Project rename/move without overwrite, and validated recursive deletion that can never delete the Project root. Controllers must remain thin and must verify current-user ownership before delegating to the service. Responses and controlled errors must never expose absolute server paths.

Extend the plain TypeScript Project detail UI with a compact Files section supporting relative browsing and breadcrumbs, text file creation/edit/save, directory creation, rename, and confirmation-gated deletion. Do not implement Agents, shell/process execution, uploads, binary editing, Git, watching, sharing, or cross-Project operations.

Add deterministic isolated filesystem, API ownership/security, and frontend tests covering the numbered acceptance cases in the task request, including traversal variants, link escapes where supported, safe metadata, operation conflicts and limits, ownership, API delegation, relative UI navigation, editing, creation, rename, confirmation, and preservation of existing behavior.

Run first after the documentation preflight:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\inspect-repo.ps1
```

Mandatory verification:

```text
npm.cmd run build
npm.cmd run build:client
npm.cmd run typecheck:client
npm.cmd run lint
npm.cmd test
```

Create the matching task and result tracking files, perform the requested ten-point final security self-check, and report PASS only if every mandatory verification command is executed successfully in this session. Do not inspect historical task/result files.
