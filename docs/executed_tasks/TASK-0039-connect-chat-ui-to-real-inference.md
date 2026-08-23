# TASK-0039 - Connect Chat UI to real inference

Task ID: TASK-0039
Task slug: connect-chat-ui-to-real-inference

## Instruction

## Goal

Replace the existing deterministic Chat UI stub response with the real persisted-chat inference endpoint.

Use:

    POST /api/chats/:id/inference

Do not add message persistence or streaming yet.

## Read first

Run:

    powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\inspect-repo.ps1

Then read only relevant files for:

- ChatView
- active chat state/layout
- existing chat message behavior
- POST /api/chats/:id/inference
- relevant frontend tests
- CODINGSTANDARDS.md
- ARCHITECTURE.md

Do not use recursive repository listing commands.

## Required behavior

When an active persisted chat exists and the user sends a message:

- show the user's message immediately
- send the trimmed message to:

    POST /api/chats/:id/inference

Request body:

    {
      "message": "<user message>"
    }

Use the active persisted chat id.

Do not send:

- modelId
- modelConnectionId
- baseUrl
- userId
- API key

Those values are resolved by the backend.

## Assistant response

On a successful response:

    {
      "message": "..."
    }

- validate the response before using it
- render the returned message as the assistant response
- use text-safe DOM rendering
- do not use innerHTML for model output

Remove the old local deterministic:

    Stub response: ...

behavior from ChatView.

## No active chat

If no persisted chat is active:

- do not send an inference request
- keep the message input unavailable or show a clear state

Use the smallest behavior consistent with the existing UI.

## Missing model configuration

The backend may reject inference if:

- no model connection is selected
- no model is selected
- connection is unavailable or disabled

Show a concise user-visible error in the existing Chat UI error style.

Do not expose internal server details.

## Loading state

While inference is running:

- prevent duplicate sends from the same input
- disable Send
- prevent Enter from issuing another request
- show a simple waiting state

Example:

    Thinking...

or equivalent existing UI language.

Do not add animation dependencies.

## Completion

After success or failure:

- restore Send/input availability
- clear the loading state

Preserve the user's message even if inference fails.

## Request ordering

Keep this task simple.

Only one inference request from this ChatView should be active at a time.

Do not implement the global model-server inference queue yet.

That will be handled separately.

## Chat switching

If practical within the existing client structure:

- do not render a late response into a different chat if the user switches chats before the request finishes

Keep the implementation small.

Do not add a broad state-management abstraction.

## Message persistence

Messages remain client-memory-only in this task.

Do not add database persistence for:

- user messages
- assistant messages
- conversation history

Reloading may still clear displayed messages.

## Tests

Use deterministic frontend/API behavior.

Do not use LM Studio in automated tests.

Test at minimum:

- Send calls POST /api/chats/:id/inference
- active chat id is used
- request body contains only the message
- modelId/baseUrl/userId are not sent
- successful assistant message is rendered
- old Stub response behavior is removed
- invalid inference response shows error
- failed request shows error
- Send is disabled while inference is pending
- duplicate send while pending is prevented
- input becomes usable after completion
- no active chat sends no inference request
- model configuration backend error is shown safely
- late response is not rendered into another active chat if chat changes during request

Do not weaken existing tests.

## Optional live verification

After automated tests pass, a manual live test may be performed using an existing chat configured with a connection pointing to:

    http://127.0.0.1:1234

The chat must already have a valid selected model.

Send one simple message and verify an assistant response is displayed.

Live verification is optional and must not determine automated test success.

## Out of scope

Do not add:

- message persistence
- conversation history
- streaming
- tools
- agents
- inference queue
- credential persistence
- authentication
- dynamic users
- markdown rendering
- new dependencies
- unrelated refactors

## Verification

Run:

    npm run build
    npm run build:client
    npm run typecheck:client
    npm run lint
    npm test

## Acceptance

- Chat UI uses POST /api/chats/:id/inference
- active persisted chat id is used
- backend resolves connection and model
- user message appears immediately
- real assistant response appears in Chat
- old stub response is removed
- duplicate in-flight sends are prevented
- errors are shown safely
- no active chat sends no inference
- messages are not persisted yet
- no streaming is added
- automated tests do not require LM Studio
- all verification passes
- no new dependencies
- no unrelated changes

## Tracking

Create:

- docs/executed_tasks/TASK-0039-connect-chat-ui-to-real-inference.md
- docs/executed_results/TASK-0039-connect-chat-ui-to-real-inference.md

Do not read historical task/result files.

## Final response

Return only:

    Task ID: TASK-0039
    Status: <PASS|FAIL|BLOCKED>
    Result: docs/executed_results/TASK-0039-connect-chat-ui-to-real-inference.md
    Summary: <one short sentence>
