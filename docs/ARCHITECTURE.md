# Architecture Rules

This document defines structural rules, not business functionality.

## Dependency Direction

```text
HTTP / Controllers
        ↓
Application / Services / Use Cases
        ↓
Repositories
        ↓
Infrastructure / Database
```

Dependencies should flow downward.

Lower layers must not depend on higher layers.

## HTTP Layer

Responsibilities:

* receive requests
* extract request data
* validate input
* access authentication context
* call application logic
* map results and errors to HTTP responses

Must not:

* contain significant business logic
* access the database directly
* contain persistence-specific logic

## Application Layer

Responsibilities:

* implement business workflows
* coordinate repositories and services
* enforce application rules

Must not:

* depend on HTTP request or response objects
* contain database-driver-specific code
* depend on presentation concerns

## Repository Layer

Responsibilities:

* provide persistence operations
* hide database-specific implementation details from application logic

Repositories may depend on infrastructure.

Controllers must not call repositories directly unless the project explicitly defines otherwise.

## Infrastructure

Contains technical integrations such as:

* database
* logging
* filesystem
* external APIs
* queues
* configuration

Infrastructure must not contain application-specific business rules.

## Feature Boundaries

* Keep feature-specific code inside the owning feature.
* Do not access another feature's internal files directly.
* Expose a small public interface when cross-feature interaction is required.
* Shared modules must contain genuinely reusable code.
* Do not move code to shared modules only because it might be reused later.

## New Architecture

Do not introduce:

* new architectural layers
* new dependency patterns
* new global abstractions
* new cross-feature coupling

without a concrete current need.

Prefer consistency with the existing system over introducing a theoretically better local pattern.

## Refactoring

Architecture refactoring should be separate from unrelated feature work whenever practical.

Do not perform broad architecture cleanup while implementing a small feature unless the cleanup is required for correctness.
