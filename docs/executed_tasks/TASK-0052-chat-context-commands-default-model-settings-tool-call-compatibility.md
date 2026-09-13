# TASK-0052 - Chat context commands, default model settings and tool-call compatibility

Task ID: TASK-0052
Task slug: chat-context-commands-default-model-settings-tool-call-compatibility

## Goal

Implement three focused improvements:

1. Add `/clear` and `/new` commands in Chat.
2. Add user-scoped default Chat model connection/model settings used by newly created chats.
3. Reproduce and fix the current OpenAI-compatible tool-call compatibility issue against the available local LM Studio server using Qwen3.8-27B, while keeping automated tests deterministic.

Do not change unrelated chat behavior.

## Required behavior

### `/clear`

When `/clear` is entered as the complete trimmed message, do not send or persist it. Clear only the active owned chat's complete persisted message history after a successful focused server operation, while preserving the chat record, title, model selection, and active selection. A missing history file is already empty. Validate the chat ID, verify ownership through the service, never accept a filesystem path, and retain rendered messages with a safe error if clearing fails. Non-exact command-like text remains a normal message.

### `/new`

When `/new` is entered as the complete trimmed message, do not send or persist it. Reuse the existing chat creation application/API flow, activate the newly saved empty chat, and let server-side defaults select its model connection/model. Non-exact command-like text remains a normal message.

### User-scoped default Chat model settings

Add a Settings Chat section for `defaultModelConnectionId` and `defaultModelId`, persisted server-side for current `UserId = 1` in a design that remains user-scoped for future authentication. These are templates copied into newly created chats only; changing defaults must not mutate existing chats. Invalid or absent defaults produce null chat model fields.

Validate that the connection exists, belongs to the current user, and satisfies current enabled rules. Validate that a non-empty model is available for the selected connection through existing discovery behavior. Never persist a model without a connection. Changing connection clears an incompatible model until a valid model is selected. Never trust client-supplied user IDs.

The Settings UI must load persisted defaults, use saved model connections and existing model discovery API, show `Select connection` and `Select model` placeholders, disable model selection without a connection, and save explicitly using existing styling. Do not duplicate model discovery logic or store defaults only in the browser.

Use HTTP -> Service -> Repository -> SQLite, with no SQL in handlers and no speculative abstractions. `POST /api/chats` must apply defaults server-side for all callers while preserving its contract if possible.

### Tool-call compatibility

Diagnose the real local OpenAI-compatible server at `http://127.0.0.1:1234` with model `qwen/qwen3.8-27b`. Inspect the actual pipeline and response shape, including `message.content`, `message.reasoning_content`, `message.tool_calls`, and `finish_reason`. Do not guess and never execute reasoning content as instructions.

Fix only the reproduced provider compatibility gap. Preserve the provider abstraction, keep LM Studio-specific logic out of `ChatInferenceService`, tolerate `reasoning_content` alongside valid structured tool calls, support valid tool calls with null/empty normal content, preserve tool call IDs, keep normal text behavior unchanged, and fail safely for malformed responses.

After execution, provider conversation messages must contain the assistant `tool_calls` message followed by a `role: "tool"` message with matching `tool_call_id` and serialized structured content, then the follow-up model request. Preserve intended multiple-call behavior and the existing five-round limit; do not add broad parallelism.

Manually verify an ordinary response, DuckDuckGo invocation, progression to Visit Website, and a final assistant response using the live server. If DuckDuckGo yields no results, distinguish extraction behavior from provider parsing and only fix a concrete tool regression. Do not permanently log conversations, secrets, keys, or large webpage content. Do not dump hidden reasoning in the result, only field presence.

### Client command handling

Match `/clear` and `/new` exactly after trimming through both Enter and Send. Do not create a generic parser. Prevent duplicate execution while pending using existing conventions where practical.

## Tests

Add deterministic automated coverage for command exactness, whitespace, non-persistence/non-inference, ownership and clear semantics, clear failure UI retention, shared new-chat creation/activation/empty history, nullable and user-scoped defaults, settings validation and UI discovery/save behavior, new-chat copying without existing-chat mutation, provider text and structured calls with reasoning/null content, ID and argument preservation, matching tool results and follow-up protocol, malformed responses, reasoning-only behavior, both web tools, and the five-round limit. Automated tests must not depend on LM Studio.

## Out of scope

Do not add generic slash commands, `/help`, `/delete`, `/model`, system prompt settings, per-chat tool selection, orchestration, a global inference queue, streaming, context trimming, summaries, authentication, client-supplied user IDs, message editing/deletion, dependencies, or unrelated refactors.

## Verification

Run:

```text
npm.cmd run build
npm.cmd run build:client
npm.cmd run typecheck:client
npm.cmd run lint
npm.cmd test
```

Then separately perform live verification against `http://127.0.0.1:1234` and `qwen/qwen3.8-27b` and document response shape, structured calls, reasoning field presence, compatibility fix, DuckDuckGo usability, Visit Website execution, and PASS/BLOCKED status.

## Tracking and final response

Create this task record and `docs/executed_results/TASK-0052-chat-context-commands-default-model-settings-tool-call-compatibility.md`. Do not read historical task/result files. The final response must contain only:

```text
Task ID: TASK-0052
Status: <PASS|FAIL|BLOCKED>
Result: docs/executed_results/TASK-0052-chat-context-commands-default-model-settings-tool-call-compatibility.md
Summary: <one short sentence>
```
