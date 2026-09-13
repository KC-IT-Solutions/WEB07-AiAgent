Task ID: TASK-0104A
Task: Persist attached Project file paths for Agents
Slug: agent-attached-project-files-persistence

Goal
Add persistence support for a list of Project-relative file paths attached to an Agent.

Requirements
1. Agent data/type definitions
   Add:
       attachedProjectFiles: string[]
   to the Agent data model.

2. New Agent default
   When creating a new Agent and attachedProjectFiles is omitted, the stored and returned value must be:
       []

3. Persist supplied paths
   If supplied, for example:
       [
         "docs/spec.md",
         "context/domain.txt"
       ]
   the same ordered string array must be persisted and returned.

4. Existing Agent compatibility
   Persisted legacy Agent JSON that does not contain attachedProjectFiles must load successfully with:
       attachedProjectFiles: []
   Do not require an existing record to contain the new property.

5. Persisted-data validation
   If attachedProjectFiles exists in persisted Agent JSON:
   - it must be an array
   - every element must be a string
   Invalid persisted data must follow the repository's existing invalid-data handling behavior.
   Do not invent a new error mechanism.

6. Create/update data flow
   Carry attachedProjectFiles through the existing Agent create/update data flow where required.
   Follow the current API contract.
   Do not invent PATCH semantics or redesign Agent requests.

7. Ordering
   Preserve the supplied array order exactly.

8. Database
   This is an optional flexible Agent JSON property.
   Do not add a database migration unless repository inspection proves one is required.
   If a migration appears necessary, stop and report BLOCKED rather than changing the persistence model without approval.

Out of scope
Do NOT implement any of the following in this task:
- Agent Settings UI
- Project file picker
- reading attached file contents
- adding attached files to provider/model context
- Agent execution behavior
- AgentRunService runtime behavior
- ProjectFilesystemService changes
- file existence checks
- path normalization
- path resolution
- path sandbox changes
- file size limits
- context/token size limits
- automatic deduplication
- projectFilesystemPermissions changes
- Skills changes
- external Tools changes
- unrelated refactoring

Do not modify ProjectAgentsSection.ts for UI behavior.

If AgentRunService or another runtime module requires a value only because AgentData became stricter, use an empty array where necessary for type compatibility only. Do not add attached-file runtime behavior.

Acceptance criteria
Focused deterministic coverage must prove:
1. A newly created Agent defaults attachedProjectFiles to [].
2. Multiple attached Project file paths can be persisted.
3. Path order is preserved.
4. A legacy persisted Agent record without attachedProjectFiles loads with [].
5. Invalid persisted attachedProjectFiles data is rejected according to existing repository behavior.
6. Existing projectFilesystemPermissions persistence still behaves as before.
7. Existing Agent behavior remains unchanged.

Testing
Follow docs/TESTING.md.
Prefer the smallest reliable test level.
Do not weaken existing valid tests to make the task pass.

Implementation discipline
Make the smallest coherent change.
Do not perform unrelated refactoring.
Do not continue into TASK-0104B or any UI/runtime work.
If implementation requires a product, architecture, security, compatibility, or persistence decision not defined here or in repository documentation, stop and report BLOCKED.

Verification
Run all of:
    npm.cmd run build
    npm.cmd run build:client
    npm.cmd run typecheck:client
    npm.cmd run lint
    npm.cmd test

Do not report PASS unless every command was actually run and succeeded.
