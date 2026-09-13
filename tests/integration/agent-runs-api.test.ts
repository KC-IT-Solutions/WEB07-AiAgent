import { after, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createServer, type Server, type ServerResponse } from 'node:http';

const __dirname = dirname(fileURLToPath(import.meta.url));
function findProjectRoot(startDir: string): string | null {
  let current = startDir;
  while (current !== dirname(current)) {
    if (existsSync(resolve(current, 'package.json'))) return current;
    current = dirname(current);
  }
  return null;
}

const projectRoot = findProjectRoot(__dirname);
assert.ok(projectRoot);
const testRoot = mkdtempSync(resolve(tmpdir(), 'web07-agent-runs-api-'));
process.env.DB_PATH = resolve(testRoot, 'test.db');
process.env.CHAT_HISTORY_PATH = resolve(testRoot, 'history');
process.env.SKILL_CONTENT_PATH = resolve(testRoot, 'skills');
process.env.PROJECTS_PATH = resolve(testRoot, 'projects');
process.env.LOG_DIRECTORY = resolve(testRoot, 'logs');
process.env.DEFAULT_USER_ID = '1';

interface ExpressLike {
  listen(port: number, callback: () => void): Server;
}

let appServer: Server | null = null;
let providerServer: Server | null = null;
let appUrl = '';
let providerUrl = '';
let projectId = 0;
let agentId = 0;
let connectionId = 0;
let providerMode: 'hold' | 'success' | 'error' | 'project-tools' | 'reasoning' = 'hold';
let inferenceRequestCount = 0;
let projectToolRound = 0;
const projectToolRequests: unknown[] = [];
const heldResponses: ServerResponse[] = [];

async function jsonRequest(path: string, method: string, body?: unknown): Promise<Response> {
  return fetch(`${appUrl}${path}`, {
    method,
    ...(body === undefined
      ? {}
      : { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }),
  });
}

async function waitForStatus(
  runId: number,
  status: string,
  targetAgentId = agentId,
): Promise<Record<string, unknown>> {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    const response = await fetch(
      `${appUrl}/api/projects/${projectId}/agents/${targetAgentId}/runs/${runId}`,
    );
    if (response.ok) {
      const run = (await response.json()) as Record<string, unknown>;
      if (run.status === status) return run;
    }
    await new Promise<void>((resolve) => setTimeout(resolve, 10));
  }
  assert.fail(`Timed out waiting for ${status}`);
}

async function waitForHeldProviderRequest(): Promise<void> {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    if (heldResponses.length > 0) return;
    await new Promise<void>((resolve) => setTimeout(resolve, 10));
  }
  assert.fail('Timed out waiting for provider request');
}

function releaseHeld(result = 'Provider result'): void {
  for (const response of heldResponses.splice(0)) {
    response.writeHead(200, { 'Content-Type': 'text/event-stream' });
    response.end(`data: ${JSON.stringify({ choices: [{ delta: { content: result } }] })}\n\ndata: {"choices":[{"delta":{},"finish_reason":"stop"}]}\n\ndata: [DONE]\n\n`);
  }
}

function sseResponse(content: string, reasoningContent?: string): string {
  const parts = [JSON.stringify({ choices: [{ delta: { content } }] })];
  if (reasoningContent) {
    parts.unshift(JSON.stringify({ choices: [{ delta: { reasoning_content: reasoningContent } }] }));
  }
  return `data: ${parts.join('\ndata: ')}\n\ndata: {"choices":[{"delta":{},"finish_reason":"stop"}]}\n\ndata: [DONE]\n\n`;
}

function sseToolCallResponse(toolCallId: string, fnName: string, fnArgs: string): string {
  const tc: Record<string, unknown> = { index: 0, id: toolCallId, type: 'function' };
  const fnObj: Record<string, string> = { name: fnName };
  fnObj.arguments = fnArgs;
  (tc as Record<string, unknown>)['function'] = fnObj;
  const deltaObj: Record<string, unknown> = { tool_calls: [tc] };
  const choiceObj: Record<string, unknown> = { delta: deltaObj };
  const payloadObj: Record<string, unknown> = { choices: [choiceObj] };
  const payload = JSON.stringify(payloadObj);
  return `data: ${payload}\n\ndata: {"choices":[{"delta":{},"finish_reason":"tool_calls"}]}\n\ndata: [DONE]\n\n`;
}

