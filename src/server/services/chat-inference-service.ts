import {
  createOpenAICompatibleTransport,
  ModelInferenceError,
  requestModelInference,
  type ModelAssistantMessage,
  type ModelInferenceMessage,
  type ModelInferenceResult,
  type ModelToolCall,
  type ModelToolDefinition,
  type OpenAICompatibleTransport,
} from '../../services/model-inference.js';
import type { ChatService } from './chat-service.js';
import type { ModelConnectionService } from './model-connection-service.js';
import type { ToolSettingsService } from './tool-settings-service.js';
import type { ToolRegistry } from '../tools/tool-registry.js';
import { randomUUID } from 'node:crypto';
import type { StructuredLogger } from '../logging/logger.js';
import type { ChatMessage, JsonValue } from '../chat-types.js';
import { RecoverableToolError } from '../tool-types.js';
import type { ChatSkillRepository } from '../repositories/chat-skill-repository.js';
import type { SkillToolRepository } from '../repositories/skill-tool-repository.js';
import type { SkillContentStore } from '../stores/skill-content-store.js';
import { ModelConnectionInferenceQueue } from './model-connection-inference-queue.js';

const SKILL_COMMAND_PATTERN = /^[a-z][a-z0-9_-]*$/;
const MAX_LOGGED_SKILL_COMMANDS = 100;
const MAX_SKILL_NAME_LENGTH = 120;
const MAX_TOOL_NAME_LENGTH = 128;

type ModelInferenceRequester = (
  baseUrl: string,
  timeoutMinutes: number,
  modelId: string,
  messages: ModelInferenceMessage[],
  tools?: ModelToolDefinition[],
  transport?: OpenAICompatibleTransport,
  signal?: AbortSignal,
  apiKey?: string,
) => Promise<ModelInferenceResult>;

export type ChatInferenceErrorCode =
  | 'CHAT_NOT_FOUND'
  | 'CHAT_CONNECTION_NOT_SELECTED'
  | 'CHAT_MODEL_NOT_SELECTED'
  | 'CONNECTION_NOT_FOUND'
  | 'CONNECTION_DISABLED'
  | 'MODEL_NOT_ALLOWED'
  | 'MODEL_SERVER_UNREACHABLE'
  | 'MODEL_SERVER_TIMEOUT'
  | 'MODEL_SERVER_RESPONSE_ERROR'
  | 'MODEL_SERVER_INVALID_RESPONSE'
  | 'TOOL_CALL_REJECTED'
  | 'TOOL_EXECUTION_FAILED'
  | 'SKILL_CONTENT_UNAVAILABLE'
  | 'SKILL_DATA_INVALID'
  | 'SKILL_REQUIRED_TOOL_MISSING'
  | 'CHAT_PERSISTENCE_FAILED';

export interface ChatInferenceStreamEvent {
  type: Exclude<ChatMessage['type'], 'user'>;
  sequence: number;
  inferenceId: string;
  event: Exclude<ChatMessage, { type: 'user' }>;
  final: boolean;
}

export type ChatInferenceEventSink = (event: ChatInferenceStreamEvent) => void | Promise<void>;

export class ChatInferenceError extends Error {
  readonly code: ChatInferenceErrorCode;
  readonly inferenceId: string;

  constructor(code: ChatInferenceErrorCode, inferenceId = randomUUID()) {
    super(code);
    this.name = 'ChatInferenceError';
    this.code = code;
    this.inferenceId = inferenceId;
  }
}

function safeProviderIdentifier(baseUrl: string): string {
  try {
    const url = new URL(baseUrl);
    url.username = '';
    url.password = '';
    url.search = '';
    url.hash = '';
    return url.toString().replace(/\/$/, '');
  } catch {
    return 'invalid-provider-url';
  }
}

function messagesForLog(messages: ModelInferenceMessage[]): unknown[] {
  return messages.map((message) =>
    message.role === 'assistant' && 'reasoning_content' in message
      ? { ...message, reasoning_content: '[PRESENT]' }
      : message,
  );
}

