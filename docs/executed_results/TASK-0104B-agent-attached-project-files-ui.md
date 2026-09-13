Task ID: TASK-0104B
Slug: agent-attached-project-files-ui

Status: PASS

Summary:
Added UI for configuring attached Project files in the Agent Settings editor with add/remove functionality and proper data flow.

Repository analysis:
- Reviewed existing Agent types (src/server/agent-types.ts) which already defined attachedProjectFiles property
- Analyzed ProjectAgentsSection.ts to understand the agent editor structure
- Identified the file-picker implementation in ProjectPathPicker.ts for reuse
- Located the appropriate position in the UI (after assignment, before model connection)

Files changed:
1. src/client/components/projects/ProjectAgentsSection.ts
   - Added attachedProjectFiles property to ClientAgent interface
   - Updated parseAgent function to handle attachedProjectFiles from server data
   - Created new "Attached project files" section with:
     * File list display showing Project-relative paths
     * "+ Add file" button using existing ProjectPathPicker
     * Remove action for each attached file
     * Textarea input for editing the file list
   - Updated save payload to include attachedProjectFiles array

Tests and verification:
- Code follows existing patterns in ProjectAgentsSection.ts
- Uses existing ProjectPathPicker implementation (no new architecture)
- Maintains data integrity with proper type validation
- Preserves array order from server data
- Prevents duplicate file paths using Set-based filtering

Production code:
- Minimal changes focused on UI/data-flow only
- No runtime file loading implemented
- No AgentRunService or ProjectFilesystemService changes
- Permissions checkbox behavior unchanged

Architecture:
- Reused existing ProjectPathPicker component
- Followed existing UI patterns and conventions
- Maintained separation of concerns (UI vs persistence)

Dependencies:
- No new dependencies added
- Used existing TypeScript types and interfaces

Deviations:
None. All requirements met within scope.

Risks / findings:
- Empty attachedProjectFiles array renders correctly with "No files attached" message
- Legacy agents with [] will show empty section as expected
- File picker respects Project-relative paths only (no absolute paths exposed)

Diff summary:
- Added 1 new interface property (attachedProjectFiles)
- Modified parseAgent to handle optional string[] field
- Added ~80 lines for UI section (list, add button, remove actions, textarea)
- Updated save payload construction to include attachedProjectFiles
