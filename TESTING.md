# Testing

`npm test` är snabb och deterministisk utan browser, internet, riktig LM Studio eller riktig YouTube. `npm run test:all` lägger till headless Chromium men är fortfarande lokal och deterministisk. Live-tester körs separat.

## Lager

- `unit`: isolerad logik och små synliga test doubles; ingen HTTP eller browser.
- `integration`: verkliga repositories, services, SQLite och interna kontrakt. Externa tjänster får fake:as vid adaptergränsen.
- `frontend`: riktiga frontendmoduler och DOM-interaktion utan browser. API-klienten får fake:as för UI → API-kontrakt.
- `system`: browserless full stack genom runtime, SQLite, provider, OpenAI SDK, HTTP och ToolExecutor. LM Studio och externa tool-providers fake:as, inte runtime eller ToolExecutor.
- `e2e`: svartlådetest i headless Chromium genom riktig frontend, Express och temporär SQLite. Endast externa tjänster fake:as.
- `live`: opt-in-kompatibilitet mot riktig LM Studio eller YouTube; ingår aldrig i `test:all`.

## Kommandon

```text
npm test
npm run test:unit
npm run test:integration
npm run test:frontend
npm run test:system
npm run test:e2e
npm run test:all
npm run test:live
```

Installera Chromium en gång med `npx playwright install chromium`. Vanlig `npm install` laddar inte automatiskt ned browserbinären. E2E kör seriellt tills isoleringen verifierats för parallella workers. Vid fel sparas trace och screenshot i `test-results`; lyckade körningar lämnar inga stora artifacts.

Live-flaggor är `RUN_LM_STUDIO_LIVE_TESTS=1` och `RUN_YOUTUBE_LIVE_TESTS=1`. Utan dem skippas respektive test.

## Testdata och lifecycle

Varje stateful test skapar en unik OS-tempkatalog. Testdatabasen är riktig SQLite och kör produktionens `initializeSchema`. Seedning är explicit via små fixtures/repositories: `fresh-install`, `old-chat-tools-empty`, `chat-youtube-enabled`, `defaults-empty` och `defaults-youtube-enabled`. User 1 används där produktionsbootstrap kräver default-user.

`test:compile` tar alltid bort `.test-dist` före kompilering. Det förhindrar att flyttade eller borttagna testfiler ligger kvar och körs i fel lager.

Appserver, fake LM, browser och databas ägs av harnessen som startar dem och stängs i `finally`. App, projekt, General Chat-filer och loggar pekas mot tempkatalogen. Utvecklingsdata används aldrig. Serverhelpers väntar på exit och verifierar att testporten inte längre accepterar anslutningar. Dynamiska portar används och faktisk base URL returneras.

Helpers ska vara små och visa state. Skapa inte helpers som bygger en “fullt fungerande chat” eller effective runtime-config bakom testets rygg. Full-systemtester får inte konstruera effective config direkt i runtime-lagret.

## Skydd mot systematiska fel

1. En kritisk feature verifieras på minst två oberoende nivåer.
2. Minst ett test per golden path följer verklig användarväg.
3. Tester ska även börja från saknat, avstängt och realistiskt legacy-state.
4. Regression: reproducera → lägg test → verifiera rött → fixa → verifiera grönt. Rapportera `Regression test failed before fix: yes/no`; förklara om buggy state inte kan köras.
5. Mocka inte samma lager överallt. E2E mockar inte frontend/API/DB; system mockar inte providertransport eller ToolExecutor.
6. Snapshot assertions ersätter aldrig semantiska assertions om tool state, chat-ID eller ordning.

Framtida kritiska ändringar ska namnge berörda golden paths, uppdatera rätt lager och ange om svartlåde-E2E påverkas. Påstå inte E2E-täckning för service- eller DOM-stubtester.

## Golden Paths

Prompt 33 completes the matrix: GP02, GP11 and GP12 have E2E coverage. GP11 uses the real agent policy and ToolExecutor with a fake YouTube provider; GP12 uses a confirmed-free local port without a listener. GP05 intentionally remains a system test.

### Secondary / Security-Critical Scenarios

