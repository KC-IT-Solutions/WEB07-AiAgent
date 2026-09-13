Task ID: TASK-0104B
Slug: agent-attached-project-files-ui

Goal
Allow a user to configure one or more attached Project files in an Agent's Settings UI.

Use the already-persisted Agent property:
    attachedProjectFiles: string[]

This task is UI and Agent create/edit data-flow only.
Do not implement Agent runtime file loading.

Requirements

1. Agent Settings section
Add a clearly labeled section to the Agent editor:
    Attached project files
Place it with the Agent's instruction/task configuration, before model/tool capability settings if that matches the existing editor structure.

2. Add file action
Provide a control:
    + Add file
Use the existing Project file-picker functionality already used elsewhere in the Agent editor.
Do not build a new independent file browser if an existing picker can be reused.

3. Multiple files
The user must be able to attach more than one Project file.
Each selected file must be stored as its Project-relative path.
Example:
    docs/spec.md
    context/domain.txt

4. Display selected files
Show the currently attached files in the Agent editor.
Each entry must show its Project-relative path.
Preserve the array order received from Agent data.

5. Remove file
Each attached file entry must have a Remove action.
Removing a file updates the editor state only until the Agent is saved.

6. Save
When creating or editing an Agent, include the current attachedProjectFiles array in the existing Agent save payload.
Do not redesign the save API.

7. Restore
When editing an existing Agent:
- restore attachedProjectFiles from Agent data
- display all attached paths
- preserve their order
Legacy Agents already normalize to [] from TASK-0104A and should therefore show an empty section.

8. File picker behavior
The picker must select files only.
Do not allow directory selection as an attached file.
Use Project-relative paths returned by the existing Project file picker.
Do not resolve or expose absolute filesystem paths in the browser.

9. Duplicate selection
Do not add the same exact Project-relative path more than once.
If a file already exists in attachedProjectFiles, selecting it again should leave the list unchanged.
Do not introduce complex path normalization in this task.
Exact string equality is sufficient.

10. Permissions independence
Do not connect attachedProjectFiles UI to:
    projectFilesystemPermissions.read
The user must still be able to attach files even when generic "Read files" permission is disabled.
Do not alter any filesystem permission checkbox behavior.

Out of scope

Do NOT implement:
- reading attached file contents
- Agent runtime loading of attached files
- provider/model context changes
- AgentRunService changes
- ProjectFilesystemService changes
- file existence validation during Agent execution
- missing-file failure behavior
- file size limits
- token/context limits
- attachment content previews
- drag-and-drop upload
- uploading new files from this UI
- directory attachments
- Project filesystem permission changes
- Skills changes
- external Tools changes
- unrelated UI redesign
- unrelated refactoring

Do not continue into TASK-0104C.

Testing
Follow docs/TESTING.md.
Add focused deterministic coverage for the changed UI/data behavior.
At minimum verify:
1. Existing Agent attachedProjectFiles are restored into the editor.
2. Multiple Project files can be selected.
3. Selected files appear in deterministic order.
4. A selected file can be removed.
5. Selecting the same exact path twice does not create a duplicate.
6. Agent create/save payload contains attachedProjectFiles.
7. Agent edit/save payload contains the updated attachedProjectFiles.
8. An empty attachedProjectFiles array renders correctly.
9. Attached files remain configurable when generic "Read files" permission is disabled.
10. Existing instruction-file picker behavior remains unchanged.

Prefer the smallest reliable test level.
Do not weaken existing valid tests to make the task pass.

Implementation discipline
Make the smallest coherent change.
Reuse the existing Project file-picker implementation.
Do not introduce a second file-picker architecture.
Do not perform unrelated refactoring.
If the existing picker cannot support selecting a Project file without a meaningful architecture or public API change, stop and report BLOCKED rather than inventing a new pattern.

Verification
Run all of:
    npm.cmd run build
    npm.cmd run build:client
    npm.cmd run typecheck:client
    npm.cmd run lint
    npm.cmd test

Do not report PASS unless every command was actually run and succeeded.
