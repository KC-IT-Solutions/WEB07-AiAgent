import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createTestDatabase } from '../../src/server/database.js';
import { ChatSettingsRepository } from '../../src/server/repositories/chat-settings-repository.js';
import {
  ChatSettingsError,
  ChatSettingsService,
} from '../../src/server/services/chat-settings-service.js';
import type { ModelConnection } from '../../src/server/model-connection-types.js';

function connection(id: number, userId = 1, enabled = true): ModelConnection {
  return {
    id,
    userId,
    createdAt: 1,
    updatedAt: 1,
    hasApiKey: false,
    data: {
      name: 'Connection',
      baseUrl: 'http://model.test',
      timeoutMinutes: 1,
      modelId: null,
      enabled,
      filterConfigured: false,
      visibleModelIds: [],
      modelDescriptions: {},
    },
  };
}

await describe('ChatSettingsService', async () => {
  await it('starts nullable and persists settings by user', async () => {
    const db = createTestDatabase();
    const repository = new ChatSettingsRepository(db);
    const service = new ChatSettingsService(repository, {
      getConnectionById: async (id) => (id === 3 ? connection(3) : null),
      discoverModels: async () => ['qwen/model'],
    });
    assert.deepEqual(await service.getSettings(), {
      defaultModelConnectionId: null,
      defaultModelId: null,
      showReasoning: false,
      showToolCalls: false,
    });
    assert.deepEqual(
      await service.updateSettings({ defaultModelConnectionId: 3, defaultModelId: 'qwen/model', showReasoning: true, showToolCalls: true }),
      { defaultModelConnectionId: 3, defaultModelId: 'qwen/model', showReasoning: true, showToolCalls: true },
    );
    await repository.upsert(2, { defaultModelConnectionId: 9, defaultModelId: 'other/model', showReasoning: false, showToolCalls: true });
    assert.equal((await repository.get(1))?.data.defaultModelConnectionId, 3);
    assert.equal((await repository.get(2))?.data.defaultModelConnectionId, 9);
    db.close();
  });

  await it('rejects missing, non-owned, disabled connections and unavailable models', async () => {
    for (const candidate of [null, connection(4, 2), connection(4, 1, false)]) {
      const db = createTestDatabase();
      const service = new ChatSettingsService(new ChatSettingsRepository(db), {
        getConnectionById: async () => candidate,
        discoverModels: async () => ['valid/model'],
      });
      await assert.rejects(
        () => service.updateSettings({ defaultModelConnectionId: 4, defaultModelId: null, showReasoning: false, showToolCalls: false }),
        ChatSettingsError,
      );
      db.close();
    }
    const db = createTestDatabase();
    const service = new ChatSettingsService(new ChatSettingsRepository(db), {
      getConnectionById: async () => connection(4),
      discoverModels: async () => ['valid/model'],
    });
    await assert.rejects(
      () => service.updateSettings({ defaultModelConnectionId: 4, defaultModelId: 'wrong', showReasoning: false, showToolCalls: false }),
      (error: unknown) => error instanceof ChatSettingsError && error.code === 'INVALID_MODEL',
    );
    await assert.rejects(
      () => service.updateSettings({ defaultModelConnectionId: null, defaultModelId: 'orphan', showReasoning: false, showToolCalls: false }),
      ChatSettingsError,
    );
    db.close();
  });

  await it('allows a connection-only default and clears its model when saved as null', async () => {
    const db = createTestDatabase();
    const service = new ChatSettingsService(new ChatSettingsRepository(db), {
      getConnectionById: async (id) => connection(id),
      discoverModels: async () => ['first/model'],
    });
    await service.updateSettings({ defaultModelConnectionId: 1, defaultModelId: 'first/model', showReasoning: true, showToolCalls: false });
    assert.deepEqual(
      await service.updateSettings({ defaultModelConnectionId: 2, defaultModelId: null, showReasoning: true, showToolCalls: false }),
      { defaultModelConnectionId: 2, defaultModelId: null, showReasoning: true, showToolCalls: false },
    );
    db.close();
  });

  await it('defaults historical display settings and rejects invalid stored values', async () => {
    const db = createTestDatabase();
    const repository = new ChatSettingsRepository(db);
    db.prepare(
      'INSERT INTO chat_settings (user_id, created_at, updated_at, data) VALUES (?, ?, ?, ?)',
    ).run(
      1,
      1,
      1,
      JSON.stringify({ defaultModelConnectionId: null, defaultModelId: null }),
    );
    assert.deepEqual((await repository.get(1))?.data, {
      defaultModelConnectionId: null,
      defaultModelId: null,
      showReasoning: false,
      showToolCalls: false,
    });
    db.prepare('UPDATE chat_settings SET data = ? WHERE user_id = 1').run(
      JSON.stringify({
        defaultModelConnectionId: null,
        defaultModelId: null,
        showReasoning: 'yes',
        showToolCalls: false,
      }),
    );
    await assert.rejects(repository.get(1), /Invalid chat display settings/);
    db.close();
  });
});
