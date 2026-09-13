import { after, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createServer, type Server } from 'node:http';

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
const testRoot = mkdtempSync(resolve(tmpdir(), 'web07-agents-api-'));
process.env.DB_PATH = resolve(testRoot, 'test.db');
process.env.CHAT_HISTORY_PATH = resolve(testRoot, 'history');
process.env.SKILL_CONTENT_PATH = resolve(testRoot, 'skills');
process.env.PROJECTS_PATH = resolve(testRoot, 'projects');
process.env.LOG_DIRECTORY = resolve(testRoot, 'logs');
process.env.DEFAULT_USER_ID = '1';

interface ExpressLike { listen(port: number, callback: () => void): Server }
let server: Server | null = null;
let modelServer: Server | null = null;
let appUrl = '';
let modelUrl = '';
let projectId = 0;
let connectionId = 0;
let skillId = 0;

async function jsonRequest(path: string, method: string, body: unknown): Promise<Response> {
  return fetch(`${appUrl}${path}`, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

const agentInput = () => ({
  name: 'Backend Developer',
  description: 'Backend owner',
  instructions: 'Inspect files before changes.',
  assignmentSource: 'inline',
  assignment: 'Implement the backend change.',
  assignmentFilePath: 'tasks/inactive.md',
  modelConnectionId: connectionId,
  modelId: 'model-a',
  allowModelSelection: false,
  triggerNextAgent: false,
  nextAgentId: null,
  saveResultToFile: false,
  resultDirectory: '',
  resultFilename: '',
  skillIds: [skillId],
  toolNames: ['visit_website'],
});

await describe('Project Agents API', () => {
  before(async () => {
    modelServer = createServer((_request, response) => {
      response.writeHead(200, { 'Content-Type': 'application/json' });
      response.end(JSON.stringify({ data: [{ id: 'model-a' }, { id: 'model-hidden' }] }));
    });
    await new Promise<void>((resolveListening) => modelServer!.listen(0, '127.0.0.1', resolveListening));
    const modelAddress = modelServer.address();
    assert.ok(modelAddress && typeof modelAddress !== 'string');
    modelUrl = `http://127.0.0.1:${modelAddress.port}`;
    const module = await import(pathToFileURL(resolve(projectRoot, 'dist/server.js')).href);
    await new Promise<void>((resolveListening, rejectListening) => {
      const started = (module.default as ExpressLike).listen(0, () => {
        const address = started.address();
        if (!address || typeof address === 'string') return rejectListening(new Error('No address'));
        appUrl = `http://127.0.0.1:${address.port}`;
        resolveListening();
      });
      server = started;
    });
    const project = await jsonRequest('/api/projects', 'POST', { name: 'Agents', description: '' });
    projectId = ((await project.json()) as { id: number }).id;
    const connection = await jsonRequest('/api/model-connections', 'POST', {
      name: 'Local',
      baseUrl: modelUrl,
      modelId: 'model-a',
      enabled: true,
    });
    connectionId = ((await connection.json()) as { id: number }).id;
    const skill = await jsonRequest('/api/admin/skills', 'POST', {
      name: 'Reviewer',
      commandName: 'agent-reviewer',
      markdown: '# Review',
      requiredTools: [],
    });
    skillId = ((await skill.json()) as { id: number }).id;
  });

  after(async () => {
    if (server) await new Promise<void>((resolveClosed) => server!.close(() => resolveClosed()));
    if (modelServer) {
      await new Promise<void>((resolveClosed) => modelServer!.close(() => resolveClosed()));
    }
  });

  it('creates, lists, gets, updates, and deletes a safe Project-scoped Agent DTO', async () => {
    const createdResponse = await jsonRequest(`/api/projects/${projectId}/agents`, 'POST', agentInput());
    assert.equal(createdResponse.status, 201);
    const created = (await createdResponse.json()) as Record<string, unknown>;
    assert.equal(created.projectId, projectId);
    assert.equal(created.instructionSource, 'none');
    assert.equal(created.instructions, 'Inspect files before changes.');
    assert.equal(created.instructionFilePath, '');
    assert.equal(created.assignmentSource, 'inline');
    assert.equal(created.assignment, 'Implement the backend change.');
    assert.equal(created.assignmentFilePath, 'tasks/inactive.md');
    assert.equal(created.modelConnectionId, connectionId);
    assert.equal(created.modelId, 'model-a');
    assert.equal(created.allowModelSelection, false);
    assert.equal(created.triggerNextAgent, false);
    assert.equal(created.nextAgentId, null);
    assert.equal(created.saveResultToFile, false);
    assert.equal(created.resultDirectory, '');
    assert.equal(created.resultFilename, '');
    assert.deepEqual(created.skillIds, [skillId]);
    assert.deepEqual(created.toolNames, ['visit_website']);
    const serialized = JSON.stringify(created);
    for (const forbidden of ['apiKey', 'baseUrl', 'filesystem', testRoot]) assert.ok(!serialized.includes(forbidden));
    const agentId = created.id as number;
    const list = await fetch(`${appUrl}/api/projects/${projectId}/agents`);
    assert.equal(list.status, 200);
    assert.ok(((await list.json()) as Array<{ id: number }>).some((agent) => agent.id === agentId));
    assert.equal((await fetch(`${appUrl}/api/projects/${projectId}/agents/${agentId}`)).status, 200);
    const updatedResponse = await jsonRequest(`/api/projects/${projectId}/agents/${agentId}`, 'PUT', {
      ...agentInput(),
      name: 'Planner',
      allowModelSelection: true,
      assignmentSource: 'file',
      assignmentFilePath: 'tasks/current.txt',
      skillIds: [],
      toolNames: ['duckduckgo_search'],
    });
    assert.equal(updatedResponse.status, 200);
    const updated = (await updatedResponse.json()) as Record<string, unknown>;
    assert.equal(updated.name, 'Planner');
    assert.equal(updated.allowModelSelection, true);
    assert.equal(updated.assignmentSource, 'file');
    assert.equal(updated.assignment, 'Implement the backend change.');
    assert.equal(updated.assignmentFilePath, 'tasks/current.txt');
    assert.deepEqual(updated.skillIds, []);
    assert.deepEqual(updated.toolNames, ['duckduckgo_search']);
    assert.equal((await fetch(`${appUrl}/api/projects/${projectId}/agents/${agentId}`, { method: 'DELETE' })).status, 204);
    assert.equal((await fetch(`${appUrl}/api/projects/${projectId}/agents/${agentId}`)).status, 404);
  });

  it('round-trips a pre-run-only tool configuration without granting model access', async () => {
    const payload = {
      ...agentInput(),
      name: 'Pre-run only',
      skillIds: [],
      toolNames: [],
      toolConfigurations: [
        { toolName: 'visit_website', preRunInputFile: 'tool-pre-runs/visits.json' },
      ],
    };
    const response = await jsonRequest(`/api/projects/${projectId}/agents`, 'POST', payload);
    assert.equal(response.status, 201);
    const created = (await response.json()) as {
      id: number;
      toolNames: string[];
      toolConfigurations: Array<{ toolName: string; preRunInputFile: string | null }>;
    };
    assert.deepEqual(created.toolNames, []);
    assert.deepEqual(created.toolConfigurations, payload.toolConfigurations);
    const restored = (await (
      await fetch(`${appUrl}/api/projects/${projectId}/agents/${created.id}`)
    ).json()) as typeof created;
    assert.deepEqual(restored.toolNames, []);
    assert.deepEqual(restored.toolConfigurations, payload.toolConfigurations);
  });

  it('copies an Agent through the Project-scoped POST endpoint and returns the persisted copy', async () => {
    const sourceResponse = await jsonRequest(`/api/projects/${projectId}/agents`, 'POST', {
      ...agentInput(),
      name: 'API copy source',
      instructionSource: 'inline',
      attachedProjectFiles: ['context/api.md'],
      projectFilesystemPermissions: {
        list: true,
        read: true,
        write: true,
        createDirectory: false,
        rename: false,
        delete: false,
      },
      toolConfigurations: [
        { toolName: 'visit_website', preRunInputFile: 'inputs/api.json' },
      ],
    });
    assert.equal(sourceResponse.status, 201);
    const source = (await sourceResponse.json()) as Record<string, unknown>;
    const copyResponse = await fetch(
      `${appUrl}/api/projects/${projectId}/agents/${String(source.id)}/copy`,
      { method: 'POST' },
    );
    assert.equal(copyResponse.status, 201);
    const copied = (await copyResponse.json()) as Record<string, unknown>;
    assert.notEqual(copied.id, source.id);
    assert.equal(copied.projectId, projectId);
    assert.equal(copied.name, 'API copy source copy');
    assert.equal(copied.description, source.description);
    assert.equal(copied.instructionSource, source.instructionSource);
    assert.deepEqual(copied.attachedProjectFiles, source.attachedProjectFiles);
    assert.deepEqual(copied.projectFilesystemPermissions, source.projectFilesystemPermissions);
    assert.deepEqual(copied.skillIds, source.skillIds);
    assert.deepEqual(copied.toolNames, source.toolNames);
    assert.deepEqual(copied.toolConfigurations, source.toolConfigurations);
    assert.equal(copied.triggerNextAgent, false);
    assert.equal(copied.nextAgentId, null);

    const persisted = (await (
      await fetch(`${appUrl}/api/projects/${projectId}/agents/${String(copied.id)}`)
    ).json()) as Record<string, unknown>;
    assert.deepEqual(persisted, copied);
    const otherProjectResponse = await jsonRequest('/api/projects', 'POST', {
      name: 'Copy isolation Project',
      description: '',
    });
    const otherProjectId = ((await otherProjectResponse.json()) as { id: number }).id;
    assert.equal(
      (
        await fetch(
          `${appUrl}/api/projects/${otherProjectId}/agents/${String(source.id)}/copy`,
          { method: 'POST' },
        )
      ).status,
      404,
    );
    assert.equal(
      (
        await fetch(`${appUrl}/api/projects/${projectId}/agents/1000000000/copy`, {
          method: 'POST',
        })
      ).status,
      404,
    );
  });

  it('rejects hidden models for Agent create and update without rewriting existing configuration', async () => {
    const createdResponse = await jsonRequest(`/api/projects/${projectId}/agents`, 'POST', {
      ...agentInput(),
      name: 'Visibility target',
      skillIds: [],
      toolNames: [],
    });
    assert.equal(createdResponse.status, 201);
    const created = (await createdResponse.json()) as { id: number; modelId: string };
    const visibilityEndpoint = `/api/admin/model-connections/${connectionId}/model-visibility`;
    try {
      const hidden = await jsonRequest(visibilityEndpoint, 'PUT', {
        filterConfigured: true,
        visibleModelIds: ['model-hidden'],
      });
      assert.equal(hidden.status, 200);
      assert.deepEqual(
        await (await fetch(`${appUrl}/api/model-connections/${connectionId}/models`)).json(),
        { models: [{ id: 'model-hidden', description: null }] },
      );

      const bypass = await jsonRequest(`/api/projects/${projectId}/agents`, 'POST', {
        ...agentInput(),
        name: 'Bypass attempt',
        skillIds: [],
        toolNames: [],
      });
      assert.equal(bypass.status, 400);
      assert.deepEqual(await bypass.json(), { error: 'MODEL_NOT_ALLOWED' });

      const update = await jsonRequest(
        `/api/projects/${projectId}/agents/${created.id}`,
        'PUT',
        {
          ...agentInput(),
          name: 'Must not persist',
          skillIds: [],
          toolNames: [],
        },
      );
      assert.equal(update.status, 400);
      const persisted = (await (
        await fetch(`${appUrl}/api/projects/${projectId}/agents/${created.id}`)
      ).json()) as { name: string; modelId: string };
      assert.equal(persisted.name, 'Visibility target');
      assert.equal(persisted.modelId, 'model-a');
    } finally {
      await jsonRequest(visibilityEndpoint, 'PUT', {
        filterConfigured: false,
        visibleModelIds: [],
      });
    }
  });

  it('persists safe instruction file settings and rejects unsafe manual API paths', async () => {
    for (const instructionFilePath of ['AGENT.md', 'docs/backend.txt']) {
      const response = await jsonRequest(`/api/projects/${projectId}/agents`, 'POST', {
        ...agentInput(),
        name: instructionFilePath,
        instructionSource: 'file',
        instructionFilePath,
        skillIds: [],
        toolNames: [],
      });
      assert.equal(response.status, 201);
      const created = (await response.json()) as Record<string, unknown>;
      assert.equal(created.instructionSource, 'file');
      assert.equal(created.instructions, 'Inspect files before changes.');
      assert.equal(created.instructionFilePath, instructionFilePath);
      assert.ok(!JSON.stringify(created).includes(testRoot));
    }
    for (const instructionFilePath of [
      '',
      'config.json',
      '/absolute.md',
      'C:\\temp\\agent.txt',
      '../escape.md',
      'docs/../escape.txt',
      'docs\\agent.md',
      'docs//agent.md',
    ]) {
      const response = await jsonRequest(`/api/projects/${projectId}/agents`, 'POST', {
        ...agentInput(),
        instructionSource: 'file',
        instructionFilePath,
      });
      assert.equal(response.status, 400);
    }
    const inlineResponse = await jsonRequest(`/api/projects/${projectId}/agents`, 'POST', {
      ...agentInput(),
      instructionSource: 'inline',
      instructionFilePath: 'docs/inactive.md',
    });
    assert.equal(inlineResponse.status, 201);
    const inline = (await inlineResponse.json()) as Record<string, unknown>;
    assert.equal(inline.instructions, 'Inspect files before changes.');
    assert.equal(inline.instructionFilePath, 'docs/inactive.md');

    const noneResponse = await jsonRequest(`/api/projects/${projectId}/agents`, 'POST', {
      ...agentInput(),
      name: 'No instructions',
      instructionSource: 'none',
      instructions: 'Preserved inactive instructions.',
      instructionFilePath: 'missing/inactive.json',
      skillIds: [],
      toolNames: [],
    });
    assert.equal(noneResponse.status, 201);
    const none = (await noneResponse.json()) as Record<string, unknown>;
    assert.equal(none.instructionSource, 'none');
    assert.equal(none.instructions, 'Preserved inactive instructions.');
    assert.equal(none.instructionFilePath, 'missing/inactive.json');

    const updatedResponse = await jsonRequest(
      `/api/projects/${projectId}/agents/${String(none.id)}`,
      'PUT',
      {
        ...agentInput(),
        name: 'No instructions updated',
        instructionSource: 'none',
        instructions: 'Updated preserved instructions.',
        instructionFilePath: '../inactive.txt',
        skillIds: [],
        toolNames: [],
      },
    );
    assert.equal(updatedResponse.status, 200);
    const updated = (await updatedResponse.json()) as Record<string, unknown>;
    assert.equal(updated.instructionSource, 'none');
    assert.equal(updated.instructions, 'Updated preserved instructions.');
    assert.equal(updated.instructionFilePath, '../inactive.txt');

    for (const instructionSource of ['disabled', '', null, false]) {
      const response = await jsonRequest(`/api/projects/${projectId}/agents`, 'POST', {
        ...agentInput(),
        instructionSource,
      });
      assert.equal(response.status, 400);
      assert.deepEqual(await response.json(), { error: 'INVALID_INPUT' });
    }
  });

  it('round-trips task file settings and rejects invalid assignment sources and paths', async () => {
    for (const assignmentFilePath of ['TASK.md', 'tasks/backend.txt']) {
      const response = await jsonRequest(`/api/projects/${projectId}/agents`, 'POST', {
        ...agentInput(),
        name: `Task ${assignmentFilePath}`,
        assignmentSource: 'file',
        assignmentFilePath,
        skillIds: [],
        toolNames: [],
      });
      assert.equal(response.status, 201);
      const created = (await response.json()) as Record<string, unknown>;
      assert.equal(created.assignmentSource, 'file');
      assert.equal(created.assignment, 'Implement the backend change.');
      assert.equal(created.assignmentFilePath, assignmentFilePath);
    }
    for (const invalid of [
      { assignmentSource: 'unknown', assignmentFilePath: 'TASK.md' },
      { assignmentSource: 'file', assignmentFilePath: '/absolute.md' },
      { assignmentSource: 'file', assignmentFilePath: '../escape.md' },
      { assignmentSource: 'file', assignmentFilePath: 'tasks/task.json' },
    ]) {
      const response = await jsonRequest(`/api/projects/${projectId}/agents`, 'POST', {
        ...agentInput(),
        ...invalid,
      });
      assert.equal(response.status, 400);
      assert.deepEqual(await response.json(), { error: 'INVALID_INPUT' });
    }
  });

  it('persists safe chaining and result paths, rejects cycles and unsafe destinations, and cleans deletion references', async () => {
    const createAgent = async (name: string): Promise<Record<string, unknown>> => {
      const response = await jsonRequest(`/api/projects/${projectId}/agents`, 'POST', {
        ...agentInput(),
        name,
        skillIds: [],
        toolNames: [],
      });
      assert.equal(response.status, 201);
      return (await response.json()) as Record<string, unknown>;
    };
    const a = await createAgent('Chain A');
    const b = await createAgent('Chain B');
    const c = await createAgent('Chain C');
    const update = (id: number, nextAgentId: number | null, extra: Record<string, unknown> = {}) =>
      jsonRequest(`/api/projects/${projectId}/agents/${id}`, 'PUT', {
        ...agentInput(),
        name: `Agent ${id}`,
        skillIds: [],
        toolNames: [],
        triggerNextAgent: nextAgentId !== null,
        nextAgentId,
        ...extra,
      });
    assert.equal((await update(a.id as number, b.id as number)).status, 200);
    assert.equal((await update(b.id as number, c.id as number)).status, 200);
    assert.equal((await update(c.id as number, a.id as number)).status, 400);
    assert.equal((await update(a.id as number, a.id as number)).status, 400);

    for (const [directory, filename] of [
      ['', 'result.md'],
      ['reports', 'review.txt'],
      ['reports/daily', 'report.json'],
    ]) {
      assert.equal(
        (
          await update(c.id as number, null, {
            saveResultToFile: true,
            resultDirectory: directory,
            resultFilename: filename,
          })
        ).status,
        200,
      );
    }
    for (const [directory, filename] of [
      ['/absolute', 'result.md'],
      ['../escape', 'result.md'],
      ['reports/../escape', 'result.md'],
      ['reports\\daily', 'result.md'],
      ['reports', ''],
      ['reports', 'nested/result.md'],
      ['reports', 'nested\\result.md'],
    ]) {
      assert.equal(
        (
          await update(c.id as number, null, {
            saveResultToFile: true,
            resultDirectory: directory,
            resultFilename: filename,
          })
        ).status,
        400,
      );
    }
    const disabledResult = await update(c.id as number, null, {
      saveResultToFile: false,
      resultDirectory: '../inactive',
      resultFilename: '',
    });
    assert.equal(disabledResult.status, 200);
    const disabledAgent = (await disabledResult.json()) as Record<string, unknown>;
    assert.equal(disabledAgent.resultDirectory, '');
    assert.equal(disabledAgent.resultFilename, '');
    assert.equal(
      (await fetch(`${appUrl}/api/projects/${projectId}/agents/${b.id as number}`, { method: 'DELETE' }))
        .status,
      204,
    );
    const source = (await (
      await fetch(`${appUrl}/api/projects/${projectId}/agents/${a.id as number}`)
    ).json()) as Record<string, unknown>;
    assert.equal(source.triggerNextAgent, false);
    assert.equal(source.nextAgentId, null);
  });

  it('reorders the complete Agent list while preserving chaining and configuration', async () => {
    const targetResponse = await jsonRequest(`/api/projects/${projectId}/agents`, 'POST', {
      ...agentInput(),
      name: 'Order target',
    });
    assert.equal(targetResponse.status, 201);
    const target = (await targetResponse.json()) as Record<string, unknown>;
    const sourceResponse = await jsonRequest(`/api/projects/${projectId}/agents`, 'POST', {
      ...agentInput(),
      name: 'Order source',
      triggerNextAgent: true,
      nextAgentId: target.id,
    });
    assert.equal(sourceResponse.status, 201);
    const source = (await sourceResponse.json()) as Record<string, unknown>;
    const before = (await (
      await fetch(`${appUrl}/api/projects/${projectId}/agents`)
    ).json()) as Array<Record<string, unknown>>;
    const reversedIds = before.map((agent) => agent.id as number).reverse();

    const reorderedResponse = await jsonRequest(
      `/api/projects/${projectId}/agents/order`,
      'PUT',
      { agentIds: reversedIds },
    );
    assert.equal(reorderedResponse.status, 200);
    const reordered = (await reorderedResponse.json()) as Array<Record<string, unknown>>;
    assert.deepEqual(
      reordered.map((agent) => agent.id),
      reversedIds,
    );
    assert.deepEqual(
      reordered.map((agent) => agent.sortOrder),
      reversedIds.map((_, index) => index),
    );
    const persisted = (await (
      await fetch(`${appUrl}/api/projects/${projectId}/agents`)
    ).json()) as Array<Record<string, unknown>>;
    assert.deepEqual(
      persisted.map((agent) => agent.id),
      reversedIds,
    );
    const persistedSource = persisted.find((agent) => agent.id === source.id);
    assert.equal(persistedSource?.nextAgentId, target.id);
    assert.equal(persistedSource?.triggerNextAgent, true);
    assert.equal(persistedSource?.modelConnectionId, connectionId);
    assert.equal(persistedSource?.modelId, 'model-a');
    assert.deepEqual(persistedSource?.skillIds, [skillId]);
    assert.deepEqual(persistedSource?.toolNames, ['visit_website']);

    const duplicateIds = [...reversedIds];
    duplicateIds[duplicateIds.length - 1] = duplicateIds[0]!;
    assert.equal(
      (
        await jsonRequest(`/api/projects/${projectId}/agents/order`, 'PUT', {
          agentIds: duplicateIds,
        })
      ).status,
      400,
    );
    assert.equal(
      (
        await jsonRequest(`/api/projects/${projectId}/agents/order`, 'PUT', {
          agentIds: reversedIds.slice(1),
        })
      ).status,
      400,
    );
    const otherProjectResponse = await jsonRequest('/api/projects', 'POST', {
      name: 'Other order Project',
      description: '',
    });
    const otherProjectId = ((await otherProjectResponse.json()) as { id: number }).id;
    const foreignAgentResponse = await jsonRequest(
      `/api/projects/${otherProjectId}/agents`,
      'POST',
      { ...agentInput(), name: 'Foreign order Agent' },
    );
    const foreignAgentId = ((await foreignAgentResponse.json()) as { id: number }).id;
    for (const invalidId of [foreignAgentId, 1_000_000_000]) {
      const invalidIds = [...reversedIds];
      invalidIds[invalidIds.length - 1] = invalidId;
      assert.equal(
        (
          await jsonRequest(`/api/projects/${projectId}/agents/order`, 'PUT', {
            agentIds: invalidIds,
          })
        ).status,
        400,
      );
    }
    const unchanged = (await (
      await fetch(`${appUrl}/api/projects/${projectId}/agents`)
    ).json()) as Array<Record<string, unknown>>;
    assert.deepEqual(
      unchanged.map((agent) => agent.id),
      reversedIds,
    );
  });

  it('rejects invalid references, unknown fields, duplicate selections, and leaves global tools unchanged', async () => {
    const toolsBefore = await (await fetch(`${appUrl}/api/tools`)).text();
    const invalidInputs = [
      { ...agentInput(), modelConnectionId: 99999 },
      { ...agentInput(), skillIds: [99999] },
      { ...agentInput(), toolNames: ['unknown'] },
      { ...agentInput(), skillIds: [skillId, skillId] },
      { ...agentInput(), toolNames: ['visit_website', 'visit_website'] },
      {
        ...agentInput(),
        toolNames: [],
        toolConfigurations: [
          { toolName: 'visit_website', preRunInputFile: null },
          { toolName: 'visit_website', preRunInputFile: null },
        ],
      },
      {
        ...agentInput(),
        toolNames: [],
        toolConfigurations: [{ toolName: 'unknown', preRunInputFile: 'inputs/unknown.json' }],
      },
      { ...agentInput(), projectId },
      { ...agentInput(), apiKey: 'secret' },
      { ...agentInput(), filesystemRoot: testRoot },
    ];
    for (const input of invalidInputs) {
      const response = await jsonRequest(`/api/projects/${projectId}/agents`, 'POST', input);
      assert.equal(response.status, 400);
    }
    assert.equal(await (await fetch(`${appUrl}/api/tools`)).text(), toolsBefore);
  });

  it('makes every other-user Project and Agent operation inaccessible', async () => {
    const own = await jsonRequest(`/api/projects/${projectId}/agents`, 'POST', agentInput());
    const agentId = ((await own.json()) as { id: number }).id;
    process.env.DEFAULT_USER_ID = '2';
    try {
      assert.equal((await fetch(`${appUrl}/api/projects/${projectId}/agents`)).status, 404);
      assert.equal(
        (
          await jsonRequest(`/api/projects/${projectId}/agents/order`, 'PUT', {
            agentIds: [],
          })
        ).status,
        404,
      );
      assert.equal((await fetch(`${appUrl}/api/projects/${projectId}/agents/${agentId}`)).status, 404);
      assert.equal((await jsonRequest(`/api/projects/${projectId}/agents`, 'POST', agentInput())).status, 404);
      assert.equal((await jsonRequest(`/api/projects/${projectId}/agents/${agentId}`, 'PUT', agentInput())).status, 404);
      assert.equal((await fetch(`${appUrl}/api/projects/${projectId}/agents/${agentId}`, { method: 'DELETE' })).status, 404);
    } finally {
      process.env.DEFAULT_USER_ID = '1';
    }
  });

  it('lists safe Skills for Agent selection without granting Skill administration', async () => {
    process.env.DEFAULT_USER_ID = '2';
    try {
      const available = await fetch(`${appUrl}/api/skills`);
      assert.equal(available.status, 200);
      const skills = (await available.json()) as Array<Record<string, unknown>>;
      assert.deepEqual(skills.find((skill) => skill.id === skillId), {
        id: skillId,
        commandName: 'agent-reviewer',
        name: 'Reviewer',
      });
      assert.ok(!('markdown' in (skills[0] ?? {})));
      assert.equal((await fetch(`${appUrl}/api/admin/skills`)).status, 403);
    } finally {
      process.env.DEFAULT_USER_ID = '1';
    }
  });
});
