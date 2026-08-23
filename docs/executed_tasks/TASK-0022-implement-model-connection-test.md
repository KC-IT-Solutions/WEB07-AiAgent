# TASK-0022 — Implement model connection test

## Goal

Implement the backend and frontend behavior for the existing Test connection button.
The connection test must fetch available models from an OpenAI-compatible server.

## Requirements

- POST `/api/model-connections/test` endpoint
- Accepts: base URL, optional API key, timeout in minutes
- Backend requests `{baseUrl}/v1/models`
- Trim trailing `/` from base URL
- Default timeout = 30 minutes
- Convert minutes to milliseconds for HTTP request
- API key is optional; send Authorization header only when non-empty
- Never log or return the API key
- Use native fetch, no new dependencies
- On success: return connected=true, available model IDs, populate model selector
- On failure: return connected=false, safe error message, clear/disable model selector
- Automated tests use deterministic stubs/mocks (no LM Studio/network dependency)
- Live verification against http://192.168.4.127:1234

## Out of scope

Chat inference, persistence, SQLite, saved connections, users/auth, streaming,
model execution queue, new dependencies, unrelated refactors.
