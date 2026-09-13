import type { Database } from 'better-sqlite3';
import { LOG_LEVELS } from '../logging/logger.js';
import { validateAgentRuntimeLimits } from '../runtime-limits.js';
import type {
  LoggingSettings,
  SystemSettingsData,
  SystemSettingsRecord,
} from '../system-settings-types.js';

interface SystemSettingsRow {
  id: number;
  created_at: number;
  updated_at: number;
  data: string;
}

function parseData(raw: string): SystemSettingsData {
  const value: unknown = JSON.parse(raw);
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new Error('Invalid system settings data');
  }
  const data = value as Record<string, unknown>;
  if (
    typeof data.level !== 'string' ||
    !LOG_LEVELS.includes(data.level as (typeof LOG_LEVELS)[number]) ||
    (data.applicationLogEnabled !== undefined && typeof data.applicationLogEnabled !== 'boolean') ||
    (data.modelInferenceLogEnabled !== undefined &&
      typeof data.modelInferenceLogEnabled !== 'boolean') ||
    typeof data.clearLogsOnStartup !== 'boolean'
  ) {
    throw new Error('Invalid system logging settings');
  }
  const loggingSettings: LoggingSettings = {
    level: data.level as LoggingSettings['level'],
    applicationLogEnabled: data.applicationLogEnabled ?? true,
    modelInferenceLogEnabled: data.modelInferenceLogEnabled ?? true,
    clearLogsOnStartup: data.clearLogsOnStartup,
  };
  if (data.agentRuntimeLimits === undefined) return loggingSettings;
  return {
    ...loggingSettings,
    agentRuntimeLimits: validateAgentRuntimeLimits(data.agentRuntimeLimits),
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

  get(): SystemSettingsRecord | null {
    const row = this.db
      .prepare('SELECT id, created_at, updated_at, data FROM system_settings WHERE id = 1')
      .get() as SystemSettingsRow | undefined;
    return row ? mapRow(row) : null;
  }

  upsert(data: SystemSettingsData): SystemSettingsRecord {
    const now = Math.floor(Date.now() / 1000);
    this.db
      .prepare(
        `INSERT INTO system_settings (id, created_at, updated_at, data)
         VALUES (1, ?, ?, ?)
         ON CONFLICT (id)
         DO UPDATE SET updated_at = excluded.updated_at, data = excluded.data`,
      )
      .run(now, now, JSON.stringify(data));
    const saved = this.get();
    if (!saved) {
      throw new Error('Failed to save system settings');
    }
    return saved;
  }

  transaction<T>(operation: () => T): T {
    return this.db.transaction(operation)();
  }
}
