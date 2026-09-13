import { Agent, type Dispatcher } from 'undici';

export type ModelInferenceErrorCode =
  | 'MODEL_SERVER_UNREACHABLE'
  | 'MODEL_SERVER_TIMEOUT'
  | 'MODEL_SERVER_RESPONSE_ERROR'
  | 'MODEL_SERVER_INVALID_RESPONSE';

export class ModelInferenceError extends Error {
  readonly code: ModelInferenceErrorCode;
  readonly diagnostics: ProviderErrorDiagnostics;

  constructor(
    code: ModelInferenceErrorCode,
    detail?: string,
    diagnostics: ProviderErrorDiagnostics = {},
  ) {
    super(detail ? `${code}: ${detail}` : code);
    this.name = 'ModelInferenceError';
    this.code = code;
    this.diagnostics = diagnostics;
  }
}

export interface ProviderErrorDiagnostics {
  providerErrorCode?: string;
  providerErrorName?: string;
  providerErrorCauseCode?: string;
}

export const OPENAI_COMPATIBLE_DISPATCHER_OPTIONS = Object.freeze({
  headersTimeout: 0,
  bodyTimeout: 0,
  connectTimeout: 60_000,
}) satisfies Agent.Options;

export interface OpenAICompatibleTransport {
  fetch(input: string | URL | Request, init?: RequestInit): Promise<Response>;
  close(): Promise<void>;
}

export function createOpenAICompatibleTransport(): OpenAICompatibleTransport {
  const dispatcher = new Agent(OPENAI_COMPATIBLE_DISPATCHER_OPTIONS);
  return {
    fetch: async (input, init) => {
      const dispatcherInit: RequestInit & { dispatcher: Dispatcher } = {
        ...init,
        dispatcher,
      };
      return fetch(input, dispatcherInit);
    },
    close: () => dispatcher.close(),
  };
}

function stringField(value: unknown, field: string): string | undefined {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return undefined;
  }
  const fieldValue = (value as Record<string, unknown>)[field];
  return typeof fieldValue === 'string' && fieldValue.length > 0 ? fieldValue : undefined;
}

function providerErrorDiagnostics(error: unknown): ProviderErrorDiagnostics {
  const cause =
    typeof error === 'object' && error !== null && !Array.isArray(error)
      ? (error as Record<string, unknown>).cause
      : undefined;
  const providerErrorCode = stringField(error, 'code');
  const providerErrorName = stringField(error, 'name');
  const providerErrorCauseCode = stringField(cause, 'code');
  return {
    ...(providerErrorCode ? { providerErrorCode } : {}),
    ...(providerErrorName ? { providerErrorName } : {}),
    ...(providerErrorCauseCode ? { providerErrorCauseCode } : {}),
  };
}

const PROVIDER_TRANSPORT_ERROR_CODES = new Set([
  'UND_ERR_CONNECT_TIMEOUT',
  'UND_ERR_HEADERS_TIMEOUT',
  'UND_ERR_BODY_TIMEOUT',
  'ECONNREFUSED',
  'ECONNRESET',
  'ENOTFOUND',
  'EAI_AGAIN',
]);

function isProviderTransportError(diagnostics: ProviderErrorDiagnostics): boolean {
  return (
    diagnostics.providerErrorName === 'AbortError' ||
    (diagnostics.providerErrorCode !== undefined &&
      PROVIDER_TRANSPORT_ERROR_CODES.has(diagnostics.providerErrorCode)) ||
    (diagnostics.providerErrorCauseCode !== undefined &&
      PROVIDER_TRANSPORT_ERROR_CODES.has(diagnostics.providerErrorCauseCode))
  );
}

export interface ModelToolCall {
  id: string;
  type: 'function';
  function: { name: string; arguments: string };
}

export interface ModelAssistantMessage {
  role: 'assistant';
  content: string | null;
  reasoning_content?: string;
  tool_calls?: ModelToolCall[];
}

export type ModelInferenceMessage =
  | { role: 'system'; content: string }
  | { role: 'user'; content: string }
  | ModelAssistantMessage
  | { role: 'tool'; tool_call_id: string; content: string };

export interface ModelToolDefinition {
  type: 'function';
  function: {
    name: string;
    description: string;
    parameters: Record<string, unknown>;
  };
}

export interface ModelInferenceUsage {
  totalTokens: number;
}

