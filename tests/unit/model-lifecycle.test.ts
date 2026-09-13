import { afterEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createTestDatabase } from '../../src/server/database.js';
import { ProjectRepository } from '../../src/server/repositories/project-repository.js';
import { AgentRepository } from '../../src/server/repositories/agent-repository.js';
import { AgentRunRepository } from '../../src/server/repositories/agent-run-repository.js';
import type { ModelConnection, ModelConnectionData } from '../../src/server/model-connection-types.js';
import { ModelConnectionInferenceQueue } from '../../src/server/services/model-connection-inference-queue.js';
import { LmStudioModelLifecycleService } from '../../src/server/services/lm-studio-model-lifecycle.js';
import type { RegisteredTool } from '../../src/server/tool-types.js';
import { DEFAULT_DUCKDUCKGO_SETTINGS } from '../../src/server/tool-types.js';
import { ToolRegistry } from '../../src/server/tools/tool-registry.js';
import { AgentRunService } from '../../src/server/services/agent-run-service.js';
import type { AgentData } from '../../src/server/agent-types.js';
import type { ModelInferenceResult } from '../../src/services/model-inference.js';

type TestInferenceRequester = NonNullable<ConstructorParameters<typeof AgentRunService>[6]>;

const originalFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = originalFetch;
});

function getFetchUrl(input: unknown): string {
  if (typeof input === 'string') return input;
  if (input instanceof URL) return input.toString();
  return String(input);
}

