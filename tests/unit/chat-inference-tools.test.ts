import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { createTestDatabase } from '../../src/server/database.js';
import { ChatRepository } from '../../src/server/repositories/chat-repository.js';
import { ModelConnectionRepository } from '../../src/server/repositories/model-connection-repository.js';
import { ToolSettingsRepository } from '../../src/server/repositories/tool-settings-repository.js';
import {
  ChatInferenceError,
  ChatInferenceService,
} from '../../src/server/services/chat-inference-service.js';
import { ChatService } from '../../src/server/services/chat-service.js';
import { ModelConnectionService } from '../../src/server/services/model-connection-service.js';
import { ToolSettingsService } from '../../src/server/services/tool-settings-service.js';
import { FileChatMessageStore } from '../../src/server/stores/chat-message-store.js';
import { ToolRegistry } from '../../src/server/tools/tool-registry.js';
import {
  DUCKDUCKGO_TOOL_NAME,
  RecoverableToolError,
  VISIT_WEBSITE_TOOL_NAME,
  type RegisteredTool,
  type ToolSettings,
} from '../../src/server/tool-types.js';
import type {
  ModelInferenceMessage,
  ModelInferenceResult,
  ModelToolDefinition,
} from '../../src/services/model-inference.js';
import { ModelInferenceError } from '../../src/services/model-inference.js';
import { StructuredLogger } from '../../src/server/logging/logger.js';

interface CapturedInference {
  messages: ModelInferenceMessage[];
  tools: ModelToolDefinition[];
}

function createTool(executions: unknown[]): RegisteredTool {
  return {
    name: DUCKDUCKGO_TOOL_NAME,
    displayName: 'DuckDuckGo Search',
    description: 'Searches the public web and returns search-result links.',
    inputSchema: {
      type: 'object',
      properties: { query: { type: 'string' } },
      required: ['query'],
      additionalProperties: false,
    },
    execute: async (value: unknown, settings: ToolSettings) => {
      if (
        typeof value !== 'object' ||
        value === null ||
        Array.isArray(value) ||
        typeof (value as Record<string, unknown>).query !== 'string'
      ) {
        throw new Error('Invalid arguments');
      }
      if (!('pageSize' in settings)) {
        throw new Error('Invalid settings');
      }
      executions.push(value);
      return {
        query: (value as { query: string }).query,
        results: [
          { title: 'Result A', url: 'https://example.com/a' },
          { title: 'Result B', url: 'https://example.com/b' },
        ],
        pageSize: settings.pageSize,
      };
    },
  };
}

function createVisitTool(executions: unknown[]): RegisteredTool {
  return {
    name: VISIT_WEBSITE_TOOL_NAME,
    displayName: 'Visit Website',
    description: 'Reads bounded content from a public webpage.',
    inputSchema: {
      type: 'object',
      properties: { url: { type: 'string' } },
      required: ['url'],
      additionalProperties: false,
    },
    execute: async (value: unknown, settings: ToolSettings) => {
      if (
        typeof value !== 'object' ||
        value === null ||
        Array.isArray(value) ||
        typeof (value as Record<string, unknown>).url !== 'string' ||
        !('contentLimit' in settings)
      ) {
        throw new Error('Invalid arguments');
      }
      executions.push(value);
      return {
        url: (value as { url: string }).url,
        title: 'Example',
        content: 'Structured content',
        contentLimit: settings.contentLimit,
      };
    },
  };
}

async function setup(enabledForChat: boolean) {
  const db = createTestDatabase();
  const chatService = new ChatService(
    new ChatRepository(db),
    new FileChatMessageStore(resolve(mkdtempSync(`${tmpdir()}web07-tool-loop-`), 'history')),
  );
  const modelConnectionService = new ModelConnectionService(new ModelConnectionRepository(db));
  modelConnectionService.isModelVisible = async () => true;
  const connection = await modelConnectionService.createConnection({
    name: 'Stub',
    baseUrl: 'http://model.test',
    timeoutMinutes: 1,
    modelId: null,
    enabled: true,
  });
  const chat = await chatService.createChat({
    title: 'Tool chat',
  });
  await chatService.updateChat(chat.id, {
    modelConnectionId: connection.id,
    modelId: 'stub-model',
  });
  await chatService.appendMessage(chat.id, {
    type: 'assistant',
    content: 'Persisted context',
    createdAt: 1,
  });
  const executions: unknown[] = [];
  const visitExecutions: unknown[] = [];
  const registry = new ToolRegistry([createTool(executions), createVisitTool(visitExecutions)]);
  const settingsService = new ToolSettingsService(new ToolSettingsRepository(db), registry);
  if (enabledForChat) {
    await settingsService.updateSettings(DUCKDUCKGO_TOOL_NAME, {
      enabledForChat: true,
      pageSize: 3,
      safeSearch: 'moderate',
    });
  }
  return {
    db,
    chat,
    chatService,
    modelConnectionService,
    settingsService,
    registry,
    executions,
    visitExecutions,
  };
}

