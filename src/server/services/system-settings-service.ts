import { LOG_LEVELS, type StructuredLogger } from '../logging/logger.js';
import type { SystemSettingsRepository } from '../repositories/system-settings-repository.js';
import {
  AGENT_RUNTIME_LIMITS_BOUNDS,
  AGENT_RUNTIME_LIMITS_DEFAULTS,
  isAgentRuntimeLimits,
  type AgentRuntimeLimits,
  type AgentRuntimeLimitsConfiguration,
} from '../runtime-limits.js';
import type { LoggingSettings, SystemSettingsData } from '../system-settings-types.js';

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

export class AgentRuntimeSettingsError extends Error {
  readonly code = 'INVALID_AGENT_RUNTIME_LIMITS';

  constructor() {
    super('INVALID_AGENT_RUNTIME_LIMITS');
    this.name = 'AgentRuntimeSettingsError';
  }
}

function selectLoggingSettings(data: SystemSettingsData): LoggingSettings {
  return {
    level: data.level,
    applicationLogEnabled: data.applicationLogEnabled,
    modelInferenceLogEnabled: data.modelInferenceLogEnabled,
    clearLogsOnStartup: data.clearLogsOnStartup,
  };
}

export class SystemSettingsService {
  constructor(
    private readonly repository: SystemSettingsRepository,
    private readonly logger?: Pick<StructuredLogger, 'setLevel' | 'setStreamEnabled'>,
  ) {}

  async getLoggingSettings(): Promise<LoggingSettings> {
    const saved = await this.repository.get();
    return saved ? selectLoggingSettings(saved.data) : { ...DEFAULT_SETTINGS };
  }

  async getAgentRuntimeLimits(): Promise<AgentRuntimeLimits> {
    const saved = await this.repository.get();
    return { ...(saved?.data.agentRuntimeLimits ?? AGENT_RUNTIME_LIMITS_DEFAULTS) };
  }

  async getAgentRuntimeLimitsConfiguration(): Promise<AgentRuntimeLimitsConfiguration> {
    return {
      limits: await this.getAgentRuntimeLimits(),
      defaults: { ...AGENT_RUNTIME_LIMITS_DEFAULTS },
      bounds: AGENT_RUNTIME_LIMITS_BOUNDS,
    };
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
    const saved = this.repository.transaction(() => {
      const current = this.repository.get();
      return this.repository.upsert({
        ...(current?.data ?? DEFAULT_SETTINGS),
        ...settings,
      });
    }).data;
    const savedLogging = selectLoggingSettings(saved);
    this.logger?.setLevel(savedLogging.level);
    this.logger?.setStreamEnabled('application', savedLogging.applicationLogEnabled);
    this.logger?.setStreamEnabled('model-inference', savedLogging.modelInferenceLogEnabled);
    return savedLogging;
  }

  async updateAgentRuntimeLimits(value: unknown): Promise<AgentRuntimeLimits> {
    if (!isAgentRuntimeLimits(value)) {
      throw new AgentRuntimeSettingsError();
    }
    const saved = this.repository.transaction(() => {
      const current = this.repository.get();
      return this.repository.upsert({
        ...(current?.data ?? DEFAULT_SETTINGS),
        agentRuntimeLimits: value,
      });
    });
    return { ...(saved.data.agentRuntimeLimits ?? AGENT_RUNTIME_LIMITS_DEFAULTS) };
  }
}
