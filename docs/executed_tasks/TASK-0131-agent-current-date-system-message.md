# TASK-0131

## Goal

Make Agent inference receive the same current-date provider context behavior already used by Chat.

## Requirements

- Required provider system message: `Current date: YYYY-MM-DD`
- Mirror existing Chat implementation from TASK-0069
- Use server runtime's local calendar date (not UTC)
- Capture date exactly once per Agent run when initial model context is constructed
- Reuse same captured date through every subsequent tool/inference round
- If run crosses midnight, date must remain the one captured at run context creation
- Do not persist date into Agent configuration
- Do not modify Agent instructions
- Do not expose as UI setting
- No database changes

## Context ordering

1. Agent instructions (system)
2. Skill system context (optional, system)
3. Attached Project files system context (optional, system)
4. Current date system message (system)
5. Agent task/user message (user)

## Implementation approach

- Follow ChatInferenceService pattern: injectable clock seam defaulting to `() => new Date()`
- Use local `getFullYear()/getMonth()/getDate()` formatting
- Deterministic `YYYY-MM-DD` format
- No dependency additions
- Change belongs in Agent provider-context construction only