export type ModelInferenceResult =
  | {
      type: 'message';
      content: string;
      assistantMessage?: ModelAssistantMessage;
      finishReason?: string | null;
      usage?: ModelInferenceUsage;
    }
  | {
      type: 'tool_calls';
      calls: ModelToolCall[];
      assistantMessage: ModelAssistantMessage & { tool_calls: ModelToolCall[] };
      finishReason?: string | null;
      usage?: ModelInferenceUsage;
    };

export interface StreamedModelInferencePartialResult {
  type: 'cancelled';
  reasoningContent?: string;
  content?: string;
  finishReason?: string | null;
  usage?: ModelInferenceUsage;
}

export async function requestModelInference(
  baseUrl: string,
  timeoutMinutes: number,
  modelId: string,
  messages: ModelInferenceMessage[],
  tools: ModelToolDefinition[] = [],
  providedTransport?: OpenAICompatibleTransport,
  signal?: AbortSignal,
  apiKey?: string,
  temperature?: number,
  topP?: number,
): Promise<ModelInferenceResult> {
  let url: URL;
  try {
    url = new URL(`${baseUrl.replace(/\/+$/, '')}/v1/chat/completions`);
  } catch {
    throw new ModelInferenceError('MODEL_SERVER_UNREACHABLE');
  }

  const transport = providedTransport ?? createOpenAICompatibleTransport();
  const controller = new AbortController();
  const abortFromSignal = (): void => controller.abort(signal?.reason);
  signal?.addEventListener('abort', abortFromSignal, { once: true });
  if (signal?.aborted) abortFromSignal();
  let applicationTimedOut = false;
  const timeoutId = setTimeout(() => {
    applicationTimedOut = true;
    controller.abort();
  }, timeoutMinutes * 60 * 1000);

  try {
    let response: Response;
    try {
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (apiKey) {
        headers.Authorization = `Bearer ${apiKey}`;
      }
      response = await transport.fetch(url, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          model: modelId,
          messages,
          ...(tools.length > 0 ? { tools } : {}),
          ...(temperature !== undefined ? { temperature } : {}),
          ...(topP !== undefined ? { top_p: topP } : {}),
        }),
        signal: controller.signal,
      });
    } catch (error) {
      if (signal?.aborted) {
        throw signal.reason ?? new DOMException('The operation was aborted', 'AbortError');
      }
      const diagnostics = providerErrorDiagnostics(error);
      throw new ModelInferenceError(
        applicationTimedOut ? 'MODEL_SERVER_TIMEOUT' : 'MODEL_SERVER_UNREACHABLE',
        error instanceof Error ? error.message : 'Provider request failed',
        diagnostics,
      );
    }

    if (!response.ok) {
      throw new ModelInferenceError(
        'MODEL_SERVER_RESPONSE_ERROR',
        `Provider returned HTTP ${response.status}`,
      );
    }

    let data: unknown;
    try {
      data = await response.json();
    } catch (error) {
      if (signal?.aborted) {
        throw signal.reason ?? new DOMException('The operation was aborted', 'AbortError');
      }
      const diagnostics = providerErrorDiagnostics(error);
      throw new ModelInferenceError(
        applicationTimedOut
          ? 'MODEL_SERVER_TIMEOUT'
          : isProviderTransportError(diagnostics)
            ? 'MODEL_SERVER_UNREACHABLE'
            : 'MODEL_SERVER_INVALID_RESPONSE',
        error instanceof Error ? error.message : undefined,
        diagnostics,
      );
    }

