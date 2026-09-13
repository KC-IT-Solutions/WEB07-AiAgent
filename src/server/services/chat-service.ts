import type { Chat, ChatMessage, CreateChatInput, UpdateChatInput } from '../chat-types.js';
import type { ChatRepository } from '../repositories/chat-repository.js';
import type { ChatMessageStore } from '../stores/chat-message-store.js';
import type { ChatSettingsService } from './chat-settings-service.js';
import type { ModelConnectionService } from './model-connection-service.js';

const SERVER_USER_ID = 1;

export class ChatSelectionError extends Error {
  constructor(
    readonly code: 'INVALID_CONNECTION' | 'CONNECTION_DISABLED' | 'MODEL_NOT_ALLOWED',
  ) {
    super(code);
    this.name = 'ChatSelectionError';
  }
}

export class ChatService {
  private readonly repository: ChatRepository;
  private readonly messageStore: ChatMessageStore;

  constructor(
    repository: ChatRepository,
    messageStore: ChatMessageStore,
    private readonly chatSettingsService?: Pick<ChatSettingsService, 'getDefaultsForNewChat'>,
    private readonly modelConnectionService?: Pick<
      ModelConnectionService,
      'getConnectionById' | 'isModelVisible'
    >,
  ) {
    this.repository = repository;
    this.messageStore = messageStore;
  }

  async createChat(input: CreateChatInput): Promise<Chat> {
    const defaults = this.chatSettingsService
      ? await this.chatSettingsService.getDefaultsForNewChat()
      : { defaultModelConnectionId: null, defaultModelId: null };
    return this.repository.create(SERVER_USER_ID, {
      title: input.title,
      modelConnectionId: defaults.defaultModelConnectionId,
      modelId: defaults.defaultModelId,
    });
  }

  async listChats(): Promise<Chat[]> {
    return this.repository.listByUserId(SERVER_USER_ID);
  }

  async getChatById(id: number): Promise<Chat | null> {
    return this.repository.getById(SERVER_USER_ID, id);
  }

  async updateChat(id: number, input: UpdateChatInput): Promise<Chat | null> {
    const existing = await this.repository.getById(SERVER_USER_ID, id);

    if (!existing) {
      return null;
    }

    const modelConnectionId =
      input.modelConnectionId === undefined
        ? existing.data.modelConnectionId
        : input.modelConnectionId;
    const modelId = input.modelId === undefined ? existing.data.modelId : input.modelId;
    if (
      this.modelConnectionService &&
      (input.modelConnectionId !== undefined || input.modelId !== undefined)
    ) {
      if (modelConnectionId === null) {
        if (modelId !== null) throw new ChatSelectionError('INVALID_CONNECTION');
      } else {
        const connection = await this.modelConnectionService.getConnectionById(modelConnectionId);
        if (!connection) throw new ChatSelectionError('INVALID_CONNECTION');
        if (!connection.data.enabled) throw new ChatSelectionError('CONNECTION_DISABLED');
        if (
          modelId !== null &&
          !(await this.modelConnectionService.isModelVisible(modelConnectionId, modelId))
        ) {
          throw new ChatSelectionError('MODEL_NOT_ALLOWED');
        }
      }
    }

    return this.repository.update(SERVER_USER_ID, id, {
      title: input.title ?? existing.data.title,
      modelConnectionId,
      modelId,
    });
  }

  async deleteChat(id: number): Promise<boolean> {
    const existing = await this.repository.getById(SERVER_USER_ID, id);
    if (!existing) {
      return false;
    }

    await this.messageStore.deleteHistory(SERVER_USER_ID, id);
    return this.repository.delete(SERVER_USER_ID, id);
  }

  async clearMessages(id: number): Promise<boolean> {
    const existing = await this.repository.getById(SERVER_USER_ID, id);
    if (!existing) {
      return false;
    }
    await this.messageStore.deleteHistory(SERVER_USER_ID, id);
    return true;
  }

  async listMessages(id: number): Promise<ChatMessage[] | null> {
    const existing = await this.repository.getById(SERVER_USER_ID, id);
    if (!existing) {
      return null;
    }

    return this.messageStore.listMessages(SERVER_USER_ID, id);
  }

  async appendMessage(id: number, message: ChatMessage): Promise<boolean> {
    const existing = await this.repository.getById(SERVER_USER_ID, id);
    if (!existing) {
      return false;
    }

    await this.messageStore.appendMessage(SERVER_USER_ID, id, message);
    return true;
  }
}
