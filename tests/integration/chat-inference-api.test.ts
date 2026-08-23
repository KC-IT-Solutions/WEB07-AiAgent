import { after, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createServer, type IncomingMessage, type Server } from 'node:http';
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

const testDbDir = mkdtempSync(`${tmpdir()}web07-chat-inference-api-`);
process.env.DB_PATH = resolve(testDbDir, 'test.db');

const APP_URL = 'http://127.0.0.1:3994';
const MODEL_SERVER_URL = 'http://127.0.0.1:3993';

interface ExpressLike {
  listen(port: number, callback: () => void): Server;
}

interface CapturedModelRequest {
  url: string;
  body: unknown;
}

let appServer: Server | null;
let modelServer: Server | null;
const capturedRequests: CapturedModelRequest[] = [];

async function readJsonBody(request: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  for await (const chunk of request) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return JSON.parse(Buffer.concat(chunks).toString('utf8')) as unknown;
}

function insertConnection(options: {
  baseUrl?: string;
  timeoutMinutes?: number;
  enabled?: boolean;
  userId?: number;
} = {}): number {
  const db = new Database(process.env.DB_PATH as string);
  const result = db
    .prepare(
      'INSERT INTO model_connections (user_id, created_at, updated_at, data) VALUES (?, ?, ?, ?)',
    )
    .run(
      options.userId ?? 1,
      1,
      1,
      JSON.stringify({
        name: 'Inference connection',
        baseUrl: options.baseUrl ?? `${MODEL_SERVER_URL}/saved///`,
        timeoutMinutes: options.timeoutMinutes ?? 1,
        modelId: null,
        enabled: options.enabled ?? true,
      }),
    );
  db.close();
  return Number(result.lastInsertRowid);
}

function insertChat(options: {
  modelConnectionId: number | null;
  modelId: string | null;
  userId?: number;
}): number {
  const db = new Database(process.env.DB_PATH as string);
  const result = db
    .prepare('INSERT INTO chats (user_id, created_at, updated_at, data) VALUES (?, ?, ?, ?)')
    .run(
      options.userId ?? 1,
      1,
      1,
      JSON.stringify({
        title: 'Inference chat',
        modelConnectionId: options.modelConnectionId,
        modelId: options.modelId,
      }),
    );
  db.close();
  return Number(result.lastInsertRowid);
}

