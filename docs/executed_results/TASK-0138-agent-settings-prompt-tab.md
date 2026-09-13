Task ID: TASK-0138
Status: BLOCKED

Summary:

- Added the Agent Settings `Prompt` tab immediately after `General`.
- `General` now contains only Name and Description.
- Moved the existing instruction source, inline instructions, instruction file, and Task / Assignment controls into `Prompt`.
- Preserved the existing tab activation and keyboard behavior. Panels continue to hide without being recreated, so unsaved values remain in their existing controls while switching tabs.
- Agent field names, initial values, validation, load behavior, save behavior, and API payload construction are unchanged.

Repository analysis:

- Agent Settings tabs and all relevant controls are assembled in `src/client/components/projects/ProjectAgentsSection.ts`.
- Existing deterministic frontend coverage in `tests/frontend/projects-ui.test.ts` uses source-level structural assertions for this DOM-based UI.
- The existing tab implementation already preserves mounted controls while changing only each panel's `hidden` state, so no new state or component architecture was needed.

Files changed:

- `src/client/components/projects/ProjectAgentsSection.ts`
- `tests/frontend/projects-ui.test.ts`
- `docs/executed_tasks/TASK-0138-agent-settings-prompt-tab.md`
- `docs/executed_results/TASK-0138-agent-settings-prompt-tab.md`

Tests and verification:

- `npm.cmd run test:frontend` - PASS (247 tests passed).
- `npm.cmd run build` - PASS.
- `npm.cmd run build:client` - PASS.
- `npm.cmd run typecheck:client` - PASS.
- `npm.cmd run lint` - BLOCKED. ESLint reports a parsing error at `data/projects/user-1/project-3/results/Rates_regime.js:2:17`. The failure is outside TASK-0138, under a repository path that `docs/IGNORE.md` prohibits normal inspection of, and the file was not modified.
- `npm.cmd run lint` was repeated after the other verification and failed identically.
- `npx.cmd eslint src/client/components/projects/ProjectAgentsSection.ts tests/frontend/projects-ui.test.ts` - PASS.
- `npm.cmd test` - PASS (1,094 tests passed).

Focused tests:

- Assert the `Prompt` tab exists in the required seven-tab order.
- Assert General owns Name and Description and owns no prompt controls.
- Assert Prompt uniquely owns instruction source, inline instructions, instruction file, and Task / Assignment.
- Assert instruction-source conditional visibility, required state, and event handlers remain intact.
- Assert tab activation only changes panel visibility and does not replace controls or reset values.
- Assert saved prompt values continue populating the existing fields.
- Retain existing assertions for unchanged payload fields and Model, Context, Tools & Skills, Runtime, and Advanced contents and behavior.

Production code:

- Added one `promptPanel` using the existing tab-panel conventions and unique editor-scoped IDs.
- Moved existing control nodes from `generalPanel.append(...)` to `promptPanel.append(...)`.
- Added Prompt to `tabDefinitions` and `tabContent` in the required position.
- No CSS, API, persistence, validation, or runtime code changed.

Architecture:

- No architecture changes. The existing Agent Settings function and tab implementation remain in place.

Dependencies:

- No dependencies added or changed.

Deviations:

- Final status is BLOCKED rather than PASS because the task explicitly requires all five verification commands to pass, and repository-wide lint is blocked by an unrelated ignored project-data JavaScript file.

Risks / findings:

- No TASK-0138 implementation risks found during self-review.
- The working tree contains many pre-existing unrelated changes and untracked files. They were not modified or reverted.

Diff summary:

- Presentation-only Agent Settings restructuring plus focused deterministic test updates and required task documentation.
