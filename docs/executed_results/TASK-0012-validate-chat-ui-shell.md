# TASK-0012 — Validate Chat UI Shell — Result

Task ID: TASK-0012
Status: FAIL

## Summary

Validated the existing Chat UI shell. All functional acceptance criteria are met, but `npm run build` emits a TypeScript deprecation error and produces .js files containing untransformed JSX due to missing `jsx` configuration in tsconfig.json.

## Files Reviewed

- `package.json`
- `tsconfig.json`
- `src/client/index.html`
- `src/client/components/layout.tsx`
- `src/client/components/index.ts`
- `src/client/components/chat/ChatView.tsx`
- `src/client/components/chat/index.ts`
- `src/client/components/chat/chat.css`
- `src/client/components/chat/__tests__/ChatView.test.tsx`
- `src/server.ts`

## Acceptance Criteria Results

| Criterion | Result | Notes |
|---|---|---|
| Permanent left sidebar | PASS | `layout.tsx` renders a fixed-width sidebar (`w-64`) with dark background. Visible on desktop, togglable on mobile. |
| Chat navigation item | PASS | Sidebar contains `<a href="/chat">Chat</a>` navigation link. |
| Main content area | PASS | `<main>` element renders `{children}` for page content. |
| Separate Chat view component | PASS | `ChatView.tsx` is a standalone component in `src/client/components/chat/`. |
| Simple Chat placeholder | PASS | ChatView renders placeholder text: "This is a placeholder for the chat feature." |
| Modular Chat CSS | PASS | `chat.css` exists with chat-specific styles (sidebar, header, main content, placeholder). |
| No actual chat functionality | PASS | ChatView contains no state, no API calls, no message handling. |
| No unnecessary dependency additions | PASS | React loaded via CDN in `index.html`; no React in `package.json` dependencies. |

## Build Result (`npm run build`)

**WARN** — Build completes (exit code 0) but emits a TypeScript deprecation error:

```
tsconfig.json(5,25): error TS5107: Option 'moduleResolution=node10' is deprecated and will stop functioning in TypeScript 7.0.
```

Additionally, `tsconfig.json` lacks a `jsx` compiler option. As a result, compiled `.js` files in `dist/` contain raw JSX syntax (e.g., `<div>`) which cannot execute in Node.js. The `.tsx` files are included via `"include": ["src/**/*"]` but are not properly transformed.

## Lint Result (`npm run lint`)

**PASS** — ESLint ran with no errors or warnings.

## Problems Found

1. **Deprecated moduleResolution**: `tsconfig.json` uses `"moduleResolution": "node"` which triggers TS5107 deprecation error in TypeScript 6.x. Should be updated to `"bundler"` or `"node16"`, or silenced with `"ignoreDeprecations": "6.0"`.

2. **Missing jsx configuration**: `tsconfig.json` has no `jsx` option. Compiled `.js` files in `dist/client/` contain raw JSX syntax that cannot execute in Node.js. Adding `"jsx": "react"` or `"jsx": "react-jsx"` would fix this.

3. **Test file uses Jest syntax**: `ChatView.test.tsx` uses `describe`, `it`, and `expect` which are Jest globals, but the project does not include Jest in its dependencies. The test file will not execute with the project's test runner.

## Production Code Changed

No.
