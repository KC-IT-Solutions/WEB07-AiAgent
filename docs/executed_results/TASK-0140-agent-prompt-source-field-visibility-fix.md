# TASK-0140: Agent Prompt Source Field Visibility Fix

Task ID: TASK-0140
Status: PASS

Summary:

Agent Settings -> Prompt now visually renders only the field group belonging to each selected Instructions and Task / Assignment source. Inactive groups use the existing native `hidden` property, occupy no layout space, and retain their control values.

Repository analysis:

- `ProjectAgentsSection.ts` already set the correct initial radio state from the saved Agent, registered change listeners for both radio choices, invoked both source-update functions during editor setup, and assigned `hidden` to the correct field wrappers.
- The field wrappers have `.settings-form-group`, whose author CSS declares `display: flex`. That author display declaration overrode the browser presentation of the native `hidden` attribute, so the DOM state changed while both groups remained visibly laid out.
- Existing tab panels and nested Agent settings had dedicated `[hidden]` CSS rules, but ordinary settings form groups did not.
- Existing frontend coverage asserted that `.hidden =` assignment text existed in TypeScript. It did not evaluate the CSS cascade or rendered browser layout, so it passed while the fields remained visible.

Files changed:

- `src/client/components/settings/settings.css`
- `tests/frontend/projects-ui.test.ts`
- `tests/e2e/agent-prompt-source-visibility.spec.ts`
- `docs/executed_tasks/TASK-0140-agent-prompt-source-field-visibility-fix.md`
- `docs/executed_results/TASK-0140-agent-prompt-source-field-visibility-fix.md`

Tests and verification:

- Added a deterministic frontend assertion that the shared `[hidden]` rule resolves to `display: none !important` despite `.settings-form-group` using flex layout.
- Strengthened source coverage for both Instructions and Task / Assignment initialization, both radio listeners, immediate update functions, value non-clearing, and unchanged payload fields.
- Added a Chromium Playwright regression test using the built client. It verifies saved inline and file states, visible/hidden field pairs, zero inactive wrapper height, immediate source switching, value preservation in both directions, tab switching, and the unchanged six prompt-related save payload fields.
- `npm.cmd run build`: PASS.
- `npm.cmd run build:client`: PASS.
- `npm.cmd run typecheck:client`: PASS.
- `npm.cmd run lint`: PASS.
- `npm.cmd test`: PASS, 1,100 tests passed and 0 failed.
- `npx.cmd playwright test tests/e2e/agent-prompt-source-visibility.spec.ts`: PASS, 1 test passed. The first attempt reached the rendered UI but failed because the Agent-name locator also matched the reorder control; the locator was narrowed to the full open-button accessible name and the rerun passed.
- `git diff --check -- src/client/components/settings/settings.css tests/frontend/projects-ui.test.ts`: PASS.

Production code:

- Added one shared rule to `settings.css`: `[hidden] { display: none !important; }`.
- This preserves native hidden semantics against component `display: flex` or `display: grid` declarations without adding inline display mutations or a second JavaScript visibility state.
- Instructions inline source shows only Inline instructions; Instructions file source shows only Instruction file.
- Task inline source shows only Task / Assignment; Task file source shows only Task file.
- No values are cleared when a source becomes inactive. Inline text and Project file paths remain in their existing controls and are restored when switched back.

Architecture:

- No architecture, data model, API, persistence, service, file-resolution, prompt-construction, or tab-structure changes.
- `ProjectAgentsSection.ts`, `AgentService`, and `AgentRunService` were not modified.

Dependencies:

- No dependencies added or changed.

Deviations:

- None. The implementation continues to use the existing native `hidden` property and source-update logic.

Risks / findings:

- The shared rule intentionally enforces standard hidden semantics for every element carrying the `hidden` attribute. This prevents later non-important display declarations from accidentally exposing hidden content.
- The worktree contained substantial unrelated pre-existing modifications and untracked files. They were not reverted or modified for this task.

Diff summary:

- One production CSS rule added.
- Existing frontend regression coverage strengthened.
- One rendered Chromium regression test added.
- Task trace and result records added.
