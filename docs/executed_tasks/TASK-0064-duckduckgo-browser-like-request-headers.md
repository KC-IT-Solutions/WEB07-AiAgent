# TASK-0064 - Apply browser-like DuckDuckGo request headers

Task ID: TASK-0064
Task slug: duckduckgo-browser-like-request-headers

## Instruction

Add a deterministic browser-like request-header profile to the DuckDuckGo search tool, using `searchDuckDuckGo(2).js` only as the behavioral reference for useful headers. Use one fixed modern desktop `User-Agent` and include browser navigation metadata such as `Accept`, `Accept-Language`, `Accept-Encoding`, `Connection`, `Referer`, `Origin`, `Upgrade-Insecure-Requests`, `Sec-Fetch-Dest`, `Sec-Fetch-Mode`, `Sec-Fetch-Site`, `Sec-Fetch-User`, and `Cache-Control`.

Apply the same profile to both the primary DuckDuckGo request and TASK-0063's single fallback request while preserving the existing inference-scoped `AbortSignal`, query behavior, SafeSearch behavior, result count, URL validation, timeout/cancellation, logging, response parser, structural classifications (`VALID_RESULTS`, `VALID_NO_RESULTS`, `UNUSABLE_RESPONSE`), exactly-one-fallback semantics, recoverable `SEARCH_RESPONSE_UNUSABLE` behavior, model/tool chronology, Skill behavior, streaming, and Chat history format.

Do not add random User-Agent rotation, configurability, cookies, credentials, session values, forwarded application request headers, raw provider response logging, retries, another provider, parser redesign, generic HTTP abstractions, dependencies, or unrelated refactors.

Add deterministic mocked-network tests proving that primary and fallback requests receive the expected browser-like headers without relying on property order, repeated searches use the same User-Agent, a valid primary response returns results without fallback, and two unusable responses still make exactly two requests and return the existing bounded recoverable failure without raw HTML exposure.

Run:

```text
npm.cmd run build
npm.cmd run build:client
npm.cmd run typecheck:client
npm.cmd run lint
npm.cmd test
```

Create the corresponding result report at `docs/executed_results/TASK-0064-duckduckgo-browser-like-request-headers.md`. Do not read historical executed task or result files. Return only the requested four-line final response.
