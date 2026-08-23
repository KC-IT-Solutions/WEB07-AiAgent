Task ID: TASK-0018
Task slug: add-local-chat-interaction

## Goal

Add the first minimal interactive Chat behavior in the frontend.
The user must be able to type a message, press Send, and see that message rendered locally in the Chat view.
Do not connect to backend or LM Studio yet.

## Requirements

- a message area
- a text input
- a Send button
- user enters text, clicking Send renders the message in the message area
- submitting an empty or whitespace-only message does nothing
- input is cleared after a valid message is sent
- pressing Enter should submit the message
- rendered user messages must use text-safe DOM APIs such as textContent
- keep everything local in the browser

## Out of scope

- backend/API calls, LM Studio/OpenAI integration, AI responses
- saved chats, chat history persistence, model selection
- state libraries, routing, dependencies, frameworks, markdown rendering
- modifying backend files

## Acceptance

- input is visible, Send button is visible
- valid text creates a visible user message
- empty/whitespace messages are ignored
- input clears after send, Enter submits
- no backend request is made, no dependencies added
- build passes, client build passes, lint passes, ChatView test passes
