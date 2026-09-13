import { after, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createServer, type IncomingMessage, type Server } from 'node:http';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import Database from 'better-sqlite3';
import { AGENT_RUNTIME_LIMITS_DEFAULTS } from '../../src/server/runtime-limits.js';

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
process.env.CHAT_HISTORY_PATH = resolve(testDbDir, 'chat-history');
process.env.LOG_DIRECTORY = resolve(testDbDir, 'logs');
process.env.MODEL_CREDENTIAL_ENCRYPTION_KEY = Buffer.alloc(32, 13).toString('base64');

const APP_URL = 'http://127.0.0.1:3994';
const MODEL_SERVER_URL = 'http://127.0.0.1:3993';

interface ExpressLike {
  listen(port: number, callback: () => void): Server;
}

interface CapturedModelRequest {
  url: string;
  body: unknown;
  authorization: string | null;
}

interface StoredMessage {
  role: 'user' | 'assistant';
  content: string;
  createdAt: number;
}

let appServer: Server | null;
let modelServer: Server | null;
const capturedRequests: CapturedModelRequest[] = [];

function inferenceRequestCount(): number {
  return capturedRequests.filter((request) => request.url.endsWith('/v1/chat/completions')).length;
}

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

function insertSkill(commandName: string, name: string): number {
  const db = new Database(process.env.DB_PATH as string);
  const result = db
    .prepare(
      'INSERT INTO skills (command_name, created_at, updated_at, data) VALUES (?, 1, 1, ?)',
    )
    .run(commandName, JSON.stringify({ name }));
  db.close();
  return Number(result.lastInsertRowid);
}

function writeHistory(chatId: number, messages: StoredMessage[]): void {
  const historyDirectory = resolve(process.env.CHAT_HISTORY_PATH as string, 'user-1');
  mkdirSync(historyDirectory, { recursive: true });
  writeFileSync(
    resolve(historyDirectory, `chat-${chatId}.jsonl`),
    `${messages.map((message) => JSON.stringify(message)).join('\n')}\n`,
    'utf8',
  );
}

async function infer(chatId: number | string, body: Record<string, unknown>) {
  const response = await fetch(`${APP_URL}/api/chats/${chatId}/inference`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  return { response, data: await response.json() };
}

async function inferStream(chatId: number | string, body: Record<string, unknown>) {
  const response = await fetch(`${APP_URL}/api/chats/${chatId}/inference/stream`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const text = await response.text();
  const events = text
    .split('\n')
    .filter((line) => line.length > 0)
    .map((line) => JSON.parse(line) as Record<string, unknown>);
  return { response, events };
}

async function getMessages(chatId: number) {
  const response = await fetch(`${APP_URL}/api/chats/${chatId}/messages`);
  return { response, data: await response.json() };
}

async function command(chatId: number | string, message: string) {
  const response = await fetch(`${APP_URL}/api/chats/${chatId}/commands`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ message }),
  });
  return { response, data: await response.json() };
}