function parseProviderUsage(raw: unknown): ModelInferenceUsage | undefined {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return undefined;
  const obj = raw as Record<string, unknown>;
  const totalTokens = obj.total_tokens;
  if (typeof totalTokens !== 'number') return undefined;
  if (!Number.isFinite(totalTokens)) return undefined;
  if (!Number.isSafeInteger(totalTokens)) return undefined;
  if (totalTokens < 0) return undefined;
  return { totalTokens };
}

    if (typeof data !== 'object' || data === null || Array.isArray(data)) {
      throw new ModelInferenceError('MODEL_SERVER_INVALID_RESPONSE');
    }

    const responseData = data as Record<string, unknown>;
    const usage = parseProviderUsage(responseData.usage);
    const choices = responseData.choices;
    if (!Array.isArray(choices) || choices.length === 0) {
      throw new ModelInferenceError('MODEL_SERVER_INVALID_RESPONSE');
    }

    const choice = choices[0];
    if (typeof choice !== 'object' || choice === null || Array.isArray(choice)) {
      throw new ModelInferenceError('MODEL_SERVER_INVALID_RESPONSE');
    }

    const assistantMessage = (choice as Record<string, unknown>).message;
    if (
      typeof assistantMessage !== 'object' ||
      assistantMessage === null ||
      Array.isArray(assistantMessage)
    ) {
      throw new ModelInferenceError('MODEL_SERVER_INVALID_RESPONSE');
    }

    const message = assistantMessage as Record<string, unknown>;
    const finishReasonValue = (choice as Record<string, unknown>).finish_reason;
    const finishReason = typeof finishReasonValue === 'string' ? finishReasonValue : null;
    const content = typeof message.content === 'string' ? message.content : null;
    if (message.content !== null && message.content !== undefined && content === null) {
      throw new ModelInferenceError('MODEL_SERVER_INVALID_RESPONSE');
    }
    const reasoningContent =
      typeof message.reasoning_content === 'string' ? message.reasoning_content : undefined;
    if (
      message.reasoning_content !== undefined &&
      message.reasoning_content !== null &&
      reasoningContent === undefined
    ) {
      throw new ModelInferenceError('MODEL_SERVER_INVALID_RESPONSE');
    }
    if (Array.isArray(message.tool_calls) && message.tool_calls.length > 0) {
      const calls: ModelToolCall[] = [];
      for (const value of message.tool_calls) {
        if (typeof value !== 'object' || value === null || Array.isArray(value)) {
          throw new ModelInferenceError('MODEL_SERVER_INVALID_RESPONSE');
        }
        const call = value as Record<string, unknown>;
        if (
          typeof call.id !== 'string' ||
          call.id.length === 0 ||
          call.type !== 'function' ||
          typeof call.function !== 'object' ||
          call.function === null ||
          Array.isArray(call.function)
        ) {
          throw new ModelInferenceError('MODEL_SERVER_INVALID_RESPONSE');
        }
        const functionValue = call.function as Record<string, unknown>;
        if (
          typeof functionValue.name !== 'string' ||
          functionValue.name.length === 0 ||
          typeof functionValue.arguments !== 'string'
        ) {
          throw new ModelInferenceError('MODEL_SERVER_INVALID_RESPONSE');
        }
        calls.push({
          id: call.id,
          type: 'function',
          function: { name: functionValue.name, arguments: functionValue.arguments },
        });
      }
      return {
        type: 'tool_calls',
        calls,
        finishReason,
        assistantMessage: {
          role: 'assistant',
          content,
          ...(reasoningContent === undefined ? {} : { reasoning_content: reasoningContent }),
          tool_calls: calls,
        },
        ...(usage !== undefined ? { usage } : {}),
      };
    }

    if (content !== null && content.trim().length > 0) {
      return {
        type: 'message',
        content: content.trim(),
        finishReason,
        assistantMessage: {
          role: 'assistant',
          content,
          ...(reasoningContent === undefined ? {} : { reasoning_content: reasoningContent }),
        },
        ...(usage !== undefined ? { usage } : {}),
      };
    }

    throw new ModelInferenceError('MODEL_SERVER_INVALID_RESPONSE');
  } finally {
    clearTimeout(timeoutId);
    signal?.removeEventListener('abort', abortFromSignal);
    if (!providedTransport) {
      await transport.close();
    }
  }
}