describe('LmStudioModelLifecycleService', () => {
  it('returns no_loaded_instance when model exists but not loaded', async () => {
    globalThis.fetch = async () =>
      new Response(
        JSON.stringify({ models: [{ key: 'test-model', loaded_instances: [] }] }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      );

    const service = new LmStudioModelLifecycleService();
    const result = await service.unloadModel('http://localhost:1234', undefined, 'test-model');
    assert.equal(result.status, 'skipped');
    assert.equal(result.reason, 'no_loaded_instance');
    await service.close();
  });

  it('unloads exactly one matching loaded instance', async () => {
    let unloadPayload: unknown;
    globalThis.fetch = async (input: unknown, init?: RequestInit) => {
      const url = getFetchUrl(input);
      if (url.endsWith('/api/v1/models')) {
        return new Response(
          JSON.stringify({
            models: [
              {
                key: 'test-model',
                loaded_instances: [{ id: 'instance-42' }],
              },
            ],
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        );
      }
      if (url.endsWith('/api/v1/models/unload')) {
        unloadPayload = JSON.parse(String(init?.body));
        return new Response('', { status: 200 });
      }
      throw new Error('unexpected fetch');
    };

    const service = new LmStudioModelLifecycleService();
    const result = await service.unloadModel('http://localhost:1234', undefined, 'test-model');
    assert.equal(result.status, 'completed');
    assert.deepEqual(unloadPayload, { instance_id: 'instance-42' });
    await service.close();
  });

  it('skips when multiple loaded instances exist', async () => {
    globalThis.fetch = async () =>
      new Response(
        JSON.stringify({
          models: [
            { key: 'test-model', loaded_instances: [{ id: 'instance-1' }, { id: 'instance-2' }] },
          ],
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      );

    const service = new LmStudioModelLifecycleService();
    const result = await service.unloadModel('http://localhost:1234', undefined, 'test-model');
    assert.equal(result.status, 'skipped');
    assert.equal(result.reason, 'multiple_loaded_instances');
    await service.close();
  });

  it('handles non-LM-Studio 404 discovery gracefully', async () => {
    globalThis.fetch = async () => new Response('', { status: 404 });

    const service = new LmStudioModelLifecycleService();
    const result = await service.unloadModel('http://localhost:1234', undefined, 'test-model');
    assert.equal(result.status, 'skipped');
    assert.equal(result.reason, 'discovery_unavailable');
    await service.close();
  });

  it('handles malformed discovery response gracefully', async () => {
    globalThis.fetch = async () => new Response('{ invalid json', { status: 200 });

    const service = new LmStudioModelLifecycleService();
    const result = await service.unloadModel('http://localhost:1234', undefined, 'test-model');
    assert.equal(result.status, 'skipped');
    assert.equal(result.reason, 'discovery_malformed_response');
    await service.close();
  });

  it('handles unload HTTP failure gracefully', async () => {
    globalThis.fetch = async (input: unknown) => {
      const url = getFetchUrl(input);
      if (url.endsWith('/api/v1/models')) {
        return new Response(
          JSON.stringify({
            models: [{ key: 'test-model', loaded_instances: [{ id: 'instance-1' }] }],
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        );
      }
      if (url.endsWith('/api/v1/models/unload')) {
        return new Response('', { status: 500 });
      }
      throw new Error('unexpected fetch');
    };

    const service = new LmStudioModelLifecycleService();
    const result = await service.unloadModel('http://localhost:1234', undefined, 'test-model');
    assert.equal(result.status, 'skipped');
    assert.equal(result.reason, 'unload_http_error');
    await service.close();
  });

  it('handles network error gracefully', async () => {
    globalThis.fetch = async () => { throw new Error('network error'); };

    const service = new LmStudioModelLifecycleService();
    const result = await service.unloadModel('http://localhost:1234', undefined, 'test-model');
    assert.equal(result.status, 'skipped');
    assert.equal(result.reason, 'discovery_failed');
    await service.close();
  });

  it('does not send API key in logs when building headers', async () => {
    let capturedHeaders: Record<string, string> = {};
    globalThis.fetch = async (input: unknown, init?: RequestInit) => {
      const url = getFetchUrl(input);
      if (url.endsWith('/api/v1/models')) {
        return new Response(
        JSON.stringify({
          models: [{ key: 'test-model', loaded_instances: [{ id: 'instance-1' }] }],
        }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        );
      }
      if (url.endsWith('/api/v1/models/unload')) {
        capturedHeaders = init?.headers as Record<string, string> ?? {};
        return new Response('', { status: 200 });
      }
      throw new Error('unexpected fetch');
    };

    const service = new LmStudioModelLifecycleService();
    await service.unloadModel('http://localhost:1234', 'secret-api-key-123', 'test-model');
    assert.equal(capturedHeaders['Authorization'], 'Bearer secret-api-key-123');
    await service.close();
  });
});

describe('AgentRunService model lifecycle integration', () => {
  const connectionData: ModelConnectionData = {
    name: 'Local',
    baseUrl: 'http://localhost:1234',
    timeoutMinutes: 1,
    modelId: 'connection-default',
    enabled: true,
    filterConfigured: false,
    visibleModelIds: [],
    modelDescriptions: {},
  };

  const connection: ModelConnection = {
    id: 7,
    userId: 1,
    createdAt: 1,
    updatedAt: 1,
    hasApiKey: true,
    data: connectionData,
  };

  function setupWithLifecycle(
    agentData: Partial<AgentData> = {},
    inferenceResponses: ModelInferenceResult[] = [],
  ) {
    const db = createTestDatabase();
    const projects = new ProjectRepository(db);
    const agents = new AgentRepository(db);
    const runs = new AgentRunRepository(db);
    const project = projects.create(1, { name: 'Project', description: '' });

    const agentDataFull: AgentData = {
      name: 'TestAgent',
      description: '',
      instructionSource: 'inline',
      instructions: 'Inline instructions',
      instructionFilePath: '',
      assignmentSource: 'inline',
      assignment: 'Do the work',
      assignmentFilePath: '',
      modelConnectionId: connection.id,
      modelId: 'configured-model',
      allowModelSelection: false,
      triggerNextAgent: false,
      saveResultToFile: false,
      resultDirectory: '',
      resultFilename: '',
      projectFilesystemPermissions: {
        list: true,
        read: true,
        write: false,
        createDirectory: false,
        rename: false,
        delete: false,
      },
      ...agentData,
    };

    const agent = agents.create(project.id, agentDataFull);

    let inferenceIndex = 0;
    const requestInference: TestInferenceRequester = async () => {
      const response = inferenceResponses[inferenceIndex++];
      if (!response) return { type: 'message' as const, content: 'done', finishReason: 'stop' };
      return response;
    };

    const queue = new ModelConnectionInferenceQueue();
    const lifecycleService = new LmStudioModelLifecycleService();

    const service = new AgentRunService(
      runs,
      agents,
      {
        listDirectory: async () => ({ relativePath: '', entries: [] }),
        readFile: async () => ({ relativePath: 'AGENT.md', content: '', size: 0 }),
        writeFile: async (_projectId, value) => ({
          relativePath: String((value as Record<string, unknown>).path),
          size: 0,
        }),
        createDirectory: async (_projectId, value) => ({
          name: String((value as Record<string, unknown>).path),
          relativePath: String((value as Record<string, unknown>).path),
          type: 'directory',
          modifiedAt: 1,
        }),
        renameEntry: async () => undefined as never,
        deleteEntry: async () => undefined as never,
      },
      {
        getConnectionForInference: async () => ({ connection, apiKey: undefined }),
        isModelVisible: async () => true,
      },
      queue,
      () => 1,
      requestInference,
      undefined,
      new ToolRegistry([] as RegisteredTool[]),
      { getSettings: async () => ({ ...DEFAULT_DUCKDUCKGO_SETTINGS }) },
      undefined,
      lifecycleService,
    );

    return { db, agents, runs, project, agent, queue, service, lifecycleService };
  }

  it('does not attempt unload when unloadModelAfterRun is false', async () => {
    let discoveryCalled = false;
    globalThis.fetch = async (input: unknown) => {
      const url = getFetchUrl(input);
      if (url.includes('/api/v1/models')) {
        discoveryCalled = true;
      }
      throw new Error('should not reach here');
    };

    const context = setupWithLifecycle({ unloadModelAfterRun: false }, [{ type: 'message', content: 'done' }]);
    await context.service.start(context.project.id, context.agent.id, { task: 'Test' });
    await waitFor(() => context.service.latest(context.project.id, context.agent.id)?.status === 'done');

    assert.equal(discoveryCalled, false);
    await context.lifecycleService.close();
    context.db.close();
  });

  it('attempts unload after successful run when enabled', async () => {
    let discoveryCalled = false;
    let unloadCalled = false;
    globalThis.fetch = async (input: unknown) => {
      const url = getFetchUrl(input);
      if (url.endsWith('/api/v1/models')) {
        discoveryCalled = true;
        return new Response(
          JSON.stringify({
            models: [{ key: 'configured-model', loaded_instances: [{ id: 'instance-99' }] }],
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        );
      }
      if (url.endsWith('/api/v1/models/unload')) {
        unloadCalled = true;
        return new Response('', { status: 200 });
      }
      throw new Error('unexpected fetch');
    };

    const context = setupWithLifecycle({ unloadModelAfterRun: true }, [{ type: 'message', content: 'done' }]);
    await context.service.start(context.project.id, context.agent.id, { task: 'Test' });
    await waitFor(() => context.service.latest(context.project.id, context.agent.id)?.status === 'done');

    // Allow fire-and-forget unload to complete and emit events
    await new Promise<void>((resolve) => setTimeout(resolve, 100));

    assert.equal(discoveryCalled, true);
    assert.equal(unloadCalled, true);
    const events = context.runs.listEvents(1, context.project.id, context.agent.id, context.service.latest(context.project.id, context.agent.id)!.id)!;
    assert.ok(events.some((e) => e.eventType === 'model_unload_completed'));

    await context.lifecycleService.close();
    context.db.close();
  });

  it('attempts unload after cancelled run when enabled', async () => {
    let discoveryCalled = false;
    globalThis.fetch = async (input: unknown) => {
      const url = getFetchUrl(input);
      if (url.endsWith('/api/v1/models')) {
        discoveryCalled = true;
        return new Response(
          JSON.stringify({
            models: [{ key: 'configured-model', loaded_instances: [{ id: 'instance-99' }] }],
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        );
      }
      if (url.endsWith('/api/v1/models/unload')) {
        return new Response('', { status: 200 });
      }
      throw new Error('unexpected fetch');
    };

    const context = setupWithLifecycle({ unloadModelAfterRun: true }, [{ type: 'message', content: 'partial' }]);
    await context.service.start(context.project.id, context.agent.id, { task: 'Test' });
    await waitFor(() => context.service.latest(context.project.id, context.agent.id)?.status === 'running');
    context.service.cancel(context.project.id, context.agent.id, context.service.latest(context.project.id, context.agent.id)!.id);
    await waitFor(() => context.service.latest(context.project.id, context.agent.id)?.status === 'cancelled');

    // Allow fire-and-forget unload to complete
    await new Promise<void>((resolve) => setTimeout(resolve, 100));

    assert.equal(discoveryCalled, true);
    const events = context.runs.listEvents(1, context.project.id, context.agent.id, context.service.latest(context.project.id, context.agent.id)!.id)!;
    assert.ok(events.some((e) => e.eventType === 'model_unload_completed' || e.eventType === 'model_unload_skipped'));

    await context.lifecycleService.close();
    context.db.close();
  });

  it('attempts unload after error run when enabled', async () => {
    let discoveryCalled = false;
    globalThis.fetch = async (input: unknown) => {
      const url = getFetchUrl(input);
      if (url.endsWith('/api/v1/models')) {
        discoveryCalled = true;
        return new Response(
          JSON.stringify({
            models: [{ key: 'configured-model', loaded_instances: [{ id: 'instance-99' }] }],
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        );
      }
      if (url.endsWith('/api/v1/models/unload')) {
        return new Response('', { status: 500 });
      }
      throw new Error('unexpected fetch');
    };

    const context = setupWithLifecycle({ unloadModelAfterRun: true }, [
      { type: 'message', content: 'error response' },
    ]);
    await context.service.start(context.project.id, context.agent.id, { task: 'Test' });
    await waitFor(() => ['done', 'error'].includes(context.service.latest(context.project.id, context.agent.id)?.status ?? ''));

    // Allow fire-and-forget unload to complete
    await new Promise<void>((resolve) => setTimeout(resolve, 100));

    assert.equal(discoveryCalled, true);
    await context.lifecycleService.close();
    context.db.close();
  });

  it('successful run remains done after unload failure', async () => {
    globalThis.fetch = async (input: unknown) => {
      const url = getFetchUrl(input);
      if (url.endsWith('/api/v1/models')) {
        return new Response(
          JSON.stringify({
            models: [{ key: 'configured-model', loaded_instances: [{ id: 'instance-99' }] }],
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        );
      }
      if (url.endsWith('/api/v1/models/unload')) {
        return new Response('', { status: 500 });
      }
      throw new Error('unexpected fetch');
    };

    const context = setupWithLifecycle({ unloadModelAfterRun: true }, [{ type: 'message', content: 'done' }]);
    await context.service.start(context.project.id, context.agent.id, { task: 'Test' });
    await waitFor(() => context.service.latest(context.project.id, context.agent.id)?.status === 'done');

    // Allow fire-and-forget unload to complete and emit events
    await new Promise<void>((resolve) => setTimeout(resolve, 100));

    const run = context.service.latest(context.project.id, context.agent.id)!;
    assert.equal(run.status, 'done');
    const events = context.runs.listEvents(1, context.project.id, context.agent.id, run.id)!;
    assert.ok(events.some((e) => e.eventType === 'model_unload_skipped'));

    await context.lifecycleService.close();
    context.db.close();
  });

  it('cancelled run remains cancelled after unload failure', async () => {
    globalThis.fetch = async (input: unknown) => {
      const url = getFetchUrl(input);
      if (url.endsWith('/api/v1/models')) {
        return new Response(
          JSON.stringify({
            models: [{ key: 'configured-model', loaded_instances: [{ id: 'instance-99' }] }],
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        );
      }
      if (url.endsWith('/api/v1/models/unload')) {
        return new Response('', { status: 500 });
      }
      throw new Error('unexpected fetch');
    };

    const context = setupWithLifecycle({ unloadModelAfterRun: true }, [{ type: 'message', content: 'partial' }]);
    await context.service.start(context.project.id, context.agent.id, { task: 'Test' });
    await waitFor(() => context.service.latest(context.project.id, context.agent.id)?.status === 'running');
    context.service.cancel(context.project.id, context.agent.id, context.service.latest(context.project.id, context.agent.id)!.id);
    await waitFor(() => context.service.latest(context.project.id, context.agent.id)?.status === 'cancelled');

    // Allow fire-and-forget unload to complete
    await new Promise<void>((resolve) => setTimeout(resolve, 100));

    const run = context.service.latest(context.project.id, context.agent.id)!;
    assert.equal(run.status, 'cancelled');
    const events = context.runs.listEvents(1, context.project.id, context.agent.id, run.id)!;
    assert.ok(events.some((e) => e.eventType === 'model_unload_skipped'));

    await context.lifecycleService.close();
    context.db.close();
  });

  it('no unload occurs between multi-round tool inference calls', async () => {
    let discoveryCalls = 0;
    globalThis.fetch = async (input: unknown) => {
      const url = getFetchUrl(input);
      if (url.includes('/api/v1/models')) {
        discoveryCalls += 1;
      }
      throw new Error('should not reach here');
    };

    const context = setupWithLifecycle({ unloadModelAfterRun: true }, [
      { type: 'message', content: 'first round' },
      { type: 'message', content: 'second round' },
      { type: 'message', content: 'final' },
    ]);

    await context.service.start(context.project.id, context.agent.id, { task: 'Test' });
    await waitFor(() => ['done', 'error'].includes(context.service.latest(context.project.id, context.agent.id)?.status ?? ''));

    // Allow fire-and-forget unload to complete (should be exactly 1 post-run call)
    await new Promise<void>((resolve) => setTimeout(resolve, 100));
    assert.equal(discoveryCalls, 1);
    await context.lifecycleService.close();
    context.db.close();
  });

  it('operational events contain no secrets', async () => {
    globalThis.fetch = async (input: unknown) => {
      const url = getFetchUrl(input);
      if (url.endsWith('/api/v1/models')) {
        return new Response(
          JSON.stringify({
            models: [{ key: 'configured-model', loaded_instances: [{ id: 'instance-99' }] }],
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        );
      }
      if (url.endsWith('/api/v1/models/unload')) {
        return new Response('', { status: 200 });
      }
      throw new Error('unexpected fetch');
    };

    const context = setupWithLifecycle({ unloadModelAfterRun: true }, [{ type: 'message', content: 'done' }]);
    await context.service.start(context.project.id, context.agent.id, { task: 'Test' });
    await waitFor(() => context.service.latest(context.project.id, context.agent.id)?.status === 'done');

    // Allow fire-and-forget unload to complete and emit events
    await new Promise<void>((resolve) => setTimeout(resolve, 100));

    const run = context.service.latest(context.project.id, context.agent.id)!;
    const events = context.runs.listEvents(1, context.project.id, context.agent.id, run.id)!;
    for (const event of events) {
      const dataStr = JSON.stringify(event.data);
      assert.ok(!dataStr.includes('secret'), `Event ${event.eventType} should not contain secrets`);
      assert.ok(!dataStr.includes('Bearer'), `Event ${event.eventType} should not contain auth headers`);
    }

    await context.lifecycleService.close();
    context.db.close();
  });
});

async function waitFor(assertion: () => boolean): Promise<void> {
  for (let index = 0; index < 100; index += 1) {
    if (assertion()) return;
    await new Promise<void>((resolve) => setImmediate(resolve));
  }
  assert.fail('Timed out waiting for Agent run state');
}
