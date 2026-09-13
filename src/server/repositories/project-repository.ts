import type { Database } from 'better-sqlite3';
import type { ProjectData, ProjectRecord } from '../project-types.js';

interface ProjectRow {
  id: number;
  user_id: number;
  created_at: number;
  updated_at: number;
  data: string;
}

function parseProjectData(raw: string): ProjectData {
  const parsed = JSON.parse(raw) as unknown;
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    throw new Error('Invalid project data');
  }
  const data = parsed as Record<string, unknown>;
  const fields = Object.keys(data);
  if (
    fields.length !== 2 ||
    !fields.includes('name') ||
    !fields.includes('description') ||
    typeof data.name !== 'string' ||
    data.name.trim().length === 0 ||
    typeof data.description !== 'string'
  ) {
    throw new Error('Invalid project data');
  }
  return { name: data.name, description: data.description };
}

function rowToProject(row: ProjectRow): ProjectRecord {
  return {
    id: row.id,
    userId: row.user_id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    data: parseProjectData(row.data),
  };
}

export class ProjectRepository {
  constructor(private readonly db: Database) {}

  transaction<T>(work: () => T): T {
    return this.db.transaction(work)();
  }

  create(userId: number, data: ProjectData): ProjectRecord {
    const now = Math.floor(Date.now() / 1000);
    const result = this.db
      .prepare(
        `INSERT INTO projects (user_id, created_at, updated_at, data)
         VALUES (?, ?, ?, ?)`,
      )
      .run(userId, now, now, JSON.stringify(data));
    return {
      id: Number(result.lastInsertRowid),
      userId,
      createdAt: now,
      updatedAt: now,
      data,
    };
  }

  listByUserId(userId: number): ProjectRecord[] {
    const rows = this.db
      .prepare(
        `SELECT id, user_id, created_at, updated_at, data
         FROM projects
         WHERE user_id = ?
         ORDER BY created_at DESC, id DESC`,
      )
      .all(userId) as ProjectRow[];
    return rows.map(rowToProject);
  }

  getById(userId: number, id: number): ProjectRecord | null {
    const row = this.db
      .prepare(
        `SELECT id, user_id, created_at, updated_at, data
         FROM projects
         WHERE id = ? AND user_id = ?`,
      )
      .get(id, userId) as ProjectRow | undefined;
    return row ? rowToProject(row) : null;
  }

  update(userId: number, id: number, data: ProjectData): ProjectRecord | null {
    const now = Math.floor(Date.now() / 1000);
    const result = this.db
      .prepare(
        `UPDATE projects
         SET data = ?,
             updated_at = CASE WHEN updated_at >= ? THEN updated_at + 1 ELSE ? END
         WHERE id = ? AND user_id = ?`,
      )
      .run(JSON.stringify(data), now, now, id, userId);
    return result.changes === 0 ? null : this.getById(userId, id);
  }

  delete(userId: number, id: number): boolean {
    return (
      this.db.prepare('DELETE FROM projects WHERE id = ? AND user_id = ?').run(id, userId).changes >
      0
    );
  }
}
