# TASK-0120: Restore Agent Pause/Resume After Overflow Menu Change

## Goal

Correct TASK-0119 by restoring the pre-existing Pause/Resume Agent controls while keeping the new overflow menu for log actions.

## Requirements

- Idle Agent shows: Start, ?
- Running Agent shows: Pause, Cancel, ?
- Paused Agent shows: Resume, Cancel, ?
- Overflow menu contains: Execution, Run log, Error log
- Do not move Pause/Resume into overflow
- Do not alter Pause/Resume execution semantics

## Implementation Plan

1. Edit ProjectAgentsSection.ts render() to add Pause (running) and Resume (paused) buttons
2. Update projects-ui.test.ts to remove the anti-Pause/Resume assertion and add proper tests
3. Run verification commands
