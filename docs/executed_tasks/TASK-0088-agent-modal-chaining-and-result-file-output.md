# TASK-0088 - Wider Agent modal, post-run Agent chaining, and final-result file output

Task ID: TASK-0088
Task slug: agent-modal-chaining-and-result-file-output

## Instruction

Extend persistent Agent configuration without implementing Agent execution:

1. Scope the Agent create/edit modal to a responsive desktop width of approximately 760-800 px.
2. Persist `triggerNextAgent` (default `false`) and a relational nullable `nextAgentId`; expose only same-user, same-Project Agents, reject self-reference and all cycles in service validation, and atomically deactivate incoming references when a target Agent is deleted.
3. Persist `saveResultToFile` (default `false`), `resultDirectory` (default `""`), and `resultFilename` (default `""`); validate enabled destinations using existing Project-relative filesystem safety principles without filesystem writes or requiring existing directories. Reject absolute/traversing directories and filenames containing separators, and require a filename only while enabled.
4. Extend safe Agent DTOs and strict create/update inputs without exposing Project roots, credentials, or execution state.
5. Add collapsed, accessible plain-TypeScript controls for both settings to create/edit UI, preserving all existing Agent controls and behavior.
6. Follow the relational/JSON persistence rules in `docs/DATABASE.md`; add a new migration if schema changes are needed and preserve existing rows safely.
7. Cover migration/defaults, reference cleanup, authorization, cycle validation, path validation, scoped responsive UI, conditional controls, edit population, and existing CRUD behavior with deterministic tests.
8. Record the future contract only: a successful future run saves the final result by replacement, then optionally triggers the next Agent; never persist hidden reasoning or internal provider/tool data. Do not implement runs, inference, triggering, file writing, context transfer, history, or filesystem tools.
9. Run `npm.cmd run build`, `npm.cmd run build:client`, `npm.cmd run typecheck:client`, `npm.cmd run lint`, and `npm.cmd test`. Report PASS only if all execute successfully in this session.
10. Re-read every changed range, perform the specified final self-check, and write `docs/executed_results/TASK-0088-agent-modal-chaining-and-result-file-output.md`.

Existing Agent CRUD, Project ownership, model settings, Skills, explicit tools, Project filesystem sandbox, Project UI, Chat behavior, inference serialization, and plain TypeScript + DOM architecture must remain intact.
