# TASK-0023 — Persist model connections

**Task ID:** TASK-0023
**Task slug:** persist-model-connections

## Goal

Persist model connection settings in SQLite according to DATABASE.md.

All connections in this task belong to UserId 1.

## Requirements

- Database model follows hybrid architecture: real columns for id, user_id, created_at, updated_at; JSON `data` column for connection properties
- user_id is a real column, not in JSON
- Connection properties (name, baseUrl, timeoutMinutes, modelId, enabled) stored in JSON `data` column
- UserId 1 enforced server-side; client cannot supply userId
- API key NOT persisted
- Repository pattern for database access
- API endpoints: POST /api/model-connections, GET /api/model-connections, GET /api/model-connections/:id
- Settings Save button connected to POST endpoint
- Tests use isolated SQLite test database
- No LM Studio dependency in tests

## Out of scope

- Authentication, dynamic users, credential persistence, encryption
- Update/delete operations
- Connection management UI
- Chat inference, chat persistence, inference queue
- New dependencies, unrelated refactors
