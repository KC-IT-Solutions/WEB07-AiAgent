import type { Database } from 'better-sqlite3';
import type { SkillToolRecord } from '../skill-types.js';
import { SkillRepositoryError } from './skill-repository.js';

interface SkillToolRow {
  id: number;
  skill_id: number;
  tool_name: string;
  created_at: number;
  updated_at: number;
}

function mapRow(row: SkillToolRow): SkillToolRecord {
  return {
    id: row.id,
    skillId: row.skill_id,
    toolName: row.tool_name,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export class SkillToolRepository {
  constructor(private readonly db: Database) {}

  listBySkillId(skillId: number): SkillToolRecord[] {
    const rows = this.db
      .prepare(
        `SELECT id, skill_id, tool_name, created_at, updated_at
         FROM skill_tools
         WHERE skill_id = ?
         ORDER BY id`,
      )
      .all(skillId) as SkillToolRow[];
    return rows.map(mapRow);
  }

  replace(skillId: number, toolNames: readonly string[]): SkillToolRecord[] {
    try {
      this.db.prepare('DELETE FROM skill_tools WHERE skill_id = ?').run(skillId);
      const insert = this.db.prepare(
        `INSERT INTO skill_tools (skill_id, tool_name, created_at, updated_at, data)
         VALUES (?, ?, ?, ?, ?)`,
      );
      const now = Math.floor(Date.now() / 1000);
      for (const toolName of toolNames) {
        insert.run(skillId, toolName, now, now, '{}');
      }
      return this.listBySkillId(skillId);
    } catch {
      throw new SkillRepositoryError('PERSISTENCE_FAILED');
    }
  }
}
