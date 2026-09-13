import type { LogLevel } from './logging/logger.js';
import type { AgentRuntimeLimits } from './runtime-limits.js';

export interface LoggingSettings {
  level: LogLevel;
  applicationLogEnabled: boolean;
  modelInferenceLogEnabled: boolean;
  clearLogsOnStartup: boolean;
}

export interface SystemSettingsData extends LoggingSettings {
  agentRuntimeLimits?: AgentRuntimeLimits;
}

export interface SystemSettingsRecord {
  id: number;
  createdAt: number;
  updatedAt: number;
  data: SystemSettingsData;
}
