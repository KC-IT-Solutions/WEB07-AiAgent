import type { Chat, CreateChatInput, UpdateChatInput } from '../chat-types.js';
import type { ChatRepository } from '../repositories/chat-repository.js';

const SERVER_USER_ID = 1;

export class ChatService {
  private readonly repository: ChatRepository;

  constructor(repository: ChatRepository) {
    this.repository = repository;
  }

  async createChat(input: CreateChatInput): Promise<Chat> {
    return this.repository.create(SERVER_USER_ID, input);
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

    return this.repository.update(SERVER_USER_ID, id, {
      title: input.title ?? existing.data.title,
      modelConnectionId:
        input.modelConnectionId === undefined
          ? existing.data.modelConnectionId
          : input.modelConnectionId,
      modelId: input.modelId === undefined ? existing.data.modelId : input.modelId,
    });
  }

  async deleteChat(id: number): Promise<boolean> {
    return this.repository.delete(SERVER_USER_ID, id);
  }
}
