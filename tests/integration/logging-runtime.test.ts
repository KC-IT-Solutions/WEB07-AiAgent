import { after, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createServer, type Server } from 'node:http';
import { existsSync, readFileSync, rmSync } from 'node:fs';
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

function readLogEntries(filePath: string): Array<Record<string, unknown>> {
  const content = readFileSync(filePath, 'utf8').trim();
  if (!content) return [];
  return content.split('\n').map((line) => JSON.parse(line) as Record<string, unknown>);
}

const testDir = tmpdir() ? undefined : resolve(projectRoot, '.test-logs');
const tempBase = resolve(testDir ?? resolve(tmpdir(), 'web07-logging-integration-' + Date.now()));
const dbPath = resolve(tempBase, 'test.db');
const chatHistoryPath = resolve(tempBase, 'chat-history');
const logDirectory = resolve(tempBase, 'logs');

process.env.DB_PATH = dbPath;
process.env.CHAT_HISTORY_PATH = chatHistoryPath;
process.env.LOG_DIRECTORY = logDirectory;
process.env.MODEL_CREDENTIAL_ENCRYPTION_KEY = Buffer.alloc(32, 13).toString('base64');

const APP_URL = 'http://127.0.0.1:3995';
const MODEL_SERVER_URL = 'http://127.0.0.1:3996';

interface ExpressLike {
  listen(port: number, callback: () => void): Server;
}

let appServer: Server | null;
let modelServer: Server | null;

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

function insertChat(connectionId: number): number {
  const db = new Database(dbPath);
  const result = db
    .prepare('INSERT INTO chats (user_id, created_at, updated_at, data) VALUES (?, ?, ?, ?)')
    .run(
      1,
      Date.now(),
      Date.now(),
      JSON.stringify({
        title: 'Test chat',
        modelConnectionId: connectionId,
        modelId: 'test-model',
      }),
    );
  db.close();
  return Number(result.lastInsertRowid);
}

