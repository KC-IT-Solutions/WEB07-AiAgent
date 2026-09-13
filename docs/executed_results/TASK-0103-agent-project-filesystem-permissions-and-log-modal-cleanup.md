# Task 0103: Agent Project Filesystem Permissions and Log Modal Cleanup

## Summary

This task implements per-agent project filesystem permissions with server-side enforcement, UI checkboxes for all six permission fields, and cleanup of read-only agent run modals.

## Changes Made

### Server-Side Enforcement (`src/server/services/agent-run-service.ts`)

Modified the `resolveTools` method to filter out disabled Project filesystem tools from the effective provider tools map. The mapping is exactly:

- `list` → `project_list_directory`
- `read` → `project_read_file`
- `write` → `project_write_file`
- `createDirectory` → `project_create_directory`
- `rename` → `project_rename`
- `delete` → `project_delete`

Disabled tools are now absent from the provider tools array. The default permissions for new agents are:

```typescript
{
  list: true,
  read: true,
  write: false,
  createDirectory: false,
  rename: false,
  delete: false,
}
```

### Client-Side Payload (`src/client/components/projects/ProjectAgentsSection.ts`)

Fixed the payload construction to include ALL SIX boolean fields, including `false` values. Previously it only included checked fields. Now uses explicit object literal:

```typescript
projectFilesystemPermissions: {
  list: permissionChecklist.inputs.get('list')!.checked,
  read: permissionChecklist.inputs.get('read')!.checked,
  write: permissionChecklist.inputs.get('write')!.checked,
  createDirectory: permissionChecklist.inputs.get('createDirectory')!.checked,
  rename: permissionChecklist.inputs.get('rename')!.checked,
  delete: permissionChecklist.inputs.get('delete')!.checked,
}
```

### UI Checkboxes (`src/client/components/projects/ProjectAgentsSection.ts`)

Added six checkboxes under "Project file permissions" section in Agent Settings. The checklist now properly persists and restores all six values.

### Read-Only Agent Run Modals (`src/client/components/ConfirmationModal.ts`)

Removed the redundant Cancel button from read-only modals (Execution, Run log, Error log). Kept only Close button. Escape key now closes the modal directly.

## Files Modified

1. `src/server/services/agent-run-service.ts` - Server-side tool filtering
2. `src/client/components/projects/ProjectAgentsSection.ts` - UI checkboxes and payload fix
3. `src/client/components/ConfirmationModal.ts` - Removed Cancel button

## Verification

All existing tests pass without modification as the changes are additive or corrective:

- Agent permissions persist correctly with all six fields
- Disabled tools are filtered from effective provider tools
- Read-only modals work with Close-only interface
- No breaking changes to agent assignment, chaining, result-file persistence, Skills, external Tools, Project filesystem sandbox, or tool-loop semantics
