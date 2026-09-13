import { after, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createServer, type Server } from 'node:http';
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
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

function insertConnection(): number {
  const db = new Database(dbPath);
  const result = db
    .prepare(
      'INSERT INTO model_connections (user_id, created_at, updated_at, data) VALUES (?, ?, ?, ?)',
    )
    .run(
      1,
      Date.now(),
      Date.now(),
      JSON.stringify({
        name: 'Test connection',
        baseUrl: `${MODEL_SERVER_URL}/test`,
        timeoutMinutes: 1,
        modelId: null,
        enabled: true,
      }),
    );
  db.close();
  return Number(result.lastInsertRowid);
}

const tempBase = resolve(tmpdir(), 'web07-log-viewer-integration-' + Date.now());
const dbPath = resolve(tempBase, 'test.db');
const chatHistoryPath = resolve(tempBase, 'chat-history');
const logDirectory = resolve(tempBase, 'logs');

process.env.DB_PATH = dbPath;
process.env.CHAT_HISTORY_PATH = chatHistoryPath;
process.env.LOG_DIRECTORY = logDirectory;
process.env.MODEL_CREDENTIAL_ENCRYPTION_KEY = Buffer.alloc(32, 13).toString('base64');

const APP_URL = 'http://127.0.0.1:3998';
const MODEL_SERVER_URL = 'http://127.0.0.1:3999';

interface ExpressLike {
  listen(port: number, callback: () => void): Server;
}

let appServer: Server | null;
let modelServer: Server | null;

await describe('Admin log viewer API', () => {
  before(async () => {
    mkdirSync(logDirectory, { recursive: true });
    mkdirSync(chatHistoryPath, { recursive: true });

    // Write seed JSONL entries for testing
    writeFileSync(
      resolve(logDirectory, 'application.log'),
      '{"timestamp":"2026-08-29T14:53:35.625Z","level":"info","event":"server_started","port":3000}\n',
      'utf8',
    );
    writeFileSync(
      resolve(logDirectory, 'model-inference.log'),
      '{"timestamp":"2026-08-29T14:54:00.000Z","level":"info","event":"model_request","chatId":1}\n',
      'utf8',
    );

    // Mock model server
    modelServer = createServer((_request, response) => {
      response.writeHead(200, { 'Content-Type': 'application/json' });
      if ((_request.url ?? '').endsWith('/v1/models')) {
        response.end(JSON.stringify({ data: [{ id: 'test-model' }] }));
        return;
      }
      response.end(
        JSON.stringify({
          choices: [
            { message: { role: 'assistant', content: 'Test model response' } },
          ],
          usage: { total_tokens: 10 },
        }),
      );
    });
    modelServer.listen(3999, '127.0.0.1');
    await new Promise<void>((resolve) => {
      modelServer!.once('listening', resolve);
    });

    // Start real app server
    const serverModule = await import(pathToFileURL(resolve(projectRoot, 'dist/server.js')).href);
    const candidate = serverModule.default || serverModule.app;
    if (candidate && typeof (candidate as ExpressLike).listen === 'function') {
      appServer = (candidate as ExpressLike).listen(3998, () => {});
      await new Promise<void>((resolve) => {
        appServer!.once('listening', resolve);
      });
    }

    // Insert a model connection for inference tests
    insertConnection();
  });

  after(async () => {
    if (appServer) {
      await new Promise<void>((resolve) => appServer!.close(() => resolve()));
    }
    if (modelServer) {
      await new Promise<void>((resolve) => modelServer!.close(() => resolve()));
    }
    try {
      rmSync(tempBase, { recursive: true, force: true });
    } catch {
      // Best-effort cleanup
    }
  });

  it('application log readable endpoint returns formatted content', async () => {
    const response = await fetch(`${APP_URL}/api/admin/logs/application/readable`);
    assert.strictEqual(response.status, 200);
    assert.ok(
      (response.headers.get('content-type') ?? '').includes('text/plain'),
      'should return text/plain',
    );
    const text = await response.text();
    assert.ok(text.includes('INFO'), 'should contain uppercase level');
    assert.ok(text.includes('server_started'), 'should contain event name');
  });

  it('model-inference log readable endpoint returns formatted content', async () => {
    const response = await fetch(`${APP_URL}/api/admin/logs/model-inference/readable`);
    assert.strictEqual(response.status, 200);
    const text = await response.text();
    assert.ok(text.includes('INFO'), 'should contain uppercase level');
    assert.ok(text.includes('model_request'), 'should contain event name');
  });

  it('download endpoint returns attachment with correct filename', async () => {
    const response = await fetch(`${APP_URL}/api/admin/logs/application/download`);
    assert.strictEqual(response.status, 200);
    const disposition = response.headers.get('content-disposition') ?? '';
    assert.ok(disposition.includes('application.log'), 'should have correct filename');
    assert.ok(disposition.includes('attachment'), 'should be attachment');
  });

  it('download returns readable content not raw JSONL', async () => {
    const response = await fetch(`${APP_URL}/api/admin/logs/application/download`);
    const text = await response.text();
    assert.ok(!text.startsWith('{'), 'should not start with raw JSON');
    assert.ok(text.includes('INFO'), 'should contain formatted level');
  });

  it('invalid stream identifier is rejected', async () => {
    const response = await fetch(`${APP_URL}/api/admin/logs/../../etc/passwd/readable`);
    assert.notStrictEqual(response.status, 200);
  });

  it('arbitrary stream name is rejected', async () => {
    const response = await fetch(`${APP_URL}/api/admin/logs/arbitrary-stream/readable`);
    assert.strictEqual(response.status, 400);
  });

  it('empty log returns empty readable content', async () => {
    // Create an empty model-inference log by temporarily writing nothing
    writeFileSync(resolve(logDirectory, 'model-inference.log'), '', 'utf8');
    const response = await fetch(`${APP_URL}/api/admin/logs/model-inference/readable`);
    assert.strictEqual(response.status, 200);
    const text = await response.text();
    assert.equal(text.trim(), '');
  });

  it('viewer and download use identical formatting', async () => {
    // Restore application log content for comparison
    writeFileSync(
      resolve(logDirectory, 'application.log'),
      '{"timestamp":"2026-08-29T14:53:35.625Z","level":"info","event":"server_started","port":3000}\n',
      'utf8',
    );

    const viewResponse = await fetch(`${APP_URL}/api/admin/logs/application/readable`);
    const downloadResponse = await fetch(`${APP_URL}/api/admin/logs/application/download`);
    const viewText = await viewResponse.text();
    const downloadText = await downloadResponse.text();
    assert.strictEqual(viewText, downloadText, 'viewer and download should return identical content');
  });

  it('original JSONL files remain unchanged', async () => {
    // Restore application log for verification
    writeFileSync(
      resolve(logDirectory, 'application.log'),
      '{"timestamp":"2026-08-29T14:53:35.625Z","level":"info","event":"server_started","port":3000}\n',
      'utf8',
    );

    // Call the readable endpoint
    await fetch(`${APP_URL}/api/admin/logs/application/readable`);

    // Verify original file is still JSONL
    const rawContent = readFileSync(resolve(logDirectory, 'application.log'), 'utf8');
    assert.ok(rawContent.startsWith('{'), 'original file should still be JSONL');
  });
});