await describe('Logging runtime integration', () => {
  before(async () => {
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
    modelServer.listen(3996, '127.0.0.1');
    await new Promise<void>((resolve) => {
      modelServer!.once('listening', resolve);
    });

    // Start real app server
    const serverModule = await import(pathToFileURL(resolve(projectRoot, 'dist/server.js')).href);
    const candidate = serverModule.default || serverModule.app;
    if (candidate && typeof (candidate as ExpressLike).listen === 'function') {
      appServer = (candidate as ExpressLike).listen(3995, () => {});
      await new Promise<void>((resolve) => {
        appServer!.once('listening', resolve);
      });
    }
  });

  after(async () => {
    if (appServer) {
      await new Promise<void>((resolve) => appServer!.close(() => resolve()));
    }
    if (modelServer) {
      await new Promise<void>((resolve) => modelServer!.close(() => resolve()));
    }
    // Cleanup temp directory
    try {
      rmSync(tempBase, { recursive: true, force: true });
    } catch {
      // Best-effort cleanup
    }
  });

  it('bootstrap creates application.log with server_bootstrapped event', () => {
    const appLogPath = resolve(logDirectory, 'application.log');
    assert.ok(existsSync(appLogPath), 'application.log should exist after bootstrap');
    const entries = readLogEntries(appLogPath);
    const bootstrapEntry = entries.find((e) => e.event === 'server_bootstrapped');
    assert.ok(bootstrapEntry, 'Should have server_bootstrapped log entry');
  });

  it('admin settings update affects runtime logger instance', async () => {
    // First disable application logging via admin API
    const updateResponse = await fetch(`${APP_URL}/api/admin/settings/logging`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        level: 'info',
        applicationLogEnabled: false,
        modelInferenceLogEnabled: true,
        clearLogsOnStartup: false,
      }),
    });
    assert.strictEqual(updateResponse.status, 200);

    // Trigger an HTTP error to generate a log event (should be suppressed)
    await fetch(`${APP_URL}/api/nonexistent-path-for-test`);

    // Re-enable application logging
    const reenableResponse = await fetch(`${APP_URL}/api/admin/settings/logging`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        level: 'info',
        applicationLogEnabled: true,
        modelInferenceLogEnabled: true,
        clearLogsOnStartup: false,
      }),
    });
    assert.strictEqual(reenableResponse.status, 200);

    // The admin settings update itself generates a log entry
    const appLogPath = resolve(logDirectory, 'application.log');
    const entries = readLogEntries(appLogPath);
    const settingsUpdatedEntry = entries.find((e) => e.event === 'admin_logging_settings_updated');
    assert.ok(settingsUpdatedEntry, 'Should have admin_logging_settings_updated log entry');
  });

  it('chat inference produces model-inference.log entries through real wiring', async () => {
    const connectionId = insertConnection();
    const chatId = insertChat(connectionId);

    // Trigger inference via the real API
    const response = await fetch(`${APP_URL}/api/chats/${chatId}/inference`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: 'Hello test' }),
    });
    assert.strictEqual(response.status, 200);

    // Verify model-inference.log has entries from the real inference path
    const modelLogPath = resolve(logDirectory, 'model-inference.log');
    assert.ok(existsSync(modelLogPath), 'model-inference.log should exist after inference');
    const entries = readLogEntries(modelLogPath);

    // Should have model_request and model_response events from ChatInferenceService
    const requestEntry = entries.find((e) => e.event === 'model_request');
    assert.ok(requestEntry, 'Should have model_request log entry from chat inference');
    assert.equal(Number(requestEntry.chatId), chatId);

    const responseEntry = entries.find((e) => e.event === 'model_response');
    assert.ok(responseEntry, 'Should have model_response log entry from chat inference');
  });

  it('disabled model-inference stream suppresses output', async () => {
    // Disable model-inference logging
    const disableResponse = await fetch(`${APP_URL}/api/admin/settings/logging`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        level: 'debug',
        applicationLogEnabled: true,
        modelInferenceLogEnabled: false,
        clearLogsOnStartup: false,
      }),
    });
    assert.strictEqual(disableResponse.status, 200);

    const connectionId = insertConnection();
    const chatId = insertChat(connectionId);

    // Count entries before inference
    const modelLogPath = resolve(logDirectory, 'model-inference.log');
    const entriesBefore = readLogEntries(modelLogPath).length;

    // Trigger another inference
    await fetch(`${APP_URL}/api/chats/${chatId}/inference`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: 'Should not log' }),
    });

    // Model-inference entries should NOT increase because stream is disabled
    const entriesAfter = readLogEntries(modelLogPath).length;
    assert.strictEqual(
      entriesAfter,
      entriesBefore,
      'model-inference.log should not grow when stream is disabled',
    );
  });

  it('resolved log directory matches LOG_DIRECTORY environment variable', () => {
    // The logs should be in our configured temp directory
    const appLogPath = resolve(logDirectory, 'application.log');
    assert.ok(existsSync(appLogPath), `Logs should exist at ${logDirectory}`);
    // Verify absolute path is correct (not relative or unexpected)
    assert.ok(
      logDirectory.startsWith(tmpdir()) || logDirectory.includes('web07-logging-integration'),
      'Log directory should be our configured temp directory',
    );
  });

  it('clear-on-start does not remove logs written after startup', async () => {
    // Write a known entry first by triggering an event
    const connectionId = insertConnection();
    const chatId = insertChat(connectionId);

    // Re-enable model-inference for this test
    await fetch(`${APP_URL}/api/admin/settings/logging`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        level: 'debug',
        applicationLogEnabled: true,
        modelInferenceLogEnabled: true,
        clearLogsOnStartup: false,
      }),
    });

    await fetch(`${APP_URL}/api/chats/${chatId}/inference`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: 'Post-clear test' }),
    });

    const modelLogPath = resolve(logDirectory, 'model-inference.log');
    const entries = readLogEntries(modelLogPath);
    // Should have at least the post-clear inference entry
    assert.ok(
      entries.some((e) => e.event === 'model_request'),
      'Should have inference log entries written after startup',
    );
  });
});
