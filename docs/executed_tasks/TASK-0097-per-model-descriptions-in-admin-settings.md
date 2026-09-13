# TASK-0097 - Per-model descriptions in Admin Settings

Task ID: TASK-0097
Task slug: per-model-descriptions-in-admin-settings

## Instruction

Implement optional, plain-text descriptions for exact provider model IDs, scoped to each saved Model Connection and stored as typed connection-owned JSON metadata with a backward-compatible empty default and no migration unless repository structure requires one.

Extend the existing Admin per-connection model visibility editor so each discovered or retained stale model can edit a description of at most 500 characters. Empty or whitespace-only values remove the entry. Description changes must debounce and autosave without a Save button, share coherent save status and failure recovery with visibility edits, and must not race with or overwrite visibility policy. Only Admin may modify this metadata; malformed values and unknown connections must be rejected without exposing credentials.

Resolve application-owned descriptions centrally with effective model discovery. Normal Chat and Agent model selectors receive only effective visible models plus `string | null` descriptions, keep the exact model ID authoritative, display the selected model's description as secondary safe text where practical, and never reveal hidden models because they have metadata. Agent configuration continues to persist only connection/model identity. Retain descriptions when models are hidden, unavailable, or discovery fails, and restore them if the model reappears.

Document that future Agent self-directed model selection, when enabled, may receive connection ID, model ID, and advisory Admin description, while the visibility allowlist and exact identities remain authoritative. Do not implement self-directed switching, provider metadata changes, generated descriptions, tags, pricing, rich text, new frameworks, or unrelated behavior.

Add deterministic persistence/service, stale-model, authorization/API, Admin autosave, Chat, and Agent coverage for the acceptance cases in the received task specification. Preserve show-all and explicit-empty visibility behavior, stale model support, Chat and Agent enforcement, credentials, inference serialization, Projects, Agent lifecycle, Tools, Skills, and plain TypeScript/DOM architecture.

Run and require success from:

```text
npm.cmd run build
npm.cmd run build:client
npm.cmd run typecheck:client
npm.cmd run lint
npm.cmd test
```

Create `docs/executed_results/TASK-0097-per-model-descriptions-in-admin-settings.md`, perform the required final self-check, and return exactly the requested five-line Task ID, Status, Result, Verification, and Summary response.
