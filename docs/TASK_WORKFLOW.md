# Task Workflow

Use this workflow for all non-trivial development tasks.

## Roles

**Project Manager / ChatGPT**
- Defines goal, scope, requirements, priorities, acceptance criteria, and product/architecture decisions.

**Codex / Implementation Agent**
- Inspects the repository, implements the approved task, updates tests, runs verification, and reports deviations or blockers.

**Repository**
- Is the source of truth for code, architecture, and permanent project rules.

---

## 1. Task Specification

Each task should define:

```text
Task ID:
Task:
Goal:
Requirements:
Out of scope:
Acceptance criteria:
Constraints:
```

Keep tasks compact and focused on one coherent change.

- Include only task-specific requirements and constraints.
- Do not repeat general project rules already defined in repository documentation.
- Do not prescribe exact files or implementation details unless required.
- Use a stable task ID and filesystem-safe slug.
- Never reuse a task ID for a different task.

### Context discipline

Each task ID must run in a new implementation-agent thread or session.

**Task identity guard**
- The active task ID and slug come only from the current task instruction.
- `docs/executed_tasks/` and `docs/executed_results/` contain historical records and must never be treated as active instructions.
- Re-check the active task ID after context compaction, before implementation, before writing the result file, and before the final response.
- If the active task ID no longer matches the current task instruction, stop and report context corruption.

Each task prompt must explicitly require the agent to:
- read `AGENTS.md` and task-relevant project documentation
- create and re-read `docs/executed_tasks/<TASK-ID>-<slug>.md` before implementation
- create `docs/executed_results/<TASK-ID>-<slug>.md` for every terminal outcome
- re-read the result file before the final response
- report final status and result-file path

---

## 2. Task Traceability

Before implementation, store the received task instruction in:

```text
docs/executed_tasks/<TASK-ID>-<slug>.md
```

The task file must:
- identify the task ID and task name
- contain the instruction used for that execution
- be created and re-read before implementation
- remain unchanged after implementation begins

Exact instruction fidelity may be reviewed separately by the Project Manager.

When using PowerShell, write long or multiline Markdown with a here-string or another robust multiline method. Avoid long inline `Set-Content -Value` strings with complex quoting.

Always create the corresponding result file:

```text
docs/executed_results/<TASK-ID>-<slug>.md
```

A result file is required even when the task is blocked, fails verification, changes no production code, or cannot be completed safely.

---

## 3. Repository Analysis

### Preflight gate

Before any repository inspection:
1. read `AGENTS.md`
2. read `docs/IGNORE.md`
3. read other task-required documentation
4. confirm the active Task ID and slug

No repository-discovery command may run before this gate is complete.

If repository inspection starts before preflight, or the active Task ID is wrong, stop and report the execution as failed instead of continuing.

Before changing code:
- read `AGENTS.md` and only task-relevant documentation
- inspect the existing implementation and conventions
- search for reusable existing code
- identify affected modules, dependencies, tests, ambiguities, and risks

### Repository inspection discipline

- Respect `.gitignore` during normal repository inspection.
- Do not recursively inspect ignored directories unless explicitly relevant.
- Prefer narrow, git-aware inspection such as `git ls-files`, `git status --short`, and targeted directory listings.
- Never run unrestricted recursive listings of the entire repository.
- Expand inspection only into paths relevant to the active task.

For database-related tasks, also inspect existing schema, migrations, repositories, and JSON structures before deciding on persistence changes.

For significant tasks, produce a short implementation plan before coding.

---

## 4. Escalation

Stop and request a decision when implementation requires a meaningful change to:
- product behavior or task scope
- architecture or public APIs
- data model semantics
- security or authorization policy
- compatibility guarantees
- relational/JSON ownership of data
- database changes where migration compatibility cannot be preserved

Do not silently invent product or architecture decisions.

---

## 5. Implementation

During implementation:
- follow the approved task specification
- follow existing architecture and conventions
- make the smallest coherent change
- reuse existing functionality where practical
- avoid unrelated refactoring and speculative abstractions
- do not add dependencies unless justified
- preserve backward compatibility unless explicitly changed
- keep changes reviewable and reversible

If the original plan becomes invalid, reassess before continuing.

---

## 6. Testing and Verification

After implementation:
- add or update tests for changed behavior
- test important success and failure paths
- run relevant tests
- run type checking, linting, and formatting checks where configured
- run other task-relevant verification

Do not weaken valid tests to make the implementation pass.

Report any verification step that could not be run.

---

## 7. Self Review

Before finishing:
- review the complete diff
- verify every changed file is necessary
- check for unrelated changes
- check for duplicated logic or unnecessary complexity
- check for architecture, validation, error-handling, or security regressions
- check for missing tests, dead code, debug code, or accidental dependencies

---

## 8. Implementation Report

When execution ends for any reason, write the report to:

```text
docs/executed_results/<TASK-ID>-<slug>.md
```

Use this compact structure:

```text
Task ID:
Status:

Summary:

Repository analysis:

Files changed:

Tests and verification:

Production code:

Architecture:

Dependencies:

Deviations:

Risks / findings:

Diff summary:
```

Requirements:
- report observed facts separately from hypotheses
- include exact relevant commands executed and their results
- report verification that could not be run and why
- do not report `Completed` when acceptance criteria are knowingly unmet

After writing the result file, return only a short terminal/chat summary with task ID, status, result-file path, and any blocker or escalation requiring attention.

---

## 9. Review and Next Step

Review the implementation report against the original task.

If issues are found:
- create a focused follow-up task
- do not mix unrelated fixes into the same task
- update permanent documentation only when a lasting project decision was made

Important product or architecture decisions should be recorded in project documentation or a decision record.

---

## Core Principle

```text
Project Manager defines WHAT and WHY.
Codex determines HOW within project constraints.
Repository remains the source of truth.
```