async function infer(chatId: number | string, body: Record<string, unknown>) {
  const response = await fetch(`${APP_URL}/api/chats/${chatId}/inference`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  return { response, data: await response.json() };
}

await describe('Chat inference API', () => {
  before(async () => {
    modelServer = createServer(async (request, response) => {
      const url = request.url ?? '';
      const body = await readJsonBody(request);
      capturedRequests.push({ url, body });

      if (url === '/non-ok/v1/chat/completions') {
        response.writeHead(503, { 'Content-Type': 'application/json' });
        response.end(JSON.stringify({ error: 'Sensitive upstream failure' }));
        return;
      }

      if (url === '/malformed/v1/chat/completions') {
        response.writeHead(200, { 'Content-Type': 'application/json' });
        response.end(JSON.stringify({ choices: [{ message: { content: 42 } }] }));
        return;
      }

      if (url === '/slow/v1/chat/completions') {
        setTimeout(() => {
          response.writeHead(200, { 'Content-Type': 'application/json' });
          response.end(JSON.stringify({ choices: [{ message: { content: 'Too late' } }] }));
        }, 200);
        return;
      }

      response.writeHead(200, { 'Content-Type': 'application/json' });
      response.end(
        JSON.stringify({
          id: 'upstream-secret-id',
          choices: [{ message: { role: 'assistant', content: '  Assistant answer  ' } }],
          usage: { prompt_tokens: 12 },
        }),
      );
    });
    modelServer.listen(3993, '127.0.0.1');
    await new Promise<void>((resolveListening) => {
      modelServer!.once('listening', resolveListening);
    });

    const serverModule = await import(pathToFileURL(resolve(projectRoot, 'dist/server.js')).href);
    const candidate = serverModule.default || serverModule.app;
    if (candidate && typeof (candidate as ExpressLike).listen === 'function') {
      appServer = (candidate as ExpressLike).listen(3994, () => {});
      await new Promise<void>((resolveListening) => {
        appServer!.once('listening', resolveListening);
      });
    }
  });

  after(async () => {
    if (appServer) {
      await new Promise<void>((resolveClosed) => appServer!.close(() => resolveClosed()));
    }
    if (modelServer) {
      await new Promise<void>((resolveClosed) => modelServer!.close(() => resolveClosed()));
    }
  });

  it('uses only saved configuration and returns a normalized assistant message', async () => {
    const connectionId = insertConnection();
    const chatId = insertChat({ modelConnectionId: connectionId, modelId: 'saved-model' });

    const { response, data } = await infer(chatId, {
      message: '  Hello model  ',
      userId: 999,
      baseUrl: `${MODEL_SERVER_URL}/non-ok`,
      modelId: 'client-model',
    });

    assert.strictEqual(response.status, 200);
    assert.deepStrictEqual(data, { message: 'Assistant answer' });
    assert.deepStrictEqual(capturedRequests[capturedRequests.length - 1], {
      url: '/saved/v1/chat/completions',
      body: {
        model: 'saved-model',
        messages: [{ role: 'user', content: 'Hello model' }],
      },
    });
  });

  it('does not allow client-provided userId to access another user chat', async () => {
    const connectionId = insertConnection({ userId: 2 });
    const chatId = insertChat({
      modelConnectionId: connectionId,
      modelId: 'other-user-model',
      userId: 2,
    });

    const { response, data } = await infer(chatId, { message: 'Hello', userId: 2 });

    assert.strictEqual(response.status, 404);
    assert.deepStrictEqual(data, { error: 'Chat not found' });
  });

  it('returns not found for an unknown chat', async () => {
    const { response, data } = await infer(999999, { message: 'Hello' });
    assert.strictEqual(response.status, 404);
    assert.deepStrictEqual(data, { error: 'Chat not found' });
  });

  it('rejects a chat without a selected connection', async () => {
    const chatId = insertChat({ modelConnectionId: null, modelId: 'saved-model' });
    const { response, data } = await infer(chatId, { message: 'Hello' });
    assert.strictEqual(response.status, 409);
    assert.deepStrictEqual(data, { error: 'Chat has no selected model connection' });
  });

  it('rejects a chat without a selected model', async () => {
    const connectionId = insertConnection();
    const chatId = insertChat({ modelConnectionId: connectionId, modelId: null });
    const { response, data } = await infer(chatId, { message: 'Hello' });
    assert.strictEqual(response.status, 409);
    assert.deepStrictEqual(data, { error: 'Chat has no selected model' });
  });

  it('returns not found when the saved connection does not exist', async () => {
    const chatId = insertChat({ modelConnectionId: 999999, modelId: 'saved-model' });
    const { response, data } = await infer(chatId, { message: 'Hello' });
    assert.strictEqual(response.status, 404);
    assert.deepStrictEqual(data, { error: 'Connection not found' });
  });

  it('rejects a disabled saved connection', async () => {
    const connectionId = insertConnection({ enabled: false });
    const chatId = insertChat({ modelConnectionId: connectionId, modelId: 'saved-model' });
    const { response, data } = await infer(chatId, { message: 'Hello' });
    assert.strictEqual(response.status, 409);
    assert.deepStrictEqual(data, { error: 'Connection is disabled' });
  });

  it('returns a safe error when the model server is unreachable', async () => {
    const connectionId = insertConnection({ baseUrl: 'http://127.0.0.1:3992' });
    const chatId = insertChat({ modelConnectionId: connectionId, modelId: 'saved-model' });
    const { response, data } = await infer(chatId, { message: 'Hello' });
    assert.strictEqual(response.status, 502);
    assert.deepStrictEqual(data, { error: 'Model server is unreachable' });
  });

  it('applies the saved timeout', async () => {
    const connectionId = insertConnection({
      baseUrl: `${MODEL_SERVER_URL}/slow`,
      timeoutMinutes: 0.001,
    });
    const chatId = insertChat({ modelConnectionId: connectionId, modelId: 'saved-model' });
    const { response, data } = await infer(chatId, { message: 'Hello' });
    assert.strictEqual(response.status, 504);
    assert.deepStrictEqual(data, { error: 'Model server request timed out' });
  });

  it('does not expose a non-OK model-server response', async () => {
    const connectionId = insertConnection({ baseUrl: `${MODEL_SERVER_URL}/non-ok` });
    const chatId = insertChat({ modelConnectionId: connectionId, modelId: 'saved-model' });
    const { response, data } = await infer(chatId, { message: 'Hello' });
    assert.strictEqual(response.status, 502);
    assert.deepStrictEqual(data, { error: 'Model server request failed' });
    assert.ok(!JSON.stringify(data).includes('Sensitive upstream failure'));
  });

  it('rejects a malformed model-server response', async () => {
    const connectionId = insertConnection({ baseUrl: `${MODEL_SERVER_URL}/malformed` });
    const chatId = insertChat({ modelConnectionId: connectionId, modelId: 'saved-model' });
    const { response, data } = await infer(chatId, { message: 'Hello' });
    assert.strictEqual(response.status, 502);
    assert.deepStrictEqual(data, { error: 'Invalid model server response' });
  });

  it('validates the chat id and message', async () => {
    const invalidId = await infer('invalid', { message: 'Hello' });
    const emptyMessage = await infer(1, { message: '   ' });
    assert.strictEqual(invalidId.response.status, 400);
    assert.strictEqual(emptyMessage.response.status, 400);
  });
});
