import type { Database } from 'better-sqlite3';
import type { SkillData, SkillRecord } from '../skill-types.js';

interface SkillRow {
  id: number;
  command_name: string;
  created_at: number;
  updated_at: number;
  data: string;
}

export class SkillRepositoryError extends Error {
  constructor(readonly code: 'DUPLICATE_COMMAND' | 'INVALID_STORED_DATA' | 'PERSISTENCE_FAILED') {
    super(code);
    this.name = 'SkillRepositoryError';
  }
}

function parseData(raw: string): SkillData {
  let value: unknown;
  try {
    value = JSON.parse(raw) as unknown;
  } catch {
    throw new SkillRepositoryError('INVALID_STORED_DATA');
  }
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new SkillRepositoryError('INVALID_STORED_DATA');
  }
  const data = value as Record<string, unknown>;
  if (
    Object.keys(data).length !== 1 ||
    typeof data.name !== 'string' ||
    data.name.trim().length === 0
  ) {
    throw new SkillRepositoryError('INVALID_STORED_DATA');
  }
  return { name: data.name };
}

function mapRow(row: SkillRow): SkillRecord {
  return {
    id: row.id,
    commandName: row.command_name,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    data: parseData(row.data),
  };
}

function isUniqueConstraint(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    typeof (error as { code?: unknown }).code === 'string' &&
    ((error as { code: string }).code === 'SQLITE_CONSTRAINT_UNIQUE' ||
      (error as { code: string }).code === 'SQLITE_CONSTRAINT')
  );
}

export class SkillRepository {
  constructor(private readonly db: Database) {}

  transaction<T>(operation: () => T): T {
    return this.db.transaction(operation)();
  }

  list(): SkillRecord[] {
    const rows = this.db
      .prepare(
        `SELECT id, command_name, created_at, updated_at, data
         FROM skills
         ORDER BY id`,
      )
      .all() as SkillRow[];
    return rows.map(mapRow);
  }

  getById(id: number): SkillRecord | null {
    const row = this.db
      .prepare(
        `SELECT id, command_name, created_at, updated_at, data
         FROM skills
         WHERE id = ?`,
      )
      .get(id) as SkillRow | undefined;
    return row ? mapRow(row) : null;
  }

  getByCommandName(commandName: string): SkillRecord | null {
    const row = this.db
      .prepare(
        `SELECT id, command_name, created_at, updated_at, data
         FROM skills
         WHERE command_name = ?`,
      )
      .get(commandName) as SkillRow | undefined;
    return row ? mapRow(row) : null;
  }

  create(commandName: string, data: SkillData): SkillRecord {
    const now = Math.floor(Date.now() / 1000);
    try {
      const result = this.db
        .prepare(
          `INSERT INTO skills (command_name, created_at, updated_at, data)
           VALUES (?, ?, ?, ?)`,
        )
        .run(commandName, now, now, JSON.stringify(data));
      const saved = this.getById(Number(result.lastInsertRowid));
      if (!saved) {
        throw new SkillRepositoryError('PERSISTENCE_FAILED');
      }
      return saved;
    } catch (error) {
      if (error instanceof SkillRepositoryError) {
        throw error;
      }
      throw new SkillRepositoryError(
        isUniqueConstraint(error) ? 'DUPLICATE_COMMAND' : 'PERSISTENCE_FAILED',
      );
    }
  }

  update(id: number, commandName: string, data: SkillData): SkillRecord | null {
    const existing = this.getById(id);
    if (!existing) {
      return null;
    }
    const updatedAt = Math.max(Math.floor(Date.now() / 1000), existing.updatedAt + 1);
    try {
      this.db
        .prepare(
          `UPDATE skills
           SET command_name = ?, updated_at = ?, data = ?
           WHERE id = ?`,
        )
        .run(commandName, updatedAt, JSON.stringify(data), id);
      return this.getById(id);
    } catch (error) {
      throw new SkillRepositoryError(
        isUniqueConstraint(error) ? 'DUPLICATE_COMMAND' : 'PERSISTENCE_FAILED',
      );
    }
  }

  delete(id: number): boolean {
    try {
      return this.db.prepare('DELETE FROM skills WHERE id = ?').run(id).changes > 0;
    } catch {
      throw new SkillRepositoryError('PERSISTENCE_FAILED');
    }
  }
}