await describe('Chat inference API', () => {
  before(async () => {
    modelServer = createServer(async (request, response) => {
      const url = request.url ?? '';
      const isModelDiscovery = url.endsWith('/v1/models');
      const body = isModelDiscovery ? null : await readJsonBody(request);
      capturedRequests.push({
        url,
        body,
        authorization: request.headers.authorization ?? null,
      });

      if (isModelDiscovery) {
        response.writeHead(200, { 'Content-Type': 'application/json' });
        response.end(
          JSON.stringify({
            data: [
              'saved-model',
              'keyed-model',
              'stream-model',
              'slash-model',
              'history-model',
            ].map((id) => ({ id })),
          }),
        );
        return;
      }

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
    assert.equal(data.message, 'Assistant answer');
    assert.deepEqual(data.events.map((event: { type: string }) => event.type), ['assistant']);
    const captured = capturedRequests[capturedRequests.length - 1];
    const capturedBody = captured.body as {
      model: string;
      messages: Array<{ role: string; content: string }>;
    };
    assert.equal(captured.url, '/saved/v1/chat/completions');
    assert.equal(captured.authorization, null);
    assert.equal(capturedBody.model, 'saved-model');
    assert.equal(capturedBody.messages[0].role, 'system');
    assert.match(capturedBody.messages[0].content, /^Current date: \d{4}-\d{2}-\d{2}$/);
    assert.deepStrictEqual(capturedBody.messages.slice(1), [
      { role: 'user', content: 'Hello model' },
    ]);
    const history = await getMessages(chatId);
    assert.strictEqual(history.response.status, 200);
    assert.deepStrictEqual(
      history.data.messages.map((message: { type: string; content: string }) => ({
        type: message.type,
        content: message.content,
      })),
      [
        { type: 'user', content: 'Hello model' },
        { type: 'assistant', content: 'Assistant answer' },
      ],
    );
    assert.ok(
      history.data.messages.every(
        (message: { createdAt: unknown }) =>
          typeof message.createdAt === 'number' && Number.isInteger(message.createdAt),
      ),
    );
  });

  it('rejects a newly hidden Chat model before inference and preserves existing history', async () => {
    const connectionId = insertConnection();
    const chatId = insertChat({ modelConnectionId: connectionId, modelId: 'saved-model' });
    writeHistory(chatId, [{ role: 'assistant', content: 'Historical answer', createdAt: 1 }]);
    const visibility = await fetch(
      `${APP_URL}/api/admin/model-connections/${connectionId}/model-visibility`,
      {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          filterConfigured: true,
          visibleModelIds: ['stream-model'],
        }),
      },
    );
    assert.equal(visibility.status, 200);
    const providerRequestsBefore = capturedRequests.filter((request) =>
      request.url.endsWith('/v1/chat/completions'),
    ).length;

    const result = await infer(chatId, { message: 'Bypass attempt' });

    assert.equal(result.response.status, 409);
    assert.deepEqual(result.data, { error: 'Model is not allowed for this connection' });
    assert.equal(
      capturedRequests.filter((request) => request.url.endsWith('/v1/chat/completions')).length,
      providerRequestsBefore,
    );
    const history = await getMessages(chatId);
    assert.deepEqual(
      history.data.messages.map((message: { type: string; content: string }) => ({
        type: message.type,
        content: message.content,
      })),
      [{ type: 'assistant', content: 'Historical answer' }],
    );
    const persistedChat = (await (
      await fetch(`${APP_URL}/api/chats/${chatId}`)
    ).json()) as { data: { modelId: string } };
    assert.equal(persistedChat.data.modelId, 'saved-model');
  });

  it('uses a saved connection API key for inference authorization', async () => {
    const apiKey = 'inference-only-saved-secret';
    const replacementApiKey = 'replacement-inference-secret';
    const connectionResponse = await fetch(`${APP_URL}/api/model-connections`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'Keyed inference connection',
        baseUrl: `${MODEL_SERVER_URL}/keyed`,
        timeoutMinutes: 1,
        modelId: 'keyed-model',
        enabled: true,
        apiKey,
      }),
    });
    assert.equal(connectionResponse.status, 201);
    const connection = await connectionResponse.json();
    assert.equal(connection.hasApiKey, true);
    assert.equal(connection.apiKey, undefined);
    assert.ok(!JSON.stringify(connection).includes(apiKey));
    const chatId = insertChat({
      modelConnectionId: connection.id,
      modelId: 'keyed-model',
    });

    const result = await infer(chatId, { message: 'Authenticated request' });

    assert.equal(result.response.status, 200);
    const captured = capturedRequests[capturedRequests.length - 1];
    assert.equal(captured.url, '/keyed/v1/chat/completions');
    assert.equal(captured.authorization, `Bearer ${apiKey}`);

    const replacementResponse = await fetch(
      `${APP_URL}/api/model-connections/${connection.id}`,
      {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: connection.data.name,
          baseUrl: connection.data.baseUrl,
          timeoutMinutes: 1,
          modelId: 'keyed-model',
          enabled: true,
          apiKey: replacementApiKey,
        }),
      },
    );
    assert.equal(replacementResponse.status, 200);
    const replacementConnection = await replacementResponse.json();
    assert.equal(replacementConnection.hasApiKey, true);
    assert.equal(replacementConnection.apiKey, undefined);

    const replacementResult = await infer(chatId, { message: 'Replacement key request' });
    assert.equal(replacementResult.response.status, 200);
    assert.equal(
      capturedRequests[capturedRequests.length - 1].authorization,
      `Bearer ${replacementApiKey}`,
    );

    const structuredLogs = ['application.log', 'model-inference.log']
      .map((fileName) => readFileSync(resolve(process.env.LOG_DIRECTORY as string, fileName), 'utf8'))
      .join('\n');
    assert.ok(!structuredLogs.includes(apiKey));
    assert.ok(!structuredLogs.includes(`Bearer ${apiKey}`));
    assert.ok(!structuredLogs.includes(replacementApiKey));
    assert.ok(!structuredLogs.includes(`Bearer ${replacementApiKey}`));
  });

  it('streams structured assistant and done events with one monotonic inference id', async () => {
    const connectionId = insertConnection();
    const chatId = insertChat({ modelConnectionId: connectionId, modelId: 'stream-model' });

    const { response, events } = await inferStream(chatId, { message: 'Stream this' });

    assert.equal(response.status, 200);
    assert.ok(response.headers.get('content-type')?.startsWith('application/x-ndjson'));
    assert.deepEqual(
      events.map((event) => event.type),
      ['assistant', 'done'],
    );
    assert.deepEqual(
      events.map((event) => event.sequence),
      [1, 2],
    );
    assert.equal(new Set(events.map((event) => event.inferenceId)).size, 1);
    assert.equal(typeof events[0].inferenceId, 'string');
    assert.equal(events[0].final, true);
    assert.deepEqual(events[0].event, {
      type: 'assistant',
      content: 'Assistant answer',
      createdAt: (events[0].event as { createdAt: number }).createdAt,
    });
    assert.ok(Number.isInteger((events[0].event as { createdAt: number }).createdAt));
  });

  it('handles every slash command locally without provider requests or persisted messages', async () => {
    const chatId = insertChat({ modelConnectionId: null, modelId: null });
    insertSkill('news-compiler', 'News Compiler');
    const requestCount = inferenceRequestCount();

    const enabled = await command(chatId, '/news-compiler');
    const skills = await command(chatId, '/skills');
    const unknown = await infer(chatId, { message: '/does-not-exist' });
    const newChat = await command(chatId, '/new');
    const streamGuard = await inferStream(chatId, { message: '  /test  ' });

    assert.equal(enabled.response.status, 200);
    assert.deepEqual(enabled.data, {
      type: 'command_result',
      command: 'news-compiler',
      message: 'Skill enabled: News Compiler',
    });
    assert.equal(skills.data.message, 'Active skills\n\n/news-compiler - News Compiler');
    assert.deepEqual(unknown.data, {
      type: 'command_result',
      command: 'does-not-exist',
      message: 'Command not found: /does-not-exist',
    });
    assert.equal(newChat.data.command, 'new');
    assert.equal(streamGuard.response.headers.get('content-type')?.startsWith('application/json'), true);
    assert.deepEqual(streamGuard.events, [
      { type: 'command_result', command: 'test', message: 'Command not found: /test' },
    ]);
    assert.equal(inferenceRequestCount(), requestCount);
    assert.deepEqual((await getMessages(chatId)).data, { messages: [] });

    const disabled = await command(chatId, '/news-compiler');
    assert.equal(disabled.data.message, 'Skill disabled: News Compiler');
    const db = new Database(process.env.DB_PATH as string);
    assert.equal(
      (db.prepare('SELECT COUNT(*) count FROM chat_skills WHERE chat_id = ?').get(chatId) as {
        count: number;
      }).count,
      0,
    );
    db.close();
  });

  it('preserves clear behavior through the command path without inference', async () => {
    const chatId = insertChat({ modelConnectionId: null, modelId: null });
    writeHistory(chatId, [{ role: 'user', content: 'Clear this', createdAt: 1 }]);
    const requestCount = capturedRequests.length;

    const cleared = await command(chatId, '/clear');

    assert.deepEqual(cleared.data, {
      type: 'command_result',
      command: 'clear',
      message: 'Chat history cleared.',
    });
    assert.deepEqual((await getMessages(chatId)).data, { messages: [] });
    assert.equal(capturedRequests.length, requestCount);
  });

  it('keeps ordinary text containing a slash on the inference path', async () => {
    const connectionId = insertConnection();
    const chatId = insertChat({ modelConnectionId: connectionId, modelId: 'slash-model' });
    const requestCount = inferenceRequestCount();

    const result = await infer(chatId, { message: 'Compare price/performance' });

    assert.equal(result.response.status, 200);
    assert.equal(inferenceRequestCount(), requestCount + 1);
    assert.deepEqual(
      (await getMessages(chatId)).data.messages.map(
        (message: { type: string; content: string }) => ({
          type: message.type,
          content: message.content,
        }),
      ),
      [
        { type: 'user', content: 'Compare price/performance' },
        { type: 'assistant', content: 'Assistant answer' },
      ],
    );
  });

  it('terminates malformed provider output with a safe typed stream error', async () => {
    const connectionId = insertConnection({ baseUrl: `${MODEL_SERVER_URL}/malformed` });
    const chatId = insertChat({ modelConnectionId: connectionId, modelId: 'stream-model' });

    const { response, events } = await inferStream(chatId, { message: 'Malformed stream' });

    assert.equal(response.status, 200);
    assert.deepEqual(events.map((event) => event.type), ['error']);
    assert.deepEqual(events.map((event) => event.sequence), [1]);
    assert.equal(events[0].error, 'Invalid model server response');
    assert.deepEqual(Object.keys(events[0]).sort(), ['error', 'inferenceId', 'sequence', 'type']);
  });

  it('sends complete persisted user and assistant history before the current message', async () => {
    const connectionId = insertConnection();
    const chatId = insertChat({ modelConnectionId: connectionId, modelId: 'history-model' });
    const previousMessages: StoredMessage[] = [
      { role: 'user', content: 'First user message', createdAt: 10 },
      { role: 'assistant', content: 'First assistant message', createdAt: 11 },
      { role: 'user', content: 'Second user message', createdAt: 12 },
      { role: 'assistant', content: 'Second assistant message', createdAt: 13 },
    ];
    writeHistory(chatId, previousMessages);

    const { response, data } = await infer(chatId, { message: 'Current user message' });

    assert.strictEqual(response.status, 200);
    assert.equal(data.message, 'Assistant answer');
    const captured = capturedRequests[capturedRequests.length - 1];
    const capturedBody = captured.body as {
      model: string;
      messages: Array<{ role: string; content: string }>;
    };
    assert.equal(captured.url, '/saved/v1/chat/completions');
    assert.equal(capturedBody.model, 'history-model');
    assert.equal(capturedBody.messages[0].role, 'system');
    assert.match(capturedBody.messages[0].content, /^Current date: \d{4}-\d{2}-\d{2}$/);
    assert.deepStrictEqual(capturedBody.messages.slice(1), [
      { role: 'user', content: 'First user message' },
      { role: 'assistant', content: 'First assistant message' },
      { role: 'user', content: 'Second user message' },
      { role: 'assistant', content: 'Second assistant message' },
      { role: 'user', content: 'Current user message' },
    ]);
    const modelMessages = capturedBody.messages;
    assert.strictEqual(
      modelMessages.filter((modelMessage) => modelMessage.content === 'Current user message')
        .length,
      1,
    );

    const history = await getMessages(chatId);
    assert.deepStrictEqual(
      history.data.messages.map((storedMessage: { type: string; content: string }) => ({
        type: storedMessage.type,
        content: storedMessage.content,
      })),
      [
        ...previousMessages.map(({ role, content }) => ({ type: role, content })),
        { type: 'user', content: 'Current user message' },
        { type: 'assistant', content: 'Assistant answer' },
      ],
    );
  });

  it('does not invoke the model or append the current message for malformed history', async () => {
    const connectionId = insertConnection();
    const chatId = insertChat({ modelConnectionId: connectionId, modelId: 'saved-model' });
    const historyDirectory = resolve(process.env.CHAT_HISTORY_PATH as string, 'user-1');
    mkdirSync(historyDirectory, { recursive: true });
    writeFileSync(resolve(historyDirectory, `chat-${chatId}.jsonl`), '{not-json}\n', 'utf8');
    const requestCount = inferenceRequestCount();

    const { response, data } = await infer(chatId, { message: 'Must not be sent' });

    assert.strictEqual(response.status, 500);
    assert.deepStrictEqual(data, { error: 'Failed to run chat inference' });
    assert.strictEqual(inferenceRequestCount(), requestCount);
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
    const history = await getMessages(chatId);
    assert.deepStrictEqual(
      history.data.messages.map((message: { type: string; content: string }) => ({
        type: message.type,
        content: message.content,
      })),
      [{ type: 'user', content: 'Hello' }],
    );
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

  it('reports server-derived admin capability and allows admin logging settings updates', async () => {
    process.env.DEFAULT_USER_ID = '1';
    const meResponse = await fetch(`${APP_URL}/api/me`);
    assert.equal(meResponse.status, 200);
    assert.deepEqual(await meResponse.json(), { isAdmin: true });

    const initialResponse = await fetch(`${APP_URL}/api/admin/settings/logging`);
    assert.equal(initialResponse.status, 200);
    assert.deepEqual(await initialResponse.json(), {
      level: 'info',
      applicationLogEnabled: true,
      modelInferenceLogEnabled: true,
      clearLogsOnStartup: false,
    });

    const updateResponse = await fetch(`${APP_URL}/api/admin/settings/logging`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        level: 'debug',
        applicationLogEnabled: false,
        modelInferenceLogEnabled: true,
        clearLogsOnStartup: true,
      }),
    });
    assert.equal(updateResponse.status, 200);
    assert.deepEqual(await updateResponse.json(), {
      level: 'debug',
      applicationLogEnabled: false,
      modelInferenceLogEnabled: true,
      clearLogsOnStartup: true,
    });
    const db = new Database(process.env.DB_PATH as string);
    const row = db.prepare('SELECT data FROM system_settings WHERE id = 1').get() as {
      data: string;
    };
    assert.deepEqual(JSON.parse(row.data), {
      level: 'debug',
      applicationLogEnabled: false,
      modelInferenceLogEnabled: true,
      clearLogsOnStartup: true,
    });
    db.close();
  });

  it('rejects invalid admin settings and forbids a non-admin server identity', async () => {
    process.env.DEFAULT_USER_ID = '1';
    const validSettings = {
      level: 'info',
      applicationLogEnabled: true,
      modelInferenceLogEnabled: true,
      clearLogsOnStartup: false,
    };
    for (const body of [
      { ...validSettings, level: 'verbose' },
      { ...validSettings, applicationLogEnabled: 'yes' },
      { ...validSettings, modelInferenceLogEnabled: 'yes' },
      { ...validSettings, clearLogsOnStartup: 'yes' },
    ]) {
      const response = await fetch(`${APP_URL}/api/admin/settings/logging`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      assert.equal(response.status, 400);
    }

    process.env.DEFAULT_USER_ID = '2';
    try {
      const meResponse = await fetch(`${APP_URL}/api/me`);
      assert.deepEqual(await meResponse.json(), { isAdmin: false });
      const getResponse = await fetch(`${APP_URL}/api/admin/settings/logging`);
      const runtimeGetResponse = await fetch(
        `${APP_URL}/api/admin/settings/agent-runtime-limits`,
      );
      const putResponse = await fetch(`${APP_URL}/api/admin/settings/logging`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...validSettings, level: 'trace' }),
      });
      assert.equal(getResponse.status, 403);
      assert.equal(putResponse.status, 403);
      assert.equal(runtimeGetResponse.status, 403);
      assert.deepEqual(await getResponse.json(), { error: 'Forbidden' });
    } finally {
      process.env.DEFAULT_USER_ID = '1';
    }
  });

  it('persists validated Agent runtime limits through the admin API', async () => {
    const initialResponse = await fetch(`${APP_URL}/api/admin/settings/agent-runtime-limits`);
    assert.equal(initialResponse.status, 200);
    const initialConfiguration = (await initialResponse.json()) as {
      limits: unknown;
      defaults: unknown;
      bounds: unknown;
    };
    assert.deepEqual(initialConfiguration.limits, AGENT_RUNTIME_LIMITS_DEFAULTS);
    assert.deepEqual(initialConfiguration.defaults, AGENT_RUNTIME_LIMITS_DEFAULTS);
    assert.equal(typeof initialConfiguration.bounds, 'object');

    const limits = {
      ...AGENT_RUNTIME_LIMITS_DEFAULTS,
      toolResultCharacters: 48_000,
      assignmentCharacters: 120_000,
      inlineInstructionsCharacters: 24_000,
      attachedFileBytes: 300 * 1024,
      attachedFilesTotalBytes: 2 * 1024 * 1024,
    };
    const updateResponse = await fetch(`${APP_URL}/api/admin/settings/agent-runtime-limits`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(limits),
    });
    assert.equal(updateResponse.status, 200);
    assert.deepEqual(await updateResponse.json(), limits);

    const invalidResponse = await fetch(`${APP_URL}/api/admin/settings/agent-runtime-limits`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...limits, attachedFilesTotalBytes: limits.attachedFileBytes - 1 }),
    });
    assert.equal(invalidResponse.status, 400);
    const reloadedResponse = await fetch(`${APP_URL}/api/admin/settings/agent-runtime-limits`);
    const reloaded = (await reloadedResponse.json()) as { limits: unknown };
    assert.deepEqual(reloaded.limits, limits);
  });
});
