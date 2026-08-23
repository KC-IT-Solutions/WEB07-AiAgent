# TASK-0043 - Increase chat panel corner radius

Task ID: TASK-0043
Task slug: increase-chat-panel-corner-radius

## Goal

Make the main chat UI surfaces slightly rounder by increasing their border radius.

This is a CSS-only visual refinement.

## Read first

Run:

    powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\inspect-repo.ps1

Then read only relevant files for:

- ChatView structure
- chat.css
- relevant frontend tests
- CODINGSTANDARDS.md

Do not use recursive repository listing commands.

## Required change

Increase the border radius on the main chat panels/containers so the UI has slightly softer corners.

Focus on:

- the bottom message composer/input container
- other equivalent main chat panels that currently use the same relatively sharp radius

Use a consistent radius.

A target around:

    12px to 14px

is appropriate unless the existing CSS structure suggests a nearby value fits better.

## Preserve message styling

Do not change the normal user or assistant message presentation.

Do not introduce chat bubbles for normal messages.

Do not change Markdown rendering.

The animated thinking indicator styling may remain unchanged unless its existing radius needs a tiny consistency adjustment.

## Scope

Change Chat-specific CSS only unless a tiny class adjustment is strictly required.

Do not modify:

- sidebar styling
- Settings styling
- modal styling
- inference behavior
- toolbar behavior
- model selection
- rename/delete behavior
- backend
- API
- database

## Consistency

Avoid adding several slightly different radii for equivalent surfaces.

Reuse or consolidate an existing Chat radius value where practical.

Do not introduce a broad design-token refactor.

## Tests

Update tests only if an existing source/style assertion requires it.

Do not add a large test suite for this CSS-only change.

## Verification

Run:

    npm run build
    npm run build:client
    npm run typecheck:client
    npm run lint
    npm test

## Acceptance

- main chat panel/composer corners are visibly slightly rounder
- radius is consistent across equivalent chat surfaces
- normal message styling is unchanged
- Markdown rendering is unchanged
- toolbar behavior is unchanged
- no backend changes
- all tests pass
- no new dependencies
- no unrelated changes

## Tracking

Create:

- docs/executed_tasks/TASK-0043-increase-chat-panel-corner-radius.md
- docs/executed_results/TASK-0043-increase-chat-panel-corner-radius.md

Do not read historical task/result files.

## Final response

Return only:

    Task ID: TASK-0043
    Status: <PASS|FAIL|BLOCKED>
    Result: docs/executed_results/TASK-0043-increase-chat-panel-corner-radius.md
    Summary: <one short sentence>
