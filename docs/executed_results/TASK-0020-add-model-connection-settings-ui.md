Task ID: TASK-0020
Status: PASS

Summary:
Added a Settings view with a model connection form (name, base URL, API key with password input, timeout) accessible via sidebar navigation without page reload. Form state is kept in memory only with no persistence or network requests.

Repository analysis:
- Existing layout used a single-view SPA with sidebar navigation pointing to /chat
- Chat view was the only content view, rendered directly in layout.ts
- CSS was in chat.css alongside layout styles
- Test infrastructure used node:test with compiled .test-dist output

Files changed:
- src/client/components/settings/SettingsView.ts (new) — Settings view component with connection form
- src/client/components/settings/settings.css (new) — Feature-scoped CSS for settings view
- src/client/components/settings/__tests__/SettingsView.test.ts (new) — 14 deterministic tests
- src/client/components/layout.ts (modified) — Added view switching between Chat and Settings
- src/client/components/index.ts (modified) — Added SettingsView export
- src/client/index.html (modified) — Added settings.css link
- src/client/components/chat/chat.css (modified) — Added active nav item style
- src/server.ts (modified) — Added /settings route serving same SPA
- scripts/copy-client-assets.mjs (modified) — Copy settings.css to dist
- eslint.config.js (modified) — Added console global for scripts/*.mjs
- package.json (modified) — Added client component tests to test command

Tests and verification:
- npm run build: PASS
- npm run build:client: PASS
- npm run typecheck:client: PASS
- npm run lint: PASS
- npm test: PASS (35 tests, 3 suites, 0 failures)
  - ChatView: 14 tests PASS
  - SettingsView: 14 tests PASS
  - POST /api/chat: 7 tests PASS

Production code:
- SettingsView component with form fields: connection name (text), base URL (url), API key (password), timeout (number)
- In-memory state management via module-level variable
- Save button shows transient "Saved" feedback then resets
- Layout supports SPA view switching without page reload
- Active nav item highlighted with chat-sidebar-item-active class

Architecture:
- Settings component follows same pattern as ChatView (DOM-based, no framework)
- CSS is feature-scoped in settings/settings.css
- Layout manages view state and switching logic
- No backend integration, no persistence

Dependencies:
- No new dependencies added

Deviations:
- None

Risks / findings:
- Test command in package.json now explicitly lists client test files rather than using recursive globs (Windows PowerShell compatibility)

Diff summary:
- 3 new files (SettingsView.ts, settings.css, SettingsView.test.ts)
- 8 modified files (layout.ts, index.ts, index.html, chat.css, server.ts, copy-client-assets.mjs, eslint.config.js, package.json)
