import { ModelInferenceError, requestModelInference } from '../../services/model-inference.js';
import type { ChatService } from './chat-service.js';
import type { ModelConnectionService } from './model-connection-service.js';

export type ChatInferenceErrorCode =
  | 'CHAT_NOT_FOUND'
  | 'CHAT_CONNECTION_NOT_SELECTED'
  | 'CHAT_MODEL_NOT_SELECTED'
  | 'CONNECTION_NOT_FOUND'
  | 'CONNECTION_DISABLED'
  | 'MODEL_SERVER_UNREACHABLE'
  | 'MODEL_SERVER_TIMEOUT'
  | 'MODEL_SERVER_RESPONSE_ERROR'
  | 'MODEL_SERVER_INVALID_RESPONSE';

export class ChatInferenceError extends Error {
  readonly code: ChatInferenceErrorCode;

  constructor(code: ChatInferenceErrorCode) {
    super(code);
    this.name = 'ChatInferenceError';
    this.code = code;
  }
}

export class ChatInferenceService {
  private readonly chatService: ChatService;
  private readonly modelConnectionService: ModelConnectionService;

  constructor(chatService: ChatService, modelConnectionService: ModelConnectionService) {
    this.chatService = chatService;
    this.modelConnectionService = modelConnectionService;
  }

  async infer(chatId: number, message: string): Promise<{ message: string }> {
    const chat = await this.chatService.getChatById(chatId);
    if (!chat) {
      throw new ChatInferenceError('CHAT_NOT_FOUND');
    }

    const connectionId = chat.data.modelConnectionId;
    if (connectionId === null) {
      throw new ChatInferenceError('CHAT_CONNECTION_NOT_SELECTED');
    }

    const modelId = chat.data.modelId;
    if (modelId === null || modelId.trim().length === 0) {
      throw new ChatInferenceError('CHAT_MODEL_NOT_SELECTED');
    }

    const connection = await this.modelConnectionService.getConnectionById(connectionId);
    if (!connection) {
      throw new ChatInferenceError('CONNECTION_NOT_FOUND');
    }

    if (!connection.data.enabled) {
      throw new ChatInferenceError('CONNECTION_DISABLED');
    }

    try {
      const assistantMessage = await requestModelInference(
        connection.data.baseUrl,
        connection.data.timeoutMinutes,
        modelId,
        message,
      );
      return { message: assistantMessage };
    } catch (error) {
      if (error instanceof ModelInferenceError) {
        throw new ChatInferenceError(error.code);
      }
      throw error;
    }
  }
}
