# TASK-0065 — Rotate coherent DuckDuckGo browser profiles

Task ID: TASK-0065
Task slug: duckduckgo-coherent-browser-profile-rotation

## Goal

Improve DuckDuckGo reliability by replacing the single fixed browser header profile from TASK-0064 with a small pool of coherent browser profiles.

The current issue is:

- the same search text works manually in a normal browser
- the tool can still receive unusable or empty DuckDuckGo responses
- TASK-0064 currently uses one fixed desktop Chrome profile for every request

Use controlled per-tool-execution variation instead.

This task must remain narrow.

Do not redesign the DuckDuckGo parser, fallback classification, or model/tool loop.

## Read first

Run:

    powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\inspect-repo.ps1

Inspect only relevant current files for:

- `src/server/tools/duckduckgo-search-tool.ts`
- current browser-like header helper from TASK-0064
- primary/fallback DuckDuckGo request loop
- TASK-0063 response classification
- DuckDuckGo tests
- logger usage
- TESTING.md
- SECURITY.md
- CODINGSTANDARDS.md

Do not use recursive repository listing commands.

Do not read historical executed task/result files.

## 1. Replace the single fixed profile

Replace the current single fixed browser identity with a small predefined pool of coherent browser profiles.

Use approximately 5–8 profiles.

Preferred desktop-oriented examples:

    chrome-windows
    edge-windows
    firefox-windows
    chrome-macos
    safari-macos
    chrome-linux
    firefox-linux

Exact browser versions may use current reasonable static values.

Do not dynamically download or discover User-Agent strings.

## 2. Profiles must be coherent

Each profile must contain a browser-consistent set of headers.

Do not merely randomize `User-Agent` while keeping an obviously incompatible header set.

Examples:

### Chromium-based profile

May include:

    User-Agent
    Accept
    Accept-Language
    Accept-Encoding
    Referer
    Origin
    Connection
    Upgrade-Insecure-Requests
    Sec-Fetch-Dest
    Sec-Fetch-Mode
    Sec-Fetch-Site
    Sec-Fetch-User
    Cache-Control

### Firefox profile

Use Firefox-compatible browser navigation headers.

Do not add Chromium-only `sec-ch-ua` metadata unless the project already uses it and the values are coherent.

### Safari profile

Use Safari-compatible headers.

Do not attach browser-specific metadata that contradicts the User-Agent.

Keep the implementation intentionally simple.

## 3. Profile data structure

Represent browser profiles explicitly and type-safely.

Conceptually:

    type DuckDuckGoBrowserProfile = {
        id: string;
        headers: Record<string, string>;
    };

Do not use `any`.

Profile IDs must be stable and non-sensitive.

Examples:

    chrome-windows
    firefox-linux

## 4. Select one profile per tool execution

At the start of one `duckduckgo_search` execution:

    choose one browser profile

Then reuse that SAME profile for the complete tool execution.

Required:

    primary request
        uses profile X

    fallback request
        also uses profile X

Do not choose a second random profile for the fallback request.

This preserves one coherent client identity for the search operation.

## 5. Production variation

Production profile selection may use randomness.

A simple implementation such as:

    Math.floor(Math.random() * profiles.length)

is acceptable at the profile-selection boundary.

Do not scatter random calls throughout request construction.

There should be one clear selection point.

Conceptually:

    selectDuckDuckGoBrowserProfile()

## 6. Testability

Keep profile selection easy to test deterministically.

Prefer one of:

- a small injectable selector dependency
- an overridable/selectable helper
- another minimal existing project pattern

Do not introduce a framework or broad dependency-injection refactor.

Tests must not depend on actual randomness.

## 7. No profile change during fallback

Explicitly test this invariant:

    selected profile = firefox-linux

    primary:
        firefox-linux

    fallback:
        firefox-linux

Never:

    primary = firefox
    fallback = chrome

## 8. Keep existing endpoint behavior

Do not change:

- primary DuckDuckGo endpoint
- fallback endpoint
- request body
- query encoding
- SafeSearch mapping
- result limits
- AbortSignal
- response parser

unless an extremely small adjustment is required solely for coherent headers.

## 9. Preserve TASK-0063 classification

Keep exactly the current semantic classifications:

    VALID_RESULTS
    VALID_NO_RESULTS
    UNUSABLE_RESPONSE

Do not weaken structural validation.

Browser profile variation improves the HTTP request but does not replace response validation.

## 10. Preserve bounded fallback

Keep:

    primary
    → UNUSABLE_RESPONSE
    → one fallback
    → classify fallback

Maximum DuckDuckGo HTTP attempts per tool execution remains:

    2

Do not add extra retry loops.

## 11. Preserve recoverable failure

If primary and fallback are both unusable:

    SEARCH_RESPONSE_UNUSABLE