await describe('chat inference tool loop', async () => {
  await it('does not expose or execute a disabled tool for ordinary responses', async () => {
    const setupValue = await setup(false);
    const captured: CapturedInference[] = [];
    const service = new ChatInferenceService(
      setupValue.chatService,
      setupValue.modelConnectionService,
      setupValue.settingsService,
      setupValue.registry,
      async (_url, _timeout, _model, messages, tools = []) => {
        captured.push({ messages: structuredClone(messages), tools: structuredClone(tools) });
        return { type: 'message', content: 'Ordinary answer' };
      },
    );

    assert.equal((await service.infer(setupValue.chat.id, 'Current question')).message, 'Ordinary answer');
    assert.deepEqual(captured[0].tools, []);
    assert.equal(setupValue.executions.length, 0);
    assert.equal(
      captured[0].messages.filter(
        (message) => message.role === 'user' && message.content === 'Current question',
      ).length,
      1,
    );
    setupValue.db.close();
  });

  await it('executes an enabled tool once and returns its structured result for final inference', async () => {
    const setupValue = await setup(true);
    const captured: CapturedInference[] = [];
    const requester = async (
      _url: string,
      _timeout: number,
      _model: string,
      messages: ModelInferenceMessage[],
      tools: ModelToolDefinition[] = [],
    ): Promise<ModelInferenceResult> => {
      captured.push({ messages: structuredClone(messages), tools: structuredClone(tools) });
          return captured.length === 1
        ? {
            type: 'tool_calls',
            calls: [
              {
                id: 'call-1',
                type: 'function',
                function: { name: DUCKDUCKGO_TOOL_NAME, arguments: '{"query":"current news"}' },
              },
            ],
            assistantMessage: {
              role: 'assistant',
              content: null,
              tool_calls: [
                {
                  id: 'call-1',
                  type: 'function',
                  function: { name: DUCKDUCKGO_TOOL_NAME, arguments: '{"query":"current news"}' },
                },
              ],
            },
          }
        : { type: 'message', content: 'Final cited answer' };
    };
    const service = new ChatInferenceService(
      setupValue.chatService,
      setupValue.modelConnectionService,
      setupValue.settingsService,
      setupValue.registry,
      requester,
    );

    assert.equal((await service.infer(setupValue.chat.id, 'Search this')).message, 'Final cited answer');
    assert.equal(captured.length, 2);
    assert.equal(captured[0].tools[0].function.name, DUCKDUCKGO_TOOL_NAME);
    assert.deepEqual(setupValue.executions, [{ query: 'current news' }]);
    const toolMessage = captured[1].messages.find((message) => message.role === 'tool');
    assert.ok(toolMessage && toolMessage.tool_call_id === 'call-1');
    const assistantToolMessage = captured[1].messages.find(
      (message) => message.role === 'assistant' && 'tool_calls' in message,
    );
    assert.ok(
      assistantToolMessage &&
        'tool_calls' in assistantToolMessage &&
        assistantToolMessage.tool_calls?.[0].id === 'call-1',
    );
    assert.deepEqual(JSON.parse(toolMessage.content), {
      query: 'current news',
      results: [
        { title: 'Result A', url: 'https://example.com/a' },
        { title: 'Result B', url: 'https://example.com/b' },
      ],
      pageSize: 3,
    });
    assert.ok(captured[0].messages.some((message) => message.content === 'Persisted context'));
    const history = await setupValue.chatService.listMessages(setupValue.chat.id);
    assert.deepEqual(
      history?.map((event) => event.type),
      [
        'assistant',
        'user',
        'tool_call',
        'tool_result',
        'assistant',
      ],
    );
    setupValue.db.close();
  });

  await it('treats search-result URLs as data and never synthesizes website visits', async () => {
    const setupValue = await setup(true);
    await setupValue.settingsService.updateSettings(VISIT_WEBSITE_TOOL_NAME, {
      enabledForChat: true,
      contentLimit: 2000,
      maxLinks: 10,
      maxImages: 5,
    });
    const searchCall = {
      id: 'search-only',
      type: 'function' as const,
      function: { name: DUCKDUCKGO_TOOL_NAME, arguments: '{"query":"two urls"}' },
    };
    let requestCount = 0;
    const service = new ChatInferenceService(
      setupValue.chatService,
      setupValue.modelConnectionService,
      setupValue.settingsService,
      setupValue.registry,
      async () => {
        requestCount += 1;
        return requestCount === 1
          ? {
              type: 'tool_calls',
              calls: [searchCall],
              assistantMessage: { role: 'assistant', content: null, tool_calls: [searchCall] },
            }
          : {
              type: 'message',
              content: 'Search results are sufficient.',
              assistantMessage: { role: 'assistant', content: 'Search results are sufficient.' },
            };
      },
    );

    assert.equal((await service.infer(setupValue.chat.id, 'Search only')).message, 'Search results are sufficient.');
    assert.equal(requestCount, 2);
    assert.deepEqual(setupValue.executions, [{ query: 'two urls' }]);
    assert.deepEqual(setupValue.visitExecutions, []);
    const history = await setupValue.chatService.listMessages(setupValue.chat.id);
    assert.deepEqual(
      history?.filter((event) => event.type === 'tool_call').map((event) => event.toolName),
      [DUCKDUCKGO_TOOL_NAME],
    );
    assert.deepEqual(
      history?.filter((event) => event.type === 'tool_result').map((event) => event.toolName),
      [DUCKDUCKGO_TOOL_NAME],
    );
    setupValue.db.close();
  });

  await it('executes Visit Website only after a later provider response explicitly requests it', async () => {
    const setupValue = await setup(true);
    await setupValue.settingsService.updateSettings(VISIT_WEBSITE_TOOL_NAME, {
      enabledForChat: true,
      contentLimit: 2000,
      maxLinks: 10,
      maxImages: 5,
    });
    const searchCall = {
      id: 'search-round-1',
      type: 'function' as const,
      function: { name: DUCKDUCKGO_TOOL_NAME, arguments: '{"query":"explicit visit"}' },
    };
    const visitCall = {
      id: 'visit-round-2',
      type: 'function' as const,
      function: {
        name: VISIT_WEBSITE_TOOL_NAME,
        arguments: '{"url":"https://example.com/a"}',
      },
    };
    const captured: ModelInferenceMessage[][] = [];
    const service = new ChatInferenceService(
      setupValue.chatService,
      setupValue.modelConnectionService,
      setupValue.settingsService,
      setupValue.registry,
      async (_url, _timeout, _model, messages) => {
        captured.push(structuredClone(messages));
        if (captured.length === 1) {
          return {
            type: 'tool_calls',
            calls: [searchCall],
            assistantMessage: { role: 'assistant', content: null, tool_calls: [searchCall] },
          };
        }
        if (captured.length === 2) {
          assert.equal(
            captured[1].find((message) => message.role === 'tool')?.content.includes('https://example.com/a'),
            true,
          );
          return {
            type: 'tool_calls',
            calls: [visitCall],
            assistantMessage: { role: 'assistant', content: null, tool_calls: [visitCall] },
          };
        }
        const finalContextMessage = captured[2][captured[2].length - 1];
        assert.equal(finalContextMessage?.role, 'tool');
        assert.equal(
          finalContextMessage?.role === 'tool' ? finalContextMessage.tool_call_id : null,
          'visit-round-2',
        );
        return { type: 'message', content: 'Visited explicitly.' };
      },
    );

    assert.equal((await service.infer(setupValue.chat.id, 'Search then inspect')).message, 'Visited explicitly.');
    assert.equal(captured.length, 3);
    assert.deepEqual(setupValue.executions, [{ query: 'explicit visit' }]);
    assert.deepEqual(setupValue.visitExecutions, [{ url: 'https://example.com/a' }]);
    const history = await setupValue.chatService.listMessages(setupValue.chat.id);
    assert.deepEqual(
      history?.filter((event) => event.type === 'tool_call').map((event) => event.toolCallId),
      ['search-round-1', 'visit-round-2'],
    );
    setupValue.db.close();
  });

  await it('never executes tools from reasoning or ordinary assistant content', async () => {
    for (const assistantMessage of [
      {
        role: 'assistant' as const,
        content: 'No tool call was returned.',
        reasoning_content: 'I should visit https://example.com/a',
      },
      { role: 'assistant' as const, content: 'I will search the web' },
    ]) {
      const setupValue = await setup(true);
      const service = new ChatInferenceService(
        setupValue.chatService,
        setupValue.modelConnectionService,
        setupValue.settingsService,
        setupValue.registry,
        async () => ({
          type: 'message',
          content: assistantMessage.content,
          assistantMessage,
        }),
      );

      assert.equal((await service.infer(setupValue.chat.id, 'Do not infer tools')).message, assistantMessage.content);
      assert.deepEqual(setupValue.executions, []);
      assert.deepEqual(setupValue.visitExecutions, []);
      const history = await setupValue.chatService.listMessages(setupValue.chat.id);
      assert.equal(history?.some((event) => event.type === 'tool_call'), false);
      assert.equal(history?.some((event) => event.type === 'tool_result'), false);
      assert.equal(
        history?.some((event) => event.type === 'reasoning'),
        'reasoning_content' in assistantMessage,
      );
      setupValue.db.close();
    }
  });

  await it('rejects calls that do not exactly match the provider assistant response', async () => {
    const setupValue = await setup(true);
    const resultCall = {
      id: 'result-call',
      type: 'function' as const,
      function: { name: DUCKDUCKGO_TOOL_NAME, arguments: '{"query":"result"}' },
    };
    const providerCall = {
      id: 'provider-call',
      type: 'function' as const,
      function: { name: DUCKDUCKGO_TOOL_NAME, arguments: '{"query":"provider"}' },
    };
    const service = new ChatInferenceService(
      setupValue.chatService,
      setupValue.modelConnectionService,
      setupValue.settingsService,
      setupValue.registry,
      async () => ({
        type: 'tool_calls',
        calls: [resultCall],
        assistantMessage: { role: 'assistant', content: null, tool_calls: [providerCall] },
      }),
    );

    await assert.rejects(
      () => service.infer(setupValue.chat.id, 'Reject synthetic call'),
      (error: unknown) =>
        error instanceof ChatInferenceError && error.code === 'TOOL_CALL_REJECTED',
    );
    assert.deepEqual(setupValue.executions, []);
    const history = await setupValue.chatService.listMessages(setupValue.chat.id);
    assert.equal(history?.some((event) => event.type === 'tool_call'), false);
    assert.equal(history?.some((event) => event.type === 'tool_result'), false);
    setupValue.db.close();
  });

  await it('rejects unsupported names and invalid arguments without persisting tool payloads', async () => {
    for (const call of [
      { name: 'unknown_tool', arguments: '{}' },
      { name: DUCKDUCKGO_TOOL_NAME, arguments: '{"query":42}' },
    ]) {
      const setupValue = await setup(true);
      const service = new ChatInferenceService(
        setupValue.chatService,
        setupValue.modelConnectionService,
        setupValue.settingsService,
        setupValue.registry,
        async () => ({
          type: 'tool_calls',
          calls: [{ id: 'bad', type: 'function', function: call }],
          assistantMessage: {
            role: 'assistant',
            content: null,
            tool_calls: [{ id: 'bad', type: 'function', function: call }],
          },
        }),
      );
      await assert.rejects(
        () => service.infer(setupValue.chat.id, 'Bad call'),
        (error: unknown) =>
          error instanceof ChatInferenceError &&
          (error.code === 'TOOL_CALL_REJECTED' || error.code === 'TOOL_EXECUTION_FAILED'),
      );
      const history = await setupValue.chatService.listMessages(setupValue.chat.id);
      assert.equal(
        history?.some((event) => event.type === 'tool_call'),
        call.name === DUCKDUCKGO_TOOL_NAME,
      );
      setupValue.db.close();
    }
  });

  await it('exposes and executes Visit Website alongside DuckDuckGo when both are enabled', async () => {
    const setupValue = await setup(true);
    await setupValue.settingsService.updateSettings(VISIT_WEBSITE_TOOL_NAME, {
      enabledForChat: true,
      contentLimit: 2000,
      maxLinks: 10,
      maxImages: 5,
    });
    const captured: CapturedInference[] = [];
    const service = new ChatInferenceService(
      setupValue.chatService,
      setupValue.modelConnectionService,
      setupValue.settingsService,
      setupValue.registry,
      async (_url, _timeout, _model, messages, tools = []) => {
        captured.push({ messages: structuredClone(messages), tools: structuredClone(tools) });
        return captured.length === 1
          ? {
              type: 'tool_calls',
              calls: [
                {
                  id: 'visit-1',
                  type: 'function',
                  function: {
                    name: VISIT_WEBSITE_TOOL_NAME,
                    arguments: '{"url":"https://example.com/page"}',
                  },
                },
              ],
              assistantMessage: {
                role: 'assistant',
                content: null,
                tool_calls: [
                  {
                    id: 'visit-1',
                    type: 'function',
                    function: {
                      name: VISIT_WEBSITE_TOOL_NAME,
                      arguments: '{"url":"https://example.com/page"}',
                    },
                  },
                ],
              },
            }
          : { type: 'message', content: 'Website summary' };
      },
    );

    assert.equal((await service.infer(setupValue.chat.id, 'Inspect the page')).message, 'Website summary');
    assert.deepEqual(
      captured[0].tools.map((tool) => tool.function.name),
      [DUCKDUCKGO_TOOL_NAME, VISIT_WEBSITE_TOOL_NAME],
    );
    assert.deepEqual(setupValue.visitExecutions, [{ url: 'https://example.com/page' }]);
    const toolMessage = captured[1].messages.find((message) => message.role === 'tool');
    assert.ok(toolMessage?.content.includes('Structured content'));
    const history = await setupValue.chatService.listMessages(setupValue.chat.id);
    assert.deepEqual(
      history?.slice(-4).map((event) => event.type),
      [
        'user',
        'tool_call',
        'tool_result',
        'assistant',
      ],
    );
    assert.ok(
      history?.some(
        (event) => event.type === 'tool_result' && JSON.stringify(event.result).includes('Structured content'),
      ),
    );
    assert.equal(
      captured[0].messages.filter(
        (message) => message.role === 'user' && message.content === 'Inspect the page',
      ).length,
      1,
    );
    setupValue.db.close();
  });

  await it('preserves persisted history and a mixed assistant tool event before its tool result', async () => {
    const setupValue = await setup(true);
    await setupValue.chatService.clearMessages(setupValue.chat.id);
    await setupValue.chatService.appendMessage(setupValue.chat.id, {
      type: 'user',
      content: 'User A',
      createdAt: 1,
    });
    await setupValue.chatService.appendMessage(setupValue.chat.id, {
      type: 'assistant',
      content: 'Assistant A',
      createdAt: 2,
    });
    const captured: ModelInferenceMessage[][] = [];
    const call = {
      id: 'mixed-call',
      type: 'function' as const,
      function: { name: DUCKDUCKGO_TOOL_NAME, arguments: '{"query":"chronology"}' },
    };
    const service = new ChatInferenceService(
      setupValue.chatService,
      setupValue.modelConnectionService,
      setupValue.settingsService,
      setupValue.registry,
      async (_url, _timeout, _model, messages) => {
        captured.push(structuredClone(messages));
        return captured.length === 1
          ? {
              type: 'tool_calls',
              calls: [call],
              finishReason: 'tool_calls',
              assistantMessage: {
                role: 'assistant',
                content: 'I will search.',
                reasoning_content: 'provider-compatible reasoning',
                tool_calls: [call],
              },
            }
          : {
              type: 'message',
              content: 'Final answer',
              finishReason: 'stop',
              assistantMessage: { role: 'assistant', content: 'Final answer' },
            };
      },
    );

    await service.infer(setupValue.chat.id, 'User B');
    assert.deepEqual(captured[1].map((item) => item.role), [
      'system',
      'user',
      'assistant',
      'user',
      'assistant',
      'tool',
    ]);
    assert.deepEqual(captured[1][4], {
      role: 'assistant',
      content: 'I will search.',
      reasoning_content: 'provider-compatible reasoning',
      tool_calls: [call],
    });
    assert.equal(captured[1][5].role, 'tool');
    assert.equal(
      captured[1][5].role === 'tool' ? captured[1][5].tool_call_id : null,
      'mixed-call',
    );
    const persistedEvents = await setupValue.chatService.listMessages(setupValue.chat.id);
    assert.deepEqual(persistedEvents?.map((event) => event.type), [
      'user',
      'assistant',
      'user',
      'reasoning',
      'assistant',
      'tool_call',
      'tool_result',
      'assistant',
    ]);
    assert.equal(
      persistedEvents?.find((event) => event.type === 'reasoning')?.content,
      'provider-compatible reasoning',
    );
    const toolCall = persistedEvents?.find((event) => event.type === 'tool_call');
    const toolResult = persistedEvents?.find((event) => event.type === 'tool_result');
    assert.equal(toolCall?.toolCallId, 'mixed-call');
    assert.equal(toolResult?.toolCallId, 'mixed-call');

    let followUpContext: ModelInferenceMessage[] = [];
    const followUpService = new ChatInferenceService(
      setupValue.chatService,
      setupValue.modelConnectionService,
      setupValue.settingsService,
      setupValue.registry,
      async (_url, _timeout, _model, messages) => {
        followUpContext = structuredClone(messages);
        return { type: 'message', content: 'Follow-up answer' };
      },
    );
    await followUpService.infer(setupValue.chat.id, 'Follow up');
    assert.ok(!followUpContext.some((message) => message.content === 'I will search.'));
    assert.ok(followUpContext.some((message) => message.content === 'Final answer'));
    setupValue.db.close();
  });

  await it('keeps multiple assistant tool rounds and matching results in exact order', async () => {
    const setupValue = await setup(true);
    await setupValue.chatService.clearMessages(setupValue.chat.id);
    const captured: ModelInferenceMessage[][] = [];
    const service = new ChatInferenceService(
      setupValue.chatService,
      setupValue.modelConnectionService,
      setupValue.settingsService,
      setupValue.registry,
      async (_url, _timeout, _model, messages) => {
        captured.push(structuredClone(messages));
        if (captured.length <= 2) {
          const id = `call-${captured.length}`;
          const call = {
            id,
            type: 'function' as const,
            function: { name: DUCKDUCKGO_TOOL_NAME, arguments: `{"query":"round ${id}"}` },
          };
          return {
            type: 'tool_calls',
            calls: [call],
            assistantMessage: { role: 'assistant', content: null, tool_calls: [call] },
          };
        }
        return { type: 'message', content: 'Final', assistantMessage: { role: 'assistant', content: 'Final' } };
      },
    );

    assert.equal((await service.infer(setupValue.chat.id, 'Start')).message, 'Final');
    assert.deepEqual(captured[2].map((item) => item.role), [
      'system',
      'user',
      'assistant',
      'tool',
      'assistant',
      'tool',
    ]);
    const toolMessages = captured[2].filter((item) => item.role === 'tool');
    assert.deepEqual(
      toolMessages.map((item) => (item.role === 'tool' ? item.tool_call_id : null)),
      ['call-1', 'call-2'],
    );
    const history = await setupValue.chatService.listMessages(setupValue.chat.id);
    assert.deepEqual(history?.map((event) => event.type), [
      'user',
      'tool_call',
      'tool_result',
      'tool_call',
      'tool_result',
      'assistant',
    ]);
    setupValue.db.close();
  });

  await it('persists and emits multi-round activity immediately in exact sequence', async () => {
    const setupValue = await setup(true);
    await setupValue.chatService.clearMessages(setupValue.chat.id);
    let requestCount = 0;
    const emitted: Array<{
      type: string;
      sequence: number;
      inferenceId: string;
      persistedType: string | undefined;
      final: boolean;
    }> = [];
    const service = new ChatInferenceService(
      setupValue.chatService,
      setupValue.modelConnectionService,
      setupValue.settingsService,
      setupValue.registry,
      async () => {
        requestCount += 1;
        if (requestCount <= 2) {
          const call = {
            id: `stream-call-${requestCount}`,
            type: 'function' as const,
            function: {
              name: DUCKDUCKGO_TOOL_NAME,
              arguments: `{"query":"stream round ${requestCount}"}`,
            },
          };
          return {
            type: 'tool_calls',
            calls: [call],
            assistantMessage: {
              role: 'assistant',
              content: null,
              reasoning_content: `reasoning ${requestCount}`,
              tool_calls: [call],
            },
          };
        }
        return { type: 'message', content: 'Stream final' };
      },
    );

    await service.infer(setupValue.chat.id, 'Stream start', async (streamEvent) => {
      const persisted = await setupValue.chatService.listMessages(setupValue.chat.id);
      emitted.push({
        type: streamEvent.type,
        sequence: streamEvent.sequence,
        inferenceId: streamEvent.inferenceId,
        persistedType: persisted?.[persisted.length - 1]?.type,
        final: streamEvent.final,
      });
    });

    assert.deepEqual(
      emitted.map((event) => event.type),
      [
        'reasoning',
        'tool_call',
        'tool_result',
        'reasoning',
        'tool_call',
        'tool_result',
        'assistant',
      ],
    );
    assert.deepEqual(
      emitted.map((event) => event.sequence),
      [1, 2, 3, 4, 5, 6, 7],
    );
    assert.ok(emitted.every((event) => event.persistedType === event.type));
    assert.equal(new Set(emitted.map((event) => event.inferenceId)).size, 1);
    assert.deepEqual(
      emitted.map((event) => event.final),
      [false, false, false, false, false, false, true],
    );
    setupValue.db.close();
  });

  await it('emits multiple tool calls in provider order before their matching results', async () => {
    const setupValue = await setup(true);
    await setupValue.settingsService.updateSettings(VISIT_WEBSITE_TOOL_NAME, {
      enabledForChat: true,
      contentLimit: 2000,
      maxLinks: 10,
      maxImages: 5,
    });
    let requestCount = 0;
    const emitted: Array<{ type: string; toolCallId?: string }> = [];
    const calls = ['provider-call-1', 'provider-call-2'].map((id, index) => ({
      id,
      type: 'function' as const,
      function: {
        name: DUCKDUCKGO_TOOL_NAME,
        arguments: `{"query":"provider order ${index + 1}"}`,
      },
    }));
    const service = new ChatInferenceService(
      setupValue.chatService,
      setupValue.modelConnectionService,
      setupValue.settingsService,
      setupValue.registry,
      async (_url, _timeout, _model, messages) => {
        requestCount += 1;
        if (requestCount === 1) {
          return {
            type: 'tool_calls',
            calls,
            assistantMessage: { role: 'assistant', content: null, tool_calls: calls },
          };
        }
        const toolIds = messages
          .filter((message) => message.role === 'tool')
          .map((message) => (message.role === 'tool' ? message.tool_call_id : ''));
        assert.deepEqual(toolIds, ['provider-call-1', 'provider-call-2']);
        return { type: 'message', content: 'Ordered final' };
      },
    );

    await service.infer(setupValue.chat.id, 'Use two tools', (streamEvent) => {
      emitted.push({
        type: streamEvent.type,
        ...('toolCallId' in streamEvent.event
          ? { toolCallId: streamEvent.event.toolCallId }
          : {}),
      });
    });

    assert.deepEqual(emitted, [
      { type: 'tool_call', toolCallId: 'provider-call-1' },
      { type: 'tool_call', toolCallId: 'provider-call-2' },
      { type: 'tool_result', toolCallId: 'provider-call-1' },
      { type: 'tool_result', toolCallId: 'provider-call-2' },
      { type: 'assistant' },
    ]);
    assert.deepEqual(setupValue.executions, [
      { query: 'provider order 1' },
      { query: 'provider order 2' },
    ]);
    assert.deepEqual(setupValue.visitExecutions, []);
    setupValue.db.close();
  });

  await it('returns a recoverable website failure to the model and completes the inference', async () => {
    const setupValue = await setup(false);
    const executions: unknown[] = [];
    const visitTool = createVisitTool(executions);
    visitTool.execute = async (value: unknown) => {
      executions.push(value);
      throw new RecoverableToolError(
        'WEBSITE_FETCH_FAILED',
        'Unable to retrieve the requested webpage.',
        { status: 403 },
      );
    };
    const registry = new ToolRegistry([visitTool]);
    const settingsService = new ToolSettingsService(
      new ToolSettingsRepository(setupValue.db),
      registry,
    );
    await settingsService.updateSettings(VISIT_WEBSITE_TOOL_NAME, {
      enabledForChat: true,
      contentLimit: 2000,
      maxLinks: 10,
      maxImages: 5,
    });
    const call = {
      id: 'blocked-visit',
      type: 'function' as const,
      function: {
        name: VISIT_WEBSITE_TOOL_NAME,
        arguments: '{"url":"https://example.com/blocked"}',
      },
    };
    const captured: ModelInferenceMessage[][] = [];
    const emitted: Array<{ type: string; event: unknown }> = [];
    const logRoot = resolve(mkdtempSync(`${tmpdir()}web07-recoverable-tool-`), 'logs');
    const service = new ChatInferenceService(
      setupValue.chatService,
      setupValue.modelConnectionService,
      settingsService,
      registry,
      async (_url, _timeout, _model, messages) => {
        captured.push(structuredClone(messages));
        return captured.length === 1
          ? {
              type: 'tool_calls',
              calls: [call],
              assistantMessage: { role: 'assistant', content: null, tool_calls: [call] },
            }
          : { type: 'message', content: 'Answered after the blocked page.' };
      },
      new StructuredLogger(logRoot, 'debug'),
    );

    const result = await service.infer(setupValue.chat.id, 'Visit the blocked page', (event) => {
      emitted.push({ type: event.type, event: structuredClone(event.event) });
    });

    assert.equal(result.message, 'Answered after the blocked page.');
    assert.equal(captured.length, 2);
    assert.deepEqual(executions, [{ url: 'https://example.com/blocked' }]);
    const failureMessage = captured[1].find((message) => message.role === 'tool');
    assert.deepEqual(failureMessage, {
      role: 'tool',
      tool_call_id: 'blocked-visit',
      content:
        '{"success":false,"error":{"code":"WEBSITE_FETCH_FAILED","message":"Unable to retrieve the requested webpage.","status":403}}',
    });
    const failureEvent = emitted.find((event) => event.type === 'tool_result')?.event;
    assert.deepEqual(failureEvent, {
      type: 'tool_result',
      toolCallId: 'blocked-visit',
      toolName: VISIT_WEBSITE_TOOL_NAME,
      result: {
        success: false,
        error: {
          code: 'WEBSITE_FETCH_FAILED',
          message: 'Unable to retrieve the requested webpage.',
          status: 403,
        },
      },
      success: false,
      createdAt: (failureEvent as { createdAt: number }).createdAt,
    });
    const history = await setupValue.chatService.listMessages(setupValue.chat.id);
    const persistedFailure = history?.find(
      (event) => event.type === 'tool_result' && event.toolCallId === 'blocked-visit',
    );
    assert.ok(persistedFailure?.type === 'tool_result');
    assert.equal(persistedFailure.success, false);
    const logEntries = readFileSync(resolve(logRoot, 'model-inference.log'), 'utf8')
      .trim()
      .split('\n')
      .map((line) => JSON.parse(line) as Record<string, unknown>);
    const executionFailure = logEntries.find(
      (entry) => entry.event === 'tool_execution_failed',
    );
    assert.equal(executionFailure?.recoverable, true);
    assert.equal(executionFailure?.errorCode, 'WEBSITE_FETCH_FAILED');
    assert.deepEqual(
      logEntries.filter((entry) => entry.event === 'model_request').map((entry) => entry.round),
      [1, 2],
    );
    assert.ok(logEntries.some((entry) => entry.event === 'tool_result' && entry.success === false));
    assert.ok(logEntries.some((entry) => entry.event === 'inference_completed'));
    assert.ok(!logEntries.some((entry) => entry.event === 'inference_failed'));
    setupValue.db.close();
  });

  await it('preserves mixed success and recoverable failure results in provider order', async () => {
    const setupValue = await setup(false);
    await setupValue.chatService.clearMessages(setupValue.chat.id);
    const executions: string[] = [];
    const visitTool = createVisitTool([]);
    visitTool.execute = async (value: unknown) => {
      const url = (value as { url: string }).url;
      executions.push(url);
      if (url.endsWith('/b')) {
        throw new RecoverableToolError(
          'WEBSITE_FETCH_FAILED',
          'Unable to retrieve the requested webpage.',
        );
      }
      return { url, content: 'Successful page A' };
    };
    const registry = new ToolRegistry([visitTool]);
    const settingsService = new ToolSettingsService(
      new ToolSettingsRepository(setupValue.db),
      registry,
    );
    await settingsService.updateSettings(VISIT_WEBSITE_TOOL_NAME, {
      enabledForChat: true,
      contentLimit: 2000,
      maxLinks: 10,
      maxImages: 5,
    });
    const calls = ['a', 'b'].map((suffix) => ({
      id: `visit-${suffix}`,
      type: 'function' as const,
      function: {
        name: VISIT_WEBSITE_TOOL_NAME,
        arguments: `{"url":"https://example.com/${suffix}"}`,
      },
    }));
    const captured: ModelInferenceMessage[][] = [];
    const service = new ChatInferenceService(
      setupValue.chatService,
      setupValue.modelConnectionService,
      settingsService,
      registry,
      async (_url, _timeout, _model, messages) => {
        captured.push(structuredClone(messages));
        return captured.length === 1
          ? {
              type: 'tool_calls',
              calls,
              assistantMessage: {
                role: 'assistant',
                content: null,
                reasoning_content: 'Inspect both pages.',
                tool_calls: calls,
              },
            }
          : {
              type: 'message',
              content: 'Used the available source.',
              assistantMessage: {
                role: 'assistant',
                content: 'Used the available source.',
                reasoning_content: 'One source was sufficient.',
              },
            };
      },
    );

    assert.equal((await service.infer(setupValue.chat.id, 'Visit both')).message, 'Used the available source.');
    assert.deepEqual(executions, ['https://example.com/a', 'https://example.com/b']);
    const toolMessages = captured[1].filter((message) => message.role === 'tool');
    assert.deepEqual(
      toolMessages.map((message) => (message.role === 'tool' ? message.tool_call_id : null)),
      ['visit-a', 'visit-b'],
    );
    assert.match(toolMessages[0].content, /Successful page A/);
    assert.equal(JSON.parse(toolMessages[1].content).success, false);
    const history = await setupValue.chatService.listMessages(setupValue.chat.id);
    assert.deepEqual(history?.map((event) => event.type), [
      'user',
      'reasoning',
      'tool_call',
      'tool_call',
      'tool_result',
      'tool_result',
      'reasoning',
      'assistant',
    ]);
    assert.deepEqual(
      history
        ?.filter((event) => event.type === 'tool_result')
        .map((event) => ({ id: event.toolCallId, success: event.success })),
      [
        { id: 'visit-a', success: true },
        { id: 'visit-b', success: false },
      ],
    );
    setupValue.db.close();
  });

  await it('returns a recoverable DuckDuckGo failure without selecting another tool', async () => {
    const setupValue = await setup(true);
    const searchTool = setupValue.registry.get(DUCKDUCKGO_TOOL_NAME);
    assert.ok(searchTool);
    searchTool.execute = async (value: unknown) => {
      setupValue.executions.push(value);
      throw new RecoverableToolError(
        'SEARCH_RESPONSE_UNUSABLE',
        'Search provider returned an unusable response.',
      );
    };
    let requestCount = 0;
    const call = {
      id: 'failed-search',
      type: 'function' as const,
      function: { name: DUCKDUCKGO_TOOL_NAME, arguments: '{"query":"network failure"}' },
    };
    const service = new ChatInferenceService(
      setupValue.chatService,
      setupValue.modelConnectionService,
      setupValue.settingsService,
      setupValue.registry,
      async (_url, _timeout, _model, messages) => {
        requestCount += 1;
        if (requestCount === 1) {
          return {
            type: 'tool_calls',
            calls: [call],
            assistantMessage: { role: 'assistant', content: null, tool_calls: [call] },
          };
        }
        const failure = messages.find((message) => message.role === 'tool');
        assert.equal(failure?.role === 'tool' ? failure.tool_call_id : null, 'failed-search');
        assert.equal(
          failure?.role === 'tool' ? JSON.parse(failure.content).error.code : null,
          'SEARCH_RESPONSE_UNUSABLE',
        );
        return { type: 'message', content: 'Answered without another tool.' };
      },
    );

    assert.equal((await service.infer(setupValue.chat.id, 'Search')).message, 'Answered without another tool.');
    assert.equal(requestCount, 2);
    assert.deepEqual(setupValue.executions, [{ query: 'network failure' }]);
    assert.deepEqual(setupValue.visitExecutions, []);
    setupValue.db.close();
  });

  await it('rejects duplicate provider tool-call ids before emitting the batch', async () => {
    const setupValue = await setup(true);
    const emitted: string[] = [];
    const duplicateCall = {
      id: 'duplicate-call',
      type: 'function' as const,
      function: { name: DUCKDUCKGO_TOOL_NAME, arguments: '{"query":"duplicate"}' },
    };
    const service = new ChatInferenceService(
      setupValue.chatService,
      setupValue.modelConnectionService,
      setupValue.settingsService,
      setupValue.registry,
      async () => ({
        type: 'tool_calls',
        calls: [duplicateCall, duplicateCall],
        assistantMessage: {
          role: 'assistant',
          content: null,
          tool_calls: [duplicateCall, duplicateCall],
        },
      }),
    );

    await assert.rejects(
      () =>
        service.infer(setupValue.chat.id, 'Reject duplicates', (event) => {
          emitted.push(event.type);
        }),
      (error: unknown) =>
        error instanceof ChatInferenceError && error.code === 'TOOL_CALL_REJECTED',
    );
    assert.deepEqual(emitted, []);
    assert.equal(setupValue.executions.length, 0);
    setupValue.db.close();
  });

  await it('keeps an unknown tool runtime exception terminal without a fake result', async () => {
    const setupValue = await setup(true);
    const searchTool = setupValue.registry.get(DUCKDUCKGO_TOOL_NAME);
    assert.ok(searchTool);
    searchTool.execute = async () => {
      throw new Error('unexpected programming failure');
    };
    const call = {
      id: 'runtime-failure',
      type: 'function' as const,
      function: { name: DUCKDUCKGO_TOOL_NAME, arguments: '{"query":"runtime"}' },
    };
    const service = new ChatInferenceService(
      setupValue.chatService,
      setupValue.modelConnectionService,
      setupValue.settingsService,
      setupValue.registry,
      async () => ({
        type: 'tool_calls',
        calls: [call],
        assistantMessage: { role: 'assistant', content: null, tool_calls: [call] },
      }),
    );

    await assert.rejects(
      () => service.infer(setupValue.chat.id, 'Trigger runtime failure'),
      (error: unknown) =>
        error instanceof ChatInferenceError && error.code === 'TOOL_EXECUTION_FAILED',
    );
    const history = await setupValue.chatService.listMessages(setupValue.chat.id);
    assert.ok(history?.some((event) => event.type === 'tool_call'));
    assert.ok(!history?.some((event) => event.type === 'tool_result'));
    setupValue.db.close();
  });

  await it('keeps persistence failure after tool execution terminal', async () => {
    const setupValue = await setup(true);
    const appendMessage = setupValue.chatService.appendMessage.bind(setupValue.chatService);
    setupValue.chatService.appendMessage = async (chatId, event) => {
      if (event.type === 'tool_result') {
        throw new Error('private persistence detail');
      }
      return appendMessage(chatId, event);
    };
    const call = {
      id: 'persist-failure',
      type: 'function' as const,
      function: { name: DUCKDUCKGO_TOOL_NAME, arguments: '{"query":"persist"}' },
    };
    let requestCount = 0;
    const emitted: string[] = [];
    const logRoot = resolve(mkdtempSync(`${tmpdir()}web07-tool-persist-failure-`), 'logs');
    const service = new ChatInferenceService(
      setupValue.chatService,
      setupValue.modelConnectionService,
      setupValue.settingsService,
      setupValue.registry,
      async () => {
        requestCount += 1;
        return {
          type: 'tool_calls',
          calls: [call],
          assistantMessage: { role: 'assistant', content: null, tool_calls: [call] },
        };
      },
      new StructuredLogger(logRoot, 'debug'),
    );

    await assert.rejects(
      () =>
        service.infer(setupValue.chat.id, 'Fail result persistence', (event) => {
          emitted.push(event.type);
        }),
      (error: unknown) =>
        error instanceof ChatInferenceError && error.code === 'CHAT_PERSISTENCE_FAILED',
    );
    assert.equal(requestCount, 1);
    assert.deepEqual(emitted, ['tool_call']);
    const history = await setupValue.chatService.listMessages(setupValue.chat.id);
    assert.ok(!history?.some((event) => event.type === 'tool_result'));
    const entries = readFileSync(resolve(logRoot, 'model-inference.log'), 'utf8')
      .trim()
      .split('\n')
      .map((line) => JSON.parse(line) as Record<string, unknown>);
    assert.ok(entries.some((entry) => entry.event === 'inference_failed'));
    assert.ok(!entries.some((entry) => entry.event === 'tool_result'));
    setupValue.db.close();
  });

  await it('terminates without emission when persistent event storage fails', async () => {
    const setupValue = await setup(false);
    const appendMessage = setupValue.chatService.appendMessage.bind(setupValue.chatService);
    setupValue.chatService.appendMessage = async (chatId, event) => {
      if (event.type === 'assistant') {
        throw new Error('private persistence detail');
      }
      return appendMessage(chatId, event);
    };
    const emitted: string[] = [];
    const service = new ChatInferenceService(
      setupValue.chatService,
      setupValue.modelConnectionService,
      setupValue.settingsService,
      setupValue.registry,
      async () => ({ type: 'message', content: 'Must not emit' }),
    );

    await assert.rejects(
      () =>
        service.infer(setupValue.chat.id, 'Persistence failure', (event) => {
          emitted.push(event.type);
        }),
      (error: unknown) =>
        error instanceof ChatInferenceError && error.code === 'CHAT_PERSISTENCE_FAILED',
    );
    assert.deepEqual(emitted, []);
    const history = await setupValue.chatService.listMessages(setupValue.chat.id);
    assert.deepEqual(history?.slice(-1).map((event) => event.type), ['user']);
    setupValue.db.close();
  });

  await it('traces one correlation id, increasing sequence, requests, tools, and completion', async () => {
    const setupValue = await setup(true);
    const logRoot = resolve(mkdtempSync(`${tmpdir()}web07-inference-trace-`), 'logs');
    const logger = new StructuredLogger(logRoot, 'debug');
    const call = {
      id: 'trace-call',
      type: 'function' as const,
      function: { name: DUCKDUCKGO_TOOL_NAME, arguments: '{"query":"trace"}' },
    };
    let requestCount = 0;
    const service = new ChatInferenceService(
      setupValue.chatService,
      setupValue.modelConnectionService,
      setupValue.settingsService,
      setupValue.registry,
      async () => {
        requestCount += 1;
        return requestCount === 1
          ? {
              type: 'tool_calls',
              calls: [call],
              assistantMessage: { role: 'assistant', content: null, tool_calls: [call] },
              finishReason: 'tool_calls',
            }
          : {
              type: 'message',
              content: 'Traced final',
              assistantMessage: { role: 'assistant', content: 'Traced final' },
              finishReason: 'stop',
            };
      },
      logger,
    );
    await service.infer(setupValue.chat.id, 'Trace this');

    const entries = readFileSync(resolve(logRoot, 'model-inference.log'), 'utf8')
      .trim()
      .split('\n')
      .map((line) => JSON.parse(line) as Record<string, unknown>);
    assert.equal(new Set(entries.map((entry) => entry.inferenceId)).size, 1);
    assert.deepEqual(
      entries.map((entry) => entry.sequence),
      entries.map((_entry, index) => index + 1),
    );
    assert.deepEqual(
      entries.filter((entry) => entry.event === 'model_request').map((entry) => entry.round),
      [1, 2],
    );
    for (const event of [
      'model_response',
      'tool_execution_started',
      'tool_execution_completed',
      'tool_result',
      'inference_completed',
    ]) {
      assert.ok(entries.some((entry) => entry.event === event), `${event} should be traced`);
    }
    assert.ok(
      entries.some(
        (entry) =>
          entry.event === 'model_request' &&
          typeof entry.messageCount === 'number' &&
          entry.messageCount > 0 &&
          typeof entry.approximateRequestBytes === 'number' &&
          entry.approximateRequestBytes > 0 &&
          Array.isArray(entry.tools) &&
          entry.tools.length === 1,
      ),
    );
    const modelResponse = entries.find(
      (entry) => entry.event === 'model_response' && entry.round === 1,
    );
    const execution = entries.find((entry) => entry.event === 'tool_execution_started');
    const assistant = modelResponse?.assistant as Record<string, unknown> | undefined;
    const loggedCalls = assistant?.tool_calls as Array<Record<string, unknown>> | undefined;
    assert.equal((loggedCalls?.[0] as { id?: unknown } | undefined)?.id, 'trace-call');
    assert.equal(execution?.tool_call_id, 'trace-call');
    assert.equal(execution?.tool, DUCKDUCKGO_TOOL_NAME);
    assert.equal(execution?.sourceRound, 1);
    assert.equal(execution?.providerResponseIndex, 0);
    assert.ok(
      entries.indexOf(modelResponse ?? {}) < entries.indexOf(execution ?? {}),
      'provider response must be logged before its execution',
    );
    setupValue.db.close();
  });

  await it('logs the model-provider failure stage with the inference correlation id', async () => {
    const setupValue = await setup(false);
    const logRoot = resolve(mkdtempSync(`${tmpdir()}web07-inference-failure-`), 'logs');
    const logger = new StructuredLogger(logRoot, 'debug');
    const service = new ChatInferenceService(
      setupValue.chatService,
      setupValue.modelConnectionService,
      setupValue.settingsService,
      setupValue.registry,
      async () => {
        throw new ModelInferenceError('MODEL_SERVER_UNREACHABLE', 'fetch failed', {
          providerErrorName: 'TypeError',
          providerErrorCauseCode: 'ECONNREFUSED',
        });
      },
      logger,
    );
    await assert.rejects(
      () => service.infer(setupValue.chat.id, 'Fail with context'),
      (error: unknown) =>
        error instanceof ChatInferenceError && error.code === 'MODEL_SERVER_UNREACHABLE',
    );
    const applicationEntries = readFileSync(resolve(logRoot, 'application.log'), 'utf8')
      .trim()
      .split('\n')
      .map((line) => JSON.parse(line) as Record<string, unknown>);
    const failure = applicationEntries.find((entry) => entry.event === 'inference_failed');
    assert.equal(failure?.stage, 'model_provider');
    assert.ok(String(failure?.error).includes('fetch failed'));
    assert.equal(failure?.errorCode, 'MODEL_SERVER_UNREACHABLE');
    assert.equal(failure?.providerErrorName, 'TypeError');
    assert.equal(failure?.providerErrorCauseCode, 'ECONNREFUSED');
    assert.equal(failure?.timeoutMinutes, 1);
    assert.equal(typeof failure?.durationMs, 'number');
    assert.equal(failure?.applicationTimeout, false);
    assert.equal(typeof failure?.inferenceId, 'string');
    setupValue.db.close();
  });

  await it('logs configured model timeout distinctly from an unreachable provider', async () => {
    const setupValue = await setup(false);
    const logRoot = resolve(mkdtempSync(`${tmpdir()}web07-inference-timeout-`), 'logs');
    const service = new ChatInferenceService(
      setupValue.chatService,
      setupValue.modelConnectionService,
      setupValue.settingsService,
      setupValue.registry,
      async () => {
        throw new ModelInferenceError('MODEL_SERVER_TIMEOUT', 'The operation was aborted', {
          providerErrorName: 'AbortError',
        });
      },
      new StructuredLogger(logRoot, 'debug'),
    );
    await assert.rejects(
      () => service.infer(setupValue.chat.id, 'Time out with context'),
      (error: unknown) =>
        error instanceof ChatInferenceError && error.code === 'MODEL_SERVER_TIMEOUT',
    );
    const entries = readFileSync(resolve(logRoot, 'model-inference.log'), 'utf8')
      .trim()
      .split('\n')
      .map((line) => JSON.parse(line) as Record<string, unknown>);
    const failure = entries.find((entry) => entry.event === 'inference_failed');
    assert.equal(failure?.errorCode, 'MODEL_SERVER_TIMEOUT');
    assert.equal(failure?.applicationTimeout, true);
    assert.equal(failure?.providerErrorName, 'AbortError');
    assert.notEqual(failure?.errorCode, 'MODEL_SERVER_UNREACHABLE');
    setupValue.db.close();
  });

  await it('continues beyond five tool rounds and preserves exact chronology through completion', async () => {
    const setupValue = await setup(true);
    const captured: ModelInferenceMessage[][] = [];
    const service = new ChatInferenceService(
      setupValue.chatService,
      setupValue.modelConnectionService,
      setupValue.settingsService,
      setupValue.registry,
      async (_url, _timeout, _model, messages) => {
        captured.push(structuredClone(messages));
        if (captured.length === 7) {
          return { type: 'message', content: 'Completed after six tool rounds.' };
        }
        const call = {
          id: `call-${captured.length}`,
          type: 'function' as const,
          function: {
            name: DUCKDUCKGO_TOOL_NAME,
            arguments: `{"query":"round ${captured.length}"}`,
          },
        };
        return {
          type: 'tool_calls',
          calls: [call],
          assistantMessage: { role: 'assistant', content: null, tool_calls: [call] },
        };
      },
    );

    assert.equal(
      (await service.infer(setupValue.chat.id, 'Continue until final')).message,
      'Completed after six tool rounds.',
    );
    assert.equal(captured.length, 7);
    assert.equal(setupValue.executions.length, 6);
    assert.deepEqual(captured[6].map((message) => message.role), [
      'system',
      'assistant',
      'user',
      'assistant',
      'tool',
      'assistant',
      'tool',
      'assistant',
      'tool',
      'assistant',
      'tool',
      'assistant',
      'tool',
      'assistant',
      'tool',
    ]);
    assert.deepEqual(
      captured[6]
        .filter((message) => message.role === 'tool')
        .map((message) => (message.role === 'tool' ? message.tool_call_id : null)),
      ['call-1', 'call-2', 'call-3', 'call-4', 'call-5', 'call-6'],
    );
    const history = await setupValue.chatService.listMessages(setupValue.chat.id);
    assert.deepEqual(
      history?.filter((event) => event.type === 'tool_call').map((event) => event.toolCallId),
      ['call-1', 'call-2', 'call-3', 'call-4', 'call-5', 'call-6'],
    );
    setupValue.db.close();
  });

  await it('uses the configured inference timeout to stop an otherwise unbounded loop', async () => {
    const setupValue = await setup(true);
    const logRoot = resolve(mkdtempSync(`${tmpdir()}web07-unbounded-timeout-`), 'logs');
    const getConnectionForInference = setupValue.modelConnectionService.getConnectionForInference.bind(
      setupValue.modelConnectionService,
    );
    setupValue.modelConnectionService.getConnectionForInference = async (id) => {
      const resolved = await getConnectionForInference(id);
      return resolved
        ? {
            ...resolved,
            connection: {
              ...resolved.connection,
              data: { ...resolved.connection.data, timeoutMinutes: 0.001 },
            },
          }
        : null;
    };
    let providerRequests = 0;
    const service = new ChatInferenceService(
      setupValue.chatService,
      setupValue.modelConnectionService,
      setupValue.settingsService,
      setupValue.registry,
      async (_url, _timeout, _model, _messages, _tools, _transport, signal) => {
        providerRequests += 1;
        const call = {
          id: `timeout-call-${providerRequests}`,
          type: 'function' as const,
          function: { name: DUCKDUCKGO_TOOL_NAME, arguments: '{"query":"keep looping"}' },
        };
        await new Promise<void>((resolveWait, reject) => {
          const timer = setTimeout(resolveWait, 10);
          signal?.addEventListener(
            'abort',
            () => {
              clearTimeout(timer);
              reject(new DOMException('The operation was aborted', 'AbortError'));
            },
            { once: true },
          );
        });
        return {
          type: 'tool_calls',
          calls: [call],
          assistantMessage: { role: 'assistant', content: null, tool_calls: [call] },
        };
      },
      new StructuredLogger(logRoot, 'debug'),
    );

    await assert.rejects(
      () => service.infer(setupValue.chat.id, 'Loop until timeout'),
      (error: unknown) =>
        error instanceof ChatInferenceError && error.code === 'MODEL_SERVER_TIMEOUT',
    );
    const requestsAfterAbort = providerRequests;
    await new Promise((resolveWait) => setTimeout(resolveWait, 20));
    assert.equal(providerRequests, requestsAfterAbort);
    assert.ok(providerRequests > 1);
    const timeoutFailure = readFileSync(resolve(logRoot, 'model-inference.log'), 'utf8')
      .trim()
      .split('\n')
      .map((line) => JSON.parse(line) as Record<string, unknown>)
      .find((entry) => entry.event === 'inference_failed');
    assert.equal(timeoutFailure?.errorCode, 'MODEL_SERVER_TIMEOUT');
    assert.equal(timeoutFailure?.applicationTimeout, true);
    setupValue.db.close();
  });

  await it('cancels an active tool phase without starting another provider round', async () => {
    const setupValue = await setup(true);
    const searchTool = setupValue.registry.get(DUCKDUCKGO_TOOL_NAME);
    assert.ok(searchTool);
    let releaseStarted: (() => void) | undefined;
    const started = new Promise<void>((resolveStarted) => {
      releaseStarted = resolveStarted;
    });
    let toolCleanedUp = false;
    searchTool.execute = async (_value, _settings, signal) =>
      new Promise((_resolve, reject) => {
        const abort = (): void => {
          signal?.removeEventListener('abort', abort);
          toolCleanedUp = true;
          reject(signal?.reason ?? new DOMException('The operation was aborted', 'AbortError'));
        };
        signal?.addEventListener('abort', abort, { once: true });
        releaseStarted?.();
      });
    let providerRequests = 0;
    const call = {
      id: 'cancelled-tool-call',
      type: 'function' as const,
      function: { name: DUCKDUCKGO_TOOL_NAME, arguments: '{"query":"cancel me"}' },
    };
    const service = new ChatInferenceService(
      setupValue.chatService,
      setupValue.modelConnectionService,
      setupValue.settingsService,
      setupValue.registry,
      async () => {
        providerRequests += 1;
        return {
          type: 'tool_calls',
          calls: [call],
          assistantMessage: { role: 'assistant', content: null, tool_calls: [call] },
        };
      },
    );
    const controller = new AbortController();
    const inference = service.infer(
      setupValue.chat.id,
      'Cancel during tool execution',
      undefined,
      undefined,
      controller.signal,
    );
    await started;
    controller.abort(new DOMException('User cancelled', 'AbortError'));

    await assert.rejects(
      () => inference,
      (error: unknown) => error instanceof DOMException && error.name === 'AbortError',
    );
    assert.equal(providerRequests, 1);
    assert.equal(toolCleanedUp, true);
    setupValue.db.close();
  });
});
