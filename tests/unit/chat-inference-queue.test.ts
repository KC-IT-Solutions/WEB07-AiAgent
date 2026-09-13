import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { describe, it } from 'node:test';
import { createTestDatabase } from '../../src/server/database.js';
import { ChatRepository } from '../../src/server/repositories/chat-repository.js';
import { ModelConnectionRepository } from '../../src/server/repositories/model-connection-repository.js';
import { ToolSettingsRepository } from '../../src/server/repositories/tool-settings-repository.js';
import { ChatInferenceService } from '../../src/server/services/chat-inference-service.js';
import { ChatService } from '../../src/server/services/chat-service.js';
import { ModelConnectionInferenceQueue } from '../../src/server/services/model-connection-inference-queue.js';
import { ModelConnectionService } from '../../src/server/services/model-connection-service.js';
import { ToolSettingsService } from '../../src/server/services/tool-settings-service.js';
import { FileChatMessageStore } from '../../src/server/stores/chat-message-store.js';
import { ToolRegistry } from '../../src/server/tools/tool-registry.js';
import {
  DUCKDUCKGO_TOOL_NAME,
  type RegisteredTool,
} from '../../src/server/tool-types.js';
import type {
  ModelInferenceMessage,
  ModelInferenceResult,
} from '../../src/services/model-inference.js';

interface Deferred {
  promise: Promise<void>;
  resolve: () => void;
  reject: (reason: unknown) => void;
}

function deferred(): Deferred {
  let resolvePromise!: () => void;
  let rejectPromise!: (reason: unknown) => void;
  const promise = new Promise<void>((resolveValue, rejectValue) => {
    resolvePromise = resolveValue;
    rejectPromise = rejectValue;
  });
  return { promise, resolve: resolvePromise, reject: rejectPromise };
}

function userMessage(messages: ModelInferenceMessage[]): string {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index];
    if (message?.role === 'user') return message.content;
  }
  throw new Error('Expected a user message');
}

async function waitForWaiting(
  queue: ModelConnectionInferenceQueue,
  connectionId: number,
  count: number,
): Promise<void> {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    if (queue.waitingCount(connectionId) === count) return;
    await new Promise<void>((resolveTurn) => setImmediate(resolveTurn));
  }
  assert.equal(queue.waitingCount(connectionId), count);
}

async function setup(connectionCount = 1) {
  const db = createTestDatabase();
  const chatService = new ChatService(
    new ChatRepository(db),
    new FileChatMessageStore(resolve(mkdtempSync(`${tmpdir()}web07-inference-queue-`), 'history')),
  );
  const modelConnectionService = new ModelConnectionService(new ModelConnectionRepository(db));
  modelConnectionService.isModelVisible = async () => true;
  const connections: Awaited<ReturnType<ModelConnectionService['createConnection']>>[] = [];
  for (let index = 0; index < connectionCount; index += 1) {
    connections.push(
      await modelConnectionService.createConnection({
        name: `Connection ${index + 1}`,
        baseUrl: `http://model-${index + 1}.test`,
        timeoutMinutes: 1,
        modelId: null,
        enabled: true,
      }),
    );
  }

  const createChat = async (connectionIndex = 0) => {
    const chat = await chatService.createChat({ title: `Queue chat ${connectionIndex}` });
    await chatService.updateChat(chat.id, {
      modelConnectionId: connections[connectionIndex].id,
      modelId: 'stub-model',
    });
    return chat;
  };

  return { db, chatService, modelConnectionService, connections, createChat };
}

