import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createTestDatabase } from '../../src/server/database.js';
import { ModelConnectionRepository } from '../../src/server/repositories/model-connection-repository.js';
import { ModelConnectionService } from '../../src/server/services/model-connection-service.js';

function createService() {
  const db = createTestDatabase();
  return {
    db,
    service: new ModelConnectionService(new ModelConnectionRepository(db)),
  };
}

const BASE_INPUT = {
  name: 'Service Connection',
  baseUrl: 'http://localhost:1234',
  timeoutMinutes: 30,
  modelId: null,
  enabled: true,
} as const;

await describe('ModelConnectionService', () => {
  it('creates a connection for UserId 1', async () => {
    const { db, service } = createService();

    const connection = await service.createConnection({ ...BASE_INPUT });

    assert.strictEqual(connection.userId, 1);
    assert.strictEqual(connection.data.name, 'Service Connection');
    assert.strictEqual(connection.data.baseUrl, 'http://localhost:1234');
    assert.ok(connection.id > 0);

    const row = db
      .prepare('SELECT user_id FROM model_connections WHERE id = ?')
      .get(connection.id) as { user_id: number };
    assert.strictEqual(row.user_id, 1);

    db.close();
  });

  it('lists only UserId 1 connections', async () => {
    const { db, service } = createService();
    const repository = new ModelConnectionRepository(db);

    await service.createConnection({ ...BASE_INPUT });

    // Simulate a connection owned by another user.
    await repository.create(2, {
      ...BASE_INPUT,
      name: 'Other User Connection',
    });

    const connections = await service.listConnections();

    assert.strictEqual(connections.length, 1);
    assert.strictEqual(connections[0].userId, 1);
    assert.strictEqual(connections[0].data.name, 'Service Connection');

    db.close();
  });

  it('gets a connection by id scoped to UserId 1', async () => {
    const { db, service } = createService();
    const repository = new ModelConnectionRepository(db);

    const ownConnection = await service.createConnection({ ...BASE_INPUT });

    const otherConnection = await repository.create(2, {
      ...BASE_INPUT,
      name: 'Other User Connection',
    });

    const found = await service.getConnectionById(ownConnection.id);
    assert.ok(found);
    assert.strictEqual(found.data.name, 'Service Connection');

    const notFound = await service.getConnectionById(otherConnection.id);
    assert.strictEqual(notFound, null);

    db.close();
  });

  it('returns null for a non-existent connection id', async () => {
    const { db, service } = createService();

    const result = await service.getConnectionById(9999);

    assert.strictEqual(result, null);

    db.close();
  });

  it('does not persist an API key', async () => {
    const { db, service } = createService();

    await service.createConnection({ ...BASE_INPUT });

    const row = db.prepare('SELECT data FROM model_connections LIMIT 1').get() as { data: string };

    assert.ok(!row.data.includes('apiKey'));

    db.close();
  });

  it('updates a connection scoped to UserId 1', async () => {
    const { db, service } = createService();

    const created = await service.createConnection({ ...BASE_INPUT });

    const updated = await service.updateConnection(created.id, {
      ...BASE_INPUT,
      name: 'Updated Service Connection',
      baseUrl: 'http://updated.example',
      timeoutMinutes: 15,
      modelId: 'updated-model',
      enabled: false,
    });

    assert.ok(updated);
    assert.strictEqual(updated.id, created.id);
    assert.strictEqual(updated.userId, 1);
    assert.strictEqual(updated.data.name, 'Updated Service Connection');
    assert.strictEqual(updated.data.baseUrl, 'http://updated.example');
    assert.strictEqual(updated.data.timeoutMinutes, 15);
    assert.strictEqual(updated.data.modelId, 'updated-model');
    assert.strictEqual(updated.data.enabled, false);

    db.close();
  });

  it('does not update another user\'s connection', async () => {
    const { db, service } = createService();
    const repository = new ModelConnectionRepository(db);

    const otherConnection = await repository.create(2, {
      ...BASE_INPUT,
      name: 'Other User Connection',
    });

    const result = await service.updateConnection(otherConnection.id, {
      ...BASE_INPUT,
      name: 'Hijack Attempt',
    });

    assert.strictEqual(result, null);

    const row = db
      .prepare('SELECT data FROM model_connections WHERE id = ?')
      .get(otherConnection.id) as { data: string };
    assert.strictEqual(JSON.parse(row.data).name, 'Other User Connection');

    db.close();
  });

  it('preserves created_at when updating', async () => {
    const { db, service } = createService();

    const created = await service.createConnection({ ...BASE_INPUT });

    const updated = await service.updateConnection(created.id, {
      ...BASE_INPUT,
      name: 'Renamed',
    });

    assert.ok(updated);
    assert.strictEqual(updated.createdAt, created.createdAt);

    db.close();
  });

  it('changes updated_at when updating', async () => {
    const { db, service } = createService();

    const created = await service.createConnection({ ...BASE_INPUT });

    // Simulate an older update time so the change is deterministic.
    db.prepare('UPDATE model_connections SET updated_at = 1 WHERE id = ?').run(created.id);

    const updated = await service.updateConnection(created.id, {
      ...BASE_INPUT,
      baseUrl: 'http://fresh.example',
    });

    assert.ok(updated);
    assert.strictEqual(updated.createdAt, created.createdAt);
    assert.ok(updated.updatedAt > 1);

    db.close();
  });

  it('does not persist an API key when updating', async () => {
    const { db, service } = createService();

    const created = await service.createConnection({ ...BASE_INPUT });

    await service.updateConnection(created.id, {
      ...BASE_INPUT,
      name: 'NoApiKey Update',
    });

    const row = db
      .prepare('SELECT data FROM model_connections WHERE id = ?')
      .get(created.id) as { data: string };

    assert.ok(!row.data.includes('apiKey'));

    db.close();
  });

  it('deletes connections scoped to UserId 1', async () => {
    const { db, service } = createService();
    const repository = new ModelConnectionRepository(db);
    const ownConnection = await service.createConnection({ ...BASE_INPUT });
    const otherConnection = await repository.create(2, {
      ...BASE_INPUT,
      name: 'Other User Delete Target',
    });

    assert.strictEqual(await service.deleteConnection(ownConnection.id), true);
    assert.strictEqual(await service.deleteConnection(otherConnection.id), false);
    assert.strictEqual(await repository.getById(1, ownConnection.id), null);
    assert.ok(await repository.getById(2, otherConnection.id));

    db.close();
  });
});
