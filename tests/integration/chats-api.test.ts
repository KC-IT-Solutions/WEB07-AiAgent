import { after, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import type { Server } from 'node:http';
import { existsSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
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

const testDbDir = mkdtempSync(`${tmpdir()}web07-chats-api-`);
process.env.DB_PATH = resolve(testDbDir, 'test.db');

const BASE_URL = 'http://localhost:3997';

interface ExpressLike {
  listen(port: number, callback: () => void): Server;
}

let httpServer: Server | null;

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

async function deleteChat(id: number | string) {
  return fetch(`${BASE_URL}/api/chats/${id}`, { method: 'DELETE' });
}

await describe('Chats API', () => {
  before(async () => {
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
  });

  it('POST creates a chat and ignores client-provided userId', async () => {
    const { response, data } = await createChat({
      title: 'API chat',
      modelConnectionId: 1,
      modelId: 'qwen/qwen3.6-27b',
      userId: 999,
    });

    assert.strictEqual(response.status, 201);
    assert.strictEqual(data.userId, 1);
    assert.strictEqual(data.data.title, 'API chat');
    assert.strictEqual(data.data.modelConnectionId, 1);
    assert.strictEqual(data.data.modelId, 'qwen/qwen3.6-27b');

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
    assert.strictEqual(chat.data.modelId, 'selected-model');
  });

  it('returns not found for an unknown chat id', async () => {
    const response = await fetch(`${BASE_URL}/api/chats/999999`);

    assert.strictEqual(response.status, 404);
    assert.deepStrictEqual(await response.json(), { error: 'Chat not found' });
  });

  it('PUT updates model selection and preserves the existing title and row', async () => {
    const { data: created } = await createChat({
      title: 'Persisted title',
      modelConnectionId: null,
      modelId: null,
    });

    const { response, data: updated } = await updateChat(created.id, {
      modelConnectionId: 12,
      modelId: 'api-selected-model',
    });

    assert.strictEqual(response.status, 200);
    assert.strictEqual(updated.id, created.id);
    assert.strictEqual(updated.userId, 1);
    assert.strictEqual(updated.data.title, 'Persisted title');
    assert.strictEqual(updated.data.modelConnectionId, 12);
    assert.strictEqual(updated.data.modelId, 'api-selected-model');
    assert.strictEqual(updated.createdAt, created.createdAt);
    assert.ok(updated.updatedAt > created.updatedAt);

    const db = new Database(process.env.DB_PATH as string);
    const count = db.prepare('SELECT COUNT(*) AS count FROM chats WHERE id = ?').get(created.id) as {
      count: number;
    };
    assert.strictEqual(count.count, 1);
    db.close();
  });

  it('PUT renames a chat while preserving its model selection', async () => {
    const { data: created } = await createChat({
      title: 'Before rename',
      modelConnectionId: 14,
      modelId: 'preserved-model',
    });

    const { response, data: updated } = await updateChat(created.id, {
      title: 'After rename',
    });

    assert.strictEqual(response.status, 200);
    assert.strictEqual(updated.id, created.id);
    assert.strictEqual(updated.data.title, 'After rename');
    assert.strictEqual(updated.data.modelConnectionId, 14);
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

  it('DELETE removes an existing UserId 1 chat', async () => {
    const { data: created } = await createChat({
      title: 'Delete API chat',
      modelConnectionId: 3,
      modelId: 'delete-model',
    });

    const response = await deleteChat(created.id);
    const db = new Database(process.env.DB_PATH as string);
    const row = db.prepare('SELECT id FROM chats WHERE id = ?').get(created.id);
    db.close();

    assert.strictEqual(response.status, 204);
    assert.strictEqual(row, undefined);
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
    const invalidConnection = await createChat({
      title: 'Invalid',
      modelConnectionId: '1',
      modelId: null,
    });
    const invalidModel = await createChat({
      title: 'Invalid',
      modelConnectionId: null,
      modelId: '',
    });

    assert.strictEqual(missingTitle.response.status, 400);
    assert.strictEqual(invalidConnection.response.status, 400);
    assert.strictEqual(invalidModel.response.status, 400);
  });
});
