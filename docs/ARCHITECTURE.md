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

## Agent Run Execution

Agent runs are persistent records with persistent operational events, but execution is process-local.
The server normalizes `running` and `paused` runs left by a restart to a sanitized terminal error on
startup; it does not resume in-flight provider requests. Chat and Agent inference share the same
process-local model-connection queue, so requests using one connection remain serialized.

Agent execution resolves inline, sandboxed Project-file, or disabled Agent instructions and resolves
inline or sandboxed Project-file assignments at run time,
activates selected Skills, and runs structured model tool calls through an unbounded multi-round loop
on the configured default model. Explicit and Skill-required external tools reuse the global ToolRegistry, while Project
filesystem tools are contextual intrinsic Agent capabilities backed only by ProjectFilesystemService;
they are not registered as ordinary Chat or Tools-UI capabilities. Configured final-result output is
written through the same Project boundary before run completion. A successful run may then create and
launch its configured next Agent through the same run lifecycle, with relational chain provenance. Each
target uses its own resolved current assignment plus a safe handoff containing only the stable original task,
previous Agent identity, and final result.

An Agent-tool relationship independently records model access and may reference one Project-relative
JSON pre-run input file. Relationships without an explicit model-access value retain legacy enabled
behavior. Pre-run-only relationships do not expose their tools to the provider. Before
the first provider request, Agent execution reads these files through the Project filesystem boundary,
validates their ordered argument-object arrays, and invokes configured tools sequentially by tool name
and array order. These system-initiated calls have no provider tool-call ID or synthetic tool messages;
their sanitized call/result events are recorded separately from model-requested tool events, and only
their arguments and successful results are prepended to the existing initial user content. Controlled
pre-run failures use the existing Agent run error record with sanitized phase diagnostics.

Agent Runner is an Agent-only registered model tool. Its provider schema accepts no target identity;
the calling Agent's relationship JSON owns the configured target. Runtime resolution rechecks user and
Project ownership, starts the target through the normal Agent run lifecycle, and waits outside the
model-connection inference queue. Different Agents may therefore remain active concurrently while each
connection's inference requests stay serialized. Process-local Agent ancestry prevents direct and
indirect runner cycles, and the database continues to enforce one active run per individual Agent.

Agent runs persist a separate, typed execution transcript in event-ID order alongside operational
run events. The transcript stores only bounded, sanitized user, provider-reasoning, assistant,
structured tool-call/result, and final-result data. Explicit provider reasoning is display-only and
is never added to inference context or interpreted as tool authority; only provider `tool_calls`
enter the tool loop. Operational Run log and historical Error log APIs remain separate from the
owned Project/Agent/run-scoped Execution API.

Saved Model Connections own the authoritative model-visibility policy used by Chat and Agent model
selection. Provider discovery remains the full internal set, while application-facing model lists
intersect discovery with an optional explicit allowlist. Hiding a model does not rewrite Chat
history or persisted Agent configuration, but new Chat inference and Agent runs using that model
fail before provider inference without fallback. Future Agent self-directed model selection must
use this same effective visible-model set.

Model descriptions are Admin-authored advisory metadata owned by the saved Model Connection and
keyed by exact provider model ID. Effective application model DTOs resolve this metadata centrally.
If future Agent self-directed model selection is enabled, it may receive connection ID, model ID,
and description for each allowed model, but visibility policy and exact connection/model identities
remain authoritative; an Agent cannot invent a connection or model.

## Refactoring

### Responsibility Growth

Do not allow an application service or module to become the owner of unrelated workflows merely because it already coordinates the feature.

When a service accumulates several independently testable responsibilities, prefer extracting cohesive collaborators with narrow interfaces.

Typical extraction candidates include:

* tool/capability resolution
* external execution loops
* result persistence
* chaining/handoff
* lifecycle/checkpoint coordination

Do not split code based on file length alone. Split when responsibilities have distinct rules, dependencies, or tests.

When adding substantial behavior to an already broad service, explicitly assess whether the new behavior belongs in a focused collaborator before extending the existing service.

Architecture refactoring should be separate from unrelated feature work whenever practical.

Do not perform broad architecture cleanup while implementing a small feature unless the cleanup is required for correctness.
