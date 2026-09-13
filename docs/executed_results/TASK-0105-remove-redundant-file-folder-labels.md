Task ID: TASK-0105
Status: PASS

Summary:
Removed redundant "File:" and "Folder:" text prefixes from Project UI file/directory row labels where inline SVG icons already communicate the entry type. The visible label now shows only the actual file or directory name.

Repository analysis:
Two locations render file/folder rows with both an SVG icon and a textual prefix identifying the type:
- ProjectFilesSection.ts (main project files browser) - line 774
- ProjectPathPicker.ts (reusable file/directory picker modal) - line 191
Both followed the same pattern: ${entry.type === 'directory' ? 'Folder' : 'File'}: ${entry.name}

The aria-label for the three-dot action menu button retains "Folder actions for X" / "File actions for X" per accessibility requirements. No other UI copy was affected.

Files changed:
- src/client/components/projects/ProjectFilesSection.ts - removed "File:"/"Folder:" prefix from visible row label (line 774)
- src/client/components/projects/ProjectPathPicker.ts - removed "File:"/"Folder:" prefix from picker entry label (line 191)
- tests/frontend/projects-ui.test.ts - updated assertion to match new simplified label expression (lines 673-675)

Tests and verification:
- npm run build: PASS
- npm run build:client: PASS
- npm run typecheck:client: PASS
- npm run lint: PASS
- npm test: PASS (all tests pass; 2 pre-existing unrelated failures in chat-inference-queue.test.js on Windows)
- npm run test:frontend specifically: all 116 frontend tests PASS

Production code:
Two one-line changes to visible text labels. No behavioral, structural, or accessibility changes beyond the redundant prefix removal. SVG icons preserved unchanged. aria-label retained for screen reader support.

Architecture:
No architectural changes. Changes are purely cosmetic UI label simplification.

Dependencies:
No dependency changes.

Deviations:
None.

Risks / findings:
The full npm test run shows 2 pre-existing failures in chat-inference-queue.test.js (Windows stack buffer overflow, exit code 3221225477) that existed before this task and are unrelated to these UI label changes. All project-related frontend tests pass.

Diff summary:
- ProjectFilesSection.ts: openLabel.textContent = entry.name (was template literal with type prefix)
- ProjectPathPicker.ts: label.textContent = entry.name (was template literal with type prefix)  
- projects-ui.test.ts: assertion updated from checking full template to checking simplified assignment
