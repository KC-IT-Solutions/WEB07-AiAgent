# TASK-0119: Move Agent Log Actions to Overflow Menu

## Status: PASS

## Summary

Simplified each Agent row/card by keeping only the primary run action visible and moving log actions behind a three-dot overflow menu. Removed Pause/Resume buttons from agent row actions, consolidating active-state control to Cancel only.

## Files Changed

1. **src/client/components/projects/ProjectAgentsSection.ts**
   - Removed addAction('Pause', ...) block (running state)
   - Removed addAction('Resume', ...) block (paused state)
   - Kept addAction('Start', ...) for idle agents
   - Kept addAction('Cancel', ...) for active agents (running or paused)

2. **src/client/components/projects/projects.css**
   - Added .project-agent-overflow container styles
   - Added .project-agent-actions-trigger three-dot button styles with hover/focus states
   - Added .project-agent-actions-menu dropdown positioning and styling
   - Added .project-agent-actions-menu-button menu item styles

3. **tests/frontend/projects-ui.test.ts**
   - Updated action assertions to check Start/Cancel as visible buttons, Execution/Run log/Error log in overflow menu
   - Changed addAction('Execution') assertion to generic string presence check
   - Added 10 new tests for overflow menu behavior:
     - Accessible trigger with aria-haspopup and data-agent-actions-id
     - Start visible when not active
     - Cancel visible when active
     - No Pause/Resume as permanently visible buttons
     - Execution, Run log, Error log inside overflow menu
     - Menu closes on item selection
     - Escape key closes menu
     - Outside click closes menu
     - First menu item focused on open
     - CSS classes and styles present

## Overflow Menu Implementation

- Reused existing three-dot/kebab pattern from file actions in ProjectFilesSection.ts
- Trigger: \u2026 character with aria-label='Agent actions', aria-haspopup='menu'
- Menu uses role='menu' and role='menuitem' attributes
- Keyboard support: Escape closes menu, click outside closes menu
- Focus management: first menu item focused on open
- CSS follows existing .project-file-actions-menu pattern

## Confirmations

- Start remains directly visible when agent is idle (not active)
- Cancel remains directly visible when agent is running or paused
- Execution, Run log, Error log are in the overflow menu with preserved behavior
- No backend/API changes
- Agent execution behavior unchanged
- Status and TOKENS rendering unaffected

## Tests Updated

- 10 new deterministic frontend tests added for TASK-0119 overflow menu behavior
- Existing action assertions updated to reflect visible vs. overflow actions
- All 903 tests pass

## Mandatory Verification Results

All five commands succeeded:
- npm run build - PASS
- npm run build:client - PASS
- npm run typecheck:client - PASS
- npm run lint - PASS
- npm test (903 tests) - PASS

## Deviations/Risks

None. Implementation follows existing patterns and preserves all existing behavior.
