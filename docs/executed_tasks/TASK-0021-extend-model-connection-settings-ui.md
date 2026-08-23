Task ID: TASK-0021
Task slug: extend-model-connection-settings-ui

## Goal

Extend the existing Settings view with timeout in minutes, a Test connection button, and a model selector. UI only. No backend implementation.

## Requirements

- Timeout in minutes (default: 30, positive number)
- Base URL without /v1
- Test connection button (visible/enabled when form valid, no network request)
- Model selector (disabled initially, no hardcoded models)
- API key remains password input
- No backend, no network requests, no new dependencies, no persistence
