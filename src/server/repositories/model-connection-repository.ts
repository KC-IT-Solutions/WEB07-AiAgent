import type { Database } from 'better-sqlite3';
import type {
  ModelConnection,
  ModelConnectionData,
  CreateModelConnectionInput,
} from '../model-connection-types.js';

const DEFAULT_TIMEOUT_MINUTES = 30;
const DEFAULT_ENABLED = true;

function parseModelConnectionData(raw: string): ModelConnectionData {
  const parsed = JSON.parse(raw) as unknown;

  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    throw new Error('Invalid model connection data');
  }

  const obj = parsed as Record<string, unknown>;

  if (typeof obj.name !== 'string' || obj.name.trim().length === 0) {
    throw new Error('Invalid model connection data: name is required');
  }

  if (typeof obj.baseUrl !== 'string' || obj.baseUrl.trim().length === 0) {
    throw new Error('Invalid model connection data: baseUrl is required');
  }

  const timeoutMinutes =
    typeof obj.timeoutMinutes === 'number' && obj.timeoutMinutes > 0
      ? obj.timeoutMinutes
      : DEFAULT_TIMEOUT_MINUTES;

  const modelId =
    obj.modelId !== undefined && obj.modelId !== null
      ? typeof obj.modelId === 'string'
        ? obj.modelId
        : null
      : null;

  const enabled =
    typeof obj.enabled === 'boolean' ? obj.enabled : DEFAULT_ENABLED;

  return {
    name: obj.name.trim(),
    baseUrl: obj.baseUrl.trim(),
    timeoutMinutes,
    modelId,
    enabled,
  };
}

function rowToModelConnection(row: {
  id: number;
  user_id: number;
  created_at: number;
  updated_at: number;
  data: string;
}): ModelConnection {
  return {
    id: row.id,
    userId: row.user_id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    data: parseModelConnectionData(row.data),
  };
}

export class ModelConnectionRepository {
  private db: Database;

  constructor(db: Database) {
    this.db = db;
  }

  async create(
    userId: number,
    input: CreateModelConnectionInput,
  ): Promise<ModelConnection> {
    const now = Math.floor(Date.now() / 1000);

    const data = {
      name: input.name,
      baseUrl: input.baseUrl,
      timeoutMinutes: input.timeoutMinutes,
      modelId: input.modelId,
      enabled: input.enabled,
    };

    const stmt = this.db.prepare(
      `INSERT INTO model_connections (user_id, created_at, updated_at, data)
       VALUES (?, ?, ?, ?)`,
    );

    const result = stmt.run(userId, now, now, JSON.stringify(data));

    return {
      id: Number(result.lastInsertRowid),
      userId,
      createdAt: now,
      updatedAt: now,
      data,
    };
  }

  async update(
    userId: number,
    id: number,
    input: CreateModelConnectionInput,
  ): Promise<ModelConnection | null> {
    const now = Math.floor(Date.now() / 1000);

    const data = {
      name: input.name,
      baseUrl: input.baseUrl,
      timeoutMinutes: input.timeoutMinutes,
      modelId: input.modelId,
      enabled: input.enabled,
    };

    const stmt = this.db.prepare(
      `UPDATE model_connections
         SET data = ?, updated_at = ?
       WHERE id = ? AND user_id = ?`,
    );

    const result = stmt.run(JSON.stringify(data), now, id, userId);

    if (result.changes === 0) {
      return null;
    }

    return this.getById(userId, id);
  }

  async delete(userId: number, id: number): Promise<boolean> {
    const stmt = this.db.prepare(
      `DELETE FROM model_connections
       WHERE id = ? AND user_id = ?`,
    );

    const result = stmt.run(id, userId);
    return result.changes > 0;
  }

  async listByUserId(userId: number): Promise<ModelConnection[]> {
    const stmt = this.db.prepare(
      `SELECT id, user_id, created_at, updated_at, data
       FROM model_connections
       WHERE user_id = ?
       ORDER BY created_at DESC`,
    );

    const rows = stmt.all(userId) as Array<{
      id: number;
      user_id: number;
      created_at: number;
      updated_at: number;
      data: string;
    }>;

    return rows.map(rowToModelConnection);
  }

  async getById(userId: number, id: number): Promise<ModelConnection | null> {
    const stmt = this.db.prepare(
      `SELECT id, user_id, created_at, updated_at, data
       FROM model_connections
       WHERE id = ? AND user_id = ?`,
    );

    const row = stmt.get(id, userId) as
      | {
          id: number;
          user_id: number;
          created_at: number;
          updated_at: number;
          data: string;
        }
      | undefined;

    if (!row) {
      return null;
    }

    return rowToModelConnection(row);
  }
}
