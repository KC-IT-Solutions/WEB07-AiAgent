# TASK-0073 - Filter DuckDuckGo ads and redirects with diagnostics

Task ID: TASK-0073
Status: PASS

Summary:

Extended the existing Cheerio parser with bounded redirect normalization, parsed ad/internal filtering, final-target deduplication, and private per-response filtering counters.

Repository analysis:

- Preserved `extractDuckDuckGoResults(...)`, `classifySearchResponse(...)`, structural result/no-result recognition, one fallback, the pacing scheduler, browser profiles, POST behavior, and the public `{ query, results }` contract.
- The supplied `searchDuckDuckGo(3).js` reference was not present in the workspace; no historical executed task/result files were read.
- The repository had extensive pre-existing modified and untracked files. Only the active implementation, test, and TASK-0073 tracking files were changed for this task.

Files changed:

- `src/server/tools/duckduckgo-search-tool.ts`
- `tests/unit/duckduckgo-search-tool.test.ts`
- `docs/executed_tasks/TASK-0073-duckduckgo-filter-ads-redirects.md`
- `docs/executed_results/TASK-0073-duckduckgo-filter-ads-redirects.md`

Tests and verification:

- `npm.cmd run test:compile` - PASS.
- `node --test .test-dist/tests/unit/duckduckgo-search-tool.test.js` - PASS, 22 tests.
- `npm.cmd run build` - PASS.
- `npm.cmd run build:client` - PASS.
- `npm.cmd run typecheck:client` - PASS.
- `npm.cmd run lint` - PASS.
- `npm.cmd test` - PASS, 451 tests across 43 suites.
- `node --test .test-dist/tests/unit/duckduckgo-search-tool.test.js` after the full test compilation - PASS, 22 tests.
- `npx.cmd prettier --check src/server/tools/duckduckgo-search-tool.ts tests/unit/duckduckgo-search-tool.test.ts docs/executed_tasks/TASK-0073-duckduckgo-filter-ads-redirects.md` - PASS.

Production code:

- Added parsed hostname/path filtering for DuckDuckGo `y.js`, Bing `/aclick` and `/alink`, and base/subdomains of `doubleclick.net` and `googleadservices.com` while retaining existing raw ad markers and `.result--ad` filtering.
- Added safe extraction of only `uddg`, `u`, `url`, and `target` redirect parameters when their decoded value is an absolute HTTP(S) URL.
- Added iterative redirect normalization with at most three unwraps. A candidate requiring a fourth unwrap is rejected and increments `filteredRedirectCount` rather than returning a residual wrapper.
- Rejected malformed encodings and unsafe protocols without throwing.
- Kept final URL canonicalization through `URL.toString()` and deduplicated only after final normalization, preserving first title and order.
- Added typed `filteredAdCount`, `filteredRedirectCount`, `filteredInternalCount`, and `duplicateResultCount` diagnostics to each `duckduckgo_search_response` event without logging link data.

Architecture:

- The current Cheerio extraction and classification architecture remains authoritative.
- All-filtered recognizable result markup remains `UNUSABLE_RESPONSE`; it does not become arbitrary success.
- Diagnostics are created independently for each primary or fallback response and are not exposed in tool output.

Dependencies:

- No dependencies added or changed.

Deviations:

- None from the requested behavior. The optional behavioral reference file was unavailable in the workspace.

Risks / findings:

- Redirect recognition intentionally treats the named `u`, `url`, and `target` parameters as wrappers only when present; invalid values reject that candidate predictably.
- Counters cover candidates inspected before the configured accepted-result limit is reached, preserving existing bounded extraction behavior.

Diff summary:

- Added bounded typed URL normalization and filtering diagnostics in the DuckDuckGo tool.
- Expanded deterministic unit coverage for ads, internal links, redirects, malformed and unsafe targets, depth bounds, duplicates, privacy, classification, fallback isolation, pacing, and browser-profile regressions.
