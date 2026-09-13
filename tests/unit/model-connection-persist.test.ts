import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { ModelConnectionRepository } from '../../src/server/repositories/model-connection-repository.js';
import { createTestDatabase } from '../../src/server/database.js';

function createTestDb() {
  return createTestDatabase();
}

await describe('ModelConnectionRepository', () => {
  let repo: ModelConnectionRepository;

  beforeEach(() => {
    const db = createTestDb();
    repo = new ModelConnectionRepository(db);
  });

  it('should create a connection with user_id = 1', async () => {
    const connection = await repo.create(1, {
      name: 'Test Connection',
      baseUrl: 'http://localhost:1234',
      timeoutMinutes: 30,
      modelId: null,
      enabled: true,
    });

    assert.strictEqual(connection.userId, 1);
    assert.strictEqual(connection.data.name, 'Test Connection');
    assert.strictEqual(connection.data.baseUrl, 'http://localhost:1234');
    assert.strictEqual(connection.data.timeoutMinutes, 30);
    assert.strictEqual(connection.data.modelId, null);
    assert.strictEqual(connection.data.enabled, true);
    assert.ok(connection.id > 0);
    assert.ok(connection.createdAt > 0);
    assert.ok(connection.updatedAt > 0);
  });

  it('should store data as valid JSON', async () => {
    const db = createTestDb();
    const testRepo = new ModelConnectionRepository(db);

    await testRepo.create(1, {
      name: 'JSON Test',
      baseUrl: 'http://localhost:1234',
      timeoutMinutes: 15,
      modelId: 'some-model',
      enabled: true,
    });

    const row = db
      .prepare('SELECT data FROM model_connections WHERE id = 1')
      .get() as { data: string };

    assert.ok(row);
    const parsed = JSON.parse(row.data);
    assert.strictEqual(parsed.name, 'JSON Test');
    assert.strictEqual(parsed.baseUrl, 'http://localhost:1234');
    assert.strictEqual(parsed.timeoutMinutes, 15);
    assert.strictEqual(parsed.modelId, 'some-model');
    assert.strictEqual(parsed.enabled, true);
  });

  it('should persist connection properties correctly', async () => {
    await repo.create(1, {
      name: 'Persistent',
      baseUrl: 'http://example.com:8080',
      timeoutMinutes: 45,
      modelId: 'qwen/qwen3.6-27b',
      enabled: false,
    });

    const connections = await repo.listByUserId(1);

    assert.strictEqual(connections.length, 1);
    assert.strictEqual(connections[0].data.name, 'Persistent');
    assert.strictEqual(connections[0].data.baseUrl, 'http://example.com:8080');
    assert.strictEqual(connections[0].data.timeoutMinutes, 45);
    assert.strictEqual(connections[0].data.modelId, 'qwen/qwen3.6-27b');
    assert.strictEqual(connections[0].data.enabled, false);
  });

  it('should not persist API key', async () => {
    const db = createTestDb();
    const testRepo = new ModelConnectionRepository(db);

    await testRepo.create(1, {
      name: 'NoApiKey',
      baseUrl: 'http://localhost:1234',
      timeoutMinutes: 30,
      modelId: null,
      enabled: true,
    });

    const row = db
      .prepare('SELECT data FROM model_connections WHERE id = 1')
      .get() as { data: string };

    const parsed = JSON.parse(row.data);
    assert.strictEqual(parsed.apiKey, undefined);
    assert.ok(!row.data.includes('apiKey'));
  });

  it('should list only UserId 1 records', async () => {
    const db = createTestDb();
    const testRepo = new ModelConnectionRepository(db);

    await testRepo.create(1, {
      name: 'User1 Conn',
      baseUrl: 'http://localhost:1234',
      timeoutMinutes: 30,
      modelId: null,
      enabled: true,
    });

    await testRepo.create(2, {
      name: 'User2 Conn',
      baseUrl: 'http://localhost:5678',
      timeoutMinutes: 30,
      modelId: null,
      enabled: true,
    });

    const user1Connections = await testRepo.listByUserId(1);
    const user2Connections = await testRepo.listByUserId(2);

    assert.strictEqual(user1Connections.length, 1);
    assert.strictEqual(user1Connections[0].data.name, 'User1 Conn');

    assert.strictEqual(user2Connections.length, 1);
    assert.strictEqual(user2Connections[0].data.name, 'User2 Conn');
  });

  it('should get by id scoped to UserId 1', async () => {
    const db = createTestDb();
    const testRepo = new ModelConnectionRepository(db);

    const conn1 = await testRepo.create(1, {
      name: 'User1 Conn',
      baseUrl: 'http://localhost:1234',
      timeoutMinutes: 30,
      modelId: null,
      enabled: true,
    });

    const conn2 = await testRepo.create(2, {
      name: 'User2 Conn',
      baseUrl: 'http://localhost:5678',
      timeoutMinutes: 30,
      modelId: null,
      enabled: true,
    });

    const found = await testRepo.getById(1, conn1.id);
    assert.ok(found);
    assert.strictEqual(found.data.name, 'User1 Conn');

    const notFound = await testRepo.getById(1, conn2.id);
    assert.strictEqual(notFound, null);
  });

  it('should return null for non-existent connection', async () => {
    const result = await repo.getById(1, 9999);
    assert.strictEqual(result, null);
  });

  it('should return empty list for user with no connections', async () => {
    const connections = await repo.listByUserId(1);
    assert.strictEqual(connections.length, 0);
  });

  it('should use default timeout when not specified', async () => {
    const connection = await repo.create(1, {
      name: 'Default Timeout',
      baseUrl: 'http://localhost:1234',
      timeoutMinutes: 30,
      modelId: null,
      enabled: true,
    });

    assert.strictEqual(connection.data.timeoutMinutes, 30);
  });

  it('should use default enabled when not specified', async () => {
    const connection = await repo.create(1, {
      name: 'Default Enabled',
      baseUrl: 'http://localhost:1234',
      timeoutMinutes: 30,
      modelId: null,
      enabled: true,
    });

    assert.strictEqual(connection.data.enabled, true);
  });

  it('should handle nullable modelId', async () => {
    const connection = await repo.create(1, {
      name: 'Nullable Model',
      baseUrl: 'http://localhost:1234',
      timeoutMinutes: 30,
      modelId: null,
      enabled: true,
    });

    assert.strictEqual(connection.data.modelId, null);
  });

  it('should handle non-null modelId', async () => {
    const connection = await repo.create(1, {
      name: 'With Model',
      baseUrl: 'http://localhost:1234',
      timeoutMinutes: 30,
      modelId: 'qwen/qwen3.6-27b',
      enabled: true,
    });

    assert.strictEqual(connection.data.modelId, 'qwen/qwen3.6-27b');
  });

  it('should update an existing connection for UserId 1', async () => {
    const created = await repo.create(1, {
      name: 'Original',
      baseUrl: 'http://localhost:1234',
      timeoutMinutes: 30,
      modelId: null,
      enabled: true,
    });

    const updated = await repo.update(1, created.id, {
      name: 'Updated',
      baseUrl: 'http://example.com:8080',
      timeoutMinutes: 15,
      modelId: 'some-model',
      enabled: false,
    });

    assert.ok(updated);
    assert.strictEqual(updated.id, created.id);
    assert.strictEqual(updated.userId, 1);
    assert.strictEqual(updated.data.name, 'Updated');
    assert.strictEqual(updated.data.baseUrl, 'http://example.com:8080');
    assert.strictEqual(updated.data.timeoutMinutes, 15);
    assert.strictEqual(updated.data.modelId, 'some-model');
    assert.strictEqual(updated.data.enabled, false);
  });

  it('should update the stored JSON data', async () => {
    const db = createTestDb();
    const testRepo = new ModelConnectionRepository(db);

    const created = await testRepo.create(1, {
      name: 'JSON Original',
      baseUrl: 'http://localhost:1234',
      timeoutMinutes: 30,
      modelId: null,
      enabled: true,
    });

    await testRepo.update(1, created.id, {
      name: 'JSON Updated',
      baseUrl: 'http://updated.example',
      timeoutMinutes: 5,
      modelId: 'updated-model',
      enabled: false,
    });

    const row = db
      .prepare('SELECT data FROM model_connections WHERE id = ?')
      .get(created.id) as { data: string };

    const parsed = JSON.parse(row.data);
    assert.strictEqual(parsed.name, 'JSON Updated');
    assert.strictEqual(parsed.baseUrl, 'http://updated.example');
    assert.strictEqual(parsed.timeoutMinutes, 5);
    assert.strictEqual(parsed.modelId, 'updated-model');
    assert.strictEqual(parsed.enabled, false);
  });

  it('should not change created_at when updating', async () => {
    const created = await repo.create(1, {
      name: 'Timestamp Test',
      baseUrl: 'http://localhost:1234',
      timeoutMinutes: 30,
      modelId: null,
      enabled: true,
    });

    const updated = await repo.update(1, created.id, {
      name: 'Timestamp Test Updated',
      baseUrl: 'http://localhost:5678',
      timeoutMinutes: 20,
      modelId: null,
      enabled: true,
    });

    assert.ok(updated);
    assert.strictEqual(updated.createdAt, created.createdAt);
  });

  it('should change updated_at when updating', async () => {
    const db = createTestDb();
    const testRepo = new ModelConnectionRepository(db);

    const created = await testRepo.create(1, {
      name: 'UpdatedAt Test',
      baseUrl: 'http://localhost:1234',
      timeoutMinutes: 30,
      modelId: null,
      enabled: true,
    });

    // Simulate an older update time so the change is deterministic.
    db.prepare('UPDATE model_connections SET updated_at = 1 WHERE id = ?').run(created.id);

    const updated = await testRepo.update(1, created.id, {
      name: 'UpdatedAt Test',
      baseUrl: 'http://localhost:9999',
      timeoutMinutes: 30,
      modelId: null,
      enabled: true,
    });

    assert.ok(updated);
    assert.strictEqual(updated.createdAt, created.createdAt);
    assert.ok(updated.updatedAt > 1);
  });

  it('should not update another user\'s connection through UserId 1', async () => {
    const db = createTestDb();
    const testRepo = new ModelConnectionRepository(db);

    const otherConnection = await testRepo.create(2, {
      name: 'Other User Conn',
      baseUrl: 'http://localhost:5678',
      timeoutMinutes: 30,
      modelId: null,
      enabled: true,
    });

    const result = await testRepo.update(1, otherConnection.id, {
      name: 'Hijack Attempt',
      baseUrl: 'http://hijacked.example',
      timeoutMinutes: 5,
      modelId: 'hijack-model',
      enabled: false,
    });

    assert.strictEqual(result, null);

    const row = db
      .prepare('SELECT data, user_id FROM model_connections WHERE id = ?')
      .get(otherConnection.id) as { data: string; user_id: number };

    const parsed = JSON.parse(row.data);
    assert.strictEqual(parsed.name, 'Other User Conn');
    assert.strictEqual(parsed.baseUrl, 'http://localhost:5678');
    assert.strictEqual(row.user_id, 2);
  });

  it('should return null when updating a non-existent connection', async () => {
    const result = await repo.update(1, 9999, {
      name: 'Ghost',
      baseUrl: 'http://localhost:1234',
      timeoutMinutes: 30,
      modelId: null,
      enabled: true,
    });

    assert.strictEqual(result, null);
  });

  it('should not create a duplicate row when updating', async () => {
    const db = createTestDb();
    const testRepo = new ModelConnectionRepository(db);

    const created = await testRepo.create(1, {
      name: 'No Duplicate',
      baseUrl: 'http://localhost:1234',
      timeoutMinutes: 30,
      modelId: null,
      enabled: true,
    });

    const countBefore = (
      db.prepare('SELECT COUNT(*) AS count FROM model_connections').get() as { count: number }
    ).count;

    const updated = await testRepo.update(1, created.id, {
      name: 'No Duplicate Updated',
      baseUrl: 'http://localhost:4321',
      timeoutMinutes: 10,
      modelId: 'dupe-model',
      enabled: true,
    });

    assert.ok(updated);
    assert.strictEqual(updated.id, created.id);

    const countAfter = (
      db.prepare('SELECT COUNT(*) AS count FROM model_connections').get() as { count: number }
    ).count;

    assert.strictEqual(countAfter, countBefore);
  });

  it('should delete a UserId 1 connection', async () => {
    const connection = await repo.create(1, {
      name: 'Delete Target',
      baseUrl: 'http://localhost:1234',
      timeoutMinutes: 30,
      modelId: null,
      enabled: true,
    });

    const deleted = await repo.delete(1, connection.id);

    assert.strictEqual(deleted, true);
    assert.strictEqual(await repo.getById(1, connection.id), null);
  });

  it('should not delete another user\'s connection', async () => {
    const connection = await repo.create(2, {
      name: 'Other User Delete Target',
      baseUrl: 'http://localhost:5678',
      timeoutMinutes: 30,
      modelId: null,
      enabled: true,
    });

    const deleted = await repo.delete(1, connection.id);

    assert.strictEqual(deleted, false);
    assert.ok(await repo.getById(2, connection.id));
  });

  it('should return not found when deleting an unknown id', async () => {
    assert.strictEqual(await repo.delete(1, 9999), false);
  });

  it('defaults legacy records to unfiltered and persists scoped explicit filters across reloads', async () => {
    const db = createTestDb();
    db.prepare(
      'INSERT INTO model_connections (user_id, created_at, updated_at, data) VALUES (1, 1, 1, ?)',
    ).run(
      JSON.stringify({
        name: 'Legacy',
        baseUrl: 'http://legacy.test',
        timeoutMinutes: 30,
        modelId: null,
        enabled: true,
      }),
    );
    const repository = new ModelConnectionRepository(db);
    const legacy = (await repository.listByUserId(1))[0];
    assert.equal(legacy.data.filterConfigured, false);
    assert.deepEqual(legacy.data.visibleModelIds, []);
    assert.deepEqual(legacy.data.modelDescriptions, {});

    const other = await repository.create(1, {
      name: 'Other',
      baseUrl: 'http://other.test',
      timeoutMinutes: 30,
      modelId: null,
      enabled: true,
    });
    const credential = { ciphertext: 'cipher', iv: 'iv', authTag: 'tag' };
    const filtered = await repository.create(
      1,
      {
        name: 'Filtered',
        baseUrl: 'http://filtered.test',
        timeoutMinutes: 30,
        modelId: null,
        enabled: true,
      },
      credential,
    );
    await repository.updateModelVisibility(1, filtered.id, true, ['Model/A', 'model-b']);
    await repository.updateModelDescriptions(1, filtered.id, {
      'Model/A': 'Primary model',
      'model-b': 'Secondary model',
    });
    await repository.updateModelDescriptions(1, other.id, { 'Model/A': 'Other connection' });
    const reloadedRepository = new ModelConnectionRepository(db);
    const reloaded = await reloadedRepository.getById(1, filtered.id);
    assert.equal(reloaded?.data.filterConfigured, true);
    assert.deepEqual(reloaded?.data.visibleModelIds, ['Model/A', 'model-b']);
    assert.deepEqual(reloaded?.data.modelDescriptions, {
      'Model/A': 'Primary model',
      'model-b': 'Secondary model',
    });
    assert.equal((await reloadedRepository.getById(1, other.id))?.data.filterConfigured, false);
    assert.deepEqual((await reloadedRepository.getById(1, other.id))?.data.modelDescriptions, {
      'Model/A': 'Other connection',
    });
    assert.deepEqual(await reloadedRepository.getCredential(1, filtered.id), credential);

    await reloadedRepository.update(1, filtered.id, {
      name: 'Filtered renamed',
      baseUrl: 'http://filtered.test',
      timeoutMinutes: 15,
      modelId: null,
      enabled: true,
    });
    assert.deepEqual(
      (await reloadedRepository.getById(1, filtered.id))?.data.visibleModelIds,
      ['Model/A', 'model-b'],
    );
    assert.deepEqual(
      (await reloadedRepository.getById(1, filtered.id))?.data.modelDescriptions,
      { 'Model/A': 'Primary model', 'model-b': 'Secondary model' },
    );
    await reloadedRepository.updateModelDescriptions(1, filtered.id, {});
    assert.deepEqual(
      (await new ModelConnectionRepository(db).getById(1, filtered.id))?.data.modelDescriptions,
      {},
    );
    assert.deepEqual(await reloadedRepository.getCredential(1, filtered.id), credential);
    db.close();
  });
});
