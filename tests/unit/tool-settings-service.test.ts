import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createTestDatabase } from '../../src/server/database.js';
import { ToolSettingsRepository } from '../../src/server/repositories/tool-settings-repository.js';
import {
  ToolSettingsError,
  ToolSettingsService,
} from '../../src/server/services/tool-settings-service.js';
import { DuckDuckGoSearchTool } from '../../src/server/tools/duckduckgo-search-tool.js';
import { ToolRegistry } from '../../src/server/tools/tool-registry.js';
import { VisitWebsiteTool } from '../../src/server/tools/visit-website-tool.js';
import {
  DEFAULT_DUCKDUCKGO_SETTINGS,
  DEFAULT_VISIT_WEBSITE_SETTINGS,
  DUCKDUCKGO_TOOL_NAME,
  VISIT_WEBSITE_TOOL_NAME,
} from '../../src/server/tool-types.js';

function setup() {
  const db = createTestDatabase();
  const repository = new ToolSettingsRepository(db);
  const registry = new ToolRegistry([new DuckDuckGoSearchTool(), new VisitWebsiteTool()]);
  return { db, service: new ToolSettingsService(repository, registry) };
}

await describe('tool settings service', async () => {
  await it('returns safe disabled defaults without creating a record', async () => {
    const { db, service } = setup();
    assert.deepEqual(await service.getSettings(DUCKDUCKGO_TOOL_NAME), DEFAULT_DUCKDUCKGO_SETTINGS);
    assert.equal((db.prepare('SELECT COUNT(*) count FROM tool_settings').get() as { count: number }).count, 0);
    db.close();
  });

  await it('persists one configuration owned by server UserId 1 and updates it', async () => {
    const { db, service } = setup();
    await service.updateSettings(DUCKDUCKGO_TOOL_NAME, {
      enabledForChat: true,
      pageSize: 10,
      safeSearch: 'strict',
      requestDelayMs: 1,
      cooldownAfter202Ms: 8000,
    });
    await service.updateSettings(DUCKDUCKGO_TOOL_NAME, {
      enabledForChat: false,
      pageSize: 1,
      safeSearch: 'off',
      requestDelayMs: 1500,
      cooldownAfter202Ms: 0,
    });
    const rows = db.prepare('SELECT user_id, tool_name, data FROM tool_settings').all() as Array<{
      user_id: number;
      tool_name: string;
      data: string;
    }>;
    assert.equal(rows.length, 1);
    assert.equal(rows[0].user_id, 1);
    assert.equal(rows[0].tool_name, DUCKDUCKGO_TOOL_NAME);
    assert.deepEqual(JSON.parse(rows[0].data), {
      enabledForChat: false,
      pageSize: 1,
      safeSearch: 'off',
      requestDelayMs: 1500,
      cooldownAfter202Ms: 0,
    });
    db.close();
  });

  await it('loads older persisted DuckDuckGo JSON with effective pacing defaults', async () => {
    const { db, service } = setup();
    db.prepare(
      `INSERT INTO tool_settings (user_id, tool_name, created_at, updated_at, data)
       VALUES (?, ?, ?, ?, ?)`,
    ).run(
      1,
      DUCKDUCKGO_TOOL_NAME,
      1,
      1,
      JSON.stringify({ enabledForChat: true, pageSize: 4, safeSearch: 'moderate' }),
    );
    assert.deepEqual(await service.getSettings(DUCKDUCKGO_TOOL_NAME), {
      enabledForChat: true,
      pageSize: 4,
      safeSearch: 'moderate',
      requestDelayMs: 1500,
      cooldownAfter202Ms: 8000,
    });
    db.close();
  });

  await it('lists Visit Website defaults and persists its UserId 1 settings', async () => {
    const { db, service } = setup();
    const tools = await service.listTools();
    assert.equal(tools[1].name, VISIT_WEBSITE_TOOL_NAME);
    assert.deepEqual(tools[1].settings, DEFAULT_VISIT_WEBSITE_SETTINGS);
    const updated = {
      enabledForChat: true,
      contentLimit: 10_000,
      maxLinks: 40,
      maxImages: 20,
    };
    assert.deepEqual(await service.updateSettings(VISIT_WEBSITE_TOOL_NAME, updated), updated);
    const row = db.prepare('SELECT user_id, data FROM tool_settings WHERE tool_name = ?').get(
      VISIT_WEBSITE_TOOL_NAME,
    ) as { user_id: number; data: string };
    assert.equal(row.user_id, 1);
    assert.deepEqual(JSON.parse(row.data), updated);
    db.close();
  });

  await it('rejects invalid settings and unregistered tools', async () => {
    const { db, service } = setup();
    await assert.rejects(
      () => service.updateSettings(DUCKDUCKGO_TOOL_NAME, { enabledForChat: true }),
      (error: unknown) => error instanceof ToolSettingsError && error.code === 'INVALID_SETTINGS',
    );
    await assert.rejects(
      () => service.updateSettings(VISIT_WEBSITE_TOOL_NAME, {
        enabledForChat: true,
        contentLimit: 199,
        maxLinks: 10,
        maxImages: 5,
      }),
      (error: unknown) => error instanceof ToolSettingsError && error.code === 'INVALID_SETTINGS',
    );
    await assert.rejects(
      () => service.getSettings('arbitrary_fetch'),
      (error: unknown) => error instanceof ToolSettingsError && error.code === 'UNKNOWN_TOOL',
    );
    db.close();
  });
});
