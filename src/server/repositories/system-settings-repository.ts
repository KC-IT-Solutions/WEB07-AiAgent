import type { Database } from 'better-sqlite3';
import { LOG_LEVELS } from '../logging/logger.js';
import type { LoggingSettings, SystemSettingsRecord } from '../system-settings-types.js';

interface SystemSettingsRow {
  id: number;
  created_at: number;
  updated_at: number;
  data: string;
}

function parseData(raw: string): LoggingSettings {
  const value: unknown = JSON.parse(raw);
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new Error('Invalid system settings data');
  }
  const data = value as Record<string, unknown>;
  if (
    typeof data.level !== 'string' ||
    !LOG_LEVELS.includes(data.level as (typeof LOG_LEVELS)[number]) ||
    (data.applicationLogEnabled !== undefined &&
      typeof data.applicationLogEnabled !== 'boolean') ||
    (data.modelInferenceLogEnabled !== undefined &&
      typeof data.modelInferenceLogEnabled !== 'boolean') ||
    typeof data.clearLogsOnStartup !== 'boolean'
  ) {
    throw new Error('Invalid system logging settings');
  }
  return {
    level: data.level as LoggingSettings['level'],
    applicationLogEnabled: data.applicationLogEnabled ?? true,
    modelInferenceLogEnabled: data.modelInferenceLogEnabled ?? true,
    clearLogsOnStartup: data.clearLogsOnStartup,
  };
}

function mapRow(row: SystemSettingsRow): SystemSettingsRecord {
  return {
    id: row.id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    data: parseData(row.data),
  };
}

export class SystemSettingsRepository {
  constructor(private readonly db: Database) {}

  async get(): Promise<SystemSettingsRecord | null> {
    const row = this.db
      .prepare('SELECT id, created_at, updated_at, data FROM system_settings WHERE id = 1')
      .get() as SystemSettingsRow | undefined;
    return row ? mapRow(row) : null;
  }

  async upsert(data: LoggingSettings): Promise<SystemSettingsRecord> {
    const now = Math.floor(Date.now() / 1000);
    this.db
      .prepare(
        `INSERT INTO system_settings (id, created_at, updated_at, data)
         VALUES (1, ?, ?, ?)
         ON CONFLICT (id)
         DO UPDATE SET updated_at = excluded.updated_at, data = excluded.data`,
      )
      .run(now, now, JSON.stringify(data));
    const saved = await this.get();
    if (!saved) {
      throw new Error('Failed to save system settings');
    }
    return saved;
  }
}