await describe('Agent run API', () => {
  before(async () => {
    providerServer = createServer(async (request, response) => {
      if (request.url === '/v1/models') {
        response.writeHead(200, { 'Content-Type': 'application/json' });
        response.end(JSON.stringify({ data: [{ id: 'model-a' }, { id: 'model-hidden' }] }));
        return;
      }
      inferenceRequestCount += 1;
      if (providerMode === 'hold') {
        heldResponses.push(response);
        return;
      }
      if (providerMode === 'error') {
        response.writeHead(500, { 'Content-Type': 'application/json' });
        response.end('{}');
        return;
      }
      if (providerMode === 'reasoning') {
        response.writeHead(200, { 'Content-Type': 'text/event-stream' });
        response.end(sseResponse('Reasoned result', 'Provider supplied diagnostic reasoning'));
        return;
      }
      if (providerMode === 'project-tools') {
        const chunks: Buffer[] = [];
        for await (const chunk of request) chunks.push(Buffer.from(chunk));
        projectToolRequests.push(JSON.parse(Buffer.concat(chunks).toString('utf8')) as unknown);
        projectToolRound += 1;
        if (projectToolRound <= 2) {
          const tcId = projectToolRound === 1 ? 'api-read-1' : 'api-write-1';
          const fnName = projectToolRound === 1 ? 'project_read_file' : 'project_write_file';
          const fnArgs = projectToolRound === 1 ? JSON.stringify({ path: 'input.txt' }) : JSON.stringify({ path: 'output.txt', content: 'created by Agent' });
          response.writeHead(200, { 'Content-Type': 'text/event-stream' });
          response.end(sseToolCallResponse(tcId, fnName, fnArgs));
          return;
        }
        response.writeHead(200, { 'Content-Type': 'text/event-stream' });
        response.end(sseResponse('Project tools completed'));
        return;
      }
      response.writeHead(200, { 'Content-Type': 'text/event-stream' });
      response.end(sseResponse('Done'));
    });
    await new Promise<void>((resolveListening) => {
      providerServer!.listen(0, '127.0.0.1', () => {
        const address = providerServer!.address();
        assert.ok(address && typeof address !== 'string');
        providerUrl = `http://127.0.0.1:${address.port}`;
        resolveListening();
      });
    });

    const module = await import(pathToFileURL(resolve(projectRoot, 'dist/server.js')).href);
    await new Promise<void>((resolveListening) => {
      appServer = (module.default as ExpressLike).listen(0, () => {
        const address = appServer!.address();
        assert.ok(address && typeof address !== 'string');
        appUrl = `http://127.0.0.1:${address.port}`;
        resolveListening();
      });
    });
    const project = await jsonRequest('/api/projects', 'POST', { name: 'Runs', description: '' });
    projectId = ((await project.json()) as { id: number }).id;
    const connection = await jsonRequest('/api/model-connections', 'POST', {
      name: 'Stub',
      baseUrl: providerUrl,
      timeoutMinutes: 1,
      modelId: 'model-a',
      enabled: true,
    });
    connectionId = ((await connection.json()) as { id: number }).id;
    const agent = await jsonRequest(`/api/projects/${projectId}/agents`, 'POST', {
      name: 'Runner',
      description: '',
      instructions: 'Return a final response.',
      assignment: 'Run the saved assignment',
      modelConnectionId: connectionId,
      modelId: 'model-a',
      allowModelSelection: false,
      triggerNextAgent: false,
      nextAgentId: null,
      saveResultToFile: false,
      resultDirectory: '',
      resultFilename: '',
      projectFilesystemPermissions: {
        list: true,
        read: true,
        write: true,
        createDirectory: false,
        rename: false,
        delete: false,
      },
      skillIds: [],
      toolNames: [],
    });
    agentId = ((await agent.json()) as { id: number }).id;
  });

  after(async () => {
    releaseHeld();
    if (appServer) await new Promise<void>((resolveClosed) => appServer!.close(() => resolveClosed()));
    if (providerServer) {
      await new Promise<void>((resolveClosed) => providerServer!.close(() => resolveClosed()));
    }
  });

  it('creates, scopes, pauses, resumes, cancels, and reads safe persistent runs and logs', async () => {
    const unassignedAgentResponse = await jsonRequest(`/api/projects/${projectId}/agents`, 'POST', {
      name: 'Unassigned runner',
      description: '',
      instructions: 'Return a final response.',
      assignment: '',
      modelConnectionId: connectionId,
      modelId: 'model-a',
      allowModelSelection: false,
      triggerNextAgent: false,
      nextAgentId: null,
      saveResultToFile: false,
      resultDirectory: '',
      resultFilename: '',
      skillIds: [],
      toolNames: [],
    });
    const unassignedAgentId = ((await unassignedAgentResponse.json()) as { id: number }).id;
    const empty = await jsonRequest(
      `/api/projects/${projectId}/agents/${unassignedAgentId}/runs`,
      'POST',
    );
    assert.equal(empty.status, 400);
    const startedResponse = await jsonRequest(
      `/api/projects/${projectId}/agents/${agentId}/runs`,
      'POST',
      { task: 'Client override attempt' },
    );
    assert.equal(startedResponse.status, 201);
    const started = (await startedResponse.json()) as Record<string, unknown>;
    const runId = started.id as number;
    assert.equal(started.status, 'running');
    assert.equal(started.task, 'Run the saved assignment');
    const duplicate = await jsonRequest(
      `/api/projects/${projectId}/agents/${agentId}/runs`,
      'POST',
      { task: 'Duplicate' },
    );
    assert.equal(duplicate.status, 409);

    const pause = await jsonRequest(
      `/api/projects/${projectId}/agents/${agentId}/runs/${runId}/pause`,
      'POST',
    );
    assert.equal(pause.status, 200);
    await waitForHeldProviderRequest();
    releaseHeld('Completed provider request before pause');
    await waitForStatus(runId, 'paused');
    const resume = await jsonRequest(
      `/api/projects/${projectId}/agents/${agentId}/runs/${runId}/resume`,
      'POST',
    );
    assert.equal(resume.status, 200);
    assert.equal(((await resume.json()) as { status: string }).status, 'running');
    await waitForStatus(runId, 'done');

    providerMode = 'hold';
    const cancellable = await jsonRequest(
      `/api/projects/${projectId}/agents/${agentId}/runs`,
      'POST',
      { task: 'Cancel this run' },
    );
    const cancellableId = ((await cancellable.json()) as { id: number }).id;
    const cancel = await jsonRequest(
      `/api/projects/${projectId}/agents/${agentId}/runs/${cancellableId}/cancel`,
      'POST',
    );
    assert.equal(cancel.status, 200);
    assert.equal(((await cancel.json()) as { status: string }).status, 'cancelled');
    assert.equal(
      (await fetch(`${appUrl}/api/projects/${projectId}/agents/${agentId}/runs/latest`)).status,
      200,
    );
    const eventsResponse = await fetch(
      `${appUrl}/api/projects/${projectId}/agents/${agentId}/runs/${runId}/events`,
    );
    assert.equal(eventsResponse.status, 200);
    const eventTypes = ((await eventsResponse.json()) as Array<{ eventType: string }>).map(
      (event) => event.eventType,
    );
    for (const required of ['run_started', 'pause_requested', 'paused', 'resumed', 'run_completed']) {
      assert.ok(eventTypes.includes(required));
    }
    assert.ok(!JSON.stringify(eventTypes).includes('reasoning'));
    const cancelEvents = (await (
      await fetch(
        `${appUrl}/api/projects/${projectId}/agents/${agentId}/runs/${cancellableId}/events`,
      )
    ).json()) as Array<{ eventType: string }>;
    assert.ok(cancelEvents.some((event) => event.eventType === 'cancelled'));
  });

  it('executes multiple Project filesystem tool rounds and returns operational events', async () => {
    const input = await jsonRequest(`/api/projects/${projectId}/file`, 'PUT', {
      path: 'input.txt',
      content: 'Project input',
    });
    assert.equal(input.status, 200);
    projectToolRound = 0;
    projectToolRequests.length = 0;
    providerMode = 'project-tools';
    const started = await jsonRequest(
      `/api/projects/${projectId}/agents/${agentId}/runs`,
      'POST',
      { task: 'Read input.txt and write output.txt' },
    );
    assert.equal(started.status, 201);
    const runId = ((await started.json()) as { id: number }).id;
    const completed = await waitForStatus(runId, 'done');
    assert.equal(completed.finalResult, 'Project tools completed');
    assert.equal(projectToolRequests.length, 3);
    const secondRequest = projectToolRequests[1] as { messages?: Array<Record<string, unknown>> };
    assert.equal(secondRequest.messages?.[secondRequest.messages.length - 1]?.role, 'tool');
    const thirdRequest = projectToolRequests[2] as { messages?: Array<Record<string, unknown>> };
    assert.deepEqual(thirdRequest.messages?.slice(-2).map((message) => message.role), [
      'assistant',
      'tool',
    ]);

    const output = await fetch(`${appUrl}/api/projects/${projectId}/file?path=output.txt`);
    assert.equal(output.status, 200);
    assert.equal(((await output.json()) as { content: string }).content, 'created by Agent');
    const events = (await (
      await fetch(`${appUrl}/api/projects/${projectId}/agents/${agentId}/runs/${runId}/events`)
    ).json()) as Array<{ eventType: string; data: { toolName?: string } }>;
    assert.equal(events.filter((event) => event.eventType === 'tool_call_started').length, 2);
    assert.ok(
      events.some(
        (event) =>
          event.eventType === 'tool_call_completed' && event.data.toolName === 'project_write_file',
      ),
    );
    const serialized = JSON.stringify({ requests: projectToolRequests, events });
    assert.equal(serialized.includes(testRoot), false);
    assert.equal(serialized.includes('apiKey'), false);
    assert.equal(serialized.includes('reasoning_content'), false);
    providerMode = 'success';
  });

  it('returns the owned latest run execution separately from operational logs', async () => {
    providerMode = 'reasoning';
    const started = await jsonRequest(
      `/api/projects/${projectId}/agents/${agentId}/runs`,
      'POST',
      { task: 'Show this task in execution' },
    );
    const runId = ((await started.json()) as { id: number }).id;
    await waitForStatus(runId, 'done');
    const executionPath = `/api/projects/${projectId}/agents/${agentId}/runs/${runId}/execution`;
    const executionResponse = await fetch(`${appUrl}${executionPath}`);
    assert.equal(executionResponse.status, 200);
    const execution = (await executionResponse.json()) as Array<{
      eventType: string;
      data: { content?: string };
    }>;
    assert.deepEqual(
      execution.map((event) => event.eventType),
      ['user_task', 'reasoning', 'final_result'],
    );
    assert.equal(execution[0]?.data.content, 'Run the saved assignment');
    assert.equal(execution[1]?.data.content, 'Provider supplied diagnostic reasoning');
    assert.equal(execution[2]?.data.content, 'Reasoned result');
    const operational = (await (
      await fetch(`${appUrl}/api/projects/${projectId}/agents/${agentId}/runs/${runId}/events`)
    ).json()) as Array<{ eventType: string }>;
    assert.equal(operational.some((event) => event.eventType === 'reasoning'), false);
    process.env.DEFAULT_USER_ID = '2';
    try {
      assert.equal((await fetch(`${appUrl}${executionPath}`)).status, 404);
    } finally {
      process.env.DEFAULT_USER_ID = '1';
    }
    providerMode = 'success';
  });

  it('fails a newly hidden persisted Agent model before provider inference without fallback', async () => {
    const visibilityEndpoint = `/api/admin/model-connections/${connectionId}/model-visibility`;
    const beforeRequests = inferenceRequestCount;
    try {
      const hidden = await jsonRequest(visibilityEndpoint, 'PUT', {
        filterConfigured: true,
        visibleModelIds: ['model-hidden'],
      });
      assert.equal(hidden.status, 200);
      const started = await jsonRequest(
        `/api/projects/${projectId}/agents/${agentId}/runs`,
        'POST',
        { task: 'Must not reach provider' },
      );
      assert.equal(started.status, 201);
      const runId = ((await started.json()) as { id: number }).id;
      const failed = await waitForStatus(runId, 'error');
      assert.deepEqual(failed.safeError, {
        stage: 'model_configuration',
        code: 'MODEL_NOT_ALLOWED',
        message: 'The configured model is not allowed for this connection.',
      });
      assert.equal(inferenceRequestCount, beforeRequests);
      const persistedAgent = (await (
        await fetch(`${appUrl}/api/projects/${projectId}/agents/${agentId}`)
      ).json()) as { modelId: string };
      assert.equal(persistedAgent.modelId, 'model-a');
    } finally {
      await jsonRequest(visibilityEndpoint, 'PUT', {
        filterConfigured: false,
        visibleModelIds: [],
      });
    }
  });

  it('completes normally, exposes safe errors historically, and blocks active deletion', async () => {
    providerMode = 'success';
    const success = await jsonRequest(`/api/projects/${projectId}/agents/${agentId}/runs`, 'POST', {
      task: 'Complete',
    });
    const successId = ((await success.json()) as { id: number }).id;
    const completed = await waitForStatus(successId, 'done');
    assert.equal(completed.finalResult, 'Done');
    assert.equal(completed.safeError, null);

    providerMode = 'error';
    const failed = await jsonRequest(`/api/projects/${projectId}/agents/${agentId}/runs`, 'POST', {
      task: 'Fail safely',
    });
    const failedId = ((await failed.json()) as { id: number }).id;
    const error = await waitForStatus(failedId, 'error');
    assert.deepEqual(error.safeError, {
      stage: 'provider_request',
      code: 'MODEL_SERVER_RESPONSE_ERROR',
      message: 'The model provider request failed.',
    });
    const errors = (await (
      await fetch(`${appUrl}/api/projects/${projectId}/agents/${agentId}/errors`)
    ).json()) as Array<Record<string, unknown>>;
    assert.equal(errors[0]?.runId, failedId);
    assert.ok(!errors.some((entry) => entry.runId === successId));
    const serialized = JSON.stringify(errors);
    for (const forbidden of ['apiKey', 'Authorization', testRoot, 'stack', 'reasoning']) {
      assert.ok(!serialized.includes(forbidden));
    }

    providerMode = 'hold';
    const active = await jsonRequest(`/api/projects/${projectId}/agents/${agentId}/runs`, 'POST', {
      task: 'Block delete',
    });
    const activeId = ((await active.json()) as { id: number }).id;
    assert.equal(
      (await fetch(`${appUrl}/api/projects/${projectId}/agents/${agentId}`, { method: 'DELETE' })).status,
      409,
    );
    const pause = await jsonRequest(
      `/api/projects/${projectId}/agents/${agentId}/runs/${activeId}/pause`,
      'POST',
    );
    assert.equal(pause.status, 200);
    await waitForHeldProviderRequest();
    releaseHeld('Completed provider request before paused delete check');
    await waitForStatus(activeId, 'paused');
    assert.equal(
      (await fetch(`${appUrl}/api/projects/${projectId}/agents/${agentId}`, { method: 'DELETE' })).status,
      409,
    );
    await jsonRequest(
      `/api/projects/${projectId}/agents/${agentId}/runs/${activeId}/cancel`,
      'POST',
    );
  });

  it('clears terminal runs and events without affecting active, unowned, or other-Agent history', async () => {
    const primaryLatest = (await (
      await fetch(`${appUrl}/api/projects/${projectId}/agents/${agentId}/runs/latest`)
    ).json()) as { id: number };
    const agentResponse = await jsonRequest(`/api/projects/${projectId}/agents`, 'POST', {
      name: 'Clearable runner',
      description: '',
      instructions: 'Return a final response.',
      assignment: 'Clear this history',
      modelConnectionId: connectionId,
      modelId: 'model-a',
      allowModelSelection: false,
      triggerNextAgent: false,
      nextAgentId: null,
      saveResultToFile: false,
      resultDirectory: '',
      resultFilename: '',
      skillIds: [],
      toolNames: [],
    });
    assert.equal(agentResponse.status, 201);
    const clearAgentId = ((await agentResponse.json()) as { id: number }).id;
    providerMode = 'success';
    const terminalResponse = await jsonRequest(
      `/api/projects/${projectId}/agents/${clearAgentId}/runs`,
      'POST',
      { task: 'Clear this history' },
    );
    const terminalId = ((await terminalResponse.json()) as { id: number }).id;
    await waitForStatus(terminalId, 'done', clearAgentId);
    const eventsPath = `/api/projects/${projectId}/agents/${clearAgentId}/runs/${terminalId}/events`;
    assert.equal((await fetch(`${appUrl}${eventsPath}`)).status, 200);

    const cleared = await jsonRequest(
      `/api/projects/${projectId}/agents/${clearAgentId}/runs`,
      'DELETE',
    );
    assert.equal(cleared.status, 200);
    assert.deepEqual(await cleared.json(), { deletedRuns: 1 });
    assert.equal(
      (
        await fetch(
          `${appUrl}/api/projects/${projectId}/agents/${clearAgentId}/runs/${terminalId}`,
        )
      ).status,
      404,
    );
    assert.equal((await fetch(`${appUrl}${eventsPath}`)).status, 404);
    assert.deepEqual(
      await (
        await jsonRequest(`/api/projects/${projectId}/agents/${clearAgentId}/runs`, 'DELETE')
      ).json(),
      { deletedRuns: 0 },
    );
    const primaryAfter = (await (
      await fetch(`${appUrl}/api/projects/${projectId}/agents/${agentId}/runs/latest`)
    ).json()) as { id: number };
    assert.equal(primaryAfter.id, primaryLatest.id);

    providerMode = 'hold';
    const activeResponse = await jsonRequest(
      `/api/projects/${projectId}/agents/${clearAgentId}/runs`,
      'POST',
      { task: 'Keep this active' },
    );
    const activeId = ((await activeResponse.json()) as { id: number }).id;
    assert.equal(
      (
        await jsonRequest(`/api/projects/${projectId}/agents/${clearAgentId}/runs`, 'DELETE')
      ).status,
      409,
    );
    process.env.DEFAULT_USER_ID = '2';
    try {
      assert.equal(
        (
          await jsonRequest(`/api/projects/${projectId}/agents/${clearAgentId}/runs`, 'DELETE')
        ).status,
        404,
      );
    } finally {
      process.env.DEFAULT_USER_ID = '1';
    }
    assert.equal(
      (
        await jsonRequest(
          `/api/projects/${projectId}/agents/${clearAgentId}/runs/${activeId}/cancel`,
          'POST',
        )
      ).status,
      200,
    );
    const clearedCancelled = await jsonRequest(
      `/api/projects/${projectId}/agents/${clearAgentId}/runs`,
      'DELETE',
    );
    assert.deepEqual(await clearedCancelled.json(), { deletedRuns: 1 });

    const raceAgentResponse = await jsonRequest(`/api/projects/${projectId}/agents`, 'POST', {
      name: 'Clear and start race runner',
      description: '',
      instructions: 'Return a final response.',
      assignment: 'Remain active after the race',
      modelConnectionId: connectionId,
      modelId: 'model-a',
      allowModelSelection: false,
      triggerNextAgent: false,
      nextAgentId: null,
      saveResultToFile: false,
      resultDirectory: '',
      resultFilename: '',
      skillIds: [],
      toolNames: [],
    });
    const raceAgentId = ((await raceAgentResponse.json()) as { id: number }).id;
    const [raceStart, raceClear] = await Promise.all([
      jsonRequest(`/api/projects/${projectId}/agents/${raceAgentId}/runs`, 'POST', {
        task: 'Remain active after the race',
      }),
      jsonRequest(`/api/projects/${projectId}/agents/${raceAgentId}/runs`, 'DELETE'),
    ]);
    assert.equal(raceStart.status, 201);
    assert.ok(raceClear.status === 200 || raceClear.status === 409);
    const raceRun = (await raceStart.json()) as { id: number };
    const raceLatest = (await (
      await fetch(`${appUrl}/api/projects/${projectId}/agents/${raceAgentId}/runs/latest`)
    ).json()) as { id: number; status: string };
    assert.equal(raceLatest.id, raceRun.id);
    assert.equal(raceLatest.status, 'running');
    assert.equal(
      (
        await jsonRequest(
          `/api/projects/${projectId}/agents/${raceAgentId}/runs/${raceRun.id}/cancel`,
          'POST',
        )
      ).status,
      200,
    );
  });

  it('enforces current-user ownership on every run endpoint', async () => {
    process.env.DEFAULT_USER_ID = '2';
    try {
      const base = `/api/projects/${projectId}/agents/${agentId}`;
      assert.equal((await jsonRequest(`${base}/runs`, 'POST', { task: 'Forbidden' })).status, 404);
      assert.equal((await fetch(`${appUrl}${base}/runs/latest`)).status, 404);
      assert.equal((await fetch(`${appUrl}${base}/runs/1`)).status, 404);
      assert.equal((await fetch(`${appUrl}${base}/runs/1/events`)).status, 404);
      assert.equal((await fetch(`${appUrl}${base}/runs/1/execution`)).status, 404);
      assert.equal((await fetch(`${appUrl}${base}/errors`)).status, 404);
      assert.equal((await jsonRequest(`${base}/runs`, 'DELETE')).status, 404);
      for (const action of ['pause', 'resume', 'cancel']) {
        assert.equal((await jsonRequest(`${base}/runs/1/${action}`, 'POST')).status, 404);
      }
    } finally {
      process.env.DEFAULT_USER_ID = '1';
    }
  });
});
