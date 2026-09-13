import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createTestDatabase } from '../../src/server/database.js';
import { ChatRepository } from '../../src/server/repositories/chat-repository.js';
import { ChatSkillRepository } from '../../src/server/repositories/chat-skill-repository.js';
import { SkillRepository } from '../../src/server/repositories/skill-repository.js';

await describe('ChatSkillRepository', async () => {
  await it('adds, lists, toggles, removes, and preserves deterministic activation order', async () => {
    const db = createTestDatabase();
    const chats = new ChatRepository(db);
    const skills = new SkillRepository(db);
    const links = new ChatSkillRepository(db);
    const chat = await chats.create(1, {
      title: 'Skills chat',
      modelConnectionId: null,
      modelId: null,
    });
    const first = skills.create('first-skill', { name: 'First Skill' });
    const second = skills.create('second-skill', { name: 'Second Skill' });

    assert.equal(links.add(chat.id, second.id), true);
    assert.equal(links.add(chat.id, second.id), false);
    assert.equal(links.add(chat.id, first.id), true);
    db.prepare('UPDATE chat_skills SET created_at = 10 WHERE skill_id = ?').run(second.id);
    db.prepare('UPDATE chat_skills SET created_at = 20 WHERE skill_id = ?').run(first.id);
    assert.deepEqual(
      links.listForChat(chat.id).map((skill) => skill.commandName),
      ['second-skill', 'first-skill'],
    );
    assert.equal(links.isActive(chat.id, second.id), true);
    assert.equal(links.toggle(chat.id, second.id), 'disabled');
    assert.equal(links.isActive(chat.id, second.id), false);
    assert.equal(links.toggle(chat.id, second.id), 'enabled');
    assert.equal(links.remove(chat.id, second.id), true);
    assert.equal(links.remove(chat.id, second.id), false);
    assert.equal(
      (db
        .prepare('SELECT COUNT(*) count FROM chat_skills WHERE chat_id = ? AND skill_id = ?')
        .get(chat.id, first.id) as { count: number }).count,
      1,
    );
    db.close();
  });
});
