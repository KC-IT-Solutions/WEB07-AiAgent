import { after, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import type { Server } from 'node:http';

const __dirname = dirname(fileURLToPath(import.meta.url));

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
const testRoot = mkdtempSync(resolve(tmpdir(), 'web07-skills-api-'));
process.env.DB_PATH = resolve(testRoot, 'test.db');
process.env.CHAT_HISTORY_PATH = resolve(testRoot, 'history');
process.env.SKILL_CONTENT_PATH = resolve(testRoot, 'skills');
process.env.LOG_DIRECTORY = resolve(testRoot, 'logs');
process.env.DEFAULT_USER_ID = '1';
const APP_URL = 'http://127.0.0.1:3991';

interface ExpressLike {
  listen(port: number, callback: () => void): Server;
}

let server: Server | null = null;
const validInput = {
  name: 'Research',
  commandName: 'research',
  markdown: '# Research safely',
  requiredTools: ['duckduckgo_search', 'visit_website'],
};

await describe('Admin Skills API', () => {
  before(async () => {
    const module = await import(pathToFileURL(resolve(projectRoot, 'dist/server.js')).href);
    await new Promise<void>((resolveListening) => {
      server = (module.default as ExpressLike).listen(3991, resolveListening);
    });
  });

  after(async () => {
    if (server) {
      await new Promise<void>((resolveClosed) => server!.close(() => resolveClosed()));
    }
  });

  it('allows an admin to create, list, read, update, and delete a complete Skill', async () => {
    const createResponse = await fetch(`${APP_URL}/api/admin/skills`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(validInput),
    });
    assert.equal(createResponse.status, 201);
    const created = (await createResponse.json()) as Record<string, unknown>;
    assert.equal(created.name, validInput.name);
    assert.equal(created.markdown, validInput.markdown);
    assert.deepEqual(created.requiredTools, validInput.requiredTools);
    assert.ok(!JSON.stringify(created).includes(testRoot));
    assert.ok(!('path' in created));
    const id = created.id as number;
    assert.equal(
      readFileSync(resolve(testRoot, 'skills', `skill-${id}.md`), 'utf8'),
      validInput.markdown,
    );

    const listResponse = await fetch(`${APP_URL}/api/admin/skills`);
    assert.equal(listResponse.status, 200);
    assert.equal(((await listResponse.json()) as unknown[]).length, 1);
    const getResponse = await fetch(`${APP_URL}/api/admin/skills/${id}`);
    assert.equal(getResponse.status, 200);

    const updateResponse = await fetch(`${APP_URL}/api/admin/skills/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'Updated',
        commandName: 'updated-research',
        markdown: '# Updated',
        requiredTools: ['visit_website'],
      }),
    });
    assert.equal(updateResponse.status, 200);
    const updated = (await updateResponse.json()) as Record<string, unknown>;
    assert.equal(updated.commandName, 'updated-research');
    assert.deepEqual(updated.requiredTools, ['visit_website']);

    const deleteResponse = await fetch(`${APP_URL}/api/admin/skills/${id}`, { method: 'DELETE' });
    assert.equal(deleteResponse.status, 204);
    assert.equal((await fetch(`${APP_URL}/api/admin/skills/${id}`)).status, 404);
    assert.equal(existsSync(resolve(testRoot, 'skills', `skill-${id}.md`)), false);
  });

  it('safely rejects duplicate, reserved, malformed command, tool, Markdown, and unknown fields', async () => {
    const first = await fetch(`${APP_URL}/api/admin/skills`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(validInput),
    });
    assert.equal(first.status, 201);
    const invalidInputs = [
      validInput,
      { ...validInput, commandName: 'clear' },
      { ...validInput, commandName: 'Uppercase' },
      { ...validInput, commandName: 'has space' },
      { ...validInput, commandName: 'other', requiredTools: ['unknown'] },
      { ...validInput, commandName: 'other', markdown: 42 },
      { ...validInput, commandName: 'other', unexpected: true },
      { ...validInput, commandName: 'other', requiredTools: ['visit_website', 'visit_website'] },
    ];
    const expectedStatuses = [409, 400, 400, 400, 400, 400, 400, 400];
    for (const [index, body] of invalidInputs.entries()) {
      const response = await fetch(`${APP_URL}/api/admin/skills`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      assert.equal(response.status, expectedStatuses[index]);
    }
  });

  it('rejects every administration endpoint for a non-admin server identity', async () => {
    process.env.DEFAULT_USER_ID = '2';
    try {
      const requests = [
        fetch(`${APP_URL}/api/admin/skills`),
        fetch(`${APP_URL}/api/admin/skills`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(validInput),
        }),
        fetch(`${APP_URL}/api/admin/skills/1`),
        fetch(`${APP_URL}/api/admin/skills/1`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(validInput),
        }),
        fetch(`${APP_URL}/api/admin/skills/1`, { method: 'DELETE' }),
      ];
      for (const response of await Promise.all(requests)) {
        assert.equal(response.status, 403);
        assert.deepEqual(await response.json(), { error: 'Forbidden' });
      }
    } finally {
      process.env.DEFAULT_USER_ID = '1';
    }
  });
});
