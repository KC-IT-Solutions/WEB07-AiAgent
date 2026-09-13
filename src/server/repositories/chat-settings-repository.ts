import type { Database } from 'better-sqlite3';
import type { ChatSettingsData, ChatSettingsRecord } from '../chat-settings-types.js';

interface ChatSettingsRow {
  id: number;
  user_id: number;
  created_at: number;
  updated_at: number;
  data: string;
}

function parseData(raw: string): ChatSettingsData {
  const value: unknown = JSON.parse(raw);
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new Error('Invalid chat settings data');
  }
  const data = value as Record<string, unknown>;
  const connectionId = data.defaultModelConnectionId;
  const modelId = data.defaultModelId;
  const showReasoning = data.showReasoning ?? false;
  const showToolCalls = data.showToolCalls ?? false;
  if (
    connectionId !== null &&
    (!Number.isInteger(connectionId) || Number(connectionId) <= 0)
  ) {
    throw new Error('Invalid default model connection');
  }
  if (modelId !== null && (typeof modelId !== 'string' || modelId.trim().length === 0)) {
    throw new Error('Invalid default model');
  }
  if (typeof showReasoning !== 'boolean' || typeof showToolCalls !== 'boolean') {
    throw new Error('Invalid chat display settings');
  }
  return {
    defaultModelConnectionId: connectionId as number | null,
    defaultModelId: typeof modelId === 'string' ? modelId : null,
    showReasoning,
    showToolCalls,
  };
}

function mapRow(row: ChatSettingsRow): ChatSettingsRecord {
  return {
    id: row.id,
    userId: row.user_id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    data: parseData(row.data),
  };
}

export class ChatSettingsRepository {
  constructor(private readonly db: Database) {}

  async get(userId: number): Promise<ChatSettingsRecord | null> {
    const row = this.db
      .prepare(
        `SELECT id, user_id, created_at, updated_at, data
         FROM chat_settings
         WHERE user_id = ?`,
      )
      .get(userId) as ChatSettingsRow | undefined;
    return row ? mapRow(row) : null;
  }

  async upsert(userId: number, data: ChatSettingsData): Promise<ChatSettingsRecord> {
    const now = Math.floor(Date.now() / 1000);
    this.db
      .prepare(
        `INSERT INTO chat_settings (user_id, created_at, updated_at, data)
         VALUES (?, ?, ?, ?)
         ON CONFLICT (user_id)
         DO UPDATE SET updated_at = excluded.updated_at, data = excluded.data`,
      )
      .run(userId, now, now, JSON.stringify(data));
    const saved = await this.get(userId);
    if (!saved) {
      throw new Error('Failed to save chat settings');
    }
    return saved;
  }
}
