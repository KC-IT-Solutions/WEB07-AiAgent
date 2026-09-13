import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createTestDatabase } from '../../src/server/database.js';
import {
  SkillRepository,
  SkillRepositoryError,
} from '../../src/server/repositories/skill-repository.js';
import { SkillToolRepository } from '../../src/server/repositories/skill-tool-repository.js';

await describe('Skill repositories', async () => {
  await it('serializes and validates Skill data without storing Markdown or tools in JSON', () => {
    const db = createTestDatabase();
    const skills = new SkillRepository(db);
    const tools = new SkillToolRepository(db);
    const created = skills.create('economy', { name: 'Ekonomianalys' });
    tools.replace(created.id, ['duckduckgo_search', 'visit_website']);

    assert.deepEqual(skills.getById(created.id), created);
    assert.deepEqual(
      tools.listBySkillId(created.id).map((tool) => tool.toolName),
      ['duckduckgo_search', 'visit_website'],
    );
    const row = db
      .prepare('SELECT command_name, data FROM skills WHERE id = ?')
      .get(created.id) as {
      command_name: string;
      data: string;
    };
    assert.equal(row.command_name, 'economy');
    assert.deepEqual(JSON.parse(row.data), { name: 'Ekonomianalys' });
    assert.ok(!row.data.includes('markdown'));
    assert.ok(!row.data.includes('requiredTools'));
    db.close();
  });

  await it('updates metadata timestamps and replaces required tools transactionally', () => {
    const db = createTestDatabase();
    const skills = new SkillRepository(db);
    const tools = new SkillToolRepository(db);
    const created = skills.create('first', { name: 'First' });
    tools.replace(created.id, ['duckduckgo_search']);
    const updated = skills.transaction(() => {
      const record = skills.update(created.id, 'second', { name: 'Second' });
      tools.replace(created.id, ['visit_website']);
      return record;
    });
    assert.ok(updated);
    assert.ok(updated.updatedAt > created.updatedAt);
    assert.equal(updated.commandName, 'second');
    assert.deepEqual(
      tools.listBySkillId(created.id).map((tool) => tool.toolName),
      ['visit_website'],
    );
    db.close();
  });

  await it('maps duplicate commands and malformed stored JSON to controlled errors', () => {
    const db = createTestDatabase();
    const skills = new SkillRepository(db);
    const created = skills.create('unique', { name: 'Unique' });
    assert.throws(
      () => skills.create('unique', { name: 'Other' }),
      (error: unknown) =>
        error instanceof SkillRepositoryError && error.code === 'DUPLICATE_COMMAND',
    );
    db.pragma('ignore_check_constraints = ON');
    db.prepare('UPDATE skills SET data = ? WHERE id = ?').run('{"name":3}', created.id);
    assert.throws(
      () => skills.getById(created.id),
      (error: unknown) =>
        error instanceof SkillRepositoryError && error.code === 'INVALID_STORED_DATA',
    );
    db.close();
  });
});