function approximateModelRequestBytes(
  modelId: string,
  messages: ModelInferenceMessage[],
  tools: ModelToolDefinition[],
): number {
  let bytes = Buffer.byteLength(modelId);
  for (const message of messages) {
    bytes += 64 + Buffer.byteLength(message.role);
    if ('content' in message && typeof message.content === 'string') {
      bytes += Buffer.byteLength(message.content);
    }
    if (message.role === 'assistant') {
      bytes += Buffer.byteLength(message.reasoning_content ?? '');
      for (const call of message.tool_calls ?? []) {
        bytes +=
          64 +
          Buffer.byteLength(call.id) +
          Buffer.byteLength(call.function.name) +
          Buffer.byteLength(call.function.arguments);
      }
    }
  }
  for (const tool of tools) {
    bytes += Buffer.byteLength(JSON.stringify(tool));
  }
  return bytes;
}

function boundedToolResult(value: unknown): string {
  const serialized = JSON.stringify(value) ?? 'null';
  const maximumLength = 32_000;
  return serialized.length <= maximumLength
    ? serialized
    : JSON.stringify({ truncated: true, content: serialized.slice(0, maximumLength) });
}

function boundedJsonValue(value: unknown): JsonValue {
  return JSON.parse(boundedToolResult(value)) as JsonValue;
}

