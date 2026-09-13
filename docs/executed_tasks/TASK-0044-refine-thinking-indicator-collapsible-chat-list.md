# TASK-0044 — Refine thinking indicator and collapsible chat list

Task ID: TASK-0044
Task slug: refine-thinking-indicator-collapsible-chat-list

## Goal

Make two small UI refinements:

1. Make the animated three-dot thinking indicator larger and clearer.
2. Make the Chat section in the sidebar collapsible and add a chat icon before each chat title.

Client UI only.

## Read first

Run:

    powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\inspect-repo.ps1

Then read only relevant files for:

- ChatView
- chat.css
- sidebar/layout
- chat-list rendering
- relevant frontend tests
- CODINGSTANDARDS.md

Do not use recursive repository listing commands.

## Part 1 — Thinking indicator

Keep the existing three-dot wave animation.

Increase primarily:

- dot size
- bubble size
- padding around the dots
- visual clarity/contrast

Do NOT significantly increase spacing between the dots.

The dots should remain relatively close together:

    [ • • • ]

rather than widely spaced.

Keep the existing sequential vertical wave:

    1 → 2 → 3 → 1 → 2 → 3 ...

The dots should move vertically up/down in sequence.

Do not change normal user or assistant message styling.

Do not change Markdown rendering.

## Part 2 — Collapsible Chat section

The sidebar Chat section should be collapsible.

Add a toggle control to the Chat section heading.

Use this inline SVG for the dropdown indicator:

    <svg viewBox="0 0 24 24">
      <path d="M6 9l6 6 6-6"
            stroke-linecap="round"
            stroke-linejoin="round"></path>
    </svg>

Behavior:

- expanded by default
- clicking the Chat section toggle hides the saved chat list and New chat action
- clicking again shows them
- no page reload
- collapsing must not delete or change chats
- active chat remains active when the list is collapsed
- Settings navigation remains visible

Rotate the dropdown SVG appropriately when the section is collapsed.

Keep the implementation client-side only.

Do not persist collapsed/expanded state yet.

## Chat icon

Before every saved chat title, show this inline SVG:

    <svg viewBox="0 0 24 24">
      <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path>
    </svg>

Requirements:

- icon appears immediately before the chat title
- icon is decorative and must not become a separate clickable control
- keep it compact
- align it vertically with the title
- long chat titles must still truncate/use available space correctly
- existing `...` chat actions button remains aligned at the far right

Do not use an external icon library.

## Sidebar layout

Conceptually:

    Chat                  ˅
      + New chat
      ◯ Chat title one       ...
      ◯ Chat title two       ...
      ◯ Chat title three     ...

When collapsed:

    Chat                  >

    Settings

Use the provided SVG, rotated with CSS for collapsed state rather than creating another icon.

## Accessibility

The Chat collapse trigger must be a real button.

Provide:

- accessible label
- aria-expanded reflecting current state
- keyboard accessibility

The decorative chat icon should not create redundant screen-reader output.

## Preserve behavior

Do not change:

- chat creation
- active-chat selection
- rename
- delete
- chat actions menu
- model selection
- inference
- Markdown rendering
- backend/API behavior
- persistence

## Tests

Add/update focused deterministic frontend tests for:

- thinking dots remain three separate animated elements
- thinking dots use larger visual sizing
- dot spacing remains compact
- Chat section toggle exists
- Chat section is expanded by default
- toggle updates collapsed/expanded state
- aria-expanded is updated
- collapsed state hides chat list/New chat
- active chat is not changed by collapse
- dropdown uses the supplied SVG path
- each saved chat receives the supplied chat SVG
- chat icon is decorative/non-interactive
- existing three-dot actions button remains present
- Settings navigation remains unaffected

Do not use LM Studio.

## Out of scope

Do not add:

- persisted sidebar collapse state
- new backend/API behavior
- chat grouping/folders
- search/filter
- drag-and-drop
- new dependencies
- unrelated redesign
- normal message bubble changes

## Verification

Run:

    npm run build
    npm run build:client
    npm run typecheck:client
    npm run lint
    npm test

## Acceptance

- thinking bubble is visibly larger and clearer
- thinking dots are larger but remain closely spaced
- existing wave animation remains
- Chat section can collapse/expand
- Chat section starts expanded
- supplied dropdown SVG is used
- supplied chat SVG appears before each saved chat title
- active chat and chat actions continue working
- Settings remains visible
- no backend changes
- all tests pass
- no new dependencies
- no unrelated changes

## Tracking

Create:

- docs/executed_tasks/TASK-0044-refine-thinking-indicator-collapsible-chat-list.md
- docs/executed_results/TASK-0044-refine-thinking-indicator-collapsible-chat-list.md

Do not read historical task/result files.

## Final response

Return only:

    Task ID: TASK-0044
    Status: <PASS|FAIL|BLOCKED>
    Result: docs/executed_results/TASK-0044-refine-thinking-indicator-collapsible-chat-list.md
    Summary: <one short sentence>
