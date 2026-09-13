import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createTestDatabase } from '../../src/server/database.js';
import { ProjectRepository } from '../../src/server/repositories/project-repository.js';

await describe('ProjectRepository', () => {
  it('persists ownership, timestamps, and typed shallow JSON without duplicated identifiers', () => {
    const db = createTestDatabase();
    const repository = new ProjectRepository(db);
    const created = repository.create(7, { name: 'Project A', description: 'Description' });
    const row = db
      .prepare('SELECT user_id, created_at, updated_at, data FROM projects WHERE id = ?')
      .get(created.id) as {
      user_id: number;
      created_at: number;
      updated_at: number;
      data: string;
    };

    assert.equal(row.user_id, 7);
    assert.equal(row.created_at, created.createdAt);
    assert.equal(row.updated_at, created.updatedAt);
    assert.deepEqual(JSON.parse(row.data), { name: 'Project A', description: 'Description' });
    assert.ok(!('id' in (JSON.parse(row.data) as object)));
    assert.ok(!('userId' in (JSON.parse(row.data) as object)));
    db.close();
  });

  it('scopes list, get, update, and delete by user id', () => {
    const db = createTestDatabase();
    const repository = new ProjectRepository(db);
    const own = repository.create(1, { name: 'Own', description: '' });
    const other = repository.create(2, { name: 'Other', description: 'Private' });

    assert.deepEqual(
      repository.listByUserId(1).map((project) => project.id),
      [own.id],
    );
    assert.equal(repository.getById(1, other.id), null);
    assert.equal(repository.update(1, other.id, { name: 'Changed', description: '' }), null);
    assert.equal(repository.delete(1, other.id), false);
    assert.equal(repository.getById(2, other.id)?.data.name, 'Other');

    const updated = repository.update(1, own.id, { name: 'Updated', description: 'New' });
    assert.ok(updated);
    assert.ok(updated.updatedAt > own.updatedAt);
    assert.deepEqual(updated.data, { name: 'Updated', description: 'New' });
    assert.equal(repository.delete(1, own.id), true);
    assert.equal(repository.getById(1, own.id), null);
    db.close();
  });

  it('rejects malformed stored project JSON', () => {
    const db = createTestDatabase();
    const repository = new ProjectRepository(db);
    const project = repository.create(1, { name: 'Valid', description: '' });
    db.prepare('UPDATE projects SET data = ? WHERE id = ?').run(
      '{"name":2,"description":""}',
      project.id,
    );
    assert.throws(() => repository.getById(1, project.id), /Invalid project data/);
    db.close();
  });
});
