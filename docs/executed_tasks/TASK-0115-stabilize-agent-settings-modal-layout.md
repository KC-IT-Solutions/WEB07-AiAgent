# TASK-0115: stabilize-agent-settings-modal-layout

**Task ID:** TASK-0115
**Slug:** stabilize-agent-settings-modal-layout

## Goal

Polish the existing Agent settings tabs (introduced in TASK-0114) so that:

1. The Agent settings modal keeps the same outer size when switching tabs
2. The tab bar remains fixed while tab content scrolls
3. Save and Cancel remain fixed at the bottom
4. Project file permissions uses the same visual frame style as other checklist sections

## Requirements

### Problem 1 — Modal size changes between tabs
- Opening the editor on General establishes the intended visual modal size
- Switching tabs must not resize the outer Agent settings modal
- Use existing General-tab/modal dimensions as baseline
- No per-tab heights; one shared stable viewport
- Bounded by viewport on smaller screens

### Problem 2 — Scrolling moves the tabs
- Tab controls remain visible at all times while scrolling settings
- Vertical structure: Modal title → Tab bar → Scrollable tab content → Error region → Save/Cancel
- Only active tab content area scrolls vertically
- Tab bar retains role="tablist", keyboard behavior, ARIA relationships

### Problem 3 — Project file permissions frame
- Uses same visual frame treatment as Tools/Skills checklist sections
- Matching border, radius, padding, legend treatment, internal spacing
- Permission semantics and checkbox labels unchanged

## Constraints

- Do not redesign tabs or settings structure
- Do not modify ConfirmationModal unless no viable Agent-editor-specific solution exists
- Preserve all TASK-0114 behavior (tab switching, keyboard nav, save payload, etc.)
- No backend/API changes

## Expected files

- src/client/components/projects/ProjectAgentsSection.ts
- src/client/components/projects/projects.css

## Tests required

See task specification for coverage requirements.
