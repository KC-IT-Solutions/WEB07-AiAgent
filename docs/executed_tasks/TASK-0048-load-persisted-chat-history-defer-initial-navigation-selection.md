# TASK-0048 — Load persisted chat history and defer initial navigation selection

Task ID: TASK-0048
Task slug: load-persisted-chat-history-defer-initial-navigation-selection

## Goal

Implement two client-side refinements:

1. Do not show any sidebar navigation item as active on initial page load.
2. When a saved chat is opened, load its persisted message history from the existing server API and render it in ChatView.

Client-side task only.

## Read first

Run:

    powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\inspect-repo.ps1

Then inspect only the relevant files for:

- layout/sidebar navigation
- ChatView
- chat message rendering
- existing chat selection behavior
- existing frontend API helpers/conventions
- relevant frontend tests
- CODINGSTANDARDS.md

Do not use recursive repository listing commands.

## Part 1 — No active menu item on initial load

On a full page load:

- Chat must not be marked active
- Settings must not be marked active
- no navigation content view should be treated as user-selected merely because the application started

A navigation item becomes active only after the user explicitly clicks it.

Requirements:

- clicking Chat marks Chat active
- clicking Settings marks Settings active
- switching between them updates the active state normally
- existing active-row highlight styling remains unchanged once a selection exists
- Chat section may remain collapsed by default as implemented previously

Do not persist active navigation state.

Do not add localStorage.

## Part 2 — Load persisted chat messages

Use the existing server endpoint:

    GET /api/chats/:id/messages

When the user opens/selects a saved chat:

1. activate that chat using existing behavior
2. request its persisted message history
3. validate the response
4. render the returned messages in conversation order

Expected response shape:

    {
      "messages": [
        {
          "role": "user",
          "content": "...",
          "createdAt": 123
        },
        {
          "role": "assistant",
          "content": "...",
          "createdAt": 124
        }
      ]
    }

## Rendering

Reuse the existing ChatView message rendering paths.

For persisted messages:

- user messages use the existing plain-text user rendering
- assistant messages use the existing Markdown renderer
- do not introduce a second rendering implementation
- do not change normal message styling
- do not show persisted timestamps yet

Do not render:

- thinking indicators
- UI-only error messages
- unknown message roles

## Loading state

While history is loading:

- do not show stale messages from the previously selected chat
- a minimal loading state is acceptable
- do not reuse the inference thinking indicator as chat-history loading unless the current architecture already provides a suitable generic state

When loading completes:

- render the loaded history
- an empty history should show an empty conversation area normally

If history loading fails:

- show a safe client-side error state/message
- do not crash the view
- do not invent messages
- do not modify persisted data

## Race safety

Preserve the existing protection against late asynchronous results.

If the user switches from Chat A to Chat B before Chat A history request finishes:

- Chat A's late result must not render into Chat B
- only the currently active chat may receive the loaded history

Reuse the existing active-chat/view-generation approach if applicable.

Do not introduce a large state-management abstraction.

## New inference after history load

After persisted history has loaded:

- sending a new user message must append visually to the currently rendered conversation
- successful assistant response must append normally
- do not reload the entire history after each inference unless the existing structure makes that strictly necessary

The server already persists those messages.

Do not change the inference API contract.

## Important scope boundary

This task loads history into the browser only.

Do NOT change the model request to include previous messages.

Inference must continue using the existing server behavior until a later task explicitly adds conversation context.

## Response validation

Treat API data as untrusted.

Validate at runtime:

- response is an object
- messages is an array
- role is exactly "user" or "assistant"
- content is a string
- createdAt is an integer

Do not use `any`.

Follow existing safe API parsing conventions where available.

## Preserve behavior

Do not change:

- server-side JSONL storage
- ChatMessageStore
- database schema
- chat metadata persistence
- model selection
- model discovery
- inference endpoint
- Markdown renderer
- chat rename/delete
- sidebar collapse behavior
- Settings functionality
- thinking indicator animation
- attachments/export placeholders

## Tests

Add/update focused deterministic frontend tests for at least:

- no navigation item is active on initial load
- Chat becomes active after explicit Chat click
- Settings becomes active after explicit Settings click
- active state switches correctly
- selecting a saved chat requests `/api/chats/:id/messages`
- persisted user messages use plain-text rendering
- persisted assistant messages use existing Markdown rendering
- returned message order is preserved
- empty history renders without fake messages
- malformed history response is rejected safely
- history load failure produces safe UI behavior
- stale history response from a previously selected chat is ignored
- switching chats clears previous visible messages before the new history arrives
- newly sent messages append after loaded history
- existing inference wiring remains unchanged
- previous history is not added to model requests by client changes

Do not use LM Studio.

## Out of scope

Do not add:

- conversation history to model inference requests
- context-window trimming
- history summaries
- streaming
- timestamp display
- message editing
- message deletion
- pagination
- history search
- attachments
- export
- backend changes
- database changes
- new dependencies
- unrelated refactors

## Verification

Run:

    npm.cmd run build
    npm.cmd run build:client
    npm.cmd run typecheck:client
    npm.cmd run lint
    npm.cmd test

## Acceptance

- no sidebar navigation item is active immediately after full page load
- navigation becomes active only after explicit user interaction
- selecting a saved chat loads `/api/chats/:id/messages`
- persisted user messages render with existing plain-text behavior
- persisted assistant messages render with existing Markdown behavior
- message order is preserved
- stale async history responses cannot overwrite the current chat
- newly inferred messages append to the loaded conversation
- server/API/database behavior is unchanged
- previous history is still NOT sent to the model
- no new dependencies
- all tests pass
- no unrelated changes

## Tracking

Create:

- docs/executed_tasks/TASK-0048-load-persisted-chat-history-defer-initial-navigation-selection.md
- docs/executed_results/TASK-0048-load-persisted-chat-history-defer-initial-navigation-selection.md

Do not read historical task/result files.

## Final response

Return only:

    Task ID: TASK-0048
    Status: <PASS|FAIL|BLOCKED>
    Result: docs/executed_results/TASK-0048-load-persisted-chat-history-defer-initial-navigation-selection.md
    Summary: <one short sentence>
