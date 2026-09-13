# Definition of Done

A task is complete only when all applicable items below are satisfied.

## Behavior
- Requested behavior is implemented.
- Existing behavior is preserved unless intentionally changed.
- Important edge cases are handled.

## Scope and quality
- No unrelated changes or unnecessary refactoring are included.
- No speculative functionality or unnecessary dependencies were added.
- Existing architecture and project conventions are followed.
- No unnecessary complexity, duplicated logic, dead code, or debug code remains.
- No changed service or module has accumulated an unrelated responsibility that should be a focused collaborator.

## Validation and security
- External input is validated where required.
- Errors are handled consistently.
- Relevant security and authorization rules are preserved.
- No secrets or sensitive implementation details are exposed.

## Verification
- Relevant tests exist or were updated.
- Relevant tests pass.
- Type checking passes where configured.
- Linting passes where configured.
- Formatting passes where configured.
- Database/migration verification passes when persistence is affected.
- Any verification step that could not be run is reported explicitly.

## Final review
- Review the complete diff.
- Verify every changed file is necessary.
- Check for accidental unrelated edits.
- Check for missing tests.
- Check for architecture, security, or persistence regressions.
