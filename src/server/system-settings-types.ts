import type { LogLevel } from './logging/logger.js';

export interface LoggingSettings {
  level: LogLevel;
  applicationLogEnabled: boolean;
  modelInferenceLogEnabled: boolean;
  clearLogsOnStartup: boolean;
}

export interface SystemSettingsRecord {
  id: number;
  createdAt: number;
  updatedAt: number;
  data: LoggingSettings;
}
