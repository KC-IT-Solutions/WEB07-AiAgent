# Testing Rules

## General

- Test behavior, not implementation details.
- Add or update tests when behavior changes.
- Every bug fix should include a regression test when practical.
- Cover important success and failure paths.
- Prefer deterministic tests.
- Tests must not depend on execution order.
- Do not remove or weaken valid tests to make a change pass.

## Test Platform

Playwright is the primary platform for integration and end-to-end testing.

Use Playwright for:
- browser behavior
- user workflows
- HTTP/API integration
- authentication flows
- frontend/backend integration
- critical application flows

Use unit tests for isolated business logic when a browser or running server is not required.

Prefer the smallest test level that reliably verifies the behavior.

## Playwright Test Structure

Playwright tests must be:
- independent
- deterministic
- runnable individually
- safe to run in parallel where practical

A test must not depend on another test having run first.

Each test should create, obtain, or isolate the state it requires.

Use Playwright fixtures or shared setup for reusable test infrastructure.

## Locators

Prefer user-facing locators in this order when applicable:

1. `getByRole()`
2. `getByLabel()`
3. `getByText()`
4. `getByTestId()` when no stable user-facing locator exists

Avoid:
- brittle CSS selectors
- XPath selectors
- selectors based on DOM nesting
- selectors based on visual CSS classes

Use `data-testid` only when a stable user-facing locator is not appropriate.

## Assertions and Waiting

Use Playwright's auto-waiting and web-first assertions.

Prefer assertions such as:

```ts
await expect(locator).toBeVisible();
```

Do not use arbitrary sleeps such as:

```ts
await page.waitForTimeout(2000);
```

to solve synchronization problems.

Wait for observable application state instead.

## Test Scope

Use:
- unit tests for isolated logic
- Playwright API/integration tests for HTTP and service boundaries when appropriate
- Playwright browser tests for browser behavior and user workflows
- end-to-end tests for critical user or system flows

Do not launch a browser solely to verify behavior that can be tested reliably through an API or smaller test.

Do not replace useful integration coverage with excessive mocking.

## Assertions

Assert externally observable outcomes.

Prefer:

```text
Given an existing user
When registration is attempted with the same email
Then registration fails with a conflict result
```

Avoid tests that only verify internal call counts unless those calls are themselves part of required behavior.

## Mocks

- Mock external systems when needed.
- Avoid mocking every internal module.
- Do not make tests tightly coupled to implementation structure.
- Prefer realistic test data over large amounts of mock plumbing.

## Test Data

Tests must control their own test data.

Do not depend on:
- execution order
- manually prepared database state
- stale state from previous tests
- production data
- another test creating required data

Test data should be created explicitly and cleaned up or isolated appropriately.

## Authentication

Do not repeat expensive login flows in every test when reusable authenticated state is appropriate.

Use Playwright fixtures or setup projects for reusable authenticated state.

Tests that verify login or authentication behavior must exercise the real flow being tested.

## Reliability

Tests should:
- produce the same result across runs
- clean up or isolate created state
- avoid arbitrary sleeps
- avoid external network access unless explicitly testing an integration
- avoid depending on local machine configuration

Retries must not be used to hide flaky tests.

A test that only succeeds after retry should be treated as potentially flaky and investigated.

## Browser Coverage

Use Chromium as the default browser unless project requirements specify otherwise.

Run Firefox and/or WebKit when cross-browser behavior is relevant or for selected critical flows.

Do not multiply every test across all browsers without a concrete need.

## Failure Diagnostics

Configure Playwright to retain useful failure diagnostics where practical, such as:
- traces
- screenshots
- videos when useful

Prefer retaining diagnostics for failed tests rather than every successful run.

## Type Checking

Playwright execution does not replace TypeScript type checking.

Run the project type checker separately.

## Before Completion

Run all relevant:
- unit tests
- Playwright tests
- integration tests not covered by Playwright
- type checks
- lint checks
- formatting checks where configured

Verify that:
- relevant Playwright tests pass
- tests do not depend on execution order
- no new flaky behavior was introduced

Fix failures introduced by the change.

If a required verification step cannot be run, report it explicitly.
