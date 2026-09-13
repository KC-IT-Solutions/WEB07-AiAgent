## TASK-0123: Diagnose Admin Logging Pipeline

**Task ID:** TASK-0123
**Status:** PASS

### Summary

Diagnosed the admin logging pipeline end-to-end. Found two concrete issues where the logger's `initialize()` method ignored stream enablement state, creating empty log files for disabled streams and confusing users into thinking logging was broken when it was working as designed. Added stderr diagnostics to inference logging wrappers so filesystem failures are observable rather than silently swallowed.

### Repository analysis

Traced complete pipeline:
- Admin Settings UI -> PUT /api/admin/settings/logging payload -> SystemSettingsService validation/persistence -> SQLite system_settings table -> server.ts bootstrap reload -> StructuredLogger constructor + initialize() -> application/model log sinks -> filesystem output at data/logs/

All field names (`applicationLogEnabled`, `modelInferenceLogEnabled`) are consistent across UI, API, service, repository, and types. Settings persist correctly and reload on startup. Runtime updates via `setLevel()`/`setStreamEnabled()` work immediately without restart required.

### Root causes

1. **`initialize()` ignored stream enablement** (`src/server/logging/logger.ts:65-73`)
   - The `initialize()` method always operated on ALL managed log files regardless of which streams were enabled
   - When a stream was disabled, its log file still got created/touched during initialization
   - This produced empty log files for disabled streams, confusing users who saw files exist but contained no entries
   - Normal init now only touches files for enabled streams; clear-on-start preserves full-clear behavior

2. **Silent error swallowing in inference logging wrappers** (`src/server/services/chat-inference-service.ts:198-203`, `210-220`)
   - Both `logApplication` and `logModel` catch blocks silently swallowed ALL errors from logger calls
   - If the logger's write failed due to filesystem issues (permissions, disk full), no diagnostic was produced
   - Added stderr diagnostics so failures are observable without breaking inference flow

### Files changed

- `src/server/logging/logger.ts` — `initialize()` now respects stream enablement for normal init; clear-on-start still clears all managed files
- `src/server/services/chat-inference-service.ts` — Added stderr error messages to `logApplication` and `logModel` catch blocks
- `tests/unit/logger.test.ts` — Updated existing test expectations, added 8 new tests covering stream enablement behavior

### Tests and verification

**Tests added/updated:**
- `initialize creates files only for enabled streams` — Verifies disabled stream files are NOT created during normal init
- `initialize with all streams disabled creates no files` — Edge case: nothing touched when everything is off
- `clear-on-start clears all managed files regardless of stream enablement` — Clear behavior preserved
- `enabled application log produces output at configured level` — Application log enabled -> file has entries
- `disabled application log suppresses all output` — Application log disabled -> no file created
- `enabled model-inference log produces output at configured level` — Model inference log enabled -> file has entries
- `disabled model-inference log suppresses all output` — Model inference log disabled -> no file created
- `configured log level filters entries correctly` — Level filtering works as expected
- `missing log directory is created on write` — Directory auto-creation verified

**Verification results:**
| Command | Result |
|---------|--------|
| `npm run build` | PASS |
| `npm run build:client` | PASS |
| `npm run typecheck:client` | PASS |
| `npm run lint` | PASS |
| `npm test` | PASS (953 tests, 0 failures) |

### Production code

Two production files modified with minimal targeted changes. No new dependencies, no format changes, no API contract changes.

### Architecture

No architectural changes. Fixes stay within existing logger and service boundaries.

### Dependencies

No new dependencies added.

### Deviations

None.

### Risks / findings

- The pipeline was fundamentally sound: field names match, persistence works, settings reload correctly
- The confusion came from `initialize()` creating files for disabled streams, making it appear that logging "wasn't working" when the stream was actually just disabled
- Clear-on-start behavior (`clearManagedLogs=true`) correctly clears ALL managed files regardless of current stream state — this is intentional and preserved

### Diff summary

- `src/server/logging/logger.ts`: +10 lines (initialize logic split into clear-all vs enabled-only paths)
- `src/server/services/chat-inference-service.ts`: +6 lines (stderr diagnostics in two catch blocks)
- `tests/unit/logger.test.ts`: +87 lines (updated existing test, added 8 new tests)

### Pipeline verification checklist

| # | Check | Result |
|---|-------|--------|
| 1 | UI field names map to server-side settings fields | PASS — consistent everywhere |
| 2 | Save persists log level, app-log flag, model-inference flag, clear-on-start | PASS |
| 3 | Persisted values reload correctly | PASS |
| 4 | Logger initialization reads persisted settings | PASS |
| 5 | Logger initialization at correct lifecycle point (before routes) | PASS |
| 6 | Runtime changes reconfigure immediately (no restart needed) | PASS |
| 7 | Application log emits through enabled file sink | FIXED — initialize no longer creates files for disabled streams |
| 8 | Model inference logging uses its enabled flag | PASS |
| 9 | Log directory/path resolved correctly | PASS — `data/logs` or env override |
| 10 | Required directories created if missing | PASS — recursive mkdir in both init and write |
| 11 | Filesystem write failures observable (not silently swallowed) | IMPROVED — stderr diagnostics added to inference wrappers |
| 12 | Clear-on-start runs once at startup only | PASS — single call during module load |

### Behavior summary

- **Restart required after settings changes:** No — runtime updates apply immediately via `setLevel()`/`setStreamEnabled()`
- **Application-log behavior:** Enabled -> writes to `application.log`; Disabled -> no file created, no writes
- **Model-inference-log behavior:** Enabled -> writes to `model-inference.log`; Disabled -> no file created, no writes
- **Clear-on-start behavior:** When enabled, clears ALL managed log files on startup (including disabled streams); after clear, only enabled streams receive new entries
- **Log path used:** `data/logs/` (default) or `$LOG_DIRECTORY` environment variable override
