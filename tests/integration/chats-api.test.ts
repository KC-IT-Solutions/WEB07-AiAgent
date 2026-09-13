import { after, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createServer, type Server } from 'node:http';
import { existsSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import Database from 'better-sqlite3';
import { FileChatMessageStore } from '../../src/server/stores/chat-message-store.js';

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

const testDbDir = mkdtempSync(`${tmpdir()}web07-chats-api-`);
process.env.DB_PATH = resolve(testDbDir, 'test.db');
process.env.CHAT_HISTORY_PATH = resolve(testDbDir, 'chat-history');
process.env.LOG_DIRECTORY = resolve(testDbDir, 'logs');
const messageStore = new FileChatMessageStore(process.env.CHAT_HISTORY_PATH);

const BASE_URL = 'http://localhost:3997';

interface ExpressLike {
  listen(port: number, callback: () => void): Server;
}

let httpServer: Server | null;
let modelServer: Server | null;

async function createChat(body: Record<string, unknown>) {
  const response = await fetch(`${BASE_URL}/api/chats`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  return { response, data: await response.json() };
}

async function updateChat(id: number, body: Record<string, unknown>) {
  const response = await fetch(`${BASE_URL}/api/chats/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  return { response, data: await response.json() };
}

async function createModelConnection(): Promise<number> {
  const response = await fetch(`${BASE_URL}/api/model-connections`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name: 'Chat selection connection',
      baseUrl: 'http://127.0.0.1:3989',
      timeoutMinutes: 1,
      enabled: true,
    }),
  });
  assert.equal(response.status, 201);
  return ((await response.json()) as { id: number }).id;
}

async function deleteChat(id: number | string) {
  return fetch(`${BASE_URL}/api/chats/${id}`, { method: 'DELETE' });
}

await describe('Chats API', () => {
  before(async () => {
    modelServer = createServer((_request, response) => {
      response.writeHead(200, { 'Content-Type': 'application/json' });
      response.end(
        JSON.stringify({
          data: [
            { id: 'stub/default-model' },
            { id: 'api-selected-model' },
            { id: 'preserved-model' },
            { id: ' exact/model ' },
          ],
        }),
      );
    });
    modelServer.listen(3989);
    await new Promise<void>((resolveListening) => {
      modelServer!.once('listening', resolveListening);
    });
    const serverModule = await import(pathToFileURL(resolve(projectRoot, 'dist/server.js')).href);
    const candidate = serverModule.default || serverModule.app;

    if (candidate && typeof (candidate as ExpressLike).listen === 'function') {
      httpServer = (candidate as ExpressLike).listen(3997, () => {});
      await new Promise<void>((resolveListening) => {
        httpServer!.once('listening', resolveListening);
      });
    }
  });

  after(async () => {
    if (httpServer) {
      await new Promise<void>((resolveClosed) => {
        httpServer!.close(() => resolveClosed());
      });
    }
    if (modelServer) {
      await new Promise<void>((resolveClosed) => {
        modelServer!.close(() => resolveClosed());
      });
    }
  });

  it('POST creates a chat and ignores client-provided ownership and model defaults', async () => {
    const { response, data } = await createChat({
      title: 'API chat',
      modelConnectionId: 1,
      modelId: 'qwen/qwen3.6-27b',
      userId: 999,
    });

    assert.strictEqual(response.status, 201);
    assert.strictEqual(data.userId, 1);
    assert.strictEqual(data.data.title, 'API chat');
    assert.strictEqual(data.data.modelConnectionId, null);
    assert.strictEqual(data.data.modelId, null);

    const db = new Database(process.env.DB_PATH as string);
    const row = db.prepare('SELECT user_id, data FROM chats WHERE id = ?').get(data.id) as {
      user_id: number;
      data: string;
    };
    assert.strictEqual(row.user_id, 1);
    assert.strictEqual(JSON.parse(row.data).userId, undefined);
    db.close();
  });

  it('GET lists chats for UserId 1', async () => {
    const { data: created } = await createChat({
      title: 'Listed API chat',
      modelConnectionId: null,
      modelId: null,
    });
    const db = new Database(process.env.DB_PATH as string);
    db.prepare(
      'INSERT INTO chats (user_id, created_at, updated_at, data) VALUES (?, ?, ?, ?)',
    ).run(
      2,
      1,
      1,
      JSON.stringify({ title: 'Other user chat', modelConnectionId: null, modelId: null }),
    );
    db.close();

    const response = await fetch(`${BASE_URL}/api/chats`);
    const chats = await response.json();

    assert.strictEqual(response.status, 200);
    assert.ok(chats.some((chat: { id: number }) => chat.id === created.id));
    assert.ok(chats.every((chat: { userId: number }) => chat.userId === 1));
  });

  it('GET by id returns the correct chat', async () => {
    const { data: created } = await createChat({
      title: 'Get API chat',
      modelConnectionId: null,
      modelId: 'selected-model',
    });

    const response = await fetch(`${BASE_URL}/api/chats/${created.id}`);
    const chat = await response.json();

    assert.strictEqual(response.status, 200);
    assert.strictEqual(chat.id, created.id);
    assert.strictEqual(chat.data.title, 'Get API chat');
    assert.strictEqual(chat.data.modelId, null);
  });

  it('GET messages returns persisted history for an owned chat', async () => {
    const { data: created } = await createChat({
      title: 'History API chat',
      modelConnectionId: null,
      modelId: null,
    });
    const messages = [
      { type: 'user', content: 'Hej', createdAt: 100 },
      { type: 'assistant', content: 'Hallå', createdAt: 101 },
    ] as const;
    await messageStore.appendMessage(1, created.id, messages[0]);
    await messageStore.appendMessage(1, created.id, messages[1]);

    const response = await fetch(`${BASE_URL}/api/chats/${created.id}/messages`);

    assert.strictEqual(response.status, 200);
    assert.deepStrictEqual(await response.json(), { messages });
  });

  it('GET messages returns empty history and enforces chat ownership', async () => {
    const { data: created } = await createChat({
      title: 'Empty history chat',
      modelConnectionId: null,
      modelId: null,
    });
    const db = new Database(process.env.DB_PATH as string);
    const otherResult = db
      .prepare('INSERT INTO chats (user_id, created_at, updated_at, data) VALUES (?, ?, ?, ?)')
      .run(
        2,
        1,
        1,
        JSON.stringify({ title: 'Other history', modelConnectionId: null, modelId: null }),
      );
    db.close();
    const otherId = Number(otherResult.lastInsertRowid);
    await messageStore.appendMessage(2, otherId, {
      type: 'user',
      content: 'Private',
      createdAt: 1,
    });

    const emptyResponse = await fetch(`${BASE_URL}/api/chats/${created.id}/messages`);
    const forbiddenResponse = await fetch(`${BASE_URL}/api/chats/${otherId}/messages`);

    assert.deepStrictEqual(await emptyResponse.json(), { messages: [] });
    assert.strictEqual(forbiddenResponse.status, 404);
    assert.deepStrictEqual(await forbiddenResponse.json(), { error: 'Chat not found' });
  });

  it('DELETE messages clears owned history, preserves metadata, and is idempotent', async () => {
    const { data: created } = await createChat({ title: 'Clear API chat' });
    const connectionId = await createModelConnection();
    const { data: selected } = await updateChat(created.id, {
      modelConnectionId: connectionId,
      modelId: 'preserved-model',
    });
    await messageStore.appendMessage(1, created.id, {
      type: 'reasoning',
      content: 'Remove this',
      createdAt: 1,
    });

    const response = await fetch(`${BASE_URL}/api/chats/${created.id}/messages`, {
      method: 'DELETE',
    });
    const again = await fetch(`${BASE_URL}/api/chats/${created.id}/messages`, {
      method: 'DELETE',
    });
    const metadata = await (await fetch(`${BASE_URL}/api/chats/${created.id}`)).json();

    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { success: true });
    assert.equal(again.status, 200);
    assert.deepEqual(await messageStore.listMessages(1, created.id), []);
    assert.equal(metadata.id, created.id);
    assert.deepEqual(metadata.data, selected.data);
  });

  it('DELETE messages validates ownership and route ids', async () => {
    const db = new Database(process.env.DB_PATH as string);
    const other = db
      .prepare('INSERT INTO chats (user_id, created_at, updated_at, data) VALUES (2, 1, 1, ?)')
      .run(JSON.stringify({ title: 'Private', modelConnectionId: null, modelId: null }));
    db.close();
    const wrongUser = await fetch(
      `${BASE_URL}/api/chats/${Number(other.lastInsertRowid)}/messages`,
      { method: 'DELETE' },
    );
    const invalid = await fetch(`${BASE_URL}/api/chats/not-an-id/messages`, { method: 'DELETE' });
    assert.equal(wrongUser.status, 404);
    assert.equal(invalid.status, 400);
  });

  it('persists Chat defaults and copies them only into subsequently created chats', async () => {
    const before = await createChat({ title: 'Before defaults' });
    const connectionResponse = await fetch(`${BASE_URL}/api/model-connections`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'Default stub',
        baseUrl: 'http://127.0.0.1:3989',
        timeoutMinutes: 1,
        modelId: null,
        enabled: true,
      }),
    });
    const connection = await connectionResponse.json();
    const saveResponse = await fetch(`${BASE_URL}/api/settings/chat`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        defaultModelConnectionId: connection.id,
        defaultModelId: 'stub/default-model',
        showReasoning: true,
        showToolCalls: true,
      }),
    });
    const after = await createChat({ title: 'After defaults' });
    const loaded = await (await fetch(`${BASE_URL}/api/settings/chat`)).json();
    const unchangedBefore = await (await fetch(`${BASE_URL}/api/chats/${before.data.id}`)).json();

    assert.equal(saveResponse.status, 200);
    assert.deepEqual(loaded, {
      defaultModelConnectionId: connection.id,
      defaultModelId: 'stub/default-model',
      showReasoning: true,
      showToolCalls: true,
    });
    assert.deepEqual(after.data.data, {
      title: 'After defaults',
      modelConnectionId: connection.id,
      modelId: 'stub/default-model',
    });
    assert.equal(unchangedBefore.data.modelConnectionId, null);
    assert.equal(unchangedBefore.data.modelId, null);

    await fetch(`${BASE_URL}/api/settings/chat`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ defaultModelConnectionId: null, defaultModelId: null, showReasoning: false, showToolCalls: false }),
    });
  });

  it('returns not found for an unknown chat id', async () => {
    const response = await fetch(`${BASE_URL}/api/chats/999999`);

    assert.strictEqual(response.status, 404);
    assert.deepStrictEqual(await response.json(), { error: 'Chat not found' });
  });

  it('PUT updates model selection and preserves the existing title and row', async () => {
    const connectionId = await createModelConnection();
    const { data: created } = await createChat({
      title: 'Persisted title',
      modelConnectionId: null,
      modelId: null,
    });

    const { response, data: updated } = await updateChat(created.id, {
      modelConnectionId: connectionId,
      modelId: ' exact/model ',
    });

    assert.strictEqual(response.status, 200);
    assert.strictEqual(updated.id, created.id);
    assert.strictEqual(updated.userId, 1);
    assert.strictEqual(updated.data.title, 'Persisted title');
    assert.strictEqual(updated.data.modelConnectionId, connectionId);
    assert.strictEqual(updated.data.modelId, ' exact/model ');
    assert.strictEqual(updated.createdAt, created.createdAt);
    assert.ok(updated.updatedAt > created.updatedAt);

    const db = new Database(process.env.DB_PATH as string);
    const count = db.prepare('SELECT COUNT(*) AS count FROM chats WHERE id = ?').get(created.id) as {
      count: number;
    };
    assert.strictEqual(count.count, 1);
    db.close();
  });

  it('PUT rejects a hidden model through a direct API request while allowing a visible model', async () => {
    const connectionId = await createModelConnection();
    const { data: created } = await createChat({ title: 'Visibility selection' });
    const visibilityEndpoint = `${BASE_URL}/api/admin/model-connections/${connectionId}/model-visibility`;
    try {
      const filter = await fetch(visibilityEndpoint, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          filterConfigured: true,
          visibleModelIds: ['preserved-model'],
        }),
      });
      assert.equal(filter.status, 200);
      const hidden = await updateChat(created.id, {
        modelConnectionId: connectionId,
        modelId: 'api-selected-model',
      });
      assert.equal(hidden.response.status, 400);
      assert.equal(hidden.data.code, 'MODEL_NOT_ALLOWED');
      const unchanged = await (await fetch(`${BASE_URL}/api/chats/${created.id}`)).json();
      assert.equal(unchanged.data.modelConnectionId, null);
      assert.equal(unchanged.data.modelId, null);

      const visible = await updateChat(created.id, {
        modelConnectionId: connectionId,
        modelId: 'preserved-model',
      });
      assert.equal(visible.response.status, 200);
      assert.equal(visible.data.data.modelId, 'preserved-model');
    } finally {
      await fetch(visibilityEndpoint, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ filterConfigured: false, visibleModelIds: [] }),
      });
    }
  });

  it('PUT renames a chat while preserving its model selection', async () => {
    const connectionId = await createModelConnection();
    const { data: created } = await createChat({
      title: 'Before rename',
      modelConnectionId: connectionId,
      modelId: 'preserved-model',
    });

    await updateChat(created.id, {
      modelConnectionId: connectionId,
      modelId: 'preserved-model',
    });
    const { response, data: updated } = await updateChat(created.id, {
      title: 'After rename',
    });

    assert.strictEqual(response.status, 200);
    assert.strictEqual(updated.id, created.id);
    assert.strictEqual(updated.data.title, 'After rename');
    assert.strictEqual(updated.data.modelConnectionId, connectionId);
    assert.strictEqual(updated.data.modelId, 'preserved-model');
  });

  it('PUT returns not found for unknown and wrong-user chats', async () => {
    const db = new Database(process.env.DB_PATH as string);
    const result = db.prepare(
      'INSERT INTO chats (user_id, created_at, updated_at, data) VALUES (?, ?, ?, ?)',
    ).run(
      2,
      10,
      10,
      JSON.stringify({ title: 'Other user chat', modelConnectionId: null, modelId: null }),
    );
    db.close();

    const unknown = await updateChat(999998, { modelId: 'model' });
    const wrongUser = await updateChat(Number(result.lastInsertRowid), { modelId: 'model' });

    assert.strictEqual(unknown.response.status, 404);
    assert.deepStrictEqual(unknown.data, { error: 'Chat not found' });
    assert.strictEqual(wrongUser.response.status, 404);
    assert.deepStrictEqual(wrongUser.data, { error: 'Chat not found' });
  });

  it('PUT rejects client-controlled ownership and lifecycle fields', async () => {
    const { data: created } = await createChat({
      title: 'Protected chat',
      modelConnectionId: null,
      modelId: null,
    });

    for (const field of ['userId', 'createdAt', 'updatedAt']) {
      const { response } = await updateChat(created.id, {
        modelId: 'attempted-model',
        [field]: 999,
      });
      assert.strictEqual(response.status, 400);
    }

    const { data: unchanged } = await updateChat(created.id, { title: 'Protected chat' });
    assert.strictEqual(unchanged.userId, 1);
    assert.strictEqual(unchanged.data.modelId, null);
  });

  it('DELETE removes an existing UserId 1 chat and its history', async () => {
    const { data: created } = await createChat({
      title: 'Delete API chat',
      modelConnectionId: 3,
      modelId: 'delete-model',
    });
    await messageStore.appendMessage(1, created.id, {
      type: 'tool_call',
      toolCallId: 'delete-call',
      toolName: 'search',
      arguments: {},
      createdAt: 1,
    });

    const response = await deleteChat(created.id);
    const db = new Database(process.env.DB_PATH as string);
    const row = db.prepare('SELECT id FROM chats WHERE id = ?').get(created.id);
    db.close();

    assert.strictEqual(response.status, 204);
    assert.strictEqual(row, undefined);
    assert.deepStrictEqual(await messageStore.listMessages(1, created.id), []);
  });

  it('DELETE succeeds when an owned chat has no history file', async () => {
    const { data: created } = await createChat({
      title: 'No history delete',
      modelConnectionId: null,
      modelId: null,
    });

    const response = await deleteChat(created.id);

    assert.strictEqual(response.status, 204);
  });

  it('DELETE returns not found for unknown and wrong-user chats', async () => {
    const db = new Database(process.env.DB_PATH as string);
    const result = db.prepare(
      'INSERT INTO chats (user_id, created_at, updated_at, data) VALUES (?, ?, ?, ?)',
    ).run(
      2,
      20,
      20,
      JSON.stringify({ title: 'Wrong user delete', modelConnectionId: null, modelId: null }),
    );
    db.close();

    const unknown = await deleteChat(999997);
    const wrongUser = await deleteChat(Number(result.lastInsertRowid));

    assert.strictEqual(unknown.status, 404);
    assert.deepStrictEqual(await unknown.json(), { error: 'Chat not found' });
    assert.strictEqual(wrongUser.status, 404);
    assert.deepStrictEqual(await wrongUser.json(), { error: 'Chat not found' });
  });

  it('DELETE rejects an invalid route id', async () => {
    const response = await deleteChat('invalid');

    assert.strictEqual(response.status, 400);
    assert.deepStrictEqual(await response.json(), { error: 'Invalid chat id' });
  });

  it('validates chat creation input', async () => {
    const missingTitle = await createChat({ modelConnectionId: null, modelId: null });

    assert.strictEqual(missingTitle.response.status, 400);
  });
});