function formatLocalCalendarDate(date: Date): string {
  const year = String(date.getFullYear()).padStart(4, '0');
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export class ChatInferenceService {
  private readonly chatService: ChatService;
  private readonly modelConnectionService: ModelConnectionService;

  constructor(
    chatService: ChatService,
    modelConnectionService: ModelConnectionService,
    private readonly toolSettingsService?: ToolSettingsService,
    private readonly toolRegistry?: ToolRegistry,
    private readonly modelInferenceRequester: ModelInferenceRequester = requestModelInference,
    private readonly logger?: Pick<StructuredLogger, 'application' | 'model'>,
    private readonly chatSkillRepository?: Pick<ChatSkillRepository, 'listForChat'>,
    private readonly skillToolRepository?: Pick<SkillToolRepository, 'listBySkillId'>,
    private readonly skillContentStore?: Pick<SkillContentStore, 'read'>,
    private readonly now: () => Date = () => new Date(),
    private readonly inferenceQueue = new ModelConnectionInferenceQueue(),
  ) {
    this.chatService = chatService;
    this.modelConnectionService = modelConnectionService;
  }

  async infer(
    chatId: number,
    message: string,
    eventSink?: ChatInferenceEventSink,
    inferenceId = randomUUID(),
    signal?: AbortSignal,
  ): Promise<{ message: string; events: ChatMessage[] }> {
    const currentDateMessage: ModelInferenceMessage = {
      role: 'system',
      content: `Current date: ${formatLocalCalendarDate(this.now())}`,
    };
    let logSequence = 0;
    let eventSequence = 0;
    let stage = 'initialization';
    let providerTransport: OpenAICompatibleTransport | undefined;
    let providerRequestStartedAt: number | undefined;
    let providerTimeoutMinutes: number | undefined;
    let inferenceTimeout: ReturnType<typeof setTimeout> | undefined;
    let inferenceTimedOut = false;
    let releaseConnectionSlot: (() => void) | undefined;
    const inferenceController = new AbortController();
    const abortInference = (): void => inferenceController.abort(signal?.reason);
    signal?.addEventListener('abort', abortInference, { once: true });
    if (signal?.aborted) abortInference();
    const logApplication = async (
      level: 'error' | 'warn' | 'info' | 'debug',
      event: string,
      fields: Record<string, unknown> = {},
    ): Promise<void> => {
      try {
        await this.logger?.application(level, event, { inferenceId, chatId, ...fields });
      } catch (error) {
        // Logging failures must not replace the inference result.
        process.stderr.write(
          `[logger] application log failed: ${error instanceof Error ? error.message : String(error)}\n`,
        );
      }
    };
    const logModel = async (
      level: 'error' | 'warn' | 'info' | 'debug' | 'trace',
      event: string,
      fields: Record<string, unknown> = {},
    ): Promise<void> => {
      try {
        logSequence += 1;
        await this.logger?.model(level, event, {
          inferenceId,
          sequence: logSequence,
          chatId,
          ...fields,
        });
      } catch (error) {
        // Logging failures must not replace the inference result.
        process.stderr.write(
          `[logger] model-inference log failed: ${error instanceof Error ? error.message : String(error)}\n`,
        );
      }
    };

    await logApplication('info', 'inference_started');
    try {
      stage = 'chat_configuration';
      const chat = await this.chatService.getChatById(chatId);
      if (!chat) {
        throw new ChatInferenceError('CHAT_NOT_FOUND', inferenceId);
      }
      const connectionId = chat.data.modelConnectionId;
      if (connectionId === null) {
        throw new ChatInferenceError('CHAT_CONNECTION_NOT_SELECTED', inferenceId);
      }
      const modelId = chat.data.modelId;
      if (modelId === null || modelId.trim().length === 0) {
        throw new ChatInferenceError('CHAT_MODEL_NOT_SELECTED', inferenceId);
      }
      const resolvedConnection = await this.modelConnectionService.getConnectionForInference(connectionId);
      if (!resolvedConnection) {
        throw new ChatInferenceError('CONNECTION_NOT_FOUND', inferenceId);
      }
      const { connection, apiKey } = resolvedConnection;
      if (!connection.data.enabled) {
        throw new ChatInferenceError('CONNECTION_DISABLED', inferenceId);
      }
      let modelVisible: boolean | null;
      try {
        modelVisible = await this.modelConnectionService.isModelVisible(connectionId, modelId);
      } catch {
        throw new ChatInferenceError('MODEL_SERVER_UNREACHABLE', inferenceId);
      }
      if (!modelVisible) {
        throw new ChatInferenceError('MODEL_NOT_ALLOWED', inferenceId);
      }
      stage = 'connection_queue';
      releaseConnectionSlot = await this.inferenceQueue.acquire(
        connectionId,
        inferenceController.signal,
      );
      providerTransport = createOpenAICompatibleTransport();
      providerTimeoutMinutes = connection.data.timeoutMinutes;
      inferenceTimeout = setTimeout(() => {
        inferenceTimedOut = true;
        inferenceController.abort();
      }, connection.data.timeoutMinutes * 60 * 1000);

      stage = 'persisted_history';
      const persistedMessages = await this.chatService.listMessages(chatId);
      if (persistedMessages === null) {
        throw new ChatInferenceError('CHAT_NOT_FOUND', inferenceId);
      }
      stage = 'active_skills';
      let activeSkills: ReturnType<ChatSkillRepository['listForChat']> = [];
      try {
        activeSkills = this.chatSkillRepository?.listForChat(chatId) ?? [];
      } catch {
        throw new ChatInferenceError('SKILL_DATA_INVALID', inferenceId);
      }
      const skillSections: string[] = [];
      const requiredToolOwners = new Map<string, { skillId: number; commandName: string }>();
      for (const skill of activeSkills) {
        if (
          !Number.isSafeInteger(skill.relationId) ||
          skill.relationId <= 0 ||
          !Number.isSafeInteger(skill.skillId) ||
          skill.skillId <= 0 ||
          typeof skill.commandName !== 'string' ||
          skill.commandName.length > 64 ||
          !SKILL_COMMAND_PATTERN.test(skill.commandName) ||
          typeof skill.name !== 'string' ||
          skill.name.trim().length === 0 ||
          skill.name.length > MAX_SKILL_NAME_LENGTH ||
          !Number.isSafeInteger(skill.createdAt)
        ) {
          await logModel('error', 'active_skill_resolution_failed', {
            stage,
            ...(Number.isSafeInteger(skill.skillId) ? { skillId: skill.skillId } : {}),
          });
          throw new ChatInferenceError('SKILL_DATA_INVALID', inferenceId);
        }

        let markdown: string;
        try {
          if (!this.skillContentStore) {
            throw new Error('Skill content store unavailable');
          }
          markdown = await this.skillContentStore.read(skill.skillId);
        } catch {
          await logModel('error', 'active_skill_resolution_failed', {
            skillId: skill.skillId,
            commandName: skill.commandName,
            stage: 'skill_content',
          });
          throw new ChatInferenceError('SKILL_CONTENT_UNAVAILABLE', inferenceId);
        }
        skillSections.push(`# Skill: ${skill.commandName}\n\n${markdown}`);

        let requiredTools: ReturnType<SkillToolRepository['listBySkillId']>;
        try {
          requiredTools = this.skillToolRepository?.listBySkillId(skill.skillId) ?? [];
        } catch {
          await logModel('error', 'active_skill_resolution_failed', {
            skillId: skill.skillId,
            commandName: skill.commandName,
            stage: 'skill_tools',
          });
          throw new ChatInferenceError('SKILL_DATA_INVALID', inferenceId);
        }
        for (const relation of requiredTools) {
          if (
            !Number.isSafeInteger(relation.id) ||
            relation.id <= 0 ||
            relation.skillId !== skill.skillId ||
            typeof relation.toolName !== 'string' ||
            relation.toolName.length === 0 ||
            relation.toolName.length > MAX_TOOL_NAME_LENGTH
          ) {
            await logModel('error', 'active_skill_resolution_failed', {
              skillId: skill.skillId,
              commandName: skill.commandName,
              stage: 'skill_tools',
            });
            throw new ChatInferenceError('SKILL_DATA_INVALID', inferenceId);
          }
          if (!requiredToolOwners.has(relation.toolName)) {
            requiredToolOwners.set(relation.toolName, {
              skillId: skill.skillId,
              commandName: skill.commandName,
            });
          }
        }
      }
      const skillContext = skillSections.length > 0 ? skillSections.join('\n\n') : null;
      const modelMessages: ModelInferenceMessage[] = [
        ...(skillContext === null
          ? []
          : [{ role: 'system' as const, content: skillContext }]),
        currentDateMessage,
        ...persistedMessages.flatMap((event, index): ModelInferenceMessage[] => {
          if (event.type === 'user') {
            return [{ role: 'user', content: event.content }];
          }
          if (event.type !== 'assistant') {
            return [];
          }
          const nextProtocolEvent = persistedMessages
            .slice(index + 1)
            .find((candidate) => candidate.type !== 'reasoning');
          return nextProtocolEvent?.type === 'tool_call'
            ? []
            : [{ role: 'assistant', content: event.content }];
        }),
        { role: 'user' as const, content: message },
      ];
      let appended: boolean;
      try {
        appended = await this.chatService.appendMessage(chatId, {
          type: 'user',
          content: message,
          createdAt: Math.floor(Date.now() / 1000),
        });
      } catch (error) {
        await logModel('error', 'chat_event_persistence_failed', {
          eventType: 'user',
          error: error instanceof Error ? error.message : 'Unknown persistence error',
        });
        throw new ChatInferenceError('CHAT_PERSISTENCE_FAILED', inferenceId);
      }
      if (!appended) {
        throw new ChatInferenceError('CHAT_NOT_FOUND', inferenceId);
      }
      const inferenceEvents: ChatMessage[] = [];
      const persistAndEmit = async (
        event: Exclude<ChatMessage, { type: 'user' }>,
        final = false,
      ): Promise<void> => {
        stage = 'event_persistence';
        let appended: boolean;
        try {
          appended = await this.chatService.appendMessage(chatId, event);
        } catch (error) {
          await logModel('error', 'chat_event_persistence_failed', {
            eventType: event.type,
            error: error instanceof Error ? error.message : 'Unknown persistence error',
          });
          throw new ChatInferenceError('CHAT_PERSISTENCE_FAILED', inferenceId);
        }
        if (!appended) {
          throw new ChatInferenceError('CHAT_NOT_FOUND', inferenceId);
        }

        inferenceEvents.push(event);
        eventSequence += 1;
        const eventFields = {
          eventSequence,
          eventType: event.type,
          ...(event.type === 'tool_call' || event.type === 'tool_result'
            ? { tool_call_id: event.toolCallId, tool: event.toolName }
            : {}),
        };
        await logModel('debug', 'chat_event_persisted', eventFields);
        if (eventSink) {
          stage = 'event_stream';
          await eventSink({
            type: event.type,
            sequence: eventSequence,
            inferenceId,
            event,
            final,
          });
          await logModel('debug', 'chat_event_streamed', eventFields);
        }
      };

      stage = 'effective_tools';
      const enabledTools =
        this.toolSettingsService && this.toolRegistry
          ? await this.toolSettingsService.listEnabledForChat()
          : [];
      const enabledByName = new Map(enabledTools.map((tool) => [tool.name, tool.settings]));
      for (const [toolName, owner] of requiredToolOwners) {
        const tool = this.toolRegistry?.get(toolName);
        if (!tool) {
          await logModel('error', 'active_skill_resolution_failed', {
            skillId: owner.skillId,
            commandName: owner.commandName,
            toolName,
            stage: 'required_tool_registry',
          });
          throw new ChatInferenceError('SKILL_REQUIRED_TOOL_MISSING', inferenceId);
        }
        if (!this.toolSettingsService) {
          throw new ChatInferenceError('SKILL_DATA_INVALID', inferenceId);
        }
        try {
          if (!enabledByName.has(toolName)) {
            enabledByName.set(toolName, await this.toolSettingsService.getSettings(toolName));
          }
        } catch {
          await logModel('error', 'active_skill_resolution_failed', {
            skillId: owner.skillId,
            commandName: owner.commandName,
            toolName,
            stage: 'required_tool_settings',
          });
          throw new ChatInferenceError('SKILL_DATA_INVALID', inferenceId);
        }
      }
      const definitions: ModelToolDefinition[] = [...enabledByName.keys()].flatMap((name) => {
        const tool = this.toolRegistry?.get(name);
        return tool
          ? [{
              type: 'function' as const,
              function: {
                name: tool.name,
                description: tool.description,
                parameters: tool.inputSchema,
              },
            }]
          : [];
      });

      let modelRound = 0;
      let assistantMessage: string | null = null;
      const seenToolCallIds = new Set<string>();
      while (assistantMessage === null) {
        if (inferenceController.signal.aborted) {
          throw inferenceTimedOut
            ? new ModelInferenceError('MODEL_SERVER_TIMEOUT')
            : (signal?.reason ?? new DOMException('The operation was aborted', 'AbortError'));
        }
        modelRound += 1;
        stage = 'model_provider';
        providerRequestStartedAt = Date.now();
        await logModel('info', 'model_request', {
          round: modelRound,
          modelConnectionId: connectionId,
          modelId,
          provider: safeProviderIdentifier(connection.data.baseUrl),
          timeoutMinutes: connection.data.timeoutMinutes,
          activeSkillCount: activeSkills.length,
          activeSkillCommands: activeSkills
            .slice(0, MAX_LOGGED_SKILL_COMMANDS)
            .map((skill) => skill.commandName),
          skillContextBytes: skillContext === null ? 0 : Buffer.byteLength(skillContext, 'utf8'),
          effectiveToolCount: definitions.length,
          messageCount: modelMessages.length,
          approximateRequestBytes: approximateModelRequestBytes(
            modelId,
            modelMessages,
            definitions,
          ),
          messages: messagesForLog(modelMessages),
          tools: definitions,
        });
        const result = await this.modelInferenceRequester(
          connection.data.baseUrl,
          connection.data.timeoutMinutes,
          modelId,
          modelMessages,
          definitions,
          providerTransport,
          inferenceController.signal,
          apiKey,
        );
        providerRequestStartedAt = undefined;
        const providerAssistantMessage: ModelAssistantMessage | undefined =
          result.assistantMessage ??
          (result.type === 'message'
            ? { role: 'assistant', content: result.content }
            : undefined);
        if (!providerAssistantMessage) {
          throw new ChatInferenceError('TOOL_CALL_REJECTED', inferenceId);
        }
        await logModel('info', 'model_response', {
          round: modelRound,
          finish_reason: result.finishReason ?? null,
          assistant: {
            role: providerAssistantMessage.role,
            content: providerAssistantMessage.content,
            reasoning_content_present: 'reasoning_content' in providerAssistantMessage,
            tool_calls: providerAssistantMessage.tool_calls ?? [],
          },
        });
        const validatedCalls: Array<{
          call: ModelToolCall;
          argumentsValue: unknown;
          sourceRound: number;
          responseIndex: number;
          sourceArguments: string;
          sourceResponse: ModelAssistantMessage;
        }> = [];
        if (result.type === 'tool_calls') {
          const providerCalls = providerAssistantMessage.tool_calls;
          if (
            !providerCalls ||
            providerCalls.length !== result.calls.length ||
            providerCalls.some((call, index) => {
              const resultCall = result.calls[index];
              return (
                call.id !== resultCall?.id ||
                call.type !== resultCall.type ||
                call.function.name !== resultCall.function.name ||
                call.function.arguments !== resultCall.function.arguments
              );
            })
          ) {
            throw new ChatInferenceError('TOOL_CALL_REJECTED', inferenceId);
          }
          const roundCallIds = new Set<string>();
          for (const [responseIndex, call] of providerCalls.entries()) {
            if (
              seenToolCallIds.has(call.id) ||
              roundCallIds.has(call.id) ||
              !enabledByName.has(call.function.name) ||
              !this.toolRegistry
            ) {
              throw new ChatInferenceError('TOOL_CALL_REJECTED', inferenceId);
            }
            let argumentsValue: unknown;
            try {
              argumentsValue = JSON.parse(call.function.arguments) as unknown;
            } catch {
              throw new ChatInferenceError('TOOL_CALL_REJECTED', inferenceId);
            }
            roundCallIds.add(call.id);
            validatedCalls.push({
              call,
              argumentsValue,
              sourceRound: modelRound,
              responseIndex,
              sourceArguments: call.function.arguments,
              sourceResponse: providerAssistantMessage,
            });
          }
          for (const callId of roundCallIds) {
            seenToolCallIds.add(callId);
          }
        }
        const createdAt = Math.floor(Date.now() / 1000);
        if (
          providerAssistantMessage.reasoning_content !== undefined &&
          providerAssistantMessage.reasoning_content.trim().length > 0
        ) {
          await persistAndEmit({
            type: 'reasoning',
            content: providerAssistantMessage.reasoning_content,
            createdAt,
          });
        }
        if (
          result.type === 'tool_calls' &&
          providerAssistantMessage.content !== null &&
          providerAssistantMessage.content.trim().length > 0
        ) {
          await persistAndEmit({
            type: 'assistant',
            content: providerAssistantMessage.content,
            createdAt,
          });
        }
        if (result.type === 'tool_calls') {
          for (const { call, argumentsValue } of validatedCalls) {
            await persistAndEmit({
              type: 'tool_call',
              toolCallId: call.id,
              toolName: call.function.name,
              arguments: boundedJsonValue(argumentsValue),
              createdAt,
            });
          }
        }
        if (result.type === 'message') {
          assistantMessage = result.content;
          break;
        }
        modelMessages.push(providerAssistantMessage);
        for (const provenance of validatedCalls) {
          const {
            call,
            argumentsValue,
            sourceRound,
            responseIndex,
            sourceArguments,
            sourceResponse,
          } = provenance;
          stage = 'tool_validation';
          const settings = enabledByName.get(call.function.name);
          const sourceCall = providerAssistantMessage.tool_calls?.[responseIndex];
          if (
            !settings ||
            !this.toolRegistry ||
            sourceRound !== modelRound ||
            sourceResponse !== providerAssistantMessage ||
            sourceCall?.id !== call.id ||
            sourceCall.type !== call.type ||
            sourceCall.function.name !== call.function.name ||
            sourceCall.function.arguments !== sourceArguments ||
            JSON.stringify(argumentsValue) !== JSON.stringify(JSON.parse(sourceArguments) as unknown)
          ) {
            throw new ChatInferenceError('TOOL_CALL_REJECTED', inferenceId);
          }
          await logModel('debug', 'tool_execution_started', {
            round: modelRound,
            sourceRound,
            providerResponseIndex: responseIndex,
            tool_call_id: call.id,
            tool: call.function.name,
            arguments: argumentsValue,
          });
          const startedAt = Date.now();
          let toolResult: unknown;
          try {
            stage = 'tool_execution';
            toolResult = await this.toolRegistry.execute(
              call.function.name,
              argumentsValue,
              settings,
              inferenceController.signal,
            );
            await logModel('debug', 'tool_execution_completed', {
              round: modelRound,
              tool_call_id: call.id,
              tool: call.function.name,
              durationMs: Date.now() - startedAt,
            });
          } catch (error) {
            if (inferenceController.signal.aborted) {
              throw inferenceTimedOut
                ? new ModelInferenceError('MODEL_SERVER_TIMEOUT')
                : (signal?.reason ?? new DOMException('The operation was aborted', 'AbortError'));
            }
            const recoverable = error instanceof RecoverableToolError;
            await logModel(recoverable ? 'warn' : 'error', 'tool_execution_failed', {
              round: modelRound,
              tool_call_id: call.id,
              tool: call.function.name,
              durationMs: Date.now() - startedAt,
              recoverable,
              ...(recoverable
                ? { errorCode: error.code }
                : { error: error instanceof Error ? error.message : 'Unknown tool error' }),
            });
            if (!recoverable) {
              throw new ChatInferenceError('TOOL_EXECUTION_FAILED', inferenceId);
            }

            const failureResult = {
              success: false,
              error: {
                code: error.code,
                message: error.safeMessage,
                ...error.metadata,
              },
            };
            const toolContent = boundedToolResult(failureResult);
            await persistAndEmit({
              type: 'tool_result',
              toolCallId: call.id,
              toolName: call.function.name,
              result: boundedJsonValue(failureResult),
              success: false,
              createdAt: Math.floor(Date.now() / 1000),
            });
            modelMessages.push({
              role: 'tool',
              tool_call_id: call.id,
              content: toolContent,
            });
            await logModel('debug', 'tool_result', {
              round: modelRound,
              tool_call_id: call.id,
              tool: call.function.name,
              success: false,
              content: toolContent,
            });
            continue;
          }
          const toolContent = boundedToolResult(toolResult);
          const toolResultEvent: ChatMessage = {
            type: 'tool_result',
            toolCallId: call.id,
            toolName: call.function.name,
            result: boundedJsonValue(toolResult),
            success: true,
            createdAt: Math.floor(Date.now() / 1000),
          };
          await persistAndEmit(toolResultEvent);
          modelMessages.push({
            role: 'tool',
            tool_call_id: call.id,
            content: toolContent,
          });
          await logModel('debug', 'tool_result', {
            round: modelRound,
            tool_call_id: call.id,
            tool: call.function.name,
            content: toolContent,
          });
        }
      }

      const finalAssistantEvent: ChatMessage = {
        type: 'assistant',
        content: assistantMessage,
        createdAt: Math.floor(Date.now() / 1000),
      };
      await persistAndEmit(finalAssistantEvent, true);
      await logModel('info', 'inference_completed', { rounds: modelRound });
      await logApplication('info', 'inference_completed', { rounds: modelRound });
      return { message: assistantMessage, events: inferenceEvents };
    } catch (error) {
      let mappedError = error;
      if (inferenceTimedOut) {
        mappedError = new ChatInferenceError('MODEL_SERVER_TIMEOUT', inferenceId);
      } else if (error instanceof ModelInferenceError) {
        mappedError = new ChatInferenceError(error.code, inferenceId);
      }
      const applicationTimeout =
        inferenceTimedOut ||
        (error instanceof ModelInferenceError && error.code === 'MODEL_SERVER_TIMEOUT');
      const providerFields =
        error instanceof ModelInferenceError || applicationTimeout
          ? {
              errorCode: applicationTimeout
                ? 'MODEL_SERVER_TIMEOUT'
                : (error as ModelInferenceError).code,
              ...(error instanceof ModelInferenceError ? error.diagnostics : {}),
              ...(providerTimeoutMinutes === undefined
                ? {}
                : { timeoutMinutes: providerTimeoutMinutes }),
              ...(providerRequestStartedAt === undefined
                ? {}
                : { durationMs: Date.now() - providerRequestStartedAt }),
              applicationTimeout,
            }
          : {};
      await logModel('error', 'inference_failed', {
        stage,
        ...providerFields,
        error:
          error instanceof Error
            ? error.message
            : 'Unknown inference error',
      });
      await logApplication('error', 'inference_failed', {
        stage,
        ...providerFields,
        error: error instanceof Error ? error.message : 'Unknown inference error',
      });
      throw mappedError;
    } finally {
      if (inferenceTimeout !== undefined) clearTimeout(inferenceTimeout);
      signal?.removeEventListener('abort', abortInference);
      if (providerTransport) {
        try {
          await providerTransport.close();
        } catch {
          await logApplication('error', 'model_transport_close_failed');
        }
      }
      releaseConnectionSlot?.();
    }
  }
}
