import type { Database } from 'better-sqlite3';
import type { Chat, ChatData } from '../chat-types.js';

interface ChatRow {
  id: number;
  user_id: number;
  created_at: number;
  updated_at: number;
  data: string;
}

function parseChatData(raw: string): ChatData {
  const parsed = JSON.parse(raw) as unknown;

  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    throw new Error('Invalid chat data');
  }

  const data = parsed as Record<string, unknown>;

  if (typeof data.title !== 'string' || data.title.trim().length === 0) {
    throw new Error('Invalid chat data: title is required');
  }

  if (
    data.modelConnectionId !== null &&
    (typeof data.modelConnectionId !== 'number' ||
      !Number.isInteger(data.modelConnectionId) ||
      data.modelConnectionId <= 0)
  ) {
    throw new Error('Invalid chat data: modelConnectionId must be a positive integer or null');
  }

  if (
    data.modelId !== null &&
    (typeof data.modelId !== 'string' || data.modelId.trim().length === 0)
  ) {
    throw new Error('Invalid chat data: modelId must be a non-empty string or null');
  }

  return {
    title: data.title.trim(),
    modelConnectionId: data.modelConnectionId,
    modelId: data.modelId,
  };
}

function rowToChat(row: ChatRow): Chat {
  return {
    id: row.id,
    userId: row.user_id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    data: parseChatData(row.data),
  };
}

export class ChatRepository {
  private readonly db: Database;

  constructor(db: Database) {
    this.db = db;
  }

  async create(userId: number, input: ChatData): Promise<Chat> {
    const now = Math.floor(Date.now() / 1000);
    const data: ChatData = {
      title: input.title,
      modelConnectionId: input.modelConnectionId,
      modelId: input.modelId,
    };
    const result = this.db
      .prepare(
        `INSERT INTO chats (user_id, created_at, updated_at, data)
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

  async listByUserId(userId: number): Promise<Chat[]> {
    const rows = this.db
      .prepare(
        `SELECT id, user_id, created_at, updated_at, data
         FROM chats
         WHERE user_id = ?
         ORDER BY created_at DESC`,
      )
      .all(userId) as ChatRow[];

    return rows.map(rowToChat);
  }

  async getById(userId: number, id: number): Promise<Chat | null> {
    const row = this.db
      .prepare(
        `SELECT id, user_id, created_at, updated_at, data
         FROM chats
         WHERE id = ? AND user_id = ?`,
      )
      .get(id, userId) as ChatRow | undefined;

    return row ? rowToChat(row) : null;
  }

  async update(userId: number, id: number, data: ChatData): Promise<Chat | null> {
    const now = Math.floor(Date.now() / 1000);
    const result = this.db
      .prepare(
        `UPDATE chats
         SET data = ?,
             updated_at = CASE WHEN updated_at >= ? THEN updated_at + 1 ELSE ? END
         WHERE id = ? AND user_id = ?`,
      )
      .run(JSON.stringify(data), now, now, id, userId);

    if (result.changes === 0) {
      return null;
    }

    return this.getById(userId, id);
  }

  async delete(userId: number, id: number): Promise<boolean> {
    const result = this.db
      .prepare('DELETE FROM chats WHERE id = ? AND user_id = ?')
      .run(id, userId);

    return result.changes > 0;
  }
}
