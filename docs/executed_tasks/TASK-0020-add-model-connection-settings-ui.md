# TASK-0020 — Add model connection Settings UI

## Goal

Add a Settings view where the user can configure model connections.

This task is UI only.

## Requirements

- Add a `Settings` item to the permanent left sidebar.
- Add a separate Settings view for model connections.
- The Settings view must contain a simple connection form with:
  - Connection name
  - Base URL
  - Optional API key (password input)
  - Timeout in milliseconds
- The UI should treat local and remote servers as the same technical connection type: `OpenAI-compatible connection`.
- Add a simple Save button.
- Save may only keep the form state in memory.
- no backend request, no database, no persistence after page reload.
- no `/v1/models` request, no connection test, no model selector yet.
- Keep Chat and Settings as separate views/components.
- Switching between `Chat` and `Settings` must happen in the existing SPA without a full page reload.

## Security

- API key field must use password-style input.
- do not display the API key elsewhere in the UI.
- do not log the API key.
- do not send it anywhere in this task.

## Out of scope

- SQLite, backend settings API, LM Studio integration, model discovery.
- Test connection, model selection, saved chats, users/authentication, encryption.
- new dependencies, frameworks, unrelated refactors.

## Acceptance

- sidebar contains Chat and Settings
- Chat view still works
- Settings view can be opened without page reload
- form contains name, base URL, API key, timeout
- API key uses password input
- Save works in memory only
- no network request occurs
- no persistence occurs
- Settings is a separate component/feature
- CSS is feature-oriented
- build passes
- client build passes
- lint passes
- relevant tests pass
- no dependencies added
