# TASK-0134: Agent Execution Support — inference_cancelled

## Task ID
TASK-0134

## Slug
agent-execution-support-inference-cancelled

## Goal
Make the Agent Execution UI accept and render inference_cancelled execution events instead of rejecting the entire execution payload.

## Requirements
- Extend client execution event model to support eventType 'inference_cancelled'
- Parser must accept inference_cancelled when id, runId, createdAt are valid and data is an object
- Preserve only safe display metadata: finishReason, totalTokens
- Render as status entry labeled "Inference cancelled"
- Do NOT treat as assistant content, reasoning, final_result, tool_call, or tool_result
- Do NOT call JSON.parse() on cancellation data

## Scope
Primary file: src/client/components/projects/ProjectAgentsSection.ts
Update only frontend execution event type/parser/renderer and directly related tests.

## Tests Required (10)
1. Parser accepts inference_cancelled
2. Clean cancellation with empty data parses successfully
3. Cancellation with finishReason parses successfully
4. Cancellation with totalTokens parses successfully
5. reasoning + assistant_message + inference_cancelled parses as valid payload
6. inference_cancelled does not get parsed as a tool event
7. Renderer labels it "Inference cancelled"
8. Renderer does not JSON.parse cancellation data
9. Cancelled execution no longer produces "Failed to load"
10. Existing parsing for user/reasoning/assistant/tool/final remains unchanged

## Verification Commands
- npm.cmd run build
- npm.cmd run build:client
- npm.cmd run typecheck:client
- npm.cmd run lint
- npm.cmd test