- Child-agent tool delegation — E2E for explicit positive delegation, global deny, root use without delegation, delegation without root use, disabled child, and root/child isolation.
- Child-agent policy truth table — integration coverage for independent root-use and root-delegation axes, legacy missing permissions, revocation, and re-enablement.
- Security invariants: `effectiveRootTools ⊆ globalAllowedTools` and `effectiveChildTools ⊆ delegatedByRoot ⊆ globalAllowedTools`.
- `toolPermissions` is the canonical explicit root-to-child delegation list. Missing legacy permissions normalize to an empty list and therefore deny child access without changing root use.

- GP01 App startup + render — E2E.
- GP02 New General Chat gets normal response — E2E.
- GP03 Existing chat: enable tool → send — frontend + E2E från legacy `tools: []`.
- GP04 Transient chat: enable tool → first send — frontend + E2E.
- GP05 Tool call → tool result → final response — system.
- GP06 Switch chats with different tool configs — E2E.
- GP07 Autosave → immediate Send — frontend + E2E med kontrollerad PATCH-gate.
- GP08 Autosave failure blocks execution — frontend + E2E med canonical rollback och ARIA-fel.
- GP09 Cancel execution — integration + E2E med pending och sen LM-respons samt recovery.
- GP10 Retry execution — integration + E2E med ny execution, aktuell sparad tool-config och deduplicerad historik.
- GP11 Agent chat with tools — integration + E2E genom riktig policy och ToolExecutor.
- GP12 LM Studio offline gives controlled error — integration + E2E mot oanvänd lokal port.

### Runtime Resilience

- Offline recovery — E2E covered. A persisted General Chat fails against an unused local provider port, then retries successfully after fake LM Studio starts on that same endpoint. The test verifies a new execution ID, one persisted user message, one final assistant message, health, and released busy state.
- Cancel during ToolExecutor — E2E covered. Fake LM emits a stable `youtube_search` tool call; the real registry, policy, schema validation and ToolExecutor enter a pending fake external provider; browser Cancel propagates its `AbortSignal`. A deliberately late provider result cannot trigger another model request or terminal transition, and the next independent send completes.
- Navigation away during active execution — E2E covered. Detached-view polling stops without cancelling server execution; completed canonical history reconciles exactly once after return and hard reload.
- Return/reconnect to running execution — E2E and frontend covered. A remounted view discovers the existing execution ID, restores one polling lifecycle and can cancel that same execution; a late model response remains ignored.
- Cross-chat stale-view isolation — E2E covered. With the supported LM concurrency set to two, Chat A and Chat B execute independently and neither detached callback nor canonical history crosses chat boundaries.
- All scenarios use dynamic local ports, deterministic gates and `finally` cleanup. They do not use the development database, internet, real LM Studio or real YouTube.

### Model Boundary and Runtime Policy Snapshots

- Hostile model tool calls are E2E-covered for General Chat tools that were not offered and child-agent tools without root delegation. The real runtime and ToolExecutor reject the call, never invoke the external provider, persist no unauthorized assistant result, and stop before another model request.
- Global deny and unknown tool names are integration-covered through the real policy and ToolExecutor, including an assertion that the provider is not invoked.
- Tool authorization, effective schemas, configuration and denial reasons are immutable for one active execution. General Chat and agent execution therefore use the same start snapshot from the first model request through every tool call and follow-up model request.
- A configuration or delegation change made while execution A is waiting applies to execution B. Execution A finishes against its start snapshot; canonical persisted configuration immediately reflects the edit and is not rolled back.
- Revocation is intentionally not an emergency stop for work already authorized by an active snapshot. Use Cancel to abort an active execution and propagate its `AbortSignal` to ToolExecutor/provider work.

Kontrakttester namnges efter gränsen de bevisar, exempelvis `contract-ui-api-tool-toggle`, `contract-config-snapshot-tools`, `contract-provider-http-tools` och `contract-tool-result-next-model-step`.

## Nästa steg

Golden-path-matrisen GP01–GP12 är komplett på E2E- eller systemnivå. Sekundära varianter är child-agent-delegering, offline recovery, cancel under ToolExecutor, navigering under execution, GP06 med en annan chats PATCH pending, GP08 recovery efter navigering och GP10 med Retry i samma vy medan PATCH är pending. Mutation testing är ett senare steg; Stryker är främst relevant för tool-policy, configvalidering, permissions och snapshotlogik.
