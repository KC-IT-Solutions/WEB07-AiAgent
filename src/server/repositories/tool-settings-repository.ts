import type { Database } from 'better-sqlite3';
import {
  DUCKDUCKGO_TOOL_NAME,
  FRED_DATA_TOOL_NAME,
  VISIT_WEBSITE_TOOL_NAME,
  YAHOO_FINANCE_DATA_TOOL_NAME,
  parseDuckDuckGoSettings,
  parseFredDataSettings,
  parseVisitWebsiteSettings,
  parseYahooFinanceDataSettings,
  type ToolSettings,
  type ToolSettingsRecord,
} from '../tool-types.js';

interface ToolSettingsRow {
  id: number;
  user_id: number;
  tool_name: string;
  created_at: number;
  updated_at: number;
  data: string;
}

function mapRow(row: ToolSettingsRow): ToolSettingsRecord {
  const parsed: unknown = JSON.parse(row.data);
  const data =
    row.tool_name === DUCKDUCKGO_TOOL_NAME
      ? parseDuckDuckGoSettings(parsed)
      : row.tool_name === VISIT_WEBSITE_TOOL_NAME
        ? parseVisitWebsiteSettings(parsed)
      : row.tool_name === FRED_DATA_TOOL_NAME
          ? parseFredDataSettings(parsed)
          : row.tool_name === YAHOO_FINANCE_DATA_TOOL_NAME
            ? parseYahooFinanceDataSettings(parsed)
            : null;
  if (!data) {
    throw new Error('Invalid persisted tool settings');
  }

  return {
    id: row.id,
    userId: row.user_id,
    toolName: row.tool_name,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    data,
  };
}

export class ToolSettingsRepository {
  constructor(private readonly db: Database) {}

  async get(userId: number, toolName: string): Promise<ToolSettingsRecord | null> {
    const row = this.db
      .prepare(
        `SELECT id, user_id, tool_name, created_at, updated_at, data
         FROM tool_settings
         WHERE user_id = ? AND tool_name = ?`,
      )
      .get(userId, toolName) as ToolSettingsRow | undefined;
    return row ? mapRow(row) : null;
  }

  async upsert(
    userId: number,
    toolName: string,
    data: ToolSettings,
  ): Promise<ToolSettingsRecord> {
    const now = Math.floor(Date.now() / 1000);
    this.db
      .prepare(
        `INSERT INTO tool_settings (user_id, tool_name, created_at, updated_at, data)
         VALUES (?, ?, ?, ?, ?)
         ON CONFLICT (user_id, tool_name)
         DO UPDATE SET updated_at = excluded.updated_at, data = excluded.data`,
      )
      .run(userId, toolName, now, now, JSON.stringify(data));

    const saved = await this.get(userId, toolName);
    if (!saved) {
      throw new Error('Failed to save tool settings');
    }
    return saved;
  }
}
