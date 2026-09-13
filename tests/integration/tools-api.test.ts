import { after, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import type { Server } from 'node:http';

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
assert.ok(projectRoot);
const testRoot = mkdtempSync(`${tmpdir()}web07-tools-api-`);
process.env.DB_PATH = resolve(testRoot, 'test.db');
process.env.CHAT_HISTORY_PATH = resolve(testRoot, 'history');
process.env.LOG_DIRECTORY = resolve(testRoot, 'logs');
const APP_URL = 'http://127.0.0.1:3990';

interface ExpressLike {
  listen(port: number, callback: () => void): Server;
}

let server: Server | null = null;

await describe('Tools API', () => {
  before(async () => {
    const module = await import(pathToFileURL(resolve(projectRoot, 'dist/server.js')).href);
    await new Promise<void>((resolveListening) => {
      server = (module.default as ExpressLike).listen(3990, resolveListening);
    });
  });

  after(async () => {
    if (server) {
      await new Promise<void>((resolveClosed) => server!.close(() => resolveClosed()));
    }
  });

  it('lists all registered tools with disabled defaults', async () => {
    const response = await fetch(`${APP_URL}/api/tools`);
    const data = (await response.json()) as Array<Record<string, unknown>>;
    assert.equal(response.status, 200);
    assert.ok(Array.isArray(data), JSON.stringify(data));
    assert.equal(data.length, 5);
    assert.equal(data[0].name, 'duckduckgo_search');
    assert.deepEqual(data[0].settings, {
      enabledForChat: false,
      pageSize: 5,
      safeSearch: 'moderate',
      requestDelayMs: 1500,
      cooldownAfter202Ms: 8000,
    });
    assert.equal(data[1].name, 'visit_website');
    assert.deepEqual(data[1].settings, {
      enabledForChat: false,
      contentLimit: 2000,
      maxLinks: 10,
      maxImages: 5,
    });
    assert.equal(data[2].name, 'fred_data');
    assert.deepEqual(data[2].settings, {
      enabledForChat: false,
    });
    assert.equal(data[3].name, 'yahoo_finance_data');
    assert.deepEqual(data[3].settings, {
      enabledForChat: false,
    });
    assert.equal(data[4].name, 'run_agent');
    assert.equal(data[4].displayName, 'Agent Runner');
    assert.equal(data[4].agentOnly, true);
    assert.deepEqual(data[4].inputSchema, {
      type: 'object',
      properties: {},
      additionalProperties: false,
    });
    assert.deepEqual(data[4].settings, { enabledForChat: false });
  });

  it('saves and validates Visit Website settings', async () => {
    const settings = { enabledForChat: true, contentLimit: 4000, maxLinks: 20, maxImages: 0 };
    const saved = await fetch(`${APP_URL}/api/tools/visit_website/settings`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(settings),
    });
    assert.equal(saved.status, 200);
    assert.deepEqual(await saved.json(), settings);
    const reloaded = await fetch(`${APP_URL}/api/tools/visit_website/settings`);
    assert.deepEqual(await reloaded.json(), settings);
    const invalid = await fetch(`${APP_URL}/api/tools/visit_website/settings`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...settings, maxImages: 21 }),
    });
    assert.equal(invalid.status, 400);
  });

  it('saves and reloads settings without accepting a client user id', async () => {
    const response = await fetch(`${APP_URL}/api/tools/duckduckgo_search/settings`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        enabledForChat: true,
        pageSize: 8,
        safeSearch: 'strict',
        userId: 2,
      }),
    });
    assert.equal(response.status, 400);

    const valid = await fetch(`${APP_URL}/api/tools/duckduckgo_search/settings`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        enabledForChat: true,
        pageSize: 8,
        safeSearch: 'strict',
        requestDelayMs: 1,
        cooldownAfter202Ms: 8000,
      }),
    });
    assert.equal(valid.status, 200);
    const reloaded = await fetch(`${APP_URL}/api/tools/duckduckgo_search/settings`);
    assert.deepEqual(await reloaded.json(), {
      enabledForChat: true,
      pageSize: 8,
      safeSearch: 'strict',
      requestDelayMs: 1,
      cooldownAfter202Ms: 8000,
    });
  });

  it('rejects invalid values and unregistered tool names', async () => {
    const invalid = await fetch(`${APP_URL}/api/tools/duckduckgo_search/settings`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ enabledForChat: true, pageSize: 11, safeSearch: 'off' }),
    });
    const unknown = await fetch(`${APP_URL}/api/tools/fetch_url/settings`);
    assert.equal(invalid.status, 400);
    assert.equal(unknown.status, 404);

    for (const invalidPacing of [
      { requestDelayMs: -1, cooldownAfter202Ms: 8000 },
      { requestDelayMs: 1.5, cooldownAfter202Ms: 8000 },
      { requestDelayMs: '1500', cooldownAfter202Ms: 8000 },
      { requestDelayMs: null, cooldownAfter202Ms: 8000 },
      { requestDelayMs: 1500, cooldownAfter202Ms: -1 },
    ]) {
      const invalidResponse = await fetch(`${APP_URL}/api/tools/duckduckgo_search/settings`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          enabledForChat: true,
          pageSize: 5,
          safeSearch: 'moderate',
          ...invalidPacing,
        }),
      });
      assert.equal(invalidResponse.status, 400);
    }
  });
});
