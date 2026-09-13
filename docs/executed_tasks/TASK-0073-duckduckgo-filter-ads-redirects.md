# TASK-0073 - Filter DuckDuckGo ads and redirects with diagnostics

Task ID: TASK-0073
Task slug: duckduckgo-filter-ads-redirects

## Instruction

Complete the existing Cheerio-based DuckDuckGo result normalization without replacing `extractDuckDuckGoResults(...)` or `classifySearchResponse(...)`. Preserve result/no-result structural classification, one bounded fallback, pacing and cooldown scheduling, browser profiles, request behavior, output contract, errors, and abort behavior.

Preserve filtering for `.result--ad`, raw `ad_provider` / `ad_domain` markers, DuckDuckGo `y.js`, internal DuckDuckGo links without usable `uddg`, non-HTTP(S) targets, and duplicate normalized URLs. Extend post-normalization ad/tracking filtering to Bing `/aclick` and `/alink`, plus the base domains and subdomains of `doubleclick.net` and `googleadservices.com`, using parsed hostname/path checks where practical.

Continue unwrapping usable HTTP(S) DuckDuckGo `uddg` targets. Add safe support for only the generic redirect parameters `u`, `url`, and `target`; reject unsupported protocols, malformed links, and unusable wrappers without throwing. Support nested wrappers with a hard maximum depth of 3 and document/test the behavior at the depth boundary. Validate the final parsed URL as HTTP(S), non-internal, and non-ad. Deduplicate final normalized URLs while preserving the first accepted title and result order.

Internally track typed, bounded counters `filteredAdCount`, `filteredRedirectCount`, `filteredInternalCount`, and `duplicateResultCount`. Count each rejected candidate once with precedence ad, internal, invalid/unusable redirect, duplicate. Successful redirect unwrapping is not filtering. Keep the public `{ query, results }` output unchanged.

Add all four counters to each existing `duckduckgo_search_response` event without removing existing fields. Diagnostics must be per HTTP response/attempt and must contain only numeric counts, never URLs, hrefs, redirect targets, query tracking data, HTML, or headers.

Add deterministic unit coverage for organic results, `uddg`, `.result--ad`, both raw ad markers, `y.js`, both Bing ad paths, base/subdomains for DoubleClick and Google Ad Services, all three generic redirect parameters, unsafe target protocols, malformed percent encoding, nested redirects and bounded depth, internal DuckDuckGo URLs, post-normalization duplicate handling, mixed-page diagnostics, structural classification when all candidates are filtered, and primary/fallback diagnostic independence. Do not change the scheduler or browser profile behavior.

Use the supplied `searchDuckDuckGo(3).js` only as behavioral reference. Add no dependencies and make no unrelated changes.

Run:

```text
npm.cmd run build
npm.cmd run build:client
npm.cmd run typecheck:client
npm.cmd run lint
npm.cmd test
```

Also run the focused DuckDuckGo test file separately after compilation.

Create `docs/executed_results/TASK-0073-duckduckgo-filter-ads-redirects.md`, re-read it, and return only the required task ID, terminal status, result path, and one-sentence summary.
