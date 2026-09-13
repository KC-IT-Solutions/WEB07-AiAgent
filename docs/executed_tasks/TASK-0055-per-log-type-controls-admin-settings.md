# TASK-0055 — Per-log-type controls in Admin Settings

Task ID: TASK-0055
Task slug: per-log-type-controls-admin-settings

## Goal

Extend Admin Settings so each server log type can be enabled or disabled independently.

Keep this task small and focused on logging configuration.

## Read first

Run:

    powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\inspect-repo.ps1

Then inspect only relevant files for:

- Admin Settings UI
- global/system logging settings
- logger implementation
- logging settings repository/service/API
- relevant frontend/backend tests
- CODINGSTANDARDS.md

Do not use recursive repository listing commands.

Do not read historical executed task/result files.

## Existing log types

The application currently has two managed log types:

    Application log
    Model inference log

Add one checkbox for each.

## Admin Settings UI

In the Logging section, show:

    [x] Application log
        Server events, warnings, errors and application activity.

    [x] Model inference log
        Model requests, responses, tool calls and inference tracing.

Each description must:

- be short
- fit naturally on one normal desktop line
- clearly explain what that log contains
- not use technical implementation details unnecessarily

Use existing Admin Settings styling.

The checkbox and its description should visually belong together.

## Existing logging settings

Keep the existing:

    Logging level
    Clear all logs on server startup

Do not remove them.

The new per-log-type switches control whether that specific log stream is written at all.

Logging level still controls severity/detail within enabled log types.

Example:

    Application log = enabled
    Model inference log = disabled
    Logging level = debug

Result:

- application.log receives eligible debug/info/warn/error entries
- model-inference.log receives no new entries

## Defaults

For existing installations without the new fields, use backward-compatible defaults:

    applicationLogEnabled: true
    modelInferenceLogEnabled: true

Do not require existing administrators to manually re-enable logging after upgrade.

## Persistence

Persist both settings in the existing global system/admin logging settings.

Do not create a new table if the existing system settings structure can hold the additional fields.

These remain:

- global application settings
- editable only by admins
- not associated with an individual admin UserId

Use existing:

    HTTP
      -> SystemSettingsService
      -> repository
      -> SQLite

Do not put SQL in HTTP handlers.

## Logger behavior

Application logger:

- if applicationLogEnabled = false, do not append normal application entries to application.log

Model inference logger:

- if modelInferenceLogEnabled = false, do not append model trace entries to model-inference.log

Requirements:

- disabling one log must not disable the other
- logger must not create unnecessary new entries for a disabled log
- re-enabling a log resumes append behavior
- existing log files do not need to be deleted when disabled
- Clear logs on startup continues to apply to managed log files regardless of enabled state

Do not change correlation IDs, ordering, redaction, or inference tracing semantics.

## Runtime updates

When an admin saves logging settings:

- updated enable/disable values should take effect without rebuilding the application
- preferably take effect immediately just like the current logging level

Do not require server restart merely to toggle a log stream.

## API

Extend the existing Admin logging settings API.

It should include values equivalent to:

    {
      "level": "info",
      "applicationLogEnabled": true,
      "modelInferenceLogEnabled": true,
      "clearLogsOnStartup": false
    }

Exact property naming may follow current conventions.

Validate both new fields as booleans.

Non-admin access remains forbidden.

## Accessibility

Each checkbox must have:

- a proper label
- keyboard accessibility
- its explanatory text associated visually and semantically where practical

Do not make the description itself a separate interactive control.

## Tests

Add/update focused deterministic tests for:

- historical settings default both log types to enabled
- application log can be disabled independently
- model inference log can be disabled independently
- disabling application logging does not disable model logging
- disabling model logging does not disable application logging
- re-enabling resumes writes
- logging level still filters enabled logs
- Clear logs on startup behavior remains unchanged
- API reads both checkbox values
- API persists both values
- invalid non-boolean values are rejected
- non-admin remains forbidden
- Admin Settings renders both checkboxes
- each checkbox has its one-line description
- Save persists the selected states

Use isolated temporary log directories.

Do not use LM Studio.

## Out of scope

Do not add:

- additional log types
- log viewer
- log download
- per-user logging settings
- log rotation
- retention periods
- file-size controls
- changes to inference logging content
- changes to chat behavior
- new dependencies
- unrelated refactors

## Verification

Run:

    npm.cmd run build
    npm.cmd run build:client
    npm.cmd run typecheck:client
    npm.cmd run lint
    npm.cmd test

## Acceptance

- Admin Settings contains a checkbox for Application log
- Admin Settings contains a checkbox for Model inference log
- each log type has a short one-line explanation
- both log streams can be enabled/disabled independently
- both default to enabled for existing settings
- Logging level remains available
- Clear logs on startup remains available
- disabling a log does not delete its existing file
- settings are global and admin-only
- changes take effect without an application rebuild
- no changes to logging chronology/redaction behavior
- all tests pass
- no new dependencies
- no unrelated changes

## Tracking

Create:

- docs/executed_tasks/TASK-0055-per-log-type-controls-admin-settings.md
- docs/executed_results/TASK-0055-per-log-type-controls-admin-settings.md

Do not read historical task/result files.

## Final response

Return only:

    Task ID: TASK-0055
    Status: <PASS|FAIL|BLOCKED>
    Result: docs/executed_results/TASK-0055-per-log-type-controls-admin-settings.md
    Summary: <one short sentence>
