import type { ChatModelDefaults, ChatSettingsData } from '../chat-settings-types.js';
import type { ChatSettingsRepository } from '../repositories/chat-settings-repository.js';
import type { ModelConnectionService } from './model-connection-service.js';

const SERVER_USER_ID = 1;
const EMPTY_SETTINGS: ChatSettingsData = {
  defaultModelConnectionId: null,
  defaultModelId: null,
  showReasoning: false,
  showToolCalls: false,
};

export class ChatSettingsError extends Error {
  constructor(readonly code: 'INVALID_CONNECTION' | 'CONNECTION_DISABLED' | 'INVALID_MODEL') {
    super(code);
    this.name = 'ChatSettingsError';
  }
}

export class ChatSettingsService {
  constructor(
    private readonly repository: ChatSettingsRepository,
    private readonly modelConnectionService: Pick<
      ModelConnectionService,
      'getConnectionById' | 'discoverModels'
    >,
  ) {}

  async getSettings(): Promise<ChatSettingsData> {
    return (await this.repository.get(SERVER_USER_ID))?.data ?? { ...EMPTY_SETTINGS };
  }

  async updateSettings(value: ChatSettingsData): Promise<ChatSettingsData> {
    const connectionId = value.defaultModelConnectionId;
    const modelId = value.defaultModelId;
    if (connectionId === null) {
      if (modelId !== null) {
        throw new ChatSettingsError('INVALID_MODEL');
      }
      return (
        await this.repository.upsert(SERVER_USER_ID, {
          ...value,
          defaultModelConnectionId: null,
          defaultModelId: null,
        })
      ).data;
    }

    const connection = await this.modelConnectionService.getConnectionById(connectionId);
    if (!connection || connection.userId !== SERVER_USER_ID) {
      throw new ChatSettingsError('INVALID_CONNECTION');
    }
    if (!connection.data.enabled) {
      throw new ChatSettingsError('CONNECTION_DISABLED');
    }
    if (modelId !== null) {
      const models = await this.modelConnectionService.discoverModels(connectionId);
      if (!models?.includes(modelId)) {
        throw new ChatSettingsError('INVALID_MODEL');
      }
    }

    return (
      await this.repository.upsert(SERVER_USER_ID, {
        defaultModelConnectionId: connectionId,
        defaultModelId: modelId,
        showReasoning: value.showReasoning,
        showToolCalls: value.showToolCalls,
      })
    ).data;
  }

  async getDefaultsForNewChat(): Promise<ChatModelDefaults> {
    const settings = await this.getSettings();
    if (settings.defaultModelConnectionId === null) {
      return { defaultModelConnectionId: null, defaultModelId: null };
    }
    const connection = await this.modelConnectionService.getConnectionById(
      settings.defaultModelConnectionId,
    );
    if (!connection || connection.userId !== SERVER_USER_ID || !connection.data.enabled) {
      return { defaultModelConnectionId: null, defaultModelId: null };
    }
    if (settings.defaultModelId === null) {
      return {
        defaultModelConnectionId: settings.defaultModelConnectionId,
        defaultModelId: null,
      };
    }
    const models = await this.modelConnectionService.discoverModels(
      settings.defaultModelConnectionId,
    );
    return {
      defaultModelConnectionId: settings.defaultModelConnectionId,
      defaultModelId: models?.includes(settings.defaultModelId) ? settings.defaultModelId : null,
    };
  }
}
