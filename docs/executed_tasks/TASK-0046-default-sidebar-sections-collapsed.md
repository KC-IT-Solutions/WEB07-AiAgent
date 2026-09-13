# TASK-0046 - Default collapsible sidebar sections closed

Task ID: TASK-0046
Task slug: default-sidebar-sections-collapsed

## Goal

All collapsible sidebar menu sections must start collapsed by default.

This is a small client-side UI behavior change only.

## Required behavior

For every sidebar section that supports expand/collapse:

- initial state is collapsed
- child items/actions are hidden initially
- clicking the section toggle expands it
- clicking again collapses it
- aria-expanded reflects the current state
- existing SVG arrow rotation/state remains correct

For the Chat section specifically, the initial sidebar shows Chat and Settings while New chat and the saved chat list are hidden. Expanding Chat reveals those items normally.

## Preserve behavior

Do not change active chat, chat selection, chat creation, rename/delete, Settings navigation, active navigation highlighting, chat icons, model selectors, composer, inference, backend/API/database.

Collapse/expand state remains client-local and non-persistent. Do not add localStorage or database persistence.

## Tests

Update focused deterministic frontend tests for:

- collapsible sections start closed
- Chat starts collapsed
- aria-expanded initially equals false
- New chat and saved chats are initially hidden
- toggle expands the section
- second toggle collapses it again
- active chat is not changed
- Settings remains available

Do not use LM Studio.

## Verification

Run:

```text
npm.cmd run build
npm.cmd run build:client
npm.cmd run typecheck:client
npm.cmd run lint
npm.cmd test
```

## Acceptance

- all collapsible sidebar sections default to collapsed
- Chat list is hidden on initial render
- toggle behavior still works
- accessibility state is correct
- no persistence of collapse state is added
- no backend changes
- no new dependencies
- all tests pass
- no unrelated changes

## Tracking

Create:

- `docs/executed_tasks/TASK-0046-default-sidebar-sections-collapsed.md`
- `docs/executed_results/TASK-0046-default-sidebar-sections-collapsed.md`

Do not read historical task/result files.
