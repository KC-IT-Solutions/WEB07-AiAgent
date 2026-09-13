import type { Database } from 'better-sqlite3';
import type { ActiveChatSkill } from '../chat-types.js';

interface ActiveChatSkillRow {
  relation_id: number;
  skill_id: number;
  command_name: string;
  name: string;
  created_at: number;
  updated_at: number;
}

function mapRow(row: ActiveChatSkillRow): ActiveChatSkill {
  return {
    relationId: row.relation_id,
    skillId: row.skill_id,
    commandName: row.command_name,
    name: row.name,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export class ChatSkillRepository {
  constructor(private readonly db: Database) {}

  listForChat(chatId: number): ActiveChatSkill[] {
    const rows = this.db
      .prepare(
        `SELECT
           chat_skills.id AS relation_id,
           chat_skills.skill_id,
           skills.command_name,
           json_extract(skills.data, '$.name') AS name,
           chat_skills.created_at,
           chat_skills.updated_at
         FROM chat_skills
         JOIN skills ON skills.id = chat_skills.skill_id
         WHERE chat_skills.chat_id = ?
         ORDER BY chat_skills.created_at, chat_skills.id`,
      )
      .all(chatId) as ActiveChatSkillRow[];
    return rows.map(mapRow);
  }

  isActive(chatId: number, skillId: number): boolean {
    return Boolean(
      this.db
        .prepare('SELECT 1 FROM chat_skills WHERE chat_id = ? AND skill_id = ?')
        .get(chatId, skillId),
    );
  }

  add(chatId: number, skillId: number): boolean {
    const now = Math.floor(Date.now() / 1000);
    return (
      this.db
        .prepare(
          `INSERT INTO chat_skills (chat_id, skill_id, created_at, updated_at, data)
           VALUES (?, ?, ?, ?, ?)
           ON CONFLICT (chat_id, skill_id) DO NOTHING`,
        )
        .run(chatId, skillId, now, now, '{}').changes > 0
    );
  }

  remove(chatId: number, skillId: number): boolean {
    return (
      this.db
        .prepare('DELETE FROM chat_skills WHERE chat_id = ? AND skill_id = ?')
        .run(chatId, skillId).changes > 0
    );
  }

  toggle(chatId: number, skillId: number): 'enabled' | 'disabled' {
    return this.db.transaction(() => {
      if (this.add(chatId, skillId)) {
        return 'enabled' as const;
      }
      this.remove(chatId, skillId);
      return 'disabled' as const;
    })();
  }
}
