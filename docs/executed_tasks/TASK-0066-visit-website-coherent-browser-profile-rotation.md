# TASK-0066 - Add coherent browser-profile rotation to visit_website

Task ID: TASK-0066
Task slug: visit-website-coherent-browser-profile-rotation

## Instruction

Apply the successful `duckduckgo_search` browser-profile strategy to `visit_website` with a small predefined pool of approximately 5-8 stable coherent desktop browser profiles. Select one profile once per tool execution, use coherent server-controlled browser navigation headers for the complete fetch, allow production randomness at a single selector boundary, and provide a minimal deterministic selector seam for tests.

Use the current DuckDuckGo implementation as the architectural pattern and the supplied `visitWebsite(2).js` only as a behavioral header reference. Do not copy unrelated parsing or extraction code and do not introduce a broad shared HTTP abstraction.

Profiles must have unique stable IDs, non-empty User-Agent values, coherent browser-family metadata, normal navigation headers, and no unnecessary client hints. Construct any target-derived headers only from the already validated URL. Prefer correct User-Agent, Accept, Accept-Language, navigation headers, and a safe Referer. Omit Origin if standards or compatibility make that preferable, and document the decision.

Preserve existing HTTP/HTTPS and public URL validation, localhost/loopback/private/link-local/DNS/redirect protections, bounded response behavior, inference-scoped AbortSignal behavior, recoverable failures, parsing and extraction behavior, output contract, model-only execution, provider chronology, Skills, timeout and cancellation, Chat JSONL, and streaming. Do not add cookies, sessions, authentication, browser storage, CAPTCHA handling, proxies, IP rotation, browser automation, retries, dependencies, client-header forwarding, parser redesign, DuckDuckGo changes, Chat UI, autoscroll, or unrelated refactors.

Add bounded safe `browserProfile` diagnostic metadata for relevant `visit_website` logging without logging headers, cookies, secrets, authentication data, or raw HTML.

Add deterministic tests covering the profile pool, unique IDs, required navigation headers, coherent browser-specific headers, a forced known profile, different profiles across executions, safe target-derived headers without path/query/newline injection, representative existing blocked targets, AbortSignal cancellation, and existing extraction/failure behavior. Avoid real randomness and exact browser-version assertions.

Run:

```text
npm.cmd run build
npm.cmd run build:client
npm.cmd run typecheck:client
npm.cmd run lint
npm.cmd test
```

Create and maintain:

```text
docs/executed_tasks/TASK-0066-visit-website-coherent-browser-profile-rotation.md
docs/executed_results/TASK-0066-visit-website-coherent-browser-profile-rotation.md
```

Do not read historical executed task/result files. Optional live verification is not required for PASS.

Acceptance requires coherent profile rotation, one selection per execution, deterministic tests, safe target-derived headers, unchanged security/abort/extraction/output behavior, safe profile diagnostics, all required verification passing, and no unrelated changes.
