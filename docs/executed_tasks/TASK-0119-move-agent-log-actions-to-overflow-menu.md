# TASK-0119: Move Agent Log Actions to Overflow Menu

## Goal

Simplify each Agent row/card by keeping only the primary run action visible and moving the three log actions behind a three-dot overflow menu.

## Requirements

Keep directly visible:
- Start when currently available
- Cancel when currently shown

Move into overflow menu (already there, preserving):
- Execution
- Run log
- Error log

Remove Pause/Resume buttons from agent row actions. Only Start (idle) and Cancel (active) should be visible action buttons.

## Implementation

- Edit ProjectAgentsSection.ts: remove Pause and Resume action button additions
- Add CSS for .project-agent-overflow, trigger, and menu positioning
- Update tests in projects-ui.test.ts
