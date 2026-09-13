Task ID: TASK-0122
Status: PASS

Summary:
Fixed 13 failing tests in agent-inference-settings.test.ts caused by TASK-0121 introducing timeoutMinutes, temperature, and topP fields that were not accounted for in the repository's JSON parser. Additionally corrected 3 null-semantics tests to match the established API convention (null → INVALID_INPUT).

Repository analysis:
Root cause of PERSISTENCE_FAILED: parseAgentData() in agent-repository.ts maintained an allowlist of permitted JSON keys. The three new fields (timeoutMinutes, temperature, topP) were serialized by AgentService.toData() but absent from the repository's allowed set and return object. On read-back (mapRow → parseAgentData), the parser rejected these unknown keys with "Invalid agent data", which AgentService caught and re-threw as PERSISTENCE_FAILED.

Files changed:
1. src/server/repositories/agent-repository.ts — Added 'timeoutMinutes', 'temperature', 'topP' to allowed set; added type validation for each field; included fields in parseAgentData return using conditional spread (omits undefined properties to preserve deepEqual compatibility with legacy records).
2. tests/unit/agent-inference-settings.test.ts — Changed 3 null-semantics tests from "null is treated as undefined (default)" to "null is rejected" expecting INVALID_INPUT, matching the established convention where typeof value !== 'number' rejects null.

Null contract chosen and why:
Explicit null → INVALID_INPUT. The parseTimeoutMinutes() and parseInferenceParam() functions already reject null because `typeof null !== 'number'`. This matches the established Agent API boundary convention: omitted/undefined fields resolve to defaults, explicit null is invalid input. No production parsing was changed to accommodate null.

Tests corrected/added:
- "null timeoutMinutes is treated as undefined (default)" → "null timeoutMinutes is rejected" (expects INVALID_INPUT)
- "null temperature is treated as undefined (default)" → "null temperature is rejected" (expects INVALID_INPUT)
- "null topP is treated as undefined (default)" → "null topP is rejected" (expects INVALID_INPUT)

Confirmation TASK-0121 behavior remains unchanged:
- timeoutMinutes default 30, temperature default 0.8, topP default 0.8 — preserved in AgentService constants
- Temperature/Top P validation: finite number, 0 <= value <= 1 — unchanged
- Provider request serialization with decimal points — unchanged
- Configured Agent timeout through existing path — unchanged
- No database migration added

Tests and verification:
All five verification commands PASS:
1. npm run build — PASS (tsc -p tsconfig.json)
2. npm run build:client — PASS (tsc + asset copy)
3. npm run typecheck:client — PASS (tsc --noEmit)
4. npm run lint — PASS (eslint .)
5. npm test — PASS (944 tests, 0 failures)

Production code:
- agent-repository.ts: parseAgentData allowlist + validation + return object extended for inference settings fields
- No changes to AgentService validation logic or defaults
- No changes to provider serialization or timeout architecture

Architecture:
No architectural changes. Fix is confined to the repository layer's JSON parser, which was missing the new schema fields added by TASK-0121.

Dependencies:
None added.

Deviations:
None.

Risks / findings:
The parseAgentData allowlist pattern requires that any new AgentData field be added in three places: allowed set, validation checks, and return object. This is a maintenance risk for future schema extensions.

Diff summary:
- agent-repository.ts: +8 lines (3 allowed keys, 4 validation conditions, 3 conditional spread returns)
- agent-inference-settings.test.ts: ~10 lines changed (3 tests converted from pass-through to rejection assertions)
