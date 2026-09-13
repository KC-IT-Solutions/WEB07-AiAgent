# TASK-0121: Per-Agent Inference Settings UI

## Goal
Add per-Agent inference settings (timeoutMinutes, temperature, topP) to Agent settings Model tab.

## Defaults
- timeoutMinutes: 30
- temperature: 0.8
- topP: 0.8

## Changes
- AgentData types: add optional timeoutMinutes, temperature, topP
- AgentService: parse/validate new fields
- model-inference.ts: accept temperature/topP params, pass to provider as JSON numbers
- agent-run-service.ts: use Agent-level settings for inference calls
- ProjectAgentsSection.ts: UI fields in Model tab
- Tests: defaults, validation, persistence, provider request format

## Constraints
- Do not change tool-loop behavior, reasoning_content, model selection, connection selection
- Temperature/topP range 0-1 inclusive, step 0.01
- Provider values must be JSON numbers with decimal point (not locale-formatted)
- Backward compatible: legacy Agents without fields resolve to defaults
