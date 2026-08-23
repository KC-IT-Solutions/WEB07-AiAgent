# TASK-0016 — Add client JavaScript build output

## Goal

Compile the frontend TypeScript to JavaScript and make `index.html` load the compiled JavaScript.

## Changes Made

### `tsconfig.client.json`
- Added `"module": "Node16"` and `"moduleResolution": "Node16"` to produce browser-compatible ES modules with proper `.js` extensions in emitted imports.

### `package.json`
- Added `"build:client": "tsc -p tsconfig.client.json"` script to compile client TypeScript.

### `src/client/index.html`
- Changed `<script type="module" src="./components/layout.ts">` to `<script type="module" src="./components/layout.js">`.

### `src/client/components/index.ts`
- Updated import paths to use `.js` extensions: `'./chat/ChatView.js'` and `'./layout.js'`.

### `src/client/components/chat/index.ts`
- Updated import paths to use `.js` extensions: `'./ChatView.js'` and `'../layout.js'`.

## Verification

- `npm run build` — server build passes
- `npm run build:client` — client build passes, emits `.js` files to `dist/client/`
- `npm run lint` — lint passes
- ChatView test passes
- Emitted JS files have correct `.js` import paths for browser ES modules
