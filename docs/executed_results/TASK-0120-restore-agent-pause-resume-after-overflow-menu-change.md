Task ID: TASK-0120
Status: PASS

Summary:
Restored Pause/Resume Agent controls that were incorrectly removed by TASK-0119. Pause shows when the agent run is running, Resume shows when paused. Both route through the existing performRunAction handler. Overflow menu (Execution / Run log / Error log) remains intact.

Repository analysis:
TASK-0119's task spec explicitly said "Remove Pause/Resume buttons from agent row actions." This removed pre-existing controls outside its approved scope (moving Execution, Run log, Error log to overflow). The performRunAction function already supports 'pause' and 'resume' — only the UI button rendering was missing.

Files changed:
- src/client/components/projects/ProjectAgentsSection.ts — Added Pause (running) and Resume (paused) buttons in render() action block
- tests/frontend/projects-ui.test.ts — Removed anti-Pause/Resume assertion; added state-based visibility and handler tests

Tests and verification:
- Updated 1 test (visible actions list expanded to include Pause, Resume)
- Removed 1 TASK-0119 test asserting Pause/Resume must not exist
- Added 6 new tests covering state visibility and handler invocation
- npm run build: PASS
- npm run build:client: PASS
- npm run typecheck:client: PASS
- npm run lint: PASS
- npm test: 909/909 PASS

Production code:
- render() now adds Pause button when run.status === 'running', calling performRunAction(agent, run, 'pause')
- render() now adds Resume button when run.status === 'paused', calling performRunAction(agent, run, 'resume')
- Cancel remains for all active states (running + paused)
- Start remains for idle state
- Overflow menu unchanged: Execution, Run log, Error log

Architecture:
No architectural changes. Restoration only — no new handlers, routes, or semantics.

Dependencies:
None added.

Deviations:
None.

Risks / findings:
Minimal risk. Changes are confined to the render() action block in a single component file. The performRunAction handler and its API endpoints were already present and tested. CSS requires no modification as the existing .project-agent-actions flex layout accommodates additional buttons.

Diff summary:
ProjectAgentsSection.ts: +6 lines (Pause/Resume conditional blocks within active && run guard)
projects-ui.test.ts: -7 lines removed, +42 lines added (test restructuring for Pause/Restore coverage)
