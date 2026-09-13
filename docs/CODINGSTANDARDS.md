# Coding Standards

Follow these rules for all code changes in this project.

## General

* Prefer simple, explicit code over clever or generic abstractions.
* Make the smallest coherent change that solves the task.
* Follow existing project conventions before introducing new patterns.
* Search for existing implementations before creating new helpers, services, components, utilities, repositories, or abstractions.
* Do not refactor unrelated code while implementing a feature.
* Do not add speculative abstractions or functionality for possible future needs.
* Remove dead code instead of commenting it out.
* Comments should explain **why**, not describe obvious code.
* Keep functions focused on one responsibility.
* Keep services and modules cohesive as well as individual functions. If a service owns several independently testable workflows with different dependencies or rules, prefer extracting a focused collaborator rather than continuing to grow the service.
* Prefer `const`; use `let` only when reassignment is required.
* Avoid magic numbers and repeated magic strings. Use named constants where appropriate.

## TypeScript

* Use TypeScript for new backend code unless there is a specific reason not to.
* Keep TypeScript strict.
* Avoid `any`. Use proper types or `unknown` with validation.
* Do not use type assertions to bypass validation of external data.
* Prefer explicit domain types over loosely shaped objects.
* Use `PascalCase` for types, interfaces, and classes.
* Use `camelCase` for variables and functions.
* Use `UPPER_SNAKE_CASE` for global constants.

## Architecture

Keep responsibilities separated:

```text
HTTP / Controller
       ↓
Service / Use Case
       ↓
Repository
       ↓
Database
```

* Routes/controllers handle HTTP concerns only.
* Business logic belongs in services/use cases.
* Database access belongs in repositories or the designated persistence layer.
* Controllers must not access the database directly.
* Services should not depend on HTTP request/response objects.
* Do not introduce a new architectural pattern without clear justification.
* Keep feature-specific code close to the feature that owns it.
* Shared code belongs in shared modules only when it is genuinely reused.

## Validation

Treat all external data as untrusted.

Validate:

* request bodies
* query parameters
* route parameters
* headers
* cookies
* environment variables
* webhook payloads
* external API responses when necessary

Do not treat TypeScript types as runtime validation.

## Errors

* Do not silently catch errors.
* Catch errors only when you can handle, transform, enrich, or log them meaningfully.
* Do not use empty `catch` blocks.
* Do not catch an error only to immediately rethrow it unchanged.
* Prefer typed/domain-specific application errors.
* Keep HTTP status-code mapping in the HTTP layer or central error handler.
* Never expose internal stack traces or sensitive implementation details to clients.

## Async Code

* Prefer `async` / `await`.
* Do not mix promise chains and `async` / `await` without reason.
* Await promises unless intentional background execution is explicitly required and safely handled.
* Handle rejected promises correctly.

## Dependencies

* Do not add a new npm dependency without justification.
* Prefer existing dependencies or built-in Node.js functionality when reasonable.
* Do not introduce a package for functionality that can be implemented clearly with a small amount of code.

## Imports

* Prefer clear, direct imports.
* Avoid unnecessarily deep relative import paths.
* Avoid large barrel files that hide dependencies or create circular imports.
* Do not create circular dependencies.

## Backend / API

* Keep route handlers thin.
* Validate input before passing it into business logic.
* Return consistent response structures.
* Use appropriate HTTP status codes.
* Keep authentication and authorization checks explicit.
* Never trust client-provided authorization information.
* Never log passwords, tokens, API keys, session secrets, authorization headers, or other sensitive data.

## Logging

* Use the project logger instead of `console.log` in production code.
* Prefer structured logs.
* Include useful context such as request IDs and entity IDs where appropriate.
* Do not log sensitive information.
* Avoid excessive logging.

## HTML

* Use semantic HTML.
* Prefer native elements such as `button`, `nav`, `main`, `section`, `form`, and `label` over generic `div` elements when appropriate.
* Maintain accessibility.
* Inputs should have associated labels.
* Interactive controls must be keyboard accessible.
* Do not use clickable `div` elements when a semantic interactive element exists.

## CSS

* Avoid inline styles unless specifically required.
* Prefer reusable classes.
* Keep selectors shallow and predictable.
* Avoid selectors tightly coupled to DOM nesting.
* Keep component-specific styles together.
* Reuse existing design patterns before creating new ones.
* Do not introduce arbitrary one-off styling conventions.

## Browser JavaScript

* Avoid global mutable state.
* Keep code modular.
* Prefer `data-*` attributes for JavaScript behavior hooks instead of relying on visual CSS classes.
* Do not mix unrelated UI responsibilities in the same module.
* Validate data received from the server when necessary.

## Tests

* Add or update tests when behavior changes.
* Test externally observable behavior rather than implementation details.
* Cover important success paths and failure paths.
* Do not remove or weaken tests merely to make a change pass.
* Fix the implementation when a valid test fails.

## Core Principle

Prefer the simplest implementation consistent with the existing architecture and project conventions.
