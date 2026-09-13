import { after, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdtempSync } from 'node:fs';
import { stat, utimes } from 'node:fs/promises';
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
const testRoot = mkdtempSync(resolve(tmpdir(), 'web07-projects-api-'));
process.env.DB_PATH = resolve(testRoot, 'test.db');
process.env.CHAT_HISTORY_PATH = resolve(testRoot, 'history');
process.env.SKILL_CONTENT_PATH = resolve(testRoot, 'skills');
process.env.PROJECTS_PATH = resolve(testRoot, 'projects');
process.env.PROJECT_FILE_UPLOAD_MAX_BYTES = '8';
process.env.LOG_DIRECTORY = resolve(testRoot, 'logs');
process.env.DEFAULT_USER_ID = '1';

interface ExpressLike {
  listen(port: number, callback: () => void): Server;
}

let server: Server | null = null;
let appUrl = '';

async function createProject(name: string, description = ''): Promise<Record<string, unknown>> {
  const response = await fetch(`${appUrl}/api/projects`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, description }),
  });
  assert.equal(response.status, 201);
  return (await response.json()) as Record<string, unknown>;
}

await describe('Projects API', () => {
  before(async () => {
    const module = await import(pathToFileURL(resolve(projectRoot, 'dist/server.js')).href);
    await new Promise<void>((resolveListening, rejectListening) => {
      const started = (module.default as ExpressLike).listen(0, () => {
        const address = started.address();
        if (!address || typeof address === 'string') {
          rejectListening(new Error('Projects API test server has no TCP address'));
          return;
        }
        appUrl = `http://127.0.0.1:${address.port}`;
        resolveListening();
      });
      server = started;
    });
  });

  after(async () => {
    if (server) {
      await new Promise<void>((resolveClosed) => server!.close(() => resolveClosed()));
    }
  });

  it('creates, lists, reads, updates, and deletes a safe project DTO and owned root', async () => {
    const created = await createProject('  Project A  ', '  First description  ');
    assert.equal(created.name, 'Project A');
    assert.equal(created.description, 'First description');
    assert.equal(typeof created.createdAt, 'number');
    assert.equal(created.createdAt, created.updatedAt);
    assert.ok(!('userId' in created));
    assert.ok(!('path' in created));
    assert.ok(!JSON.stringify(created).includes(testRoot));
    const id = created.id as number;
    const ownedRoot = resolve(testRoot, 'projects', 'user-1', `project-${id}`);
    assert.equal(existsSync(ownedRoot), true);

    const listResponse = await fetch(`${appUrl}/api/projects`);
    assert.equal(listResponse.status, 200);
    assert.deepEqual(
      ((await listResponse.json()) as Array<{ id: number }>).map((project) => project.id),
      [id],
    );
    const getResponse = await fetch(`${appUrl}/api/projects/${id}`);
    assert.equal(getResponse.status, 200);

    const updateResponse = await fetch(`${appUrl}/api/projects/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'Updated', description: 'Changed' }),
    });
    assert.equal(updateResponse.status, 200);
    const updated = (await updateResponse.json()) as Record<string, unknown>;
    assert.equal(updated.name, 'Updated');
    assert.equal(updated.description, 'Changed');
    assert.ok((updated.updatedAt as number) > (created.updatedAt as number));

    const deleteResponse = await fetch(`${appUrl}/api/projects/${id}`, { method: 'DELETE' });
    assert.equal(deleteResponse.status, 204);
    assert.equal(existsSync(ownedRoot), false);
    assert.equal((await fetch(`${appUrl}/api/projects/${id}`)).status, 404);
  });

  it('returns not found for every other-user project operation and filters lists', async () => {
    process.env.DEFAULT_USER_ID = '2';
    const other = await createProject('Other user', 'Private');
    const otherId = other.id as number;
    process.env.DEFAULT_USER_ID = '1';
    try {
      const list = (await (await fetch(`${appUrl}/api/projects`)).json()) as Array<{ id: number }>;
      assert.ok(!list.some((project) => project.id === otherId));
      assert.equal((await fetch(`${appUrl}/api/projects/${otherId}`)).status, 404);
      assert.equal(
        (
          await fetch(`${appUrl}/api/projects/${otherId}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name: 'Forbidden' }),
          })
        ).status,
        404,
      );
      assert.equal(
        (await fetch(`${appUrl}/api/projects/${otherId}`, { method: 'DELETE' })).status,
        404,
      );
      assert.equal(existsSync(resolve(testRoot, 'projects', 'user-2', `project-${otherId}`)), true);
    } finally {
      process.env.DEFAULT_USER_ID = '2';
      await fetch(`${appUrl}/api/projects/${otherId}`, { method: 'DELETE' });
      process.env.DEFAULT_USER_ID = '1';
    }
  });

  it('rejects invalid ids, malformed shapes, unknown fields, and client paths', async () => {
    const invalidCreates = [
      null,
      {},
      { name: '' },
      { name: 'Project', description: 1 },
      { name: 'Project', root: '../../outside' },
      { name: 'Project', userId: 2 },
    ];
    for (const body of invalidCreates) {
      const response = await fetch(`${appUrl}/api/projects`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      assert.equal(response.status, 400);
    }

    const project = await createProject('Valid');
    for (const body of [{}, { id: 2 }, { createdAt: 1 }, { path: '/tmp' }, { description: 3 }]) {
      const response = await fetch(`${appUrl}/api/projects/${project.id as number}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      assert.equal(response.status, 400);
    }
    assert.equal((await fetch(`${appUrl}/api/projects/not-an-id`)).status, 400);
    await fetch(`${appUrl}/api/projects/${project.id as number}`, { method: 'DELETE' });
  });

  it('manages Project-relative text files without exposing the server root', async () => {
    const project = await createProject('File API');
    const id = project.id as number;
    const requestJson = (url: string, method: string, body: unknown) =>
      fetch(`${appUrl}${url}`, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

    assert.equal(
      (await requestJson(`/api/projects/${id}/directory`, 'POST', { path: 'src' })).status,
      201,
    );
    assert.equal(
      (
        await requestJson(`/api/projects/${id}/file`, 'PUT', {
          path: 'src/example.ts',
          content: 'export const answer = 42;\n',
        })
      ).status,
      200,
    );
    const filePath = resolve(testRoot, 'projects', 'user-1', `project-${id}`, 'src', 'example.ts');
    const modifiedTime = new Date(2025, 6, 8, 9, 10, 11);
    await utimes(filePath, modifiedTime, modifiedTime);
    const filesystemModifiedAt = Math.trunc((await stat(filePath)).mtimeMs);

    const listingResponse = await fetch(`${appUrl}/api/projects/${id}/files?path=src`);
    assert.equal(listingResponse.status, 200);
    const listingText = await listingResponse.text();
    assert.ok(!listingText.includes(testRoot));
    const listing = JSON.parse(listingText) as {
      relativePath: string;
      entries: Array<{
        name: string;
        relativePath: string;
        type: string;
        size?: number;
        modifiedAt: number;
      }>;
    };
    assert.equal(listing.relativePath, 'src');
    assert.deepEqual(listing.entries, [
      {
        name: 'example.ts',
        relativePath: 'src/example.ts',
        type: 'file',
        size: 26,
        modifiedAt: filesystemModifiedAt,
      },
    ]);

    const fileResponse = await fetch(
      `${appUrl}/api/projects/${id}/file?path=${encodeURIComponent('src/example.ts')}`,
    );
    assert.equal(fileResponse.status, 200);
    const fileText = await fileResponse.text();
    assert.ok(!fileText.includes(testRoot));
    assert.equal((JSON.parse(fileText) as { content: string }).content, 'export const answer = 42;\n');

    assert.equal(
      (
        await requestJson(`/api/projects/${id}/files/rename`, 'PUT', {
          sourcePath: 'src/example.ts',
          destinationPath: 'src/renamed.ts',
        })
      ).status,
      200,
    );
    assert.equal(
      (
        await requestJson(`/api/projects/${id}/files`, 'DELETE', {
          path: 'src/renamed.ts',
        })
      ).status,
      204,
    );
    assert.equal(
      (await fetch(`${appUrl}/api/projects/${id}/file?path=src%2Frenamed.ts`)).status,
      404,
    );
    await fetch(`${appUrl}/api/projects/${id}`, { method: 'DELETE' });
  });

  it('uploads, replaces, lists, and downloads bounded binary Project files by relative path', async () => {
    const project = await createProject('Binary API');
    const id = project.id as number;
    const binary = Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x00, 0xff, 0x10]);
    const createDirectoryResponse = await fetch(`${appUrl}/api/projects/${id}/directory`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ path: 'assets' }),
    });
    assert.equal(createDirectoryResponse.status, 201);

    const upload = (directory: string, filename: string, body: BodyInit) =>
      fetch(
        `${appUrl}/api/projects/${id}/files/upload?directory=${encodeURIComponent(directory)}&filename=${encodeURIComponent(filename)}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/octet-stream' },
          body,
        },
      );

    const uploadResponse = await upload('assets', 'pixel.png', binary);
    assert.equal(uploadResponse.status, 201);
    const uploadText = await uploadResponse.text();
    assert.ok(!uploadText.includes(testRoot));
    assert.deepEqual(JSON.parse(uploadText), { relativePath: 'assets/pixel.png', size: 7 });
    const uploadedPath = resolve(
      testRoot,
      'projects',
      'user-1',
      `project-${id}`,
      'assets',
      'pixel.png',
    );
    const uploadedTime = new Date(2001, 0, 1);
    await utimes(uploadedPath, uploadedTime, uploadedTime);
    const uploadedModifiedAt = Math.trunc((await stat(uploadedPath)).mtimeMs);
    assert.equal((await upload('', 'empty.bin', new Uint8Array())).status, 201);
    assert.equal((await upload('', 'notes.txt', new TextEncoder().encode('text'))).status, 201);

    const replacement = Uint8Array.from([1, 2]);
    const replacementResponse = await upload('assets', 'pixel.png', replacement);
    assert.equal(replacementResponse.status, 201);
    assert.deepEqual(await replacementResponse.json(), {
      relativePath: 'assets/pixel.png',
      size: replacement.byteLength,
    });
    const replacedModifiedAt = Math.trunc((await stat(uploadedPath)).mtimeMs);
    assert.notEqual(replacedModifiedAt, uploadedModifiedAt);

    const listingResponse = await fetch(`${appUrl}/api/projects/${id}/files?path=assets`);
    const listing = (await listingResponse.json()) as {
      entries: Array<{ name: string; relativePath: string; type: string; size: number; modifiedAt: number }>;
    };
    assert.deepEqual(listing.entries, [
      {
        name: 'pixel.png',
        relativePath: 'assets/pixel.png',
        type: 'file',
        size: replacement.byteLength,
        modifiedAt: replacedModifiedAt,
      },
    ]);

    const downloadResponse = await fetch(
      `${appUrl}/api/projects/${id}/files/download?path=${encodeURIComponent('assets/pixel.png')}`,
    );
    assert.equal(downloadResponse.status, 200);
    assert.equal(downloadResponse.headers.get('content-type'), 'application/octet-stream');
    assert.match(
      downloadResponse.headers.get('content-disposition') ?? '',
      /^attachment; filename="pixel\.png";/,
    );
    assert.deepEqual(new Uint8Array(await downloadResponse.arrayBuffer()), replacement);
    const textDownload = await fetch(
      `${appUrl}/api/projects/${id}/files/download?path=notes.txt`,
    );
    assert.equal(textDownload.status, 200);
    assert.equal(await textDownload.text(), 'text');

    const directoryResponse = await fetch(`${appUrl}/api/projects/${id}/directory`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ path: 'assets/archive' }),
    });
    assert.equal(directoryResponse.status, 201);
    const conflict = await upload('assets', 'archive', Uint8Array.from([1, 2, 3]));
    assert.equal(conflict.status, 409);
    assert.equal(((await conflict.json()) as { code: string }).code, 'PROJECT_FILE_CONFLICT');
    assert.equal((await stat(resolve(uploadedPath, '..', 'archive'))).isDirectory(), true);

    for (const filename of ['..', '../bad.bin', 'bad/name.bin', 'bad\\name.bin']) {
      assert.equal((await upload('', filename, new Uint8Array())).status, 400);
    }
    assert.equal((await upload('../outside', 'bad.bin', new Uint8Array())).status, 400);
    const oversized = await upload('', 'large.bin', new Uint8Array(9));
    assert.equal(oversized.status, 413);
    assert.equal(
      ((await oversized.json()) as { code: string }).code,
      'PROJECT_FILE_TOO_LARGE',
    );
    const oversizedReplacement = await upload('', 'notes.txt', new Uint8Array(9));
    assert.equal(oversizedReplacement.status, 413);
    const unchangedReplacementTarget = await fetch(
      `${appUrl}/api/projects/${id}/files/download?path=notes.txt`,
    );
    assert.equal(await unchangedReplacementTarget.text(), 'text');

    assert.equal(
      (await fetch(`${appUrl}/api/projects/${id}/files/download?path=assets`)).status,
      415,
    );
    assert.equal(
      (await fetch(`${appUrl}/api/projects/${id}/files/download?path=missing.bin`)).status,
      404,
    );
    for (const invalidPath of ['../outside.bin', 'C:\\temp\\file.bin', '/tmp/file.bin']) {
      const response = await fetch(
        `${appUrl}/api/projects/${id}/files/download?path=${encodeURIComponent(invalidPath)}`,
      );
      assert.equal(response.status, 400);
      assert.ok(!(await response.text()).includes(testRoot));
    }
    await fetch(`${appUrl}/api/projects/${id}`, { method: 'DELETE' });
  });

  it('enforces owned-Project lookup and the shared sandbox on every file endpoint', async () => {
    process.env.DEFAULT_USER_ID = '2';
    const other = await createProject('Other files');
    const otherId = other.id as number;
    process.env.DEFAULT_USER_ID = '1';
    try {
      assert.equal((await fetch(`${appUrl}/api/projects/${otherId}/files`)).status, 404);
      const forbiddenWrite = await fetch(`${appUrl}/api/projects/${otherId}/file`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path: '../../outside.txt', content: 'blocked' }),
      });
      assert.equal(forbiddenWrite.status, 404);
      const forbiddenUpload = await fetch(
        `${appUrl}/api/projects/${otherId}/files/upload?directory=&filename=private.bin`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/octet-stream' },
          body: Uint8Array.from([1]),
        },
      );
      assert.equal(forbiddenUpload.status, 404);
      assert.equal(
        (await fetch(`${appUrl}/api/projects/${otherId}/files/download?path=private.bin`)).status,
        404,
      );

      const own = await createProject('Sandbox API');
      const ownId = own.id as number;
      for (const path of ['..', '../secret.txt', 'C:\\secret.txt', '/etc/passwd', '..\\secret']) {
        const response = await fetch(
          `${appUrl}/api/projects/${ownId}/file?path=${encodeURIComponent(path)}`,
        );
        assert.equal(response.status, 400);
        assert.ok(!(await response.text()).includes(testRoot));
      }
      const rootDelete = await fetch(`${appUrl}/api/projects/${ownId}/files`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path: '' }),
      });
      assert.equal(rootDelete.status, 400);
      assert.equal(existsSync(resolve(testRoot, 'projects', 'user-1', `project-${ownId}`)), true);
      await fetch(`${appUrl}/api/projects/${ownId}`, { method: 'DELETE' });
    } finally {
      process.env.DEFAULT_USER_ID = '2';
      await fetch(`${appUrl}/api/projects/${otherId}`, { method: 'DELETE' });
      process.env.DEFAULT_USER_ID = '1';
    }
  });
});
