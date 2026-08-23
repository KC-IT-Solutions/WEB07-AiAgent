# TASK-0019 — Add deterministic Chat API stub

## Goal

Connect the existing frontend Chat view to a minimal Express API endpoint.
The endpoint must return a deterministic stub response.
Do not connect to LM Studio yet.

## Requirements

- POST /api/chat endpoint
- Request body: { "message": "Hello" }
- Response body: { "message": "Stub response: Hello" }
- Validate message is a non-empty string
- Trim surrounding whitespace
- Invalid input returns HTTP 400
- Response is deterministic
- No LM Studio/OpenAI calls
- No database or persistence
- Frontend sends user message, POSTs to /api/chat, renders stub response
- Failed requests show user-visible error
- Rendered text uses safe DOM APIs (textContent)

## Out of scope

- LM Studio integration
- OpenAI SDK usage
- Model selection
- Saved chats
- SQLite
- Agents
- Streaming
- Markdown
- New dependencies
- Unrelated refactors

## Tests

- Valid API request
- Whitespace trimming
- Invalid/empty input returns 400
- Frontend sends a message and renders the stub response
