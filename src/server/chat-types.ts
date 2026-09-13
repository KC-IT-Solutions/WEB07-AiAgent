export interface ChatData {
  title: string;
  modelConnectionId: number | null;
  modelId: string | null;
}

export interface Chat {
  id: number;
  userId: number;
  createdAt: number;
  updatedAt: number;
  data: ChatData;
}

export interface CreateChatInput {
  title: string;
}

export interface UpdateChatInput {
  title?: string;
  modelConnectionId?: number | null;
  modelId?: string | null;
}

export interface ActiveChatSkill {
  relationId: number;
  skillId: number;
  commandName: string;
  name: string;
  createdAt: number;
  updatedAt: number;
}

export interface ChatCommandResult {
  type: 'command_result';
  command: string;
  message: string;
}

export type JsonValue = null | boolean | number | string | JsonValue[] | { [key: string]: JsonValue };

interface ContentChatEvent {
  content: string;
  createdAt: number;
}

export interface UserChatEvent extends ContentChatEvent {
  type: 'user';
}

export interface AssistantChatEvent extends ContentChatEvent {
  type: 'assistant';
}

export interface ReasoningChatEvent extends ContentChatEvent {
  type: 'reasoning';
}

export interface ToolCallChatEvent {
  type: 'tool_call';
  toolCallId: string;
  toolName: string;
  arguments: JsonValue;
  createdAt: number;
}

export interface ToolResultChatEvent {
  type: 'tool_result';
  toolCallId: string;
  toolName: string;
  result: JsonValue;
  success: boolean;
  createdAt: number;
}

export type ChatMessage =
  | UserChatEvent
  | AssistantChatEvent
  | ReasoningChatEvent
  | ToolCallChatEvent
  | ToolResultChatEvent;