export async function requestStreamedModelInference(
  baseUrl: string,
  timeoutMinutes: number,
  modelId: string,
  messages: ModelInferenceMessage[],
  tools: ModelToolDefinition[] = [],
  providedTransport?: OpenAICompatibleTransport,
  signal?: AbortSignal,
  apiKey?: string,
  temperature?: number,
  topP?: number,
): Promise<ModelInferenceResult | StreamedModelInferencePartialResult> {
  let url: URL;
  try {
    url = new URL(`${baseUrl.replace(/\/+$/, '')}/v1/chat/completions`);
  } catch {
    throw new ModelInferenceError('MODEL_SERVER_UNREACHABLE');
  }

  const transport = providedTransport ?? createOpenAICompatibleTransport();
  const controller = new AbortController();
  const abortFromSignal = (): void => controller.abort(signal?.reason);
  signal?.addEventListener('abort', abortFromSignal, { once: true });
  if (signal?.aborted) abortFromSignal();
  let applicationTimedOut = false;
  const timeoutId = setTimeout(() => {
    applicationTimedOut = true;
    controller.abort();
  }, timeoutMinutes * 60 * 1000);

  try {
    let response: Response;
    try {
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (apiKey) {
        headers.Authorization = `Bearer ${apiKey}`;
      }
      response = await transport.fetch(url, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          model: modelId,
          messages,
          stream: true,
          stream_options: {
            include_usage: true,
          },
          ...(tools.length > 0 ? { tools } : {}),
          ...(temperature !== undefined ? { temperature } : {}),
          ...(topP !== undefined ? { top_p: topP } : {}),
        }),
        signal: controller.signal,
      });
    } catch (error) {
      if (signal?.aborted) {
        throw signal.reason ?? new DOMException('The operation was aborted', 'AbortError');
      }
      const diagnostics = providerErrorDiagnostics(error);
      throw new ModelInferenceError(
        applicationTimedOut ? 'MODEL_SERVER_TIMEOUT' : 'MODEL_SERVER_UNREACHABLE',
        error instanceof Error ? error.message : 'Provider request failed',
        diagnostics,
      );
    }

    if (!response.ok) {
      throw new ModelInferenceError(
        'MODEL_SERVER_RESPONSE_ERROR',
        `Provider returned HTTP ${response.status}`,
      );
    }

    const accumulated = createStreamAccumulator();

    try {
      await readSSEStream(response, signal, accumulated);
    } catch (error) {
      if (signal?.aborted || controller.signal.aborted) {
        return buildPartialResult(accumulated);
      }
      const diagnostics = providerErrorDiagnostics(error);
      throw new ModelInferenceError(
        applicationTimedOut
          ? 'MODEL_SERVER_TIMEOUT'
          : isProviderTransportError(diagnostics)
            ? 'MODEL_SERVER_UNREACHABLE'
            : 'MODEL_SERVER_INVALID_RESPONSE',
        error instanceof Error ? error.message : undefined,
        diagnostics,
      );
    }

    return buildCompleteResult(accumulated);
  } finally {
    clearTimeout(timeoutId);
    signal?.removeEventListener('abort', abortFromSignal);
    if (!providedTransport) {
      await transport.close();
    }
  }
}

interface StreamAccumulator {
  reasoningContent: string;
  content: string;
  finishReason: string | null;
  usage: ModelInferenceUsage | undefined;
  toolCallsInProgress: Map<string, StreamToolCallBuilder>;
}

interface StreamToolCallBuilder {
  id: string;
  name: string;
  arguments: string;
}

function createStreamAccumulator(): StreamAccumulator {
  return {
    reasoningContent: '',
    content: '',
    finishReason: null,
    usage: undefined,
    toolCallsInProgress: new Map(),
  };
}

