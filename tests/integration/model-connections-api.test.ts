import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createServer, type Server } from 'node:http';
import { resolve, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { existsSync, mkdtempSync, readFileSync } from 'node:fs';
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
process.env.LOG_DIRECTORY = resolve(testDbDir, 'logs');
process.env.MODEL_CREDENTIAL_ENCRYPTION_KEY = Buffer.alloc(32, 11).toString('base64');

const BASE_URL = 'http://localhost:3998';
const MODEL_SERVER_URL = 'http://localhost:3996';

interface ExpressLike {
  listen(port: number, callback: () => void): Server;
}

let httpServer: Server | null;
let modelServer: Server | null;
const modelServerPaths: string[] = [];
const modelServerAuthorizations: Array<string | null> = [];

await describe('Model connections API', () => {
  before(async () => {
    modelServer = createServer((request, response) => {
      modelServerPaths.push(request.url ?? '');
      modelServerAuthorizations.push(request.headers.authorization ?? null);

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

    it('should persist the API key only as encrypted server-side credential material', async () => {
      const apiKey = 'secret-key-should-be-encrypted';
      const response = await fetch(BASE_URL + '/api/model-connections', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: 'NoApiKey',
          baseUrl: 'http://localhost:1234',
          apiKey,
        }),
      });

      assert.strictEqual(response.status, 201);

      const data = await response.json();
      assert.strictEqual(data.data.apiKey, undefined);
      assert.strictEqual(data.apiKey, undefined);
      assert.strictEqual(data.hasApiKey, true);
      assert.ok(!JSON.stringify(data).includes(apiKey));

      const db = new Database(process.env.DB_PATH as string);
      const connectionRow = db
        .prepare('SELECT data FROM model_connections WHERE id = ?')
        .get(data.id) as { data: string };
      const credentialRow = db
        .prepare(
          'SELECT ciphertext, iv, auth_tag FROM model_connection_credentials WHERE connection_id = ?',
        )
        .get(data.id) as { ciphertext: string; iv: string; auth_tag: string };
      assert.ok(!connectionRow.data.includes(apiKey));
      assert.ok(!connectionRow.data.includes('apiKey'));
      assert.ok(!Object.values(credentialRow).some((value) => value.includes(apiKey)));
      db.close();

      const getPayload = await (
        await fetch(`${BASE_URL}/api/model-connections/${data.id}`)
      ).json();
      assert.equal(getPayload.hasApiKey, true);
      assert.equal(getPayload.apiKey, undefined);
      assert.ok(!JSON.stringify(getPayload).includes(apiKey));
      const listPayload = await (await fetch(`${BASE_URL}/api/model-connections`)).json();
      const listed = listPayload.find((connection: { id: number }) => connection.id === data.id);
      assert.equal(listed.hasApiKey, true);
      assert.equal(listed.apiKey, undefined);
      assert.ok(!JSON.stringify(listed).includes(apiKey));
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
    async function createDiscoveryConnection(baseUrl: string, apiKey?: string) {
      const response = await fetch(BASE_URL + '/api/model-connections', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: 'Discovery Connection',
          baseUrl,
          timeoutMinutes: 1,
          apiKey,
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
      assert.deepStrictEqual(await response.json(), {
        models: [
          { id: 'model-a', description: null },
          { id: 'model-z', description: null },
        ],
      });
      assert.strictEqual(modelServerPaths.length, previousRequestCount + 1);
      assert.strictEqual(modelServerPaths[modelServerPaths.length - 1], '/v1/models');
      assert.strictEqual(modelServerAuthorizations[modelServerAuthorizations.length - 1], null);
    });

    it('reuses saved credentials for later Settings and Chat model discovery', async () => {
      const apiKey = 'saved-discovery-secret';
      const replacementApiKey = 'replacement-discovery-secret';

      const initialTest = await fetch(`${BASE_URL}/api/model-connections/test`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ baseUrl: MODEL_SERVER_URL, apiKey, timeoutMinutes: 1 }),
      });
      assert.equal(initialTest.status, 200);
      assert.equal(modelServerAuthorizations[modelServerAuthorizations.length - 1], `Bearer ${apiKey}`);

      const connection = await createDiscoveryConnection(MODEL_SERVER_URL, apiKey);
      assert.equal(connection.hasApiKey, true);
      assert.equal(connection.apiKey, undefined);
      assert.ok(!JSON.stringify(connection).includes(apiKey));

      const savedTest = await fetch(`${BASE_URL}/api/model-connections/test`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          connectionId: connection.id,
          baseUrl: MODEL_SERVER_URL,
          timeoutMinutes: 1,
        }),
      });
      assert.equal(savedTest.status, 200);
      assert.equal(modelServerAuthorizations[modelServerAuthorizations.length - 1], `Bearer ${apiKey}`);

      const overrideApiKey = 'unsaved-test-override';
      const overrideTest = await fetch(`${BASE_URL}/api/model-connections/test`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          connectionId: connection.id,
          baseUrl: MODEL_SERVER_URL,
          apiKey: overrideApiKey,
          timeoutMinutes: 1,
        }),
      });
      assert.equal(overrideTest.status, 200);
      assert.equal(
        modelServerAuthorizations[modelServerAuthorizations.length - 1],
        `Bearer ${overrideApiKey}`,
      );

      const chatDiscovery = await fetch(
        `${BASE_URL}/api/model-connections/${connection.id}/models`,
      );
      assert.equal(chatDiscovery.status, 200);
      assert.equal(modelServerAuthorizations[modelServerAuthorizations.length - 1], `Bearer ${apiKey}`);

      const blankUpdate = await fetch(`${BASE_URL}/api/model-connections/${connection.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: connection.data.name,
          baseUrl: MODEL_SERVER_URL,
          timeoutMinutes: 1,
          apiKey: '',
        }),
      });
      assert.equal(blankUpdate.status, 200);
      assert.equal((await blankUpdate.json()).hasApiKey, true);

      const testAfterBlankUpdate = await fetch(`${BASE_URL}/api/model-connections/test`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          connectionId: connection.id,
          baseUrl: MODEL_SERVER_URL,
          timeoutMinutes: 1,
        }),
      });
      assert.equal(testAfterBlankUpdate.status, 200);
      assert.equal(modelServerAuthorizations[modelServerAuthorizations.length - 1], `Bearer ${apiKey}`);

      const replacementUpdate = await fetch(`${BASE_URL}/api/model-connections/${connection.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: connection.data.name,
          baseUrl: MODEL_SERVER_URL,
          timeoutMinutes: 1,
          apiKey: replacementApiKey,
        }),
      });
      assert.equal(replacementUpdate.status, 200);
      const replacementPayload = await replacementUpdate.json();
      assert.equal(replacementPayload.hasApiKey, true);
      assert.equal(replacementPayload.apiKey, undefined);
      assert.ok(!JSON.stringify(replacementPayload).includes(replacementApiKey));

      const discoveryAfterReplacement = await fetch(
        `${BASE_URL}/api/model-connections/${connection.id}/models`,
      );
      assert.equal(discoveryAfterReplacement.status, 200);
      assert.equal(
        modelServerAuthorizations[modelServerAuthorizations.length - 1],
        `Bearer ${replacementApiKey}`,
      );

      const noAuthConnection = await createDiscoveryConnection(MODEL_SERVER_URL);
      const noAuthTest = await fetch(`${BASE_URL}/api/model-connections/test`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          connectionId: noAuthConnection.id,
          baseUrl: MODEL_SERVER_URL,
          timeoutMinutes: 1,
        }),
      });
      assert.equal(noAuthTest.status, 200);
      assert.equal(modelServerAuthorizations[modelServerAuthorizations.length - 1], null);
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

  describe('Admin model visibility', () => {
    async function createVisibilityConnection() {
      const response = await fetch(`${BASE_URL}/api/model-connections`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: 'Visibility connection',
          baseUrl: MODEL_SERVER_URL,
          timeoutMinutes: 1,
          apiKey: 'visibility-secret',
          enabled: true,
        }),
      });
      assert.equal(response.status, 201);
      return (await response.json()) as { id: number; data: Record<string, unknown> };
    }

    it('reads, saves, scopes, and enforces explicit and empty filters without exposing credentials', async () => {
      const connection = await createVisibilityConnection();
      const editorResponse = await fetch(
        `${BASE_URL}/api/admin/model-connections/${connection.id}/model-visibility`,
      );
      assert.equal(editorResponse.status, 200);
      const editor = (await editorResponse.json()) as Record<string, unknown>;
      assert.deepEqual(editor, {
        connectionId: connection.id,
        filterConfigured: false,
        visibleModelIds: [],
        discoveredModels: ['model-a', 'model-z'],
        modelDescriptions: {},
      });
      assert.ok(!JSON.stringify(editor).includes('visibility-secret'));

      const save = await fetch(
        `${BASE_URL}/api/admin/model-connections/${connection.id}/model-visibility`,
        {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ filterConfigured: true, visibleModelIds: ['model-a'] }),
        },
      );
      assert.equal(save.status, 200);
      assert.deepEqual(await save.json(), {
        connectionId: connection.id,
        filterConfigured: true,
        visibleModelIds: ['model-a'],
      });
      const ordinaryModels = await fetch(
        `${BASE_URL}/api/model-connections/${connection.id}/models`,
      );
      assert.deepEqual(await ordinaryModels.json(), {
        models: [{ id: 'model-a', description: null }],
      });

      const ordinaryConnection = (await (
        await fetch(`${BASE_URL}/api/model-connections/${connection.id}`)
      ).json()) as { data: Record<string, unknown> };
      assert.equal(ordinaryConnection.data.filterConfigured, undefined);
      assert.equal(ordinaryConnection.data.visibleModelIds, undefined);
      assert.equal(ordinaryConnection.data.modelDescriptions, undefined);

      const empty = await fetch(
        `${BASE_URL}/api/admin/model-connections/${connection.id}/model-visibility`,
        {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ filterConfigured: true, visibleModelIds: [] }),
        },
      );
      assert.equal(empty.status, 200);
      assert.deepEqual(
        await (await fetch(`${BASE_URL}/api/model-connections/${connection.id}/models`)).json(),
        { models: [] },
      );

      const reset = await fetch(
        `${BASE_URL}/api/admin/model-connections/${connection.id}/model-visibility`,
        {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ filterConfigured: false, visibleModelIds: [] }),
        },
      );
      assert.equal(reset.status, 200);
      assert.deepEqual(
        await (await fetch(`${BASE_URL}/api/model-connections/${connection.id}/models`)).json(),
        {
          models: [
            { id: 'model-a', description: null },
            { id: 'model-z', description: null },
          ],
        },
      );
    });

    it('authorizes, validates, normalizes, and exposes scoped descriptions without changing visibility', async () => {
      const connection = await createVisibilityConnection();
      const endpoint = `${BASE_URL}/api/admin/model-connections/${connection.id}/model-descriptions`;
      const visibilityEndpoint = `${BASE_URL}/api/admin/model-connections/${connection.id}/model-visibility`;
      await fetch(visibilityEndpoint, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ filterConfigured: true, visibleModelIds: ['model-a'] }),
      });

      const saved = await fetch(endpoint, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          modelDescriptions: { 'model-a': '  Coding model  ', 'model-z': 'Hidden model' },
        }),
      });
      assert.equal(saved.status, 200);
      assert.deepEqual(await saved.json(), {
        connectionId: connection.id,
        modelDescriptions: { 'model-a': 'Coding model', 'model-z': 'Hidden model' },
      });
      assert.deepEqual(await (await fetch(visibilityEndpoint)).json(), {
        connectionId: connection.id,
        filterConfigured: true,
        visibleModelIds: ['model-a'],
        discoveredModels: ['model-a', 'model-z'],
        modelDescriptions: { 'model-a': 'Coding model', 'model-z': 'Hidden model' },
      });
      assert.deepEqual(
        await (await fetch(`${BASE_URL}/api/model-connections/${connection.id}/models`)).json(),
        { models: [{ id: 'model-a', description: 'Coding model' }] },
      );

      process.env.DEFAULT_USER_ID = '2';
      try {
        assert.equal((await fetch(endpoint, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ modelDescriptions: {} }),
        })).status, 403);
      } finally {
        process.env.DEFAULT_USER_ID = '1';
      }
      for (const body of [
        { modelDescriptions: [] },
        { modelDescriptions: { 'model-a': { nested: true } } },
        { modelDescriptions: { 'model-a': 'x'.repeat(501) } },
        { modelDescriptions: { unknown: 'Injected' } },
        { modelDescriptions: {}, visibleModelIds: [] },
      ]) {
        const response = await fetch(endpoint, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        });
        assert.equal(response.status, 400);
      }
      assert.equal((await fetch(`${BASE_URL}/api/admin/model-connections/999999/model-descriptions`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ modelDescriptions: {} }),
      })).status, 404);
      const cleared = await fetch(endpoint, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ modelDescriptions: { 'model-a': '   ' } }),
      });
      assert.deepEqual(await cleared.json(), { connectionId: connection.id, modelDescriptions: {} });
      assert.ok(!JSON.stringify(await (await fetch(visibilityEndpoint)).json()).includes('visibility-secret'));
    });

    it('rejects non-admin access, unknown connections, malformed fields, duplicates, and injected IDs', async () => {
      const connection = await createVisibilityConnection();
      const endpoint = `${BASE_URL}/api/admin/model-connections/${connection.id}/model-visibility`;
      process.env.DEFAULT_USER_ID = '2';
      try {
        assert.equal((await fetch(endpoint)).status, 403);
        assert.equal(
          (
            await fetch(endpoint, {
              method: 'PUT',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ filterConfigured: true, visibleModelIds: [] }),
            })
          ).status,
          403,
        );
      } finally {
        process.env.DEFAULT_USER_ID = '1';
      }
      assert.equal(
        (await fetch(`${BASE_URL}/api/admin/model-connections/999999/model-visibility`)).status,
        404,
      );
      for (const body of [
        { filterConfigured: true, visibleModelIds: 'model-a' },
        { filterConfigured: true, visibleModelIds: ['', 'model-a'] },
        { filterConfigured: true, visibleModelIds: ['model-a', 'model-a'] },
        { filterConfigured: false, visibleModelIds: ['model-a'] },
        { filterConfigured: true, visibleModelIds: [], baseUrl: 'http://attacker.test' },
        { filterConfigured: true, visibleModelIds: ['never-reported'] },
      ]) {
        const response = await fetch(endpoint, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        });
        assert.equal(response.status, 400);
      }
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

    it('should preserve a saved key on blank edits and replace it on non-empty edits', async () => {
      const created = await createConnection({
        name: 'Credential update target',
        baseUrl: 'http://localhost:1234',
        apiKey: 'original-api-key',
      });
      const db = openTestDb();
      const original = db
        .prepare(
          'SELECT ciphertext FROM model_connection_credentials WHERE connection_id = ?',
        )
        .get(created.id) as { ciphertext: string };

      const blankResponse = await fetch(
        BASE_URL + '/api/model-connections/' + created.id,
        {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            name: 'Credential update target renamed',
            baseUrl: 'http://updated.example',
            apiKey: '',
          }),
        },
      );
      assert.equal(blankResponse.status, 200);
      const blankResult = await blankResponse.json();
      assert.equal(blankResult.hasApiKey, true);
      assert.equal(blankResult.data.name, 'Credential update target renamed');
      assert.equal(blankResult.apiKey, undefined);
      const preserved = db
        .prepare(
          'SELECT ciphertext FROM model_connection_credentials WHERE connection_id = ?',
        )
        .get(created.id) as { ciphertext: string };
      assert.equal(preserved.ciphertext, original.ciphertext);

      const replacementResponse = await fetch(
        BASE_URL + '/api/model-connections/' + created.id,
        {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            name: 'Credential update target renamed',
            baseUrl: 'http://updated.example',
            apiKey: 'replacement-api-key',
          }),
        },
      );
      assert.equal(replacementResponse.status, 200);
      const replacementResult = await replacementResponse.json();
      assert.equal(replacementResult.hasApiKey, true);
      assert.equal(replacementResult.apiKey, undefined);
      const replaced = db
        .prepare(
          'SELECT ciphertext FROM model_connection_credentials WHERE connection_id = ?',
        )
        .get(created.id) as { ciphertext: string };
      assert.notEqual(replaced.ciphertext, original.ciphertext);
      db.close();
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

    it('should keep an updated apiKey out of connection JSON and API responses', async () => {
      const apiKey = 'secret-key-should-be-encrypted';
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
            apiKey,
          }),
        },
      );

      assert.strictEqual(response.status, 200);

      const data = await response.json();
      assert.strictEqual(data.data.apiKey, undefined);
      assert.strictEqual(data.apiKey, undefined);
      assert.strictEqual(data.hasApiKey, true);
      assert.ok(!JSON.stringify(data).includes(apiKey));

      const db = openTestDb();
      const connectionRow = db
        .prepare('SELECT data FROM model_connections WHERE id = ?')
        .get(created.id) as { data: string };
      const credentialRow = db
        .prepare(
          'SELECT ciphertext, iv, auth_tag FROM model_connection_credentials WHERE connection_id = ?',
        )
        .get(created.id) as { ciphertext: string; iv: string; auth_tag: string };
      assert.ok(!connectionRow.data.includes('apiKey'));
      assert.ok(!connectionRow.data.includes(apiKey));
      assert.ok(!Object.values(credentialRow).some((value) => value.includes(apiKey)));
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

  describe('save failure diagnostics', () => {
    it('logs safe create and update persistence failures without changing HTTP responses', async () => {
      const targetResponse = await fetch(BASE_URL + '/api/model-connections', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: 'Diagnostic Update Target',
          baseUrl: 'http://localhost:1234',
        }),
      });
      assert.strictEqual(targetResponse.status, 201);
      const target = (await targetResponse.json()) as { id: number };
      const db = new Database(process.env.DB_PATH as string);
      db.exec(`
        CREATE TRIGGER fail_diagnostic_connection_create
        BEFORE INSERT ON model_connections
        WHEN NEW.data LIKE '%Diagnostic Create Failure%'
        BEGIN
          SELECT RAISE(ABORT, 'forced create failure');
        END;
        CREATE TRIGGER fail_diagnostic_connection_update
        BEFORE UPDATE ON model_connections
        WHEN NEW.data LIKE '%Diagnostic Update Failure%'
        BEGIN
          SELECT RAISE(ABORT, 'forced update failure');
        END;
      `);
      const apiKey = 'diagnostic-provider-secret';

      try {
        const createResponse = await fetch(BASE_URL + '/api/model-connections', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            name: 'Diagnostic Create Failure',
            baseUrl: 'http://localhost:1234',
            apiKey,
          }),
        });
        assert.strictEqual(createResponse.status, 500);
        assert.deepEqual(await createResponse.json(), { error: 'Failed to create connection' });

        const updateResponse = await fetch(
          `${BASE_URL}/api/model-connections/${target.id}`,
          {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              name: 'Diagnostic Update Failure',
              baseUrl: 'http://localhost:1234',
              apiKey,
            }),
          },
        );
        assert.strictEqual(updateResponse.status, 500);
        assert.deepEqual(await updateResponse.json(), { error: 'Failed to update connection' });
      } finally {
        db.exec(`
          DROP TRIGGER IF EXISTS fail_diagnostic_connection_create;
          DROP TRIGGER IF EXISTS fail_diagnostic_connection_update;
        `);
        db.close();
      }

      const logContents = readFileSync(
        resolve(process.env.LOG_DIRECTORY as string, 'application.log'),
        'utf8',
      );
      const saveFailures = logContents
        .trim()
        .split('\n')
        .map((line) => JSON.parse(line) as Record<string, unknown>)
        .filter((entry) => entry.event === 'model_connection_save_failed');
      assert.ok(
        saveFailures.some(
          (entry) =>
            entry.operation === 'create' &&
            entry.connectionId === null &&
            entry.stage === 'repository' &&
            entry.errorCode === 'MODEL_CONNECTION_PERSISTENCE_FAILED' &&
            entry.errorName === 'SqliteError',
        ),
      );
      assert.ok(
        saveFailures.some(
          (entry) =>
            entry.operation === 'update' &&
            entry.connectionId === target.id &&
            entry.stage === 'repository' &&
            entry.errorCode === 'MODEL_CONNECTION_PERSISTENCE_FAILED' &&
            entry.errorName === 'SqliteError',
        ),
      );
      assert.ok(!JSON.stringify(saveFailures).includes(apiKey));
      assert.ok(
        !JSON.stringify(saveFailures).includes(
          process.env.MODEL_CREDENTIAL_ENCRYPTION_KEY as string,
        ),
      );
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
          apiKey: 'delete-target-secret',
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
      const db = new Database(process.env.DB_PATH as string);
      assert.equal(
        (
          db
            .prepare(
              'SELECT COUNT(*) AS count FROM model_connection_credentials WHERE connection_id = ?',
            )
            .get(created.id) as { count: number }
        ).count,
        0,
      );
      db.close();
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
