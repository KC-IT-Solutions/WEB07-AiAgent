# TASK-0038 - Add model inference service and API

Task ID: TASK-0038
Task slug: add-model-inference-service-api

## Goal

Add backend support for real OpenAI-compatible chat inference using the model connection and model already selected on a persisted chat.

Do not connect ChatView to this endpoint yet. Do not add streaming yet.

## Required Flow

Add `POST /api/chats/:id/inference` with body `{ "message": "Hello" }`.

Validate that the chat id is a positive integer and the message is a non-empty string after trimming. UserId remains server-side as UserId 1.

The HTTP layer must call a chat inference service, which uses `ChatService` and `ModelConnectionService` to load the UserId 1 chat and saved connection. Require a selected connection and model, and require the connection to exist, belong to UserId 1, and be enabled.

The browser identifies only the persisted chat and must not control `userId`, `baseUrl`, API key, or `modelId`. Use the saved connection's `baseUrl` and `timeoutMinutes`, and the chat's saved `modelId`.

Send the smallest non-streaming OpenAI-compatible request to normalized `<baseUrl>/v1/chat/completions`:

```json
{
  "model": "<chat.modelId>",
  "messages": [
    {
      "role": "user",
      "content": "<message>"
    }
  ]
}
```

Do not add conversation history. Convert saved timeout minutes to milliseconds only when creating an AbortController request timeout.

Treat the upstream response as untrusted, validate that assistant text exists, and return only `{ "message": "Assistant response text" }` rather than the raw response.

Return safe application errors for chat not found, missing selected connection, missing selected model, connection not found, connection disabled, unreachable model server, timeout, non-OK response, and invalid upstream response. Do not expose stack traces, internal exceptions, secrets, or authorization headers.

Saved connections do not persist API keys, so this task supports unauthenticated connections only. Do not add an `apiKey` request field, credential persistence, or credential logging.

## Architecture

Add the smallest coherent inference service/application boundary. Do not put external model-server HTTP logic in the Express route. Reuse existing OpenAI-compatible URL and timeout conventions where practical without broad refactoring or duplicated discovery infrastructure.

## Automated Tests

Use a deterministic local HTTP stub/mock, never LM Studio or another live model server. Cover successful inference, selected chat model and user message in the request, saved base URL, trailing slash normalization, saved timeout, unknown chat, missing connection selection, missing model selection, unknown connection, disabled connection, connection failure, non-OK response, malformed response, normalized response only, and inability for the client to override `userId`, `baseUrl`, or `modelId`.

## Out of Scope

Do not add ChatView integration, message persistence, conversation history, streaming, tool calls, agent orchestration, an inference queue, credential persistence, authentication, dynamic users, new dependencies, or unrelated refactors.

## Verification

Run:

```text
npm run build
npm run build:client
npm run typecheck:client
npm run lint
npm test
```

## Acceptance

- `POST /api/chats/:id/inference` exists.
- Chat ownership is UserId 1 server-side.
- Saved `modelConnectionId`, `modelId`, `baseUrl`, and `timeoutMinutes` are used.
- The browser cannot override model-server configuration.
- Requests target `/v1/chat/completions`.
- Responses are safely normalized.
- No streaming or message history is added.
- Tests are deterministic and require no live model server.
- All verification passes.
- No new dependencies or unrelated changes are introduced.

## Tracking

Create `docs/executed_tasks/TASK-0038-add-model-inference-service-api.md` and `docs/executed_results/TASK-0038-add-model-inference-service-api.md`. Do not read historical task/result files.
