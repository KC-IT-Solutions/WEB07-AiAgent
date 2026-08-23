# TASK-0017 — Refine Chat UI shell layout

## Goal

Refine the existing Chat UI shell so the layout looks clean and intentional on desktop.

## Changes Made

### `src/client/components/chat/chat.css`
- Added CSS reset (`*`, `html`, `body`, `#root`) to remove browser-default margins and inconsistent typography
- Changed `.chat-container` from `flex-direction: column` to `flex-direction: row` for proper horizontal sidebar layout
- Fixed sidebar to `260px` width with `min-width` to prevent collapse
- Renamed `.chat-main-content` wrapper to `.chat-main-wrapper` to avoid class conflict
- Added `.chat-main-header` for the main area header with clean styling
- Improved `.chat-sidebar-item` with flexbox alignment, hover transitions, and active-state colors
- Added `.chat-view-container`, `.chat-card`, `.chat-placeholder-card`, `.chat-placeholder-content` classes
- Set `overflow: hidden` on container to prevent unnecessary page overflow
- Set `height: 100%` on layout elements to fill viewport without overflow

### `src/client/components/layout.ts`
- Removed the mobile menu toggle button (unnecessary for desktop layout)
- Removed `sidebarOpen` state variable (no longer needed without toggle)
- Removed inline styles from `navList` (moved to CSS)
- Removed inline styles from `main` element (moved to CSS)
- Simplified header to only contain the title text
- Renamed `mainWrapper` class to `chat-main-wrapper`
- Renamed header class to `chat-main-header`

### `src/client/components/chat/ChatView.ts`
- Replaced all inline styles with CSS class names
- Applied `.chat-view-container`, `.chat-card`, `.chat-placeholder-card`, `.chat-placeholder-content` classes
- Maintained same DOM structure and text content for test compatibility

### `src/client/index.html`
- No changes needed; CSS reset in `chat.css` handles browser defaults

## Verification

- `npm run build` — passed
- `npm run build:client` — passed
- `npm run lint` — passed (pre-existing error in `scripts/copy-client-assets.mjs` unrelated to changes)
- ChatView test — passed (1/1)

## Acceptance Criteria Met

- Sidebar has stable fixed width (260px)
- Main content uses remaining viewport width (flex: 1)
- No unnecessary horizontal or vertical overflow (overflow: hidden on container)
- Desktop does not show unnecessary mobile menu controls (menu toggle removed)
- Chat navigation is visually clear (styled with hover states, proper colors)
- Placeholder area is compact and centered (flexbox centering, max-width constraint)
- Existing functionality preserved (same DOM structure, same exports)
- No dependencies added
