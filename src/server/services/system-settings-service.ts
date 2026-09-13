import { LOG_LEVELS, type StructuredLogger } from '../logging/logger.js';
import type { SystemSettingsRepository } from '../repositories/system-settings-repository.js';
import type { LoggingSettings } from '../system-settings-types.js';

const DEFAULT_SETTINGS: LoggingSettings = {
  level: 'info',
  applicationLogEnabled: true,
  modelInferenceLogEnabled: true,
  clearLogsOnStartup: false,
};

export class SystemSettingsError extends Error {
  constructor() {
    super('INVALID_LOGGING_SETTINGS');
    this.name = 'SystemSettingsError';
  }
}

export class SystemSettingsService {
  constructor(
    private readonly repository: SystemSettingsRepository,
    private readonly logger?: Pick<StructuredLogger, 'setLevel' | 'setStreamEnabled'>,
  ) {}

  async getLoggingSettings(): Promise<LoggingSettings> {
    return (await this.repository.get())?.data ?? { ...DEFAULT_SETTINGS };
  }

  async updateLoggingSettings(value: unknown): Promise<LoggingSettings> {
    if (typeof value !== 'object' || value === null || Array.isArray(value)) {
      throw new SystemSettingsError();
    }
    const fields = value as Record<string, unknown>;
    if (
      Object.keys(fields).length !== 4 ||
      typeof fields.level !== 'string' ||
      !LOG_LEVELS.includes(fields.level as (typeof LOG_LEVELS)[number]) ||
      typeof fields.applicationLogEnabled !== 'boolean' ||
      typeof fields.modelInferenceLogEnabled !== 'boolean' ||
      typeof fields.clearLogsOnStartup !== 'boolean'
    ) {
      throw new SystemSettingsError();
    }
    const settings: LoggingSettings = {
      level: fields.level as LoggingSettings['level'],
      applicationLogEnabled: fields.applicationLogEnabled,
      modelInferenceLogEnabled: fields.modelInferenceLogEnabled,
      clearLogsOnStartup: fields.clearLogsOnStartup,
    };
    const saved = (await this.repository.upsert(settings)).data;
    this.logger?.setLevel(saved.level);
    this.logger?.setStreamEnabled('application', saved.applicationLogEnabled);
    this.logger?.setStreamEnabled('model-inference', saved.modelInferenceLogEnabled);
    return saved;
  }
}
