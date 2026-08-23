import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import type { Server } from 'node:http';
import { resolve, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { existsSync } from 'node:fs';

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

const BASE_URL = 'http://localhost:3999';

interface ExpressLike {
  listen(port: number, callback: () => void): Server;
}

let httpServer: Server | null;

await describe('POST /api/chat', () => {
  before(async () => {
    const serverModule = await import(
      pathToFileURL(resolve(projectRoot, 'dist/server.js')).href
    );
    const candidate = serverModule.default || serverModule.app;

    if (candidate && typeof (candidate as ExpressLike).listen === 'function') {
      httpServer = (candidate as ExpressLike).listen(3999, () => {
        // Server is ready
      });
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
  });

  it('should return stub response for valid message', async () => {
    const response = await fetch(BASE_URL + '/api/chat', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ message: 'Hello' }),
    });

    assert.strictEqual(response.status, 200);

    const data = await response.json();
    assert.strictEqual(data.message, 'Stub response: Hello');
  });

  it('should trim whitespace from message', async () => {
    const response = await fetch(BASE_URL + '/api/chat', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ message: '  Hello  ' }),
    });

    assert.strictEqual(response.status, 200);

    const data = await response.json();
    assert.strictEqual(data.message, 'Stub response: Hello');
  });

  it('should return 400 for empty message', async () => {
    const response = await fetch(BASE_URL + '/api/chat', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ message: '' }),
    });

    assert.strictEqual(response.status, 400);
  });

  it('should return 400 for whitespace-only message', async () => {
    const response = await fetch(BASE_URL + '/api/chat', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ message: '   ' }),
    });

    assert.strictEqual(response.status, 400);
  });

  it('should return 400 when message is missing', async () => {
    const response = await fetch(BASE_URL + '/api/chat', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({}),
    });

    assert.strictEqual(response.status, 400);
  });

  it('should return 400 when message is not a string', async () => {
    const response = await fetch(BASE_URL + '/api/chat', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ message: 123 }),
    });

    assert.strictEqual(response.status, 400);
  });

  it('should return 400 for non-JSON body', async () => {
    const response = await fetch(BASE_URL + '/api/chat', {
      method: 'POST',
      headers: {
        'Content-Type': 'text/plain',
      },
      body: 'not json',
    });

    assert.strictEqual(response.status, 400);
  });
});
