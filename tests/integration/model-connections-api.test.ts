import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createServer, type Server } from 'node:http';
import { resolve, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { existsSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import Database from 'better-sqlite3';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

function findProjectRoot(startDir: string): string | null {
  let current = startDir;
  while (current !== dirname(current)) {
    if (existsSync(resolve(current, 'package.json'))) {
      return current;
    }
    current = dirname(current);
  }
  return null;
}

const projectRoot = findProjectRoot(__dirname);
assert.ok(projectRoot, 'Project root should be found');

// Use an isolated deterministic test database for this test process.
// Must be set before the server module is imported.
const testDbDir = mkdtempSync(`${tmpdir()}web07-model-connections-api-`);
process.env.DB_PATH = resolve(testDbDir, 'test.db');

const BASE_URL = 'http://localhost:3998';
const MODEL_SERVER_URL = 'http://localhost:3996';

interface ExpressLike {
  listen(port: number, callback: () => void): Server;
}

let httpServer: Server | null;
let modelServer: Server | null;
const modelServerPaths: string[] = [];

await describe('Model connections API', () => {
  before(async () => {
    modelServer = createServer((request, response) => {
      modelServerPaths.push(request.url ?? '');

      if (request.url === '/failure/v1/models') {
        response.writeHead(503, { 'Content-Type': 'application/json' });
        response.end(JSON.stringify({ error: 'Sensitive upstream detail' }));
        return;
      }

      response.writeHead(200, { 'Content-Type': 'application/json' });
      response.end(
        JSON.stringify({
          data: [{ id: 'model-z' }, { id: 'model-a' }, { id: 'model-z' }],
        }),
      );
    });
    modelServer.listen(3996);
    await new Promise<void>((resolveListening) => {
      modelServer!.once('listening', resolveListening);
    });

    const serverModule = await import(
      pathToFileURL(resolve(projectRoot, 'dist/server.js')).href
    );
    const candidate = serverModule.default || serverModule.app;

    if (candidate && typeof (candidate as ExpressLike).listen === 'function') {
      httpServer = (candidate as ExpressLike).listen(3998, () => {});
      await new Promise<void>((resolve) => {
        httpServer!.once('listening', () => {
          resolve();
        });
      });
    }
  });

  after(async () => {
    if (httpServer) {
      await new Promise<void>((resolve) => {
        httpServer!.close(() => {
          resolve();
        });
      });
    }
    if (modelServer) {
      await new Promise<void>((resolve) => {
        modelServer!.close(() => resolve());
      });
    }
  });

  describe('POST /api/model-connections', () => {
    it('should create a connection', async () => {
      const response = await fetch(BASE_URL + '/api/model-connections', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: 'Test Connection',
          baseUrl: 'http://localhost:1234',
          timeoutMinutes: 30,
          modelId: null,
          enabled: true,
        }),
      });

      assert.strictEqual(response.status, 201);

      const data = await response.json();
      assert.strictEqual(data.userId, 1);
      assert.strictEqual(data.data.name, 'Test Connection');
      assert.strictEqual(data.data.baseUrl, 'http://localhost:1234');
      assert.strictEqual(data.data.timeoutMinutes, 30);
      assert.strictEqual(data.data.enabled, true);
      assert.ok(data.id > 0);
    });

    it('should reject missing name', async () => {
      const response = await fetch(BASE_URL + '/api/model-connections', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          baseUrl: 'http://localhost:1234',
        }),
      });

      assert.strictEqual(response.status, 400);
    });

    it('should reject missing baseUrl', async () => {
      const response = await fetch(BASE_URL + '/api/model-connections', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: 'Test',
        }),
      });

      assert.strictEqual(response.status, 400);
    });

    it('should not accept userId from client', async () => {
      const response = await fetch(BASE_URL + '/api/model-connections', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: 'Hijack Attempt',
          baseUrl: 'http://localhost:1234',
          userId: 999,
        }),
      });

      assert.strictEqual(response.status, 201);

      const data = await response.json();
      assert.strictEqual(data.userId, 1);
    });

    it('should not persist API key', async () => {
      const response = await fetch(BASE_URL + '/api/model-connections', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: 'NoApiKey',
          baseUrl: 'http://localhost:1234',
          apiKey: 'secret-key-should-not-be-persisted',
        }),
      });

      assert.strictEqual(response.status, 201);

      const data = await response.json();
      assert.strictEqual(data.data.apiKey, undefined);
    });

    it('should use default timeout when not provided', async () => {
      const response = await fetch(BASE_URL + '/api/model-connections', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: 'Default Timeout',
          baseUrl: 'http://localhost:1234',
        }),
      });

      assert.strictEqual(response.status, 201);

      const data = await response.json();
      assert.strictEqual(data.data.timeoutMinutes, 30);
    });

    it('should use default enabled when not provided', async () => {
      const response = await fetch(BASE_URL + '/api/model-connections', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: 'Default Enabled',
          baseUrl: 'http://localhost:1234',
        }),
      });

      assert.strictEqual(response.status, 201);

      const data = await response.json();
      assert.strictEqual(data.data.enabled, true);
    });
  });

  describe('GET /api/model-connections', () => {
    it('should list connections', async () => {
      const response = await fetch(BASE_URL + '/api/model-connections');

      assert.strictEqual(response.status, 200);

      const data = await response.json();
      assert.ok(Array.isArray(data));
    });

    it('should return connections created in previous tests', async () => {
      const response = await fetch(BASE_URL + '/api/model-connections');

      assert.strictEqual(response.status, 200);

      const data = await response.json();
      assert.ok(data.length > 0);

      for (const conn of data) {
        assert.strictEqual(conn.userId, 1);
        assert.ok(conn.data);
        assert.ok(conn.data.name);
        assert.ok(conn.data.baseUrl);
      }
    });
  });

  describe('GET /api/model-connections/:id', () => {
    it('should get connection by id', async () => {
      const createResponse = await fetch(BASE_URL + '/api/model-connections', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: 'GetById Test',
          baseUrl: 'http://localhost:1234',
          timeoutMinutes: 10,
          modelId: 'test-model',
          enabled: true,
        }),
      });

      assert.strictEqual(createResponse.status, 201);

      const created = await createResponse.json();

      const getResponse = await fetch(
        BASE_URL + '/api/model-connections/' + created.id,
      );

      assert.strictEqual(getResponse.status, 200);

      const data = await getResponse.json();
      assert.strictEqual(data.id, created.id);
      assert.strictEqual(data.data.name, 'GetById Test');
      assert.strictEqual(data.data.modelId, 'test-model');
    });

    it('should return 404 for non-existent id', async () => {
      const response = await fetch(
        BASE_URL + '/api/model-connections/999999',
      );

      assert.strictEqual(response.status, 404);
    });

    it('should return 400 for invalid id', async () => {
      const response = await fetch(
        BASE_URL + '/api/model-connections/abc',
      );

      assert.strictEqual(response.status, 400);
    });

    it('should return 400 for negative id', async () => {
      const response = await fetch(
        BASE_URL + '/api/model-connections/-1',
      );

      assert.strictEqual(response.status, 400);
    });
  });

  describe('GET /api/model-connections/:id/models', () => {
    async function createDiscoveryConnection(baseUrl: string) {
      const response = await fetch(BASE_URL + '/api/model-connections', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: 'Discovery Connection',
          baseUrl,
          timeoutMinutes: 1,
        }),
      });
      assert.strictEqual(response.status, 201);
      return response.json();
    }

    it('returns deterministic discovered model IDs through the backend', async () => {
      const connection = await createDiscoveryConnection(MODEL_SERVER_URL);
      const previousRequestCount = modelServerPaths.length;

      const response = await fetch(
        `${BASE_URL}/api/model-connections/${connection.id}/models`,
      );

      assert.strictEqual(response.status, 200);
      assert.deepStrictEqual(await response.json(), { models: ['model-a', 'model-z'] });
      assert.strictEqual(modelServerPaths.length, previousRequestCount + 1);
      assert.strictEqual(modelServerPaths[modelServerPaths.length - 1], '/v1/models');
    });

    it('normalizes a trailing slash in the saved base URL', async () => {
      const connection = await createDiscoveryConnection(`${MODEL_SERVER_URL}///`);

      const response = await fetch(
        `${BASE_URL}/api/model-connections/${connection.id}/models`,
      );

      assert.strictEqual(response.status, 200);
      assert.strictEqual(modelServerPaths[modelServerPaths.length - 1], '/v1/models');
    });

    it('returns not found for unknown and wrong-user connections', async () => {
      const db = new Database(process.env.DB_PATH as string);
      const result = db
        .prepare(
          'INSERT INTO model_connections (user_id, created_at, updated_at, data) VALUES (?, ?, ?, ?)',
        )
        .run(
          2,
          1,
          1,
          JSON.stringify({
            name: 'Other User Discovery',
            baseUrl: MODEL_SERVER_URL,
            timeoutMinutes: 1,
            modelId: null,
            enabled: true,
          }),
        );
      db.close();

      const unknown = await fetch(`${BASE_URL}/api/model-connections/999999/models`);
      const wrongUser = await fetch(
        `${BASE_URL}/api/model-connections/${Number(result.lastInsertRowid)}/models`,
      );

      assert.strictEqual(unknown.status, 404);
      assert.strictEqual(wrongUser.status, 404);
    });

    it('returns a safe error when model discovery fails', async () => {
      const connection = await createDiscoveryConnection(`${MODEL_SERVER_URL}/failure`);

      const response = await fetch(
        `${BASE_URL}/api/model-connections/${connection.id}/models`,
      );
      const body = await response.json();

      assert.strictEqual(response.status, 502);
      assert.deepStrictEqual(body, { error: 'Failed to discover models' });
      assert.ok(!JSON.stringify(body).includes('Sensitive upstream detail'));
      assert.ok(!('stack' in body));
    });

    it('validates the connection id', async () => {
      const response = await fetch(`${BASE_URL}/api/model-connections/1.5/models`);

      assert.strictEqual(response.status, 400);
    });
  });

  describe('PUT /api/model-connections/:id', () => {
    async function createConnection(body: Record<string, unknown>) {
      const response = await fetch(BASE_URL + '/api/model-connections', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      assert.strictEqual(response.status, 201);
      return response.json();
    }

    function openTestDb() {
      return new Database(process.env.DB_PATH as string);
    }

    it('should update an existing connection', async () => {
      const created = await createConnection({
        name: 'Put Target',
        baseUrl: 'http://localhost:1234',
        timeoutMinutes: 30,
        modelId: null,
        enabled: true,
      });

      const response = await fetch(
        BASE_URL + '/api/model-connections/' + created.id,
        {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            name: 'Put Updated',
            baseUrl: 'http://updated.example',
            timeoutMinutes: 15,
            modelId: 'put-model',
            enabled: false,
          }),
        },
      );

      assert.strictEqual(response.status, 200);

      const data = await response.json();
      assert.strictEqual(data.id, created.id);
      assert.strictEqual(data.userId, 1);
      assert.strictEqual(data.createdAt, created.createdAt);
      assert.strictEqual(data.data.name, 'Put Updated');
      assert.strictEqual(data.data.baseUrl, 'http://updated.example');
      assert.strictEqual(data.data.timeoutMinutes, 15);
      assert.strictEqual(data.data.modelId, 'put-model');
      assert.strictEqual(data.data.enabled, false);
    });

    it('should change updated_at when updating', async () => {
      const created = await createConnection({
        name: 'Put Timestamp',
        baseUrl: 'http://localhost:1234',
      });

      const db = openTestDb();
      // Simulate an older update time so the change is deterministic.
      db.prepare('UPDATE model_connections SET updated_at = 1 WHERE id = ?').run(created.id);
      const originalCreatedAt = db
        .prepare('SELECT created_at FROM model_connections WHERE id = ?')
        .get(created.id) as { created_at: number };

      const response = await fetch(
        BASE_URL + '/api/model-connections/' + created.id,
        {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            name: 'Put Timestamp',
            baseUrl: 'http://fresh.example',
          }),
        },
      );

      assert.strictEqual(response.status, 200);
      const data = await response.json();
      assert.strictEqual(data.createdAt, originalCreatedAt.created_at);
      assert.ok(data.updatedAt > 1);
      db.close();
    });

    it('should not create a duplicate connection when updating', async () => {
      const created = await createConnection({
        name: 'Put No Dup',
        baseUrl: 'http://localhost:1234',
      });

      const listBefore = await (
        await fetch(BASE_URL + '/api/model-connections')
      ).json();

      const response = await fetch(
        BASE_URL + '/api/model-connections/' + created.id,
        {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            name: 'Put No Dup Updated',
            baseUrl: 'http://localhost:4321',
          }),
        },
      );

      assert.strictEqual(response.status, 200);

      const listAfter = await (
        await fetch(BASE_URL + '/api/model-connections')
      ).json();

      assert.strictEqual(listAfter.length, listBefore.length);
      assert.ok(
        listAfter.some(
          (conn: { id: number }) => conn.id === created.id,
        ),
      );
    });

    it('should return 404 for an unknown id', async () => {
      const response = await fetch(
        BASE_URL + '/api/model-connections/999999',
        {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            name: 'Ghost',
            baseUrl: 'http://localhost:1234',
          }),
        },
      );

      assert.strictEqual(response.status, 404);
    });

    it('should return 404 for another user\'s connection', async () => {
      const db = openTestDb();
      const result = db
        .prepare(
          'INSERT INTO model_connections (user_id, created_at, updated_at, data) VALUES (?, ?, ?, ?)',
        )
        .run(
          2,
          Math.floor(Date.now() / 1000),
          Math.floor(Date.now() / 1000),
          JSON.stringify({
            name: 'Other User Put',
            baseUrl: 'http://other.example',
            timeoutMinutes: 30,
            modelId: null,
            enabled: true,
          }),
        );
      const otherId = Number(result.lastInsertRowid);

      const response = await fetch(BASE_URL + '/api/model-connections/' + otherId, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: 'Hijack Attempt',
          baseUrl: 'http://hijacked.example',
        }),
      });

      assert.strictEqual(response.status, 404);

      const row = db
        .prepare('SELECT data, user_id FROM model_connections WHERE id = ?')
        .get(otherId) as { data: string; user_id: number };
      assert.strictEqual(JSON.parse(row.data).name, 'Other User Put');
      assert.strictEqual(row.user_id, 2);
      db.close();
    });

    it('should not accept userId from client', async () => {
      const created = await createConnection({
        name: 'Put UserId',
        baseUrl: 'http://localhost:1234',
      });

      const response = await fetch(
        BASE_URL + '/api/model-connections/' + created.id,
        {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            name: 'Put UserId',
            baseUrl: 'http://localhost:1234',
            userId: 999,
          }),
        },
      );

      assert.strictEqual(response.status, 200);

      const data = await response.json();
      assert.strictEqual(data.userId, 1);

      const db = openTestDb();
      const row = db
        .prepare('SELECT user_id FROM model_connections WHERE id = ?')
        .get(created.id) as { user_id: number };
      assert.strictEqual(row.user_id, 1);
      db.close();
    });

    it('should not accept or persist apiKey', async () => {
      const created = await createConnection({
        name: 'Put ApiKey',
        baseUrl: 'http://localhost:1234',
      });

      const response = await fetch(
        BASE_URL + '/api/model-connections/' + created.id,
        {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            name: 'Put ApiKey',
            baseUrl: 'http://localhost:1234',
            apiKey: 'secret-key-should-not-be-persisted',
          }),
        },
      );

      assert.strictEqual(response.status, 200);

      const data = await response.json();
      assert.strictEqual(data.data.apiKey, undefined);

      const db = openTestDb();
      const row = db
        .prepare('SELECT data FROM model_connections WHERE id = ?')
        .get(created.id) as { data: string };
      assert.ok(!row.data.includes('apiKey'));
      db.close();
    });

    it('should return 400 for an invalid id', async () => {
      const response = await fetch(
        BASE_URL + '/api/model-connections/abc',
        {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            name: 'Invalid Id',
            baseUrl: 'http://localhost:1234',
          }),
        },
      );

      assert.strictEqual(response.status, 400);
    });

    it('should reject missing name', async () => {
      const created = await createConnection({
        name: 'Put Validation',
        baseUrl: 'http://localhost:1234',
      });

      const response = await fetch(
        BASE_URL + '/api/model-connections/' + created.id,
        {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            baseUrl: 'http://localhost:1234',
          }),
        },
      );

      assert.strictEqual(response.status, 400);
    });

    it('should reject missing baseUrl', async () => {
      const created = await createConnection({
        name: 'Put Validation',
        baseUrl: 'http://localhost:1234',
      });

      const response = await fetch(
        BASE_URL + '/api/model-connections/' + created.id,
        {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            name: 'Put Validation',
          }),
        },
      );

      assert.strictEqual(response.status, 400);
    });
  });

  describe('DELETE /api/model-connections/:id', () => {
    async function createConnection() {
      const response = await fetch(BASE_URL + '/api/model-connections', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: 'Delete Target',
          baseUrl: 'http://localhost:1234',
        }),
      });
      assert.strictEqual(response.status, 201);
      return response.json();
    }

    it('should delete an existing connection', async () => {
      const created = await createConnection();

      const response = await fetch(
        BASE_URL + '/api/model-connections/' + created.id,
        { method: 'DELETE' },
      );

      assert.strictEqual(response.status, 204);
      const getResponse = await fetch(
        BASE_URL + '/api/model-connections/' + created.id,
      );
      assert.strictEqual(getResponse.status, 404);
    });

    it('should return 404 for an unknown id', async () => {
      const response = await fetch(
        BASE_URL + '/api/model-connections/999999',
        { method: 'DELETE' },
      );

      assert.strictEqual(response.status, 404);
    });

    it('should not delete another user\'s connection', async () => {
      const db = new Database(process.env.DB_PATH as string);
      const result = db
        .prepare(
          'INSERT INTO model_connections (user_id, created_at, updated_at, data) VALUES (?, ?, ?, ?)',
        )
        .run(
          2,
          1,
          1,
          JSON.stringify({
            name: 'Other User Delete Target',
            baseUrl: 'http://other.example',
            timeoutMinutes: 30,
            modelId: null,
            enabled: true,
          }),
        );
      const otherId = Number(result.lastInsertRowid);

      const response = await fetch(
        BASE_URL + '/api/model-connections/' + otherId,
        { method: 'DELETE' },
      );

      assert.strictEqual(response.status, 404);
      assert.ok(
        db.prepare('SELECT id FROM model_connections WHERE id = ?').get(otherId),
      );
      db.close();
    });

    it('should reject an invalid route id', async () => {
      const response = await fetch(
        BASE_URL + '/api/model-connections/1.5',
        { method: 'DELETE' },
      );

      assert.strictEqual(response.status, 400);
    });
  });
});
