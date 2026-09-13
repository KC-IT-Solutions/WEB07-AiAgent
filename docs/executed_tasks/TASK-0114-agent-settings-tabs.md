Task ID: TASK-0114
Slug: agent-settings-tabs

## Task

Reorganize the Agent settings editor into tabbed sections without changing the Agent data contract, backend behavior, save semantics, or existing settings functionality.

## Requirements

See full task instruction in the task prompt for TASK-0114.

Key requirements:
- Create tabs: General | Model | Context | Tools & Skills | Runtime (+ Advanced for existing agents)
- ARIA-compliant tab interface with keyboard navigation
- Preserve all form/save/validation semantics
- No backend changes
- Update tests accordingly
