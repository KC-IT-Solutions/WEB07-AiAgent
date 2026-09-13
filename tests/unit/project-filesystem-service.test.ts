import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { existsSync } from 'node:fs';
import { mkdir, mkdtemp, readFile, rm, stat, symlink, utimes, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { buffer } from 'node:stream/consumers';
import { createTestDatabase } from '../../src/server/database.js';
import { ProjectRepository } from '../../src/server/repositories/project-repository.js';
import {
  ProjectFilesystemError,
  ProjectFilesystemService,
} from '../../src/server/services/project-filesystem-service.js';
import { ProjectService } from '../../src/server/services/project-service.js';
import {
  FileProjectFilesystemStore,
  MAX_PROJECT_TEXT_FILE_BYTES,
} from '../../src/server/stores/project-filesystem-store.js';
import { FileProjectRootStore } from '../../src/server/stores/project-root-store.js';
import { createProjectFilesystemTools } from '../../src/server/tools/project-filesystem-tools.js';

async function createFixture(maxUploadBytes?: number) {
  const temporaryRoot = await mkdtemp(resolve(tmpdir(), 'web07-project-files-'));
  const db = createTestDatabase();
  const repository = new ProjectRepository(db);
  const rootStore = new FileProjectRootStore(resolve(temporaryRoot, 'projects'));
  let userId = 1;
  const projectService = new ProjectService(repository, rootStore, () => userId);
  const filesystemService = new ProjectFilesystemService(
    repository,
    new FileProjectFilesystemStore(rootStore),
    () => userId,
    maxUploadBytes,
  );
  return {
    temporaryRoot,
    db,
    rootStore,
    projectService,
    filesystemService,
    setUserId: (value: number) => {
      userId = value;
    },
  };
}

function hasCode(code: ProjectFilesystemError['code']): (error: unknown) => boolean {
  return (error) => error instanceof ProjectFilesystemError && error.code === code;
}

await describe('ProjectFilesystemService', () => {
  it('creates, lists, reads, updates, renames, and deletes only Project descendants', async () => {
    const fixture = await createFixture();
    try {
      const project = await fixture.projectService.create({ name: 'Files' });
      const root = fixture.rootStore.getProjectRoot(1, project.id);

      await fixture.filesystemService.createDirectory(project.id, { path: 'src' });
      await fixture.filesystemService.createDirectory(project.id, { path: 'src/services' });
      await fixture.filesystemService.writeFile(project.id, {
        path: 'z.txt',
        content: 'last',
      });
      await fixture.filesystemService.writeFile(project.id, {
        path: 'src/services/example.ts',
        content: 'export const value = 1;\n',
      });

      const rootListing = await fixture.filesystemService.listDirectory(project.id, '');
      assert.equal(rootListing.relativePath, '');
      assert.deepEqual(
        rootListing.entries.map(({ name, type }) => ({ name, type })),
        [
          { name: 'src', type: 'directory' },
          { name: 'z.txt', type: 'file' },
        ],
      );
      assert.equal(rootListing.entries.find((entry) => entry.name === 'src')?.size, undefined);
      assert.equal(rootListing.entries.find((entry) => entry.name === 'z.txt')?.size, 4);
      assert.ok(!JSON.stringify(rootListing).includes(fixture.temporaryRoot));

      const read = await fixture.filesystemService.readFile(
        project.id,
        'src/services/example.ts',
      );
      assert.deepEqual(read, {
        relativePath: 'src/services/example.ts',
        content: 'export const value = 1;\n',
        size: 24,
      });
      await fixture.filesystemService.writeFile(project.id, {
        path: 'src/services/example.ts',
        content: 'updated',
      });
      assert.equal(await readFile(resolve(root, 'src', 'services', 'example.ts'), 'utf8'), 'updated');

      await fixture.filesystemService.renameEntry(project.id, {
        sourcePath: 'src/services/example.ts',
        destinationPath: 'src/services/renamed.ts',
      });
      await fixture.filesystemService.renameEntry(project.id, {
        sourcePath: 'src/services',
        destinationPath: 'src/modules',
      });
      assert.equal(existsSync(resolve(root, 'src', 'modules', 'renamed.ts')), true);

      await fixture.filesystemService.deleteEntry(project.id, { path: 'z.txt' });
      await fixture.filesystemService.deleteEntry(project.id, { path: 'src/modules' });
      assert.equal(existsSync(resolve(root, 'z.txt')), false);
      assert.equal(existsSync(resolve(root, 'src', 'modules')), false);
      assert.equal(existsSync(root), true);
    } finally {
      fixture.db.close();
      await rm(fixture.temporaryRoot, { recursive: true, force: true });
    }
  });

  it('lists filesystem mtimes after text, upload, rewrite, and Agent-tool writes', async () => {
    const fixture = await createFixture();
    try {
      const project = await fixture.projectService.create({ name: 'Modified files' });
      const root = fixture.rootStore.getProjectRoot(1, project.id);
      const textPath = resolve(root, 'notes.txt');
      const uploadPath = resolve(root, 'upload.bin');

      await fixture.filesystemService.writeFile(project.id, {
        path: 'notes.txt',
        content: 'created',
      });
      const createdStat = await stat(textPath);
      let listing = await fixture.filesystemService.listDirectory(project.id, '');
      assert.equal(listing.entries.find((entry) => entry.name === 'notes.txt')?.size, 7);
      assert.equal(
        listing.entries.find((entry) => entry.name === 'notes.txt')?.modifiedAt,
        Math.trunc(createdStat.mtimeMs),
      );

      await fixture.filesystemService.uploadFile(
        project.id,
        '',
        'upload.bin',
        Buffer.from([1, 2, 3]),
      );
      const uploadTime = new Date(2024, 1, 3, 4, 5, 6);
      await utimes(uploadPath, uploadTime, uploadTime);
      const uploadStat = await stat(uploadPath);
      listing = await fixture.filesystemService.listDirectory(project.id, '');
      assert.equal(listing.entries.find((entry) => entry.name === 'upload.bin')?.size, 3);
      assert.equal(
        listing.entries.find((entry) => entry.name === 'upload.bin')?.modifiedAt,
        Math.trunc(uploadStat.mtimeMs),
      );

      const oldTime = new Date(2001, 0, 1);
      await utimes(textPath, oldTime, oldTime);
      const oldModifiedAt = Math.trunc((await stat(textPath)).mtimeMs);
      await fixture.filesystemService.writeFile(project.id, {
        path: 'notes.txt',
        content: 'rewritten',
      });
      const rewrittenStat = await stat(textPath);
      listing = await fixture.filesystemService.listDirectory(project.id, '');
      assert.equal(listing.entries.find((entry) => entry.name === 'notes.txt')?.size, 9);
      assert.notEqual(Math.trunc(rewrittenStat.mtimeMs), oldModifiedAt);
      assert.equal(
        listing.entries.find((entry) => entry.name === 'notes.txt')?.modifiedAt,
        Math.trunc(rewrittenStat.mtimeMs),
      );

      await utimes(textPath, oldTime, oldTime);
      const writeTool = createProjectFilesystemTools(fixture.filesystemService, project.id).find(
        (tool) => tool.name === 'project_write_file',
      );
      assert.ok(writeTool);
      await writeTool.execute({ path: 'notes.txt', content: 'Agent update' });
      const agentWriteStat = await stat(textPath);
      listing = await fixture.filesystemService.listDirectory(project.id, '');
      assert.equal(listing.entries.find((entry) => entry.name === 'notes.txt')?.size, 12);
      assert.notEqual(Math.trunc(agentWriteStat.mtimeMs), oldModifiedAt);
      assert.equal(
        listing.entries.find((entry) => entry.name === 'notes.txt')?.modifiedAt,
        Math.trunc(agentWriteStat.mtimeMs),
      );
      assert.ok(!JSON.stringify(listing).includes(root));
    } finally {
      fixture.db.close();
      await rm(fixture.temporaryRoot, { recursive: true, force: true });
    }
  });

  it('does not commit an aborted Project text-file replacement', async () => {
    const fixture = await createFixture();
    try {
      const project = await fixture.projectService.create({ name: 'Abort write' });
      await fixture.filesystemService.writeFile(project.id, {
        path: 'result.md',
        content: 'original',
      });
      const controller = new AbortController();
      controller.abort();

      await assert.rejects(
        fixture.filesystemService.writeFile(
          project.id,
          { path: 'result.md', content: 'replacement' },
          controller.signal,
        ),
        hasCode('PROJECT_FILESYSTEM_FAILED'),
      );
      assert.equal((await fixture.filesystemService.readFile(project.id, 'result.md')).content, 'original');
    } finally {
      fixture.db.close();
      await rm(fixture.temporaryRoot, { recursive: true, force: true });
    }
  });

  it('moves a file between directories without overwrite or sandbox escape', async () => {
    const fixture = await createFixture();
    try {
      const project = await fixture.projectService.create({ name: 'Move files' });
      const otherProject = await fixture.projectService.create({ name: 'Other project' });
      const root = fixture.rootStore.getProjectRoot(1, project.id);
      const otherRoot = fixture.rootStore.getProjectRoot(1, otherProject.id);
      await fixture.filesystemService.createDirectory(project.id, { path: 'docs' });
      await fixture.filesystemService.createDirectory(project.id, { path: 'archive' });
      await fixture.filesystemService.writeFile(project.id, {
        path: 'docs/file.txt',
        content: 'unchanged content',
      });

      const moved = await fixture.filesystemService.renameEntry(project.id, {
        sourcePath: 'docs/file.txt',
        destinationPath: 'archive/file.txt',
      });
      assert.equal(moved.relativePath, 'archive/file.txt');
      assert.equal(moved.type, 'file');
      assert.equal(existsSync(resolve(root, 'docs', 'file.txt')), false);
      assert.equal(await readFile(resolve(root, 'archive', 'file.txt'), 'utf8'), 'unchanged content');

      await fixture.filesystemService.writeFile(project.id, {
        path: 'docs/pending.txt',
        content: 'pending',
      });
      await assert.rejects(
        fixture.filesystemService.renameEntry(project.id, {
          sourcePath: 'docs/pending.txt',
          destinationPath: 'missing/pending.txt',
        }),
        hasCode('PROJECT_FILE_NOT_FOUND'),
      );
      await fixture.filesystemService.writeFile(project.id, {
        path: 'archive/pending.txt',
        content: 'existing',
      });
      await assert.rejects(
        fixture.filesystemService.renameEntry(project.id, {
          sourcePath: 'docs/pending.txt',
          destinationPath: 'archive/pending.txt',
        }),
        hasCode('PROJECT_FILE_CONFLICT'),
      );
      await assert.rejects(
        fixture.filesystemService.renameEntry(project.id, {
          sourcePath: '../outside.txt',
          destinationPath: 'archive/outside.txt',
        }),
        hasCode('PROJECT_PATH_ESCAPE'),
      );
      await assert.rejects(
        fixture.filesystemService.renameEntry(project.id, {
          sourcePath: 'docs/pending.txt',
          destinationPath: '../outside.txt',
        }),
        hasCode('PROJECT_PATH_ESCAPE'),
      );
      await assert.rejects(
        fixture.filesystemService.renameEntry(project.id, {
          sourcePath: 'docs/pending.txt',
          destinationPath: `../project-${otherProject.id}/stolen.txt`,
        }),
        hasCode('PROJECT_PATH_ESCAPE'),
      );
      assert.equal(await readFile(resolve(root, 'docs', 'pending.txt'), 'utf8'), 'pending');
      assert.equal(existsSync(resolve(otherRoot, 'stolen.txt')), false);
    } finally {
      fixture.db.close();
      await rm(fixture.temporaryRoot, { recursive: true, force: true });
    }
  });

  it('round-trips new uploads and atomically replaces an existing file at the same path', async () => {
    const fixture = await createFixture();
    try {
      const project = await fixture.projectService.create({ name: 'Binary files' });
      const root = fixture.rootStore.getProjectRoot(1, project.id);
      const pngBytes = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x00, 0xff, 0x10]);
      await fixture.filesystemService.createDirectory(project.id, { path: 'images' });
      await fixture.filesystemService.createDirectory(project.id, { path: 'archive' });

      assert.deepEqual(
        await fixture.filesystemService.uploadFile(project.id, 'images', 'pixel.png', pngBytes),
        { relativePath: 'images/pixel.png', size: pngBytes.byteLength },
      );
      await fixture.filesystemService.uploadFile(project.id, '', 'empty.bin', Buffer.alloc(0));
      assert.deepEqual(await readFile(resolve(root, 'images', 'pixel.png')), pngBytes);
      assert.deepEqual(await readFile(resolve(root, 'empty.bin')), Buffer.alloc(0));

      const download = await fixture.filesystemService.openFileDownload(
        project.id,
        'images/pixel.png',
      );
      assert.equal(download.relativePath, 'images/pixel.png');
      assert.equal(download.size, pngBytes.byteLength);
      assert.deepEqual(await buffer(download.stream), pngBytes);

      const oldTime = new Date(2001, 0, 1);
      await utimes(resolve(root, 'images', 'pixel.png'), oldTime, oldTime);
      const oldModifiedAt = Math.trunc((await stat(resolve(root, 'images', 'pixel.png'))).mtimeMs);
      const replacement = Buffer.from('BB');
      assert.deepEqual(
        await fixture.filesystemService.uploadFile(project.id, 'images', 'pixel.png', replacement),
        { relativePath: 'images/pixel.png', size: replacement.byteLength },
      );
      assert.deepEqual(await readFile(resolve(root, 'images', 'pixel.png')), replacement);
      const replacedStat = await stat(resolve(root, 'images', 'pixel.png'));
      const listing = await fixture.filesystemService.listDirectory(project.id, 'images');
      assert.notEqual(Math.trunc(replacedStat.mtimeMs), oldModifiedAt);
      assert.deepEqual(
        listing.entries.filter((entry) => entry.name === 'pixel.png'),
        [{
          name: 'pixel.png',
          relativePath: 'images/pixel.png',
          type: 'file',
          size: replacement.byteLength,
          modifiedAt: Math.trunc(replacedStat.mtimeMs),
        }],
      );

      await fixture.filesystemService.writeFile(project.id, {
        path: 'archive/keep.txt',
        content: 'unchanged',
      });
      await assert.rejects(
        fixture.filesystemService.uploadFile(project.id, '', 'archive', Buffer.from('blocked')),
        hasCode('PROJECT_FILE_CONFLICT'),
      );
      assert.equal((await stat(resolve(root, 'archive'))).isDirectory(), true);
      assert.equal(await readFile(resolve(root, 'archive', 'keep.txt'), 'utf8'), 'unchanged');

      await fixture.filesystemService.renameEntry(project.id, {
        sourcePath: 'images/pixel.png',
        destinationPath: 'archive/pixel.png',
      });
      assert.deepEqual(await readFile(resolve(root, 'archive', 'pixel.png')), replacement);
      await fixture.filesystemService.deleteEntry(project.id, { path: 'archive/pixel.png' });
      assert.equal(existsSync(resolve(root, 'archive', 'pixel.png')), false);
    } finally {
      fixture.db.close();
      await rm(fixture.temporaryRoot, { recursive: true, force: true });
    }
  });

  it('validates upload names, paths, sizes, and download targets', async () => {
    const fixture = await createFixture(4);
    try {
      const project = await fixture.projectService.create({ name: 'Binary validation' });
      for (const filename of ['', '.', '..', '../file.bin', 'dir/file.bin', 'dir\\file.bin']) {
        await assert.rejects(
          fixture.filesystemService.uploadFile(project.id, '', filename, Buffer.alloc(0)),
          hasCode('PROJECT_PATH_INVALID'),
        );
      }
      for (const directory of ['..', '../outside', 'C:\\temp', '/tmp']) {
        await assert.rejects(
          fixture.filesystemService.uploadFile(project.id, directory, 'file.bin', Buffer.alloc(0)),
          (error: unknown) =>
            error instanceof ProjectFilesystemError &&
            (error.code === 'PROJECT_PATH_INVALID' || error.code === 'PROJECT_PATH_ESCAPE'),
        );
      }
      await assert.rejects(
        fixture.filesystemService.uploadFile(project.id, '', 'large.bin', Buffer.alloc(5)),
        hasCode('PROJECT_FILE_TOO_LARGE'),
      );
      await fixture.filesystemService.uploadFile(project.id, '', 'existing.bin', Buffer.from('keep'));
      await assert.rejects(
        fixture.filesystemService.uploadFile(project.id, '', 'existing.bin', Buffer.alloc(5)),
        hasCode('PROJECT_FILE_TOO_LARGE'),
      );
      assert.equal(
        await readFile(resolve(fixture.rootStore.getProjectRoot(1, project.id), 'existing.bin'), 'utf8'),
        'keep',
      );
      await fixture.filesystemService.createDirectory(project.id, { path: 'folder' });
      await assert.rejects(
        fixture.filesystemService.openFileDownload(project.id, 'folder'),
        hasCode('PROJECT_FILE_UNSUPPORTED'),
      );
      await assert.rejects(
        fixture.filesystemService.openFileDownload(project.id, 'missing.bin'),
        hasCode('PROJECT_FILE_NOT_FOUND'),
      );
    } finally {
      fixture.db.close();
      await rm(fixture.temporaryRoot, { recursive: true, force: true });
    }
  });

  it('rejects traversal, absolute paths, mixed separators, and deleting the root', async () => {
    const fixture = await createFixture();
    try {
      const first = await fixture.projectService.create({ name: 'First' });
      const second = await fixture.projectService.create({ name: 'Second' });
      await writeFile(
        resolve(fixture.rootStore.getProjectRoot(1, second.id), 'secret.txt'),
        'secret',
        'utf8',
      );
      const invalidPaths = [
        '..',
        '../',
        '../../secret.txt',
        `../project-${second.id}/secret.txt`,
        'C:\\Windows\\secret.txt',
        '/etc/passwd',
        '..\\project-2/secret.txt',
        '%2e%2e%2fsecret.txt',
      ];
      for (const path of invalidPaths) {
        await assert.rejects(fixture.filesystemService.readFile(first.id, path), (error: unknown) => {
          return (
            error instanceof ProjectFilesystemError &&
            (error.code === 'PROJECT_PATH_INVALID' || error.code === 'PROJECT_PATH_ESCAPE')
          );
        });
      }
      await assert.rejects(
        fixture.filesystemService.deleteEntry(first.id, { path: '' }),
        hasCode('PROJECT_PATH_INVALID'),
      );
      assert.equal(
        await readFile(
          resolve(fixture.rootStore.getProjectRoot(1, second.id), 'secret.txt'),
          'utf8',
        ),
        'secret',
      );
    } finally {
      fixture.db.close();
      await rm(fixture.temporaryRoot, { recursive: true, force: true });
    }
  });

  it('returns controlled conflicts, limits, unsupported content, and missing-entry errors', async () => {
    const fixture = await createFixture();
    try {
      const project = await fixture.projectService.create({ name: 'Limits' });
      const root = fixture.rootStore.getProjectRoot(1, project.id);
      await fixture.filesystemService.writeFile(project.id, { path: 'first.txt', content: 'one' });
      await fixture.filesystemService.writeFile(project.id, { path: 'second.txt', content: 'two' });
      await assert.rejects(
        fixture.filesystemService.renameEntry(project.id, {
          sourcePath: 'first.txt',
          destinationPath: 'second.txt',
        }),
        hasCode('PROJECT_FILE_CONFLICT'),
      );
      await assert.rejects(
        fixture.filesystemService.createDirectory(project.id, { path: 'first.txt' }),
        hasCode('PROJECT_FILE_CONFLICT'),
      );
      await assert.rejects(
        fixture.filesystemService.readFile(project.id, 'missing.txt'),
        hasCode('PROJECT_FILE_NOT_FOUND'),
      );
      await assert.rejects(
        fixture.filesystemService.writeFile(project.id, {
          path: 'large.txt',
          content: 'x'.repeat(MAX_PROJECT_TEXT_FILE_BYTES + 1),
        }),
        hasCode('PROJECT_FILE_TOO_LARGE'),
      );
      await writeFile(
        resolve(root, 'large.txt'),
        Buffer.alloc(MAX_PROJECT_TEXT_FILE_BYTES + 1, 120),
      );
      await assert.rejects(
        fixture.filesystemService.readFile(project.id, 'large.txt'),
        hasCode('PROJECT_FILE_TOO_LARGE'),
      );
      await writeFile(resolve(root, 'binary.dat'), Buffer.from([0xff, 0xfe, 0x00]));
      await assert.rejects(
        fixture.filesystemService.readFile(project.id, 'binary.dat'),
        hasCode('PROJECT_FILE_UNSUPPORTED'),
      );
    } finally {
      fixture.db.close();
      await rm(fixture.temporaryRoot, { recursive: true, force: true });
    }
  });

  it('checks ownership before accepting any Project-relative path', async () => {
    const fixture = await createFixture();
    try {
      fixture.setUserId(2);
      const other = await fixture.projectService.create({ name: 'Other' });
      await fixture.filesystemService.writeFile(other.id, { path: 'private.txt', content: 'private' });
      fixture.setUserId(1);
      await assert.rejects(
        fixture.filesystemService.readFile(other.id, '../../anything'),
        hasCode('PROJECT_NOT_FOUND'),
      );
      await assert.rejects(
        fixture.filesystemService.uploadFile(other.id, '', 'stolen.bin', Buffer.from('blocked')),
        hasCode('PROJECT_NOT_FOUND'),
      );
      await assert.rejects(
        fixture.filesystemService.openFileDownload(other.id, 'private.txt'),
        hasCode('PROJECT_NOT_FOUND'),
      );
      assert.equal(
        await readFile(
          resolve(fixture.rootStore.getProjectRoot(2, other.id), 'private.txt'),
          'utf8',
        ),
        'private',
      );
    } finally {
      fixture.db.close();
      await rm(fixture.temporaryRoot, { recursive: true, force: true });
    }
  });

  it('rejects existing and create-target filesystem links that escape the Project', async (t) => {
    const fixture = await createFixture();
    try {
      const project = await fixture.projectService.create({ name: 'Links' });
      const root = fixture.rootStore.getProjectRoot(1, project.id);
      const outside = resolve(fixture.temporaryRoot, 'outside');
      await mkdir(outside);
      await writeFile(resolve(outside, 'secret.txt'), 'outside', 'utf8');
      try {
        await symlink(outside, resolve(root, 'external-link'),
          process.platform === 'win32' ? 'junction' : 'dir');
      } catch (error) {
        const code = (error as { code?: unknown }).code;
        if (code === 'EPERM' || code === 'EACCES' || code === 'UNKNOWN') {
          t.skip('Filesystem links are unavailable on this platform');
          return;
        }
        throw error;
      }

      await assert.rejects(
        fixture.filesystemService.readFile(project.id, 'external-link/secret.txt'),
        hasCode('PROJECT_PATH_ESCAPE'),
      );
      await assert.rejects(
        fixture.filesystemService.writeFile(project.id, {
          path: 'external-link/new.txt',
          content: 'blocked',
        }),
        hasCode('PROJECT_PATH_ESCAPE'),
      );
      await assert.rejects(
        fixture.filesystemService.uploadFile(
          project.id,
          'external-link',
          'upload.bin',
          Buffer.from([1, 2, 3]),
        ),
        hasCode('PROJECT_PATH_ESCAPE'),
      );
      await assert.rejects(
        fixture.filesystemService.openFileDownload(project.id, 'external-link/secret.txt'),
        hasCode('PROJECT_PATH_ESCAPE'),
      );
      await assert.rejects(
        fixture.filesystemService.deleteEntry(project.id, { path: 'external-link' }),
        hasCode('PROJECT_PATH_ESCAPE'),
      );
      await fixture.filesystemService.writeFile(project.id, { path: 'inside.txt', content: 'inside' });
      await assert.rejects(
        fixture.filesystemService.renameEntry(project.id, {
          sourcePath: 'inside.txt',
          destinationPath: 'external-link/moved.txt',
        }),
        hasCode('PROJECT_PATH_ESCAPE'),
      );
      await assert.rejects(
        fixture.filesystemService.renameEntry(project.id, {
          sourcePath: 'external-link/secret.txt',
          destinationPath: 'moved.txt',
        }),
        hasCode('PROJECT_PATH_ESCAPE'),
      );
      assert.equal(await readFile(resolve(outside, 'secret.txt'), 'utf8'), 'outside');
      assert.equal(existsSync(resolve(outside, 'new.txt')), false);
      assert.equal(existsSync(resolve(outside, 'moved.txt')), false);
      assert.equal(await readFile(resolve(root, 'inside.txt'), 'utf8'), 'inside');
    } finally {
      fixture.db.close();
      await rm(fixture.temporaryRoot, { recursive: true, force: true });
    }
  });
});
