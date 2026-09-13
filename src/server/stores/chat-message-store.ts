import { appendFile, mkdir, readFile, unlink } from 'node:fs/promises';
import { dirname, isAbsolute, relative, resolve } from 'node:path';
import type { ChatMessage, JsonValue } from '../chat-types.js';

export interface ChatMessageStore {
  listMessages(userId: number, chatId: number): Promise<ChatMessage[]>;
  appendMessage(userId: number, chatId: number, message: ChatMessage): Promise<void>;
  deleteHistory(userId: number, chatId: number): Promise<void>;
}

export class ChatMessageStoreError extends Error {
  constructor() {
    super('Chat message history could not be read');
    this.name = 'ChatMessageStoreError';
  }
}

function isFileSystemError(error: unknown, code: string): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error as { code?: unknown }).code === code
  );
}

function validateId(value: number): void {
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new ChatMessageStoreError();
  }
}

function isJsonValue(value: unknown): value is JsonValue {
  if (
    value === null ||
    typeof value === 'string' ||
    typeof value === 'boolean' ||
    (typeof value === 'number' && Number.isFinite(value))
  ) {
    return true;
  }
  if (Array.isArray(value)) {
    return value.every(isJsonValue);
  }
  return (
    typeof value === 'object' &&
    value !== null &&
    Object.values(value as Record<string, unknown>).every(isJsonValue)
  );
}

function hasExactFields(value: Record<string, unknown>, fields: string[]): boolean {
  const actualFields = Object.keys(value);
  return actualFields.length === fields.length && fields.every((field) => actualFields.includes(field));
}

function isTimestamp(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0;
}

function parseMessage(value: unknown): ChatMessage {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new ChatMessageStoreError();
  }

  const message = value as Record<string, unknown>;
  // Historical JSONL entries used role instead of the event discriminant.
  if (hasExactFields(message, ['role', 'content', 'createdAt'])) {
    if (
      (message.role !== 'user' && message.role !== 'assistant') ||
      typeof message.content !== 'string' ||
      message.content.trim().length === 0 ||
      !isTimestamp(message.createdAt)
    ) {
      throw new ChatMessageStoreError();
    }
    return { type: message.role, content: message.content, createdAt: message.createdAt };
  }

  if (
    (message.type === 'user' || message.type === 'assistant' || message.type === 'reasoning') &&
    hasExactFields(message, ['type', 'content', 'createdAt']) &&
    typeof message.content === 'string' &&
    message.content.trim().length > 0 &&
    isTimestamp(message.createdAt)
  ) {
    return { type: message.type, content: message.content, createdAt: message.createdAt };
  }

  if (
    message.type === 'tool_call' &&
    hasExactFields(message, ['type', 'toolCallId', 'toolName', 'arguments', 'createdAt']) &&
    typeof message.toolCallId === 'string' &&
    message.toolCallId.length > 0 &&
    typeof message.toolName === 'string' &&
    message.toolName.length > 0 &&
    isJsonValue(message.arguments) &&
    isTimestamp(message.createdAt)
  ) {
    return {
      type: 'tool_call',
      toolCallId: message.toolCallId,
      toolName: message.toolName,
      arguments: message.arguments,
      createdAt: message.createdAt,
    };
  }

  if (
    message.type === 'tool_result' &&
    hasExactFields(message, ['type', 'toolCallId', 'toolName', 'result', 'success', 'createdAt']) &&
    typeof message.toolCallId === 'string' &&
    message.toolCallId.length > 0 &&
    typeof message.toolName === 'string' &&
    message.toolName.length > 0 &&
    isJsonValue(message.result) &&
    typeof message.success === 'boolean' &&
    isTimestamp(message.createdAt)
  ) {
    return {
      type: 'tool_result',
      toolCallId: message.toolCallId,
      toolName: message.toolName,
      result: message.result,
      success: message.success,
      createdAt: message.createdAt,
    };
  }

  throw new ChatMessageStoreError();
}

export class FileChatMessageStore implements ChatMessageStore {
  private readonly rootPath: string;
  private readonly pendingOperations = new Map<string, Promise<void>>();

  constructor(rootPath: string) {
    this.rootPath = resolve(rootPath);
  }

  async listMessages(userId: number, chatId: number): Promise<ChatMessage[]> {
    const filePath = this.getFilePath(userId, chatId);

    return this.withFileLock(filePath, async () => {
      let contents: string;
      try {
        contents = await readFile(filePath, 'utf8');
      } catch (error) {
        if (isFileSystemError(error, 'ENOENT')) {
          return [];
        }
        throw new ChatMessageStoreError();
      }

      if (contents.length === 0) {
        return [];
      }

      const lines = contents.split(/\r?\n/);
      if (lines[lines.length - 1] === '') {
        lines.pop();
      }

      return lines.map((line) => {
        if (line.length === 0) {
          throw new ChatMessageStoreError();
        }

        let parsed: unknown;
        try {
          parsed = JSON.parse(line) as unknown;
        } catch {
          throw new ChatMessageStoreError();
        }
        return parseMessage(parsed);
      });
    });
  }

  async appendMessage(userId: number, chatId: number, message: ChatMessage): Promise<void> {
    const filePath = this.getFilePath(userId, chatId);
    const validatedMessage = parseMessage(message);

    await this.withFileLock(filePath, async () => {
      try {
        await mkdir(dirname(filePath), { recursive: true });
        await appendFile(filePath, `${JSON.stringify(validatedMessage)}\n`, 'utf8');
      } catch {
        throw new ChatMessageStoreError();
      }
    });
  }

  async deleteHistory(userId: number, chatId: number): Promise<void> {
    const filePath = this.getFilePath(userId, chatId);

    await this.withFileLock(filePath, async () => {
      try {
        await unlink(filePath);
      } catch (error) {
        if (!isFileSystemError(error, 'ENOENT')) {
          throw new ChatMessageStoreError();
        }
      }
    });
  }

  private getFilePath(userId: number, chatId: number): string {
    validateId(userId);
    validateId(chatId);

    const filePath = resolve(this.rootPath, `user-${userId}`, `chat-${chatId}.jsonl`);
    const pathWithinRoot = relative(this.rootPath, filePath);
    if (pathWithinRoot.startsWith('..') || isAbsolute(pathWithinRoot)) {
      throw new ChatMessageStoreError();
    }
    return filePath;
  }

  private async withFileLock<T>(filePath: string, operation: () => Promise<T>): Promise<T> {
    const previous = this.pendingOperations.get(filePath) ?? Promise.resolve();
    const current = previous.then(operation, operation);
    const settled = current.then(
      () => undefined,
      () => undefined,
    );
    this.pendingOperations.set(filePath, settled);

    try {
      return await current;
    } finally {
      if (this.pendingOperations.get(filePath) === settled) {
        this.pendingOperations.delete(filePath);
      }
    }
  }
}