await describe('per-connection chat inference queue', async () => {
  await it('serializes the same connection in FIFO order through final event delivery', async () => {
    const context = await setup();
    const chats = await Promise.all([context.createChat(), context.createChat(), context.createChat()]);
    const queue = new ModelConnectionInferenceQueue();
    const firstProviderRelease = deferred();
    const firstProviderStarted = deferred();
    const firstFinalRelease = deferred();
    const firstFinalStarted = deferred();
    const order: string[] = [];
    let activeProviders = 0;
    let maximumActiveProviders = 0;
    const service = new ChatInferenceService(
      context.chatService,
      context.modelConnectionService,
      undefined,
      undefined,
      async (_url, _timeout, _model, messages): Promise<ModelInferenceResult> => {
        const current = userMessage(messages);
        order.push(current);
        activeProviders += 1;
        maximumActiveProviders = Math.max(maximumActiveProviders, activeProviders);
        try {
          if (current === 'first') {
            firstProviderStarted.resolve();
            await firstProviderRelease.promise;
          }
          return { type: 'message', content: `${current} answer` };
        } finally {
          activeProviders -= 1;
        }
      },
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      queue,
    );

    const first = service.infer(chats[0].id, 'first', async (event) => {
      if (event.final) {
        firstFinalStarted.resolve();
        await firstFinalRelease.promise;
      }
    });
    await firstProviderStarted.promise;
    const second = service.infer(chats[1].id, 'second');
    const third = service.infer(chats[2].id, 'third');
    await waitForWaiting(queue, context.connections[0].id, 2);

    firstProviderRelease.resolve();
    await firstFinalStarted.promise;
    assert.deepEqual(order, ['first']);
    firstFinalRelease.resolve();

    assert.deepEqual(
      (await Promise.all([first, second, third])).map((result) => result.message),
      ['first answer', 'second answer', 'third answer'],
    );
    assert.deepEqual(order, ['first', 'second', 'third']);
    assert.equal(maximumActiveProviders, 1);
    assert.equal(queue.connectionCount, 0);
    context.db.close();
  });

  await it('holds the slot across a tool execution and the next provider round', async () => {
    const context = await setup();
    const firstChat = await context.createChat();
    const secondChat = await context.createChat();
    const queue = new ModelConnectionInferenceQueue();
    const toolStarted = deferred();
    const toolRelease = deferred();
    const tool: RegisteredTool = {
      name: DUCKDUCKGO_TOOL_NAME,
      displayName: 'Search',
      description: 'Search test tool',
      inputSchema: { type: 'object' },
      execute: async () => {
        toolStarted.resolve();
        await toolRelease.promise;
        return { results: [] };
      },
    };
    const registry = new ToolRegistry([tool]);
    const settings = new ToolSettingsService(new ToolSettingsRepository(context.db), registry);
    await settings.updateSettings(DUCKDUCKGO_TOOL_NAME, {
      enabledForChat: true,
      pageSize: 3,
      safeSearch: 'moderate',
    });
    const requests: string[] = [];
    const service = new ChatInferenceService(
      context.chatService,
      context.modelConnectionService,
      settings,
      registry,
      async (_url, _timeout, _model, messages): Promise<ModelInferenceResult> => {
        const current = userMessage(messages);
        requests.push(current);
        if (current === 'tool first' && !messages.some((message) => message.role === 'tool')) {
          const call = {
            id: 'queue-tool-call',
            type: 'function' as const,
            function: { name: DUCKDUCKGO_TOOL_NAME, arguments: '{}' },
          };
          return {
            type: 'tool_calls',
            calls: [call],
            assistantMessage: { role: 'assistant', content: null, tool_calls: [call] },
          };
        }
        return { type: 'message', content: `${current} answer` };
      },
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      queue,
    );

    const first = service.infer(firstChat.id, 'tool first');
    await toolStarted.promise;
    const second = service.infer(secondChat.id, 'waiting second');
    await waitForWaiting(queue, context.connections[0].id, 1);
    assert.deepEqual(requests, ['tool first']);

    toolRelease.resolve();
    await Promise.all([first, second]);
    assert.deepEqual(requests, ['tool first', 'tool first', 'waiting second']);
    assert.equal(queue.connectionCount, 0);
    context.db.close();
  });

  await it('allows different saved connections to infer concurrently', async () => {
    const context = await setup(2);
    const firstChat = await context.createChat(0);
    const secondChat = await context.createChat(1);
    const queue = new ModelConnectionInferenceQueue();
    const firstStarted = deferred();
    const firstRelease = deferred();
    let activeProviders = 0;
    let maximumActiveProviders = 0;
    const service = new ChatInferenceService(
      context.chatService,
      context.modelConnectionService,
      undefined,
      undefined,
      async (_url, _timeout, _model, messages) => {
        const current = userMessage(messages);
        activeProviders += 1;
        maximumActiveProviders = Math.max(maximumActiveProviders, activeProviders);
        if (current === 'blocked') {
          firstStarted.resolve();
          await firstRelease.promise;
        }
        activeProviders -= 1;
        return { type: 'message' as const, content: `${current} answer` };
      },
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      queue,
    );

    const first = service.infer(firstChat.id, 'blocked');
    await firstStarted.promise;
    const second = service.infer(secondChat.id, 'concurrent');
    assert.equal((await second).message, 'concurrent answer');
    assert.equal(maximumActiveProviders, 2);
    firstRelease.resolve();
    await first;
    assert.equal(queue.connectionCount, 0);
    context.db.close();
  });

  await it('releases the slot after an active provider failure', async () => {
    const context = await setup();
    const firstChat = await context.createChat();
    const secondChat = await context.createChat();
    const queue = new ModelConnectionInferenceQueue();
    const failureStarted = deferred();
    const failureRelease = deferred();
    const requests: string[] = [];
    const service = new ChatInferenceService(
      context.chatService,
      context.modelConnectionService,
      undefined,
      undefined,
      async (_url, _timeout, _model, messages) => {
        const current = userMessage(messages);
        requests.push(current);
        if (current === 'fail') {
          failureStarted.resolve();
          await failureRelease.promise;
          throw new Error('provider failed');
        }
        return { type: 'message' as const, content: 'recovered' };
      },
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      queue,
    );

    const failed = service.infer(firstChat.id, 'fail');
    await failureStarted.promise;
    const next = service.infer(secondChat.id, 'next');
    await waitForWaiting(queue, context.connections[0].id, 1);
    failureRelease.resolve();

    await assert.rejects(failed, /provider failed/);
    assert.equal((await next).message, 'recovered');
    assert.deepEqual(requests, ['fail', 'next']);
    assert.equal(queue.connectionCount, 0);
    context.db.close();
  });

  await it('releases the slot when an active inference is cancelled', async () => {
    const context = await setup();
    const firstChat = await context.createChat();
    const secondChat = await context.createChat();
    const queue = new ModelConnectionInferenceQueue();
    const activeStarted = deferred();
    const requests: string[] = [];
    const service = new ChatInferenceService(
      context.chatService,
      context.modelConnectionService,
      undefined,
      undefined,
      async (_url, _timeout, _model, messages, _tools, _transport, signal) => {
        const current = userMessage(messages);
        requests.push(current);
        if (current === 'cancel active') {
          activeStarted.resolve();
          await new Promise<void>((_resolve, reject) => {
            signal?.addEventListener(
              'abort',
              () => reject(signal.reason ?? new DOMException('Aborted', 'AbortError')),
              { once: true },
            );
          });
        }
        return { type: 'message' as const, content: 'next answer' };
      },
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      queue,
    );
    const controller = new AbortController();
    const active = service.infer(firstChat.id, 'cancel active', undefined, undefined, controller.signal);
    await activeStarted.promise;
    const next = service.infer(secondChat.id, 'after cancel');
    await waitForWaiting(queue, context.connections[0].id, 1);
    controller.abort(new DOMException('User cancelled', 'AbortError'));

    await assert.rejects(active, (error: unknown) => error instanceof DOMException);
    assert.equal((await next).message, 'next answer');
    assert.deepEqual(requests, ['cancel active', 'after cancel']);
    assert.equal(queue.connectionCount, 0);
    context.db.close();
  });

  await it('releases the slot when the active inference times out', async () => {
    const context = await setup();
    const firstChat = await context.createChat();
    const secondChat = await context.createChat();
    const queue = new ModelConnectionInferenceQueue();
    const originalGetConnection = context.modelConnectionService.getConnectionForInference.bind(
      context.modelConnectionService,
    );
    context.modelConnectionService.getConnectionForInference = async (connectionId) => {
      const resolved = await originalGetConnection(connectionId);
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
    const activeStarted = deferred();
    const requests: string[] = [];
    const service = new ChatInferenceService(
      context.chatService,
      context.modelConnectionService,
      undefined,
      undefined,
      async (_url, _timeout, _model, messages, _tools, _transport, signal) => {
        const current = userMessage(messages);
        requests.push(current);
        if (current === 'time out') {
          activeStarted.resolve();
          await new Promise<void>((_resolve, reject) => {
            signal?.addEventListener(
              'abort',
              () => reject(new DOMException('Timed out', 'AbortError')),
              { once: true },
            );
          });
        }
        return { type: 'message' as const, content: 'after timeout answer' };
      },
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      queue,
    );

    const timedOut = service.infer(firstChat.id, 'time out');
    await activeStarted.promise;
    const next = service.infer(secondChat.id, 'after timeout');
    await waitForWaiting(queue, context.connections[0].id, 1);

    await assert.rejects(timedOut, (error: unknown) => {
      return error instanceof Error && error.message === 'MODEL_SERVER_TIMEOUT';
    });
    assert.equal((await next).message, 'after timeout answer');
    assert.deepEqual(requests, ['time out', 'after timeout']);
    assert.equal(queue.connectionCount, 0);
    context.db.close();
  });

  await it('removes a cancelled waiter without running it or blocking a later waiter', async () => {
    const context = await setup();
    const chats = await Promise.all([context.createChat(), context.createChat(), context.createChat()]);
    const queue = new ModelConnectionInferenceQueue();
    const firstStarted = deferred();
    const firstRelease = deferred();
    const requests: string[] = [];
    const service = new ChatInferenceService(
      context.chatService,
      context.modelConnectionService,
      undefined,
      undefined,
      async (_url, _timeout, _model, messages) => {
        const current = userMessage(messages);
        requests.push(current);
        if (current === 'first') {
          firstStarted.resolve();
          await firstRelease.promise;
        }
        return { type: 'message' as const, content: `${current} answer` };
      },
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      queue,
    );

    const first = service.infer(chats[0].id, 'first');
    await firstStarted.promise;
    const cancelledController = new AbortController();
    const cancelled = service.infer(
      chats[1].id,
      'cancelled waiter',
      undefined,
      undefined,
      cancelledController.signal,
    );
    const third = service.infer(chats[2].id, 'third');
    await waitForWaiting(queue, context.connections[0].id, 2);
    cancelledController.abort(new DOMException('Cancelled while waiting', 'AbortError'));
    await assert.rejects(cancelled, (error: unknown) => error instanceof DOMException);
    await waitForWaiting(queue, context.connections[0].id, 1);

    firstRelease.resolve();
    assert.deepEqual(
      (await Promise.all([first, third])).map((result) => result.message),
      ['first answer', 'third answer'],
    );
    assert.deepEqual(requests, ['first', 'third']);
    assert.equal(queue.connectionCount, 0);
    context.db.close();
  });

  await it('cleans up direct queue state after the final release', async () => {
    const queue = new ModelConnectionInferenceQueue();
    const firstRelease = await queue.acquire(42);
    const secondReleasePromise = queue.acquire(42);
    assert.equal(queue.connectionCount, 1);
    assert.equal(queue.waitingCount(42), 1);
    firstRelease();
    const secondRelease = await secondReleasePromise;
    secondRelease();
    assert.equal(queue.connectionCount, 0);
    assert.equal(queue.waitingCount(42), 0);
  });
});
