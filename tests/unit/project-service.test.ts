import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { createTestDatabase } from '../../src/server/database.js';
import { ProjectRepository } from '../../src/server/repositories/project-repository.js';
import { ProjectError, ProjectService } from '../../src/server/services/project-service.js';
import {
  FileProjectRootStore,
  type ProjectRootStore,
} from '../../src/server/stores/project-root-store.js';

await describe('ProjectService and project roots', () => {
  it('derives deterministic roots and creates and deletes only the owned project directory', async () => {
    const root = await mkdtemp(resolve(tmpdir(), 'web07-project-roots-'));
    const store = new FileProjectRootStore(root);
    assert.equal(store.getProjectRoot(7, 11), resolve(root, 'user-7', 'project-11'));
    assert.throws(() => store.getProjectRoot(0, 11), /Invalid user id/);

    const db = createTestDatabase();
    const repository = new ProjectRepository(db);
    const service = new ProjectService(repository, store, () => 7);
    const first = await service.create({ name: ' First ', description: ' Description ' });
    const second = await service.create({ name: 'Second' });
    const firstRoot = store.getProjectRoot(7, first.id);
    const secondRoot = store.getProjectRoot(7, second.id);
    await writeFile(resolve(firstRoot, 'owned.txt'), 'first', 'utf8');
    await writeFile(resolve(secondRoot, 'keep.txt'), 'second', 'utf8');

    assert.ok(existsSync(firstRoot));
    assert.deepEqual(first, {
      id: first.id,
      name: 'First',
      description: 'Description',
      createdAt: first.createdAt,
      updatedAt: first.updatedAt,
    });
    assert.equal(await service.delete(first.id), true);
    assert.equal(existsSync(firstRoot), false);
    assert.equal(existsSync(resolve(secondRoot, 'keep.txt')), true);
    assert.equal(repository.getById(7, first.id), null);

    db.close();
    await rm(root, { recursive: true, force: true });
  });

  it('rolls back persistence when project directory creation fails', async () => {
    const db = createTestDatabase();
    const repository = new ProjectRepository(db);
    const failingStore: ProjectRootStore = {
      getProjectRoot: () => 'not-exposed',
      getCanonicalProjectRoot: () => 'not-exposed',
      createRoot: () => {
        throw new Error('mkdir failed');
      },
      deleteRoot: () => undefined,
    };
    const service = new ProjectService(repository, failingStore, () => 3);

    await assert.rejects(
      service.create({ name: 'Cannot persist', description: '' }),
      (error: unknown) => error instanceof ProjectError && error.code === 'PERSISTENCE_FAILED',
    );
    assert.equal(repository.listByUserId(3).length, 0);
    db.close();
  });

  it('keeps the owned database row when directory deletion fails', async () => {
    const db = createTestDatabase();
    const repository = new ProjectRepository(db);
    const failingDeleteStore: ProjectRootStore = {
      getProjectRoot: () => 'server-derived',
      getCanonicalProjectRoot: () => 'server-derived',
      createRoot: () => undefined,
      deleteRoot: () => {
        throw new Error('rm failed');
      },
    };
    const service = new ProjectService(repository, failingDeleteStore, () => 4);
    const project = await service.create({ name: 'Keep row', description: '' });

    await assert.rejects(
      service.delete(project.id),
      (error: unknown) => error instanceof ProjectError && error.code === 'PERSISTENCE_FAILED',
    );
    assert.equal(repository.getById(4, project.id)?.data.name, 'Keep row');
    db.close();
  });

  it('scopes every service operation to the resolved current user', async () => {
    const root = await mkdtemp(resolve(tmpdir(), 'web07-project-ownership-'));
    const store = new FileProjectRootStore(root);
    const db = createTestDatabase();
    const repository = new ProjectRepository(db);
    let userId = 1;
    const service = new ProjectService(repository, store, () => userId);
    const own = await service.create({ name: 'Own', description: '' });
    userId = 2;
    const other = await service.create({ name: 'Other', description: 'Private' });

    userId = 1;
    assert.deepEqual(
      (await service.list()).map((project) => project.id),
      [own.id],
    );
    assert.equal(await service.get(other.id), null);
    assert.equal(await service.update(other.id, { name: 'Forbidden' }), null);
    assert.equal(await service.delete(other.id), false);
    assert.equal(existsSync(store.getProjectRoot(2, other.id)), true);
    assert.equal(repository.getById(2, other.id)?.data.name, 'Other');

    db.close();
    await rm(root, { recursive: true, force: true });
  });

  it('rejects malformed and path-bearing create and update input', async () => {
    const root = await mkdtemp(resolve(tmpdir(), 'web07-project-input-'));
    const db = createTestDatabase();
    const service = new ProjectService(
      new ProjectRepository(db),
      new FileProjectRootStore(root),
      () => 1,
    );
    const invalidCreates = [
      null,
      {},
      { name: '' },
      { name: 'Project', path: '../../outside' },
      { name: 'Project', description: 3 },
    ];
    for (const input of invalidCreates) {
      await assert.rejects(service.create(input), ProjectError);
    }
    const project = await service.create({ name: 'Valid', description: '' });
    for (const input of [{}, { id: 9 }, { filesystemPath: '/tmp' }, { name: ' ' }]) {
      await assert.rejects(service.update(project.id, input), ProjectError);
    }
    db.close();
    await rm(root, { recursive: true, force: true });
  });
});
