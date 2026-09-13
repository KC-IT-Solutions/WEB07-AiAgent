# TASK-0132: Agent Merge Provider System Context

## Goal

Make Agent provider context use exactly one initial `system` message by merging all system context sections.

## Requirements

- Merge all Agent provider-only system context into one system message
- Merged content order: instructions → skill context → attached files → current date
- Separate non-empty sections with exactly `\n\n`
- Omit absent optional sections without extra blank separators
- Preserve each section's internal content unchanged
- Preserve current-date single-capture semantics from TASK-0131
- Agent task remains a separate `user` message
- No additional system messages later in provider chronology

## Scope

Primary change: `src/server/services/agent-run-service.ts` — modelMessages construction
