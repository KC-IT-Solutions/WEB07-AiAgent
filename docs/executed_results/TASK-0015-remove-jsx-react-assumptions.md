# TASK-0015 — Remove JSX/React assumptions from client

## Task ID
TASK-0015

## Status
PASS

## Summary
Converted client shell from TSX/JSX to plain TypeScript + DOM APIs. Removed all React dependencies, JSX compiler options, and React type declarations.

## Repository Analysis
The client shell consisted of:
- layout.tsx — React component with JSX for sidebar + main content layout
- ChatView.tsx — React component with JSX for chat placeholder
- eact.d.ts — Minimal React type declarations
- index.html — Loaded React, ReactDOM, and Babel from CDN for in-browser JSX compilation
- TypeScript configs with JSX compiler options (jsx: react, jsx: react-jsx)

## Files Changed

### Created
- src/client/components/layout.ts — Plain TypeScript DOM API version of Layout
- src/client/components/chat/ChatView.ts — Plain TypeScript DOM API version of ChatView

### Deleted
- src/client/components/layout.tsx
- src/client/components/chat/ChatView.tsx
- src/client/types/react.d.ts
- src/client/types/ directory (now empty)

### Modified
- src/client/components/index.ts — Updated exports for renamed files
- src/client/components/chat/index.ts — Updated exports for renamed files
- src/client/index.html — Removed React/Babel CDN scripts; references plain TS modules
- 	sconfig.json — Removed jsx: react option; removed eact.d.ts from exclude list
- 	sconfig.client.json — Removed jsx: react-jsx option
- 	sconfig.test.json — Updated exclude paths from .tsx to .ts
- eslint.config.js — Replaced projectService with explicit project paths (fixes TypeScript 6 compatibility); removed .tsx from file patterns; added test file tsconfig reference
- src/client/components/chat/__tests__/ChatView.test.ts — Updated to reference .ts file and createChatView; added wait for floating promises

## Tests and Verification

### Build
`
npm run build
? tsc -p tsconfig.json
? PASS (no errors)
`

### Client Typecheck
`
npm run typecheck:client
? tsc -p tsconfig.client.json --noEmit
? PASS (no errors)
`

### Lint
`
npm run lint
? eslint .
? PASS (no errors)
`

### ChatView Test
`
node --test .test-dist/src/client/components/chat/__tests__/ChatView.test.js
? 1 test, 1 pass, 0 fail
? PASS
`

### No .tsx Files
`
glob src/client/**/*.tsx ? No files found
`

### No JSX/React in Client Code
`
grep jsx|JSX|react|React in src/client/*.ts ? No matches found
`

## Production Code
- layout.ts exports createLayout(renderChildren: () => HTMLElement): HTMLElement — creates DOM elements for sidebar with Chat nav link, header with toggle button, and main content area
- ChatView.ts exports createChatView(): HTMLElement — creates DOM elements for chat placeholder UI
- Both use standard document.createElement, class assignment, and ppendChild patterns

## Architecture
- No frontend framework; plain browser DOM APIs
- Client TypeScript files are excluded from server build (tsconfig.json excludes src/client/**)
- Client typecheck validates via separate 	sconfig.client.json

## Dependencies
- No dependencies added
- React and Babel CDN scripts removed from HTML

## Deviations
- eslint.config.js was modified beyond just removing .tsx from patterns: replaced projectService with explicit project paths to fix a TypeScript 6 / typescript-eslint compatibility issue that prevented lint from running. This is a necessary fix for the project to pass lint verification.

## Risks / Findings
- The HTML file references .ts files directly, which browsers cannot execute natively. A build/transpile step would be needed for production use. This was not added per task constraints (no dependency additions, minimal changes).

## Diff Summary
- 2 files renamed (.tsx ? .ts) with JSX replaced by DOM APIs
- 1 file deleted (eact.d.ts)
- 1 directory removed (empty 	ypes/)
- 8 files modified (configs, exports, HTML, test)
- 0 dependencies added
