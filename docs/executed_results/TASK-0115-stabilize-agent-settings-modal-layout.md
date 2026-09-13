Task ID: TASK-0115
Status: PASS

Summary:
Stabilized the Agent settings modal layout introduced in TASK-0114. Fixed three problems: (1) modal size changes between tabs, (2) tab bar scrolls away with content, (3) Project file permissions frame styling inconsistency. Implemented a dedicated scrollable tab-content container within the agent editor, scoped CSS for stable viewport-safe modal sizing, and unified permission checklist visual framing.

Repository analysis:
- Inspected current TASK-0114 tabbed Agent settings implementation in ProjectAgentsSection.ts and projects.css
- Identified that all tab panels were appended directly to form, with no dedicated scroll container
- Modal had no fixed height constraint, allowing content-driven resizing between tabs
- Permission fieldset used default browser fieldset styling instead of the established agent-checklist-frame

Files changed:
1. src/client/components/projects/ProjectAgentsSection.ts — Wrapped tab panels in a `.project-agent-tab-content` container; appended tabList, tabContent, editorError to form as separate children
2. src/client/components/projects/projects.css — Added stable modal sizing (min-height/max-height), flex column layout for agent-editor, fixed non-shrinking tabs, scrollable tab-content region, unified permission checklist styling via `.agent-checklist-frame` class reuse
3. tests/frontend/projects-ui.test.ts — Updated 2 existing source-structure tests to match new DOM structure; added 7 new CSS/layout contract tests

Tests and verification:
- npm run build: PASS (0 errors)
- npm run build:client: PASS (0 errors, assets copied)
- npm run typecheck:client: PASS (0 errors)
- npm run lint: PASS (0 warnings/errors)
- npm test: PASS (830 tests, 63 suites, 0 failures)

Production code:
- ProjectAgentsSection.ts: Added `.project-agent-tab-content` wrapper element; changed form child append order to use `form.append(tabList, tabContent, editorError)` for explicit structural layout
- projects.css: Added scoped CSS rules for `.project-agent-modal-backdrop .confirmation-modal`, `.project-agent-editor`, `.project-agent-tabs`, `.project-agent-tab-content`, and permission checklist frame styling

Architecture:
- No architectural changes. Layout is achieved purely through DOM structure reorganization and project-scoped CSS.
- ConfirmationModal production code was not modified.
- Agent API/backend behavior unchanged.

Dependencies:
No new dependencies added.

Deviations:
None. All task requirements implemented as specified.

Risks / findings:
- The `.project-agent-modal-backdrop .confirmation-modal` scoped height rules (min-height/max-height) ensure stable modal sizing but depend on the backdrop class remaining present in ConfirmationModal rendering. If ConfirmationModal structure changes, these scoped selectors should be reviewed.

Diff summary:
- ProjectAgentsSection.ts: ~10 lines changed (tab-content wrapper + append restructuring)
- projects.css: ~45 lines added (layout CSS + permission styling unification)
- projects-ui.test.ts: 2 existing tests updated + 7 new layout contract tests added