must still become the existing recoverable tool failure.

Do not return false-success empty results.

Do not make it a terminal Chat inference error.

## 12. No cookies or sessions

Do not introduce:

- cookies
- persisted browser sessions
- authentication
- local storage emulation
- CAPTCHA solving
- fingerprinting libraries
- proxy rotation
- IP rotation

This task only rotates a small static browser header profile.

## 13. Do not forward client headers

Never copy arbitrary headers from the incoming application HTTP request.

Profiles are server-owned static definitions.

No user-controlled header injection.

## 14. Logging

Add only a bounded profile identifier to existing DuckDuckGo diagnostics.

Example:

    browserProfile: "chrome-windows"

Do not log the complete request header object on every request.

Do not log:

- raw HTML
- cookies
- client secrets
- authentication information

Profile ID is sufficient for diagnosis.

For primary and fallback logs within one tool execution, the profile ID must match.

## 15. Tests — profile pool

Test that:

- several predefined profiles exist
- every profile has a stable non-empty ID
- every profile contains `User-Agent`
- required general navigation headers are present where appropriate
- profile IDs are unique

Do not over-test exact browser version strings unless necessary.

## 16. Tests — deterministic selector

Use a deterministic test selector.

Force, for example:

    firefox-linux

Assert the request contains that exact profile's headers.

Do not rely on statistical randomness tests.

## 17. Tests — primary and fallback reuse

Simulate:

    selected profile = chrome-windows
    primary response = UNUSABLE_RESPONSE
    fallback response = VALID_RESULTS

Assert:

- exactly two requests
- primary uses chrome-windows profile
- fallback uses chrome-windows profile
- no second profile selection occurs

## 18. Tests — different executions may use different profiles

Using an injected deterministic sequence, simulate:

    execution 1 → chrome-windows
    execution 2 → firefox-linux

Assert:

- first search uses Chrome profile
- second search uses Firefox profile
- each individual execution stays internally consistent

This verifies that variation is supported without making tests random.

## 19. Tests — recoverable failure unchanged

Simulate:

    selected profile = safari-macos
    primary unusable
    fallback unusable

Assert:

- same Safari profile used twice
- exactly two requests
- existing `SEARCH_RESPONSE_UNUSABLE`
- no raw HTML leak

## 20. Tests — valid no-results unchanged

Simulate a recognized valid no-results DuckDuckGo page.

Assert:

    results: []

and:

- no fallback
- selected profile used once
- no recoverable error

## 21. Regression coverage

Ensure existing tests remain green for:

- valid DuckDuckGo results
- genuine no-results
- structural unusable-response detection
- one fallback only
- recoverable tool failure
- unbounded model/tool rounds
- inference timeout
- cancellation
- Skills
- effective Skill tools
- provider chronology
- model-only tool execution
- streaming
- Chat history

## 22. Optional manual verification

After deterministic tests, optionally repeat the failing searches manually through the application.

Compare multiple separate tool executions.

Verify logs show different profile IDs over time, for example:

    chrome-windows
    firefox-linux
    edge-windows

Within one search execution:

    primary profile ID
    fallback profile ID

must always be identical.

Observe whether previously unreliable DuckDuckGo queries now return valid result pages more consistently.

Manual verification is optional and not required for PASS.

## Important invariants

Do not change:

- DuckDuckGo parser
- structural classification
- one-fallback maximum
- exact provider chronology
- model-only tool execution
- recoverable failure semantics
- Skill behavior
- inference timeout
- cancellation
- Chat history
- logging architecture

## Out of scope

Do not implement:

- proxy rotation
- IP rotation
- CAPTCHA handling
- cookies
- browser automation
- Playwright/Puppeteer for search
- additional search providers
- additional retries
- query rewriting
- parser redesign
- generic fingerprinting abstraction
- generic HTTP-client abstraction
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

- fixed single browser identity is replaced by a small coherent profile pool
- one profile is selected per DuckDuckGo tool execution
- production selection supports variation
- primary and fallback always reuse the same profile
- tests are deterministic
- profiles are internally coherent
- no cookies/sessions/proxies are introduced
- browser profile ID is logged safely
- TASK-0063 response classification remains intact
- exactly one fallback remains
- recoverable failure behavior remains intact
- all tests pass
- no unrelated changes

## Tracking

Create:

    docs/executed_tasks/TASK-0065-duckduckgo-coherent-browser-profile-rotation.md

and:

    docs/executed_results/TASK-0065-duckduckgo-coherent-browser-profile-rotation.md

Do not read historical executed task/result files.

## Final response

Return only:

    Task ID: TASK-0065
    Status: <PASS|FAIL|BLOCKED>
    Result: docs/executed_results/TASK-0065-duckduckgo-coherent-browser-profile-rotation.md
    Summary: <one short sentence>
