import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { createTestDatabase } from '../../src/server/database.js';
import { ModelConnectionRepository } from '../../src/server/repositories/model-connection-repository.js';
import {
  ModelConnectionService,
  ModelDescriptionError,
  ModelVisibilityError,
} from '../../src/server/services/model-connection-service.js';

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

  it('applies exact per-connection visibility semantics and validates explicit writes', async (t) => {
    let providerModels = ['model-b', 'Model/A', 'model-b', ' exact/model ', '', '   '];
    let providerUnavailable = false;
    let discoveryRequests = 0;
    const provider = createServer((_request, response) => {
      discoveryRequests += 1;
      if (providerUnavailable) {
        response.writeHead(503);
        response.end();
        return;
      }
      response.writeHead(200, { 'Content-Type': 'application/json' });
      response.end(JSON.stringify({ data: providerModels.map((id) => ({ id })) }));
    });
    await new Promise<void>((resolve) => provider.listen(0, '127.0.0.1', resolve));
    t.after(() => new Promise<void>((resolve) => provider.close(() => resolve())));
    const address = provider.address();
    assert.ok(address && typeof address !== 'string');
    const { db, service } = createService();
    const first = await service.createConnection({
      ...BASE_INPUT,
      baseUrl: `http://127.0.0.1:${address.port}`,
    });
    const second = await service.createConnection({
      ...BASE_INPUT,
      name: 'Second',
      baseUrl: `http://127.0.0.1:${address.port}`,
    });

    assert.deepEqual(await service.updateModelDescriptions(first.id, {
      modelDescriptions: {
        'Model/A': '  Primary coding model  ',
        'model-b': 'Secondary model',
      },
    }), {
      connectionId: first.id,
      modelDescriptions: {
        'Model/A': 'Primary coding model',
        'model-b': 'Secondary model',
      },
    });
    assert.deepEqual(await service.updateModelDescriptions(second.id, {
      modelDescriptions: { 'Model/A': 'Independent description' },
    }), {
      connectionId: second.id,
      modelDescriptions: { 'Model/A': 'Independent description' },
    });
    assert.deepEqual(await service.discoverEffectiveModels(first.id), [
      { id: ' exact/model ', description: null },
      { id: 'model-b', description: 'Secondary model' },
      { id: 'Model/A', description: 'Primary coding model' },
    ]);

    assert.deepEqual(await service.discoverModels(first.id), [
      ' exact/model ',
      'model-b',
      'Model/A',
    ]);
    assert.deepEqual(await service.updateModelVisibility(first.id, {
      filterConfigured: true,
      visibleModelIds: [' exact/model '],
    }), {
      connectionId: first.id,
      filterConfigured: true,
      visibleModelIds: [' exact/model '],
    });
    assert.equal(await service.isModelVisible(first.id, ' exact/model '), true);
    assert.equal(await service.isModelVisible(first.id, 'exact/model'), false);
    assert.deepEqual(await service.updateModelVisibility(first.id, {
      filterConfigured: true,
      visibleModelIds: ['Model/A'],
    }), {
      connectionId: first.id,
      filterConfigured: true,
      visibleModelIds: ['Model/A'],
    });
    assert.deepEqual(await service.discoverModels(first.id), ['Model/A']);
    assert.deepEqual(await service.discoverEffectiveModels(first.id), [
      { id: 'Model/A', description: 'Primary coding model' },
    ]);
    assert.deepEqual(await service.discoverModels(second.id), [
      ' exact/model ',
      'model-b',
      'Model/A',
    ]);

    providerUnavailable = true;
    const requestCount = discoveryRequests;
    assert.equal(await service.isModelVisible(first.id, 'hidden-model'), false);
    assert.equal(discoveryRequests, requestCount);
    await assert.rejects(service.isModelVisible(first.id, 'Model/A'), /Model discovery failed/);
    providerUnavailable = false;

    providerModels = ['model-b', 'Model/A', 'new-model'];
    assert.deepEqual(await service.discoverModels(first.id), ['Model/A']);
    assert.deepEqual(await service.discoverModels(second.id), ['model-b', 'Model/A', 'new-model']);
    assert.deepEqual((await service.getConnectionById(first.id))?.data.modelDescriptions, {
      'Model/A': 'Primary coding model',
      'model-b': 'Secondary model',
    });
    await assert.rejects(
      service.updateModelDescriptions(first.id, {
        modelDescriptions: { 'Model/A': 'x'.repeat(501) },
      }),
      (error: unknown) => error instanceof ModelDescriptionError && error.code === 'INVALID_INPUT',
    );
    await assert.rejects(
      service.updateModelDescriptions(first.id, {
        modelDescriptions: { 'never-reported': 'Injected' },
      }),
      (error: unknown) =>
        error instanceof ModelDescriptionError && error.code === 'MODEL_NOT_AVAILABLE',
    );
    await assert.rejects(
      service.updateModelVisibility(first.id, {
        filterConfigured: true,
        visibleModelIds: ['Model/A', 'Model/A'],
      }),
      (error: unknown) => error instanceof ModelVisibilityError && error.code === 'INVALID_INPUT',
    );
    await assert.rejects(
      service.updateModelVisibility(first.id, {
        filterConfigured: true,
        visibleModelIds: ['never-reported'],
      }),
      (error: unknown) =>
        error instanceof ModelVisibilityError && error.code === 'MODEL_NOT_AVAILABLE',
    );

    providerModels = [];
    assert.deepEqual(await service.discoverModels(first.id), []);
    assert.deepEqual(await service.updateModelVisibility(first.id, {
      filterConfigured: true,
      visibleModelIds: ['Model/A'],
    }), {
      connectionId: first.id,
      filterConfigured: true,
      visibleModelIds: ['Model/A'],
    });
    assert.deepEqual(await service.getModelVisibility(first.id), {
      connectionId: first.id,
      filterConfigured: true,
      visibleModelIds: ['Model/A'],
      discoveredModels: [],
      modelDescriptions: {
        'Model/A': 'Primary coding model',
        'model-b': 'Secondary model',
      },
    });
    providerModels = ['Model/A'];
    assert.deepEqual(await service.discoverEffectiveModels(first.id), [
      { id: 'Model/A', description: 'Primary coding model' },
    ]);
    providerModels = [];
    assert.deepEqual(await service.updateModelDescriptions(first.id, {
      modelDescriptions: { 'Model/A': '   ', 'model-b': '' },
    }), { connectionId: first.id, modelDescriptions: {} });
    assert.deepEqual((await service.getConnectionById(first.id))?.data.visibleModelIds, ['Model/A']);
    assert.deepEqual(await service.updateModelVisibility(first.id, {
      filterConfigured: true,
      visibleModelIds: [],
    }), {
      connectionId: first.id,
      filterConfigured: true,
      visibleModelIds: [],
    });
    assert.deepEqual(await service.discoverModels(first.id), []);
    assert.deepEqual(await service.updateModelVisibility(first.id, {
      filterConfigured: false,
      visibleModelIds: [],
    }), {
      connectionId: first.id,
      filterConfigured: false,
      visibleModelIds: [],
    });

    db.close();
  });
});
