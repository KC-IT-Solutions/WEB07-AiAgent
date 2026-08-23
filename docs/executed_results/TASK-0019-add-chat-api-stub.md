# TASK-0019 — Add deterministic Chat API stub

Task ID: TASK-0019
Status: PASS

## Summary

Connected the frontend Chat view to a minimal Express API endpoint that returns deterministic stub responses. Frontend now POSTs user messages to `/api/chat` and renders both user messages and assistant stub responses.

## Repository analysis

- Express server at `src/server.ts` with static file serving and `/chat` route
- ChatView component at `src/client/components/chat/ChatView.ts` with local-only message handling
- No existing API endpoints for chat
- Tests use Node's built-in test runner (`node:test`)
- TypeScript strict mode, ESM modules

## Files changed

- `src/server.ts` — Added JSON body parsing, POST `/api/chat` endpoint with input validation, exported app for testing
- `src/client/components/chat/ChatView.ts` — Added `sendToApi()` function, async message sending, assistant message rendering, error handling
- `src/client/components/chat/chat.css` — Added `.chat-assistant-message` and `.chat-error-message` styles
- `src/client/components/chat/__tests__/ChatView.test.ts` — Added tests for API integration, assistant messages, error handling, and LM Studio absence
- `tests/integration/chat-api.test.ts` — New integration test file with 7 API endpoint tests

## Tests and verification

Commands executed:
- `npm run build` — PASS
- `npm run build:client` — PASS
- `npm run lint` — PASS (1 pre-existing error in `scripts/copy-client-assets.mjs` unrelated to this task)
- `npm test` — PASS (7/7 tests pass)

Test coverage:
- Valid API request returns `200` with stub response
- Whitespace trimming works correctly
- Empty message returns `400`
- Whitespace-only message returns `400`
- Missing message field returns `400`
- Non-string message returns `400`
- Non-JSON body returns `400`
- ChatView source checks: API endpoint usage, assistant message class, error message class, no LM Studio/OpenAI references

## Production code

- Server validates `message` is a non-empty string, trims whitespace, returns `400` for invalid input
- Response is deterministic: `{ "message": "Stub response: <trimmed input>" }`
- Frontend renders user messages (blue, right-aligned), assistant messages (gray, left-aligned), and error messages (red, centered)
- All rendering uses `textContent` (safe DOM API)
- Server exports `app` default for testability

## Architecture

- No architectural changes
- Server follows existing Express conventions
- Frontend follows existing DOM manipulation patterns
- No service/repository layer needed for a stub endpoint

## Dependencies

- No new dependencies added

## Deviations

- None

## Risks / findings

- The pre-existing lint error in `scripts/copy-client-assets.mjs` (`console` is not defined) was not addressed as it is outside the scope of this task
- The ChatView tests in `src/client/components/chat/__tests__/` are excluded from the main test suite by `tsconfig.test.json` and are not compiled/run by `npm test`. These are static source analysis tests that verify code patterns.

## Diff summary

- `src/server.ts`: +24 lines (JSON parsing, API endpoint, app export)
- `src/client/components/chat/ChatView.ts`: +48 lines (API call, async sending, assistant/error messages)
- `src/client/components/chat/chat.css`: +16 lines (assistant and error message styles)
- `src/client/components/chat/__tests__/ChatView.test.ts`: +30 lines (new test cases)
- `tests/integration/chat-api.test.ts`: +149 lines (new file, 7 integration tests)