async function readSSEStream(
  response: Response,
  signal: AbortSignal | undefined,
  accumulated: StreamAccumulator,
): Promise<void> {
  if (!response.body) {
    throw new ModelInferenceError('MODEL_SERVER_INVALID_RESPONSE');
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  try {
    while (true) {
      signal?.throwIfAborted();
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      // Process complete lines, keep incomplete last line in buffer
      let newlineIdx: number;
      while ((newlineIdx = buffer.indexOf('\n')) >= 0) {
        const rawLine = buffer.slice(0, newlineIdx);
        buffer = buffer.slice(newlineIdx + 1);
        const line = rawLine.replace(/\r/g, '').trimStart();
        if (line.startsWith('data:')) {
          const payload = line.substring(5).trim();
          if (payload === '[DONE]') return;
          try {
            const parsed = JSON.parse(payload);
            processStreamChunk(parsed, accumulated);
          } catch {
            // Skip malformed SSE data lines
          }
        }
      }
    }
  } finally {
    reader.releaseLock();
  }
}

function processStreamChunk(
  chunk: Record<string, unknown>,
  accumulated: StreamAccumulator,
): void {
  // Usage may arrive in a final streaming chunk with an empty choices array.
  const usage = chunk.usage;
  if (typeof usage === 'object' && usage !== null && !Array.isArray(usage)) {
    const u = usage as Record<string, unknown>;
    if (
      typeof u.total_tokens === 'number' &&
      Number.isFinite(u.total_tokens) &&
      u.total_tokens >= 0
    ) {
      accumulated.usage = { totalTokens: u.total_tokens };
    }
  }

  const choices = chunk.choices;
  if (!Array.isArray(choices) || choices.length === 0) return;

  for (const choice of choices) {
    if (typeof choice !== 'object' || choice === null || Array.isArray(choice)) continue;

    const finishReasonValue = choice.finish_reason;
    if (typeof finishReasonValue === 'string') {
      accumulated.finishReason = finishReasonValue;
    }

    const delta = choice.delta;
    if (typeof delta !== 'object' || delta === null || Array.isArray(delta)) continue;
    const d = delta as Record<string, unknown>;

    // Accumulate content
    if (typeof d.content === 'string') {
      accumulated.content += d.content;
    }

    // Accumulate reasoning_content
    if (typeof d.reasoning_content === 'string') {
      accumulated.reasoningContent += d.reasoning_content;
    }

    // Handle tool_calls delta
    const tcDelta = d.tool_calls;
    if (Array.isArray(tcDelta)) {
      for (const tc of tcDelta) {
        if (typeof tc !== 'object' || tc === null || Array.isArray(tc)) continue;
        const t = tc as Record<string, unknown>;

        let builder: StreamToolCallBuilder | undefined;
        // Some providers send index, some don't
        const idx = typeof t.index === 'number' ? t.index : undefined;
        if (idx !== undefined) {
          builder = accumulated.toolCallsInProgress.get(String(idx));
        }

        // If no index or not found by index, try to match by id
        if (!builder && typeof t.id === 'string' && t.id.length > 0) {
          builder = accumulated.toolCallsInProgress.get(t.id);
        }

        if (!builder) {
          // New tool call start
          const newId = typeof t.id === 'string' ? t.id : `tc_${Date.now()}_${Math.random()}`;
          const fnObj =
            typeof t.function === 'object' && t.function !== null
              ? (t.function as Record<string, unknown>)
              : {};

          builder = {
            id: newId,
            name: typeof fnObj.name === 'string' ? fnObj.name : '',
            arguments: '',
          };

          const key = idx !== undefined ? String(idx) : newId;
          accumulated.toolCallsInProgress.set(key, builder);
        }

        if (typeof t.id === 'string' && t.id.length > 0) {
          builder.id = t.id;
        }
        const fnObj2 = typeof t.function === 'object' && t.function !== null ? (t.function as Record<string, unknown>) : {};
        if (typeof fnObj2.name === 'string') {
          builder.name = fnObj2.name;
        }
        if (typeof fnObj2.arguments === 'string') {
          builder.arguments += fnObj2.arguments;
        }
      }
    }
  }
}

function buildCompleteResult(accumulated: StreamAccumulator): ModelInferenceResult {
  const toolCalls = finalizeToolCalls(accumulated);

  if (toolCalls.length > 0) {
    return {
      type: 'tool_calls',
      calls: toolCalls,
      finishReason: accumulated.finishReason,
      assistantMessage: {
        role: 'assistant',
        content: accumulated.content || null,
        ...(accumulated.reasoningContent ? { reasoning_content: accumulated.reasoningContent } : {}),
        tool_calls: toolCalls,
      },
      ...(accumulated.usage !== undefined ? { usage: accumulated.usage } : {}),
    };
  }

  const trimmed = accumulated.content.trim();
  if (trimmed.length > 0) {
    return {
      type: 'message',
      content: trimmed,
      finishReason: accumulated.finishReason,
      assistantMessage: {
        role: 'assistant',
        content: accumulated.content || null,
        ...(accumulated.reasoningContent ? { reasoning_content: accumulated.reasoningContent } : {}),
      },
      ...(accumulated.usage !== undefined ? { usage: accumulated.usage } : {}),
    };
  }

  throw new ModelInferenceError('MODEL_SERVER_INVALID_RESPONSE');
}

function buildPartialResult(accumulated: StreamAccumulator): StreamedModelInferencePartialResult {
  return {
    type: 'cancelled',
    ...(accumulated.reasoningContent ? { reasoningContent: accumulated.reasoningContent } : {}),
    ...(accumulated.content ? { content: accumulated.content } : {}),
    finishReason: accumulated.finishReason,
    ...(accumulated.usage !== undefined ? { usage: accumulated.usage } : {}),
  };
}

function finalizeToolCalls(accumulated: StreamAccumulator): ModelToolCall[] {
  const result: ModelToolCall[] = [];
  for (const builder of accumulated.toolCallsInProgress.values()) {
    // Only include tool calls that have a valid id and name
    if (builder.id.length > 0 && builder.name.length > 0) {
      result.push({
        id: builder.id,
        type: 'function',
        function: { name: builder.name, arguments: builder.arguments },
      });
    }
  }
  return result;
}
