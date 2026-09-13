# TASK-0125: Admin Log Viewer and Readable Download

## Goal
Extend Admin Settings → Logging so each managed log can be viewed and downloaded in a human-readable format. Keep existing server-side JSONL files unchanged.

## Requirements Summary
- Add overflow menu (...) to Application log and Model inference log controls
- Menu items: View log, Download
- View log opens modal with readable formatted entries loaded via API
- Download returns .log file with same readable formatting
- Shared formatter contract between viewer and download
- Admin-only endpoints with strict stream identifier validation
- Handle missing/empty/malformed logs gracefully
- No arbitrary path traversal

## Acceptance Criteria
- Overflow menu with exactly View log / Download items per log type
- Modal shows chronologically ordered readable entries
- Timestamp in local time with unambiguous timezone offset
- Uppercase level, clearly separated event, indented key/value fields
- Nested objects/arrays rendered safely
- Malformed JSONL lines do not crash viewer
- Empty logs show clear empty state
- Download returns .log file matching viewer formatting
- Original JSONL files unchanged
- Admin authorization enforced server-side
- Arbitrary stream/path input rejected

## Verification Commands
- npm.cmd run build
- npm.cmd run build:client
- npm.cmd run typecheck:client
- npm.cmd run lint
- npm.cmd run test
