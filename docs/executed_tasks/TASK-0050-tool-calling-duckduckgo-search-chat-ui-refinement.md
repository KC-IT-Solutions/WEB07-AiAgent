# TASK-0050 - Tool calling with DuckDuckGo search and chat UI refinement

Task ID: TASK-0050
Task slug: tool-calling-duckduckgo-search-chat-ui-refinement

## Instruction

Introduce the project's first model tool call, `duckduckgo_search`. During normal chat inference the model may request the server-side tool, the server executes it, returns structured results to the model, and the model produces the final assistant response. Keep the existing browser response contract `{ "message": "..." }` and persist only user-visible user/assistant messages, never internal tool protocol messages or raw search results.

Implement a small explicit server-side tool abstraction with separate definitions, registry/execution orchestration, and concrete external integration. Tool arguments are untrusted and require runtime validation without `any`. The OpenAI-compatible provider accepts tool definitions and tool protocol messages but does not execute tools. The inference service loads enabled tools for fixed server-side UserId 1 and runs a bounded loop of at most five tool execution rounds. Disabled tools are neither exposed nor executed; unsupported names and invalid arguments fail safely.

Implement DuckDuckGo HTML search against `https://duckduckgo.com/html/` using native networking, a project-owned User-Agent, AbortSignal/timeout support, and deterministic injectable transport. Accept a required non-empty `query` and optional simple pagination only if warranted. Apply persisted page size (1..10) and safe search (`strict`, `moderate`, `off`), extract only structured titles and HTTP/HTTPS URLs, normalize redirect URLs, filter DuckDuckGo/internal/ad/tracking links, deduplicate, and bound results. Do not expose raw HTML or arbitrary URL fetching.

Persist one user-owned settings record per registered tool in SQLite using a migration and repository/service layering. Keep `user_id` and `tool_name` relational with a unique constraint and flexible validated JSON `data`. DuckDuckGo defaults are disabled for Chat, page size 5, and moderate safe search. Add user-scoped server routes equivalent to `GET /api/tools`, `GET /api/tools/:toolName/settings`, and `PUT /api/tools/:toolName/settings`; never accept UserId from the client and reject unregistered tool names.

Add a Settings Tools/Tool Calls section listing registered tools and effective Chat enablement. Clicking DuckDuckGo Search opens the existing reusable accessible modal pattern and edits Enabled for Chat, Results per search, and Safe Search. Save validates and persists, Cancel does not persist, and escape/backdrop/focus behavior follows existing conventions.

Refine Chat presentation so normal assistant responses use a centered maximum-width content container whose background blends into the surrounding chat while Markdown text remains left-aligned and rendering is unchanged. Render user plain text in a compact right-aligned rounded light-blue bubble with dark text and a sensible maximum width. Preserve the isolated animated thinking indicator except for any minimal alignment adjustment.

Add deterministic tests with no live DuckDuckGo or LM Studio access. Cover DuckDuckGo validation, safe-search/page-size boundaries, extraction, redirect normalization, filtering, deduplication, result bounds, and controlled network/timeout errors; settings defaults, ownership, persistence updates, validation, uniqueness, unknown tools, and modal load/save/cancel behavior; inference tool exposure, ordinary responses, tool call execution and follow-up, protocol payload, final persistence boundary, invalid/unsupported calls, round limits, prior history, and exactly-once current user messages; and focused assistant/user/thinking presentation assertions.

Follow the existing architecture, database, security, testing, and coding standards. Do not add an agent framework, arbitrary fetching, browser automation, SDKs, multiple providers, tool-result persistence, streaming, authentication changes, unrelated redesign, or new dependencies unless absolutely required. Use the supplied `searchDuckDuckGo(1).js` only as a behavioral reference if present and do not copy it blindly.

Create the matching executed result report. Verify with:

```text
npm.cmd run build
npm.cmd run build:client
npm.cmd run typecheck:client
npm.cmd run lint
npm.cmd test
```

The final response must contain only the Task ID, PASS/FAIL/BLOCKED status, result path, and one short summary sentence.
