import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createTestDatabase } from '../../src/server/database.js';
import { AgentRepository } from '../../src/server/repositories/agent-repository.js';
import { AgentRunRepository } from '../../src/server/repositories/agent-run-repository.js';
import { ProjectRepository } from '../../src/server/repositories/project-repository.js';
import { AgentError, AgentService } from '../../src/server/services/agent-service.js';

const input = {
  name: ' Agent ',
  description: ' Description ',
  instructions: ' Follow the architecture. ',
  assignment: ' Implement the requested change. ',
  modelConnectionId: 9,
  modelId: ' model-a ',
  skillIds: [2, 1],
  toolNames: ['visit_website'],
};

function visibleConnection(id = 9) {
  return {
    id,
    userId: 1,
    createdAt: 1,
    updatedAt: 1,
    hasApiKey: false,
    data: {
      name: 'Local',
      baseUrl: 'http://model.test',
      timeoutMinutes: 1,
      modelId: null,
      enabled: true,
      filterConfigured: false,
      visibleModelIds: [],
      modelDescriptions: {},
    },
  };
}

await describe('AgentService', () => {
  it('defaults model selection off, validates references, toggles it, and preserves ownership', async () => {
    const db = createTestDatabase();
    const projects = new ProjectRepository(db);
    const project = projects.create(1, { name: 'Own', description: '' });
    const other = projects.create(2, { name: 'Other', description: '' });
    for (const [commandName, name] of [
      ['one', 'One'],
      ['two', 'Two'],
    ]) {
      db.prepare(
        'INSERT INTO skills (command_name, created_at, updated_at, data) VALUES (?, 1, 1, ?)',
      ).run(commandName, JSON.stringify({ name }));
    }
    let userId = 1;
    const service = new AgentService(
      new AgentRepository(db),
      projects,
      {
        getConnectionById: async (id) => (id === 9 ? visibleConnection() : null),
        isModelVisible: async (_id, modelId) => modelId === ' model-a ',
      },
      {
        listAvailable: async () => [
          { id: 1, commandName: 'one', name: 'One' },
          { id: 2, commandName: 'two', name: 'Two' },
        ],
      },
      { get: (name) => (name === 'visit_website' ? ({ name } as never) : null) },
      () => userId,
    );
    const created = await service.create(project.id, input);
    assert.ok(created);
    assert.equal(created.instructionSource, 'none');
    assert.equal(created.instructions, 'Follow the architecture.');
    assert.equal(created.instructionFilePath, '');
    assert.equal(created.assignmentSource, 'inline');
    assert.equal(created.assignment, 'Implement the requested change.');
    assert.equal(created.assignmentFilePath, '');
    assert.equal(created.allowModelSelection, false);
    assert.equal(created.triggerNextAgent, false);
    assert.equal(created.nextAgentId, null);
    assert.equal(created.saveResultToFile, false);
    assert.equal(created.resultDirectory, '');
    assert.equal(created.resultFilename, '');
    assert.equal(created.modelConnectionId, 9);
    assert.equal(created.modelId, ' model-a ');
    assert.deepEqual(created.skillIds, [1, 2]);
    const enabled = await service.update(project.id, created.id, {
      ...input,
      allowModelSelection: true,
      skillIds: [],
      toolNames: [],
    });
    assert.equal(enabled?.allowModelSelection, true);
    const disabled = await service.update(project.id, created.id, {
      ...input,
      allowModelSelection: false,
    });
    assert.equal(disabled?.allowModelSelection, false);
    userId = 2;
    assert.equal(await service.get(project.id, created.id), null);
    assert.equal(await service.list(project.id), null);
    assert.equal(await service.create(project.id, input), null);
    assert.deepEqual(await service.list(other.id), []);
    db.close();
  });

  it('rejects unknown connections, Skills, tools, duplicates, and ownership fields', async () => {
    const db = createTestDatabase();
    const projects = new ProjectRepository(db);
    const project = projects.create(1, { name: 'Project', description: '' });
    const service = new AgentService(
      new AgentRepository(db),
      projects,
      { getConnectionById: async () => null, isModelVisible: async () => false },
      { listAvailable: async () => [] },
      { get: () => null },
      () => 1,
    );
    await assert.rejects(service.create(project.id, input), (error: unknown) => error instanceof AgentError && error.code === 'UNKNOWN_TOOL');
    const knownToolsService = new AgentService(
      new AgentRepository(db),
      projects,
      { getConnectionById: async () => null, isModelVisible: async () => false },
      { listAvailable: async () => [] },
      { get: () => ({ name: 'visit_website' } as never) },
      () => 1,
    );
    await assert.rejects(knownToolsService.create(project.id, input), (error: unknown) => error instanceof AgentError && error.code === 'INVALID_MODEL_CONNECTION');
    for (const invalid of [
      { ...input, projectId: project.id },
      { ...input, apiKey: 'secret' },
      { ...input, baseUrl: 'http://untrusted' },
      { ...input, skillIds: [1, 1] },
      { ...input, toolNames: ['visit_website', 'visit_website'] },
    ]) {
      await assert.rejects(knownToolsService.create(project.id, invalid), AgentError);
    }
    db.close();
  });

  it('preserves both instruction inputs and validates active Project-relative instruction files', async () => {
    const db = createTestDatabase();
    const projects = new ProjectRepository(db);
    const project = projects.create(1, { name: 'Project', description: '' });
    const service = new AgentService(
      new AgentRepository(db),
      projects,
      { getConnectionById: async () => visibleConnection(), isModelVisible: async () => true },
      { listAvailable: async () => [] },
      { get: () => ({ name: 'visit_website' } as never) },
      () => 1,
    );
    const base = { ...input, skillIds: [], toolNames: [] };
    const inline = await service.create(project.id, {
      ...base,
      instructionSource: 'inline',
      instructionFilePath: 'docs/inactive.md',
    });
    assert.equal(inline?.instructions, 'Follow the architecture.');
    assert.equal(inline?.instructionFilePath, 'docs/inactive.md');

    const none = await service.create(project.id, {
      ...base,
      name: 'No agent instructions',
      instructionSource: 'none',
      instructions: 'Preserved inactive instructions.',
      instructionFilePath: 'missing/inactive.json',
    });
    assert.equal(none?.instructionSource, 'none');
    assert.equal(none?.instructions, 'Preserved inactive instructions.');
    assert.equal(none?.instructionFilePath, 'missing/inactive.json');

    for (const instructionFilePath of ['AGENT.md', 'docs/backend.txt', 'instructions/REVIEWER.MD']) {
      const fileAgent = await service.create(project.id, {
        ...base,
        name: instructionFilePath,
        instructionSource: 'file',
        instructionFilePath,
      });
      assert.equal(fileAgent?.instructionSource, 'file');
      assert.equal(fileAgent?.instructions, 'Follow the architecture.');
      assert.equal(fileAgent?.instructionFilePath, instructionFilePath);
    }

    for (const instructionFilePath of [
      '',
      'config.json',
      '/etc/agent.txt',
      'C:\\temp\\agent.md',
      '../outside.md',
      'docs/../outside.md',
      'docs\\mixed/agent.md',
      'docs//agent.md',
      'docs/%2e%2e/agent.md',
    ]) {
      await assert.rejects(
        service.create(project.id, {
          ...base,
          instructionSource: 'file',
          instructionFilePath,
        }),
        (error: unknown) => error instanceof AgentError && error.code === 'INVALID_INPUT',
      );
    }
    for (const instructionSource of ['unknown', '', null, false]) {
      await assert.rejects(
        service.create(project.id, { ...base, instructionSource }),
        (error: unknown) => error instanceof AgentError && error.code === 'INVALID_INPUT',
      );
    }
    db.close();
  });

  it('validates and round-trips inline and file assignment sources without clearing inactive values', async () => {
    const db = createTestDatabase();
    const projects = new ProjectRepository(db);
    const project = projects.create(1, { name: 'Project', description: '' });
    const service = new AgentService(
      new AgentRepository(db),
      projects,
      { getConnectionById: async () => visibleConnection(), isModelVisible: async () => true },
      { listAvailable: async () => [] },
      { get: () => ({ name: 'visit_website' } as never) },
      () => 1,
    );
    const base = { ...input, skillIds: [], toolNames: [] };
    const inline = await service.create(project.id, {
      ...base,
      assignmentSource: 'inline',
      assignmentFilePath: 'tasks/inactive.md',
    });
    assert.equal(inline?.assignmentSource, 'inline');
    assert.equal(inline?.assignment, 'Implement the requested change.');
    assert.equal(inline?.assignmentFilePath, 'tasks/inactive.md');

    for (const assignmentFilePath of ['TASK.md', 'tasks/backend.txt', 'tasks/REVIEW.MD']) {
      const fileAgent = await service.create(project.id, {
        ...base,
        name: assignmentFilePath,
        assignmentSource: 'file',
        assignmentFilePath,
      });
      assert.equal(fileAgent?.assignmentSource, 'file');
      assert.equal(fileAgent?.assignment, 'Implement the requested change.');
      assert.equal(fileAgent?.assignmentFilePath, assignmentFilePath);
      const updated = await service.update(project.id, fileAgent!.id, {
        ...base,
        name: assignmentFilePath,
        assignmentSource: 'inline',
        assignmentFilePath,
      });
      assert.equal(updated?.assignmentSource, 'inline');
      assert.equal(updated?.assignmentFilePath, assignmentFilePath);
    }

    for (const invalid of [
      { assignmentSource: 'database', assignmentFilePath: '' },
      { assignmentSource: 'file', assignmentFilePath: '' },
      { assignmentSource: 'file', assignmentFilePath: 'config.json' },
      { assignmentSource: 'file', assignmentFilePath: '/absolute.md' },
      { assignmentSource: 'file', assignmentFilePath: 'C:\\temp\\task.txt' },
      { assignmentSource: 'file', assignmentFilePath: '../outside.md' },
      { assignmentSource: 'file', assignmentFilePath: 'tasks/../outside.md' },
      { assignmentSource: 'file', assignmentFilePath: 'tasks\\task.md' },
      { assignmentSource: 'file', assignmentFilePath: 'tasks/%2e%2e/task.md' },
      { assignmentSource: 'inline', assignmentFilePath: '../inactive.md' },
    ]) {
      await assert.rejects(
        service.create(project.id, { ...base, ...invalid }),
        (error: unknown) => error instanceof AgentError && error.code === 'INVALID_INPUT',
      );
    }
    db.close();
  });

  it('validates and persists pre-run JSON paths independently of model tool access', async () => {
    const db = createTestDatabase();
    const projects = new ProjectRepository(db);
    const project = projects.create(1, { name: 'Project', description: '' });
    const service = new AgentService(
      new AgentRepository(db),
      projects,
      { getConnectionById: async () => visibleConnection(), isModelVisible: async () => true },
      { listAvailable: async () => [] },
      { get: (name) => (name === 'visit_website' ? ({ name } as never) : null) },
      () => 1,
    );
    const configured = await service.create(project.id, {
      ...input,
      skillIds: [],
      toolNames: [],
      toolConfigurations: [
        { toolName: 'visit_website', preRunInputFile: 'inputs/visits.json' },
      ],
    });
    assert.deepEqual(configured?.toolConfigurations, [
      { toolName: 'visit_website', preRunInputFile: 'inputs/visits.json' },
    ]);
    assert.deepEqual(configured?.toolNames, []);
    assert.deepEqual((await service.get(project.id, configured!.id))?.toolConfigurations, [
      { toolName: 'visit_website', preRunInputFile: 'inputs/visits.json' },
    ]);
    const cleared = await service.update(project.id, configured!.id, {
      ...input,
      skillIds: [],
      toolNames: [],
      toolConfigurations: [{ toolName: 'visit_website', preRunInputFile: null }],
    });
    assert.equal(cleared?.toolConfigurations[0].preRunInputFile, null);
    assert.deepEqual(cleared?.toolNames, []);

    for (const toolConfigurations of [
      [
        { toolName: 'visit_website', preRunInputFile: null },
        { toolName: 'visit_website', preRunInputFile: 'inputs/visits.json' },
      ],
      [{ toolName: 'unknown', preRunInputFile: 'inputs/unknown.json' }],
    ]) {
      await assert.rejects(
        service.create(project.id, {
          ...input,
          skillIds: [],
          toolNames: [],
          toolConfigurations,
        }),
        AgentError,
      );
    }

    for (const preRunInputFile of [
      '../outside.json',
      '/outside.json',
      'C:\\outside.json',
      'inputs/../outside.json',
      'inputs/not-json.txt',
      'inputs/%2e%2e/outside.json',
    ]) {
      await assert.rejects(
        service.create(project.id, {
          ...input,
          skillIds: [],
          toolNames: [],
          toolConfigurations: [{ toolName: 'visit_website', preRunInputFile }],
        }),
        (error: unknown) => error instanceof AgentError && error.code === 'INVALID_INPUT',
      );
    }
    db.close();
  });

  it('validates and preserves the configured Agent Runner target independently of model access', async () => {
    const db = createTestDatabase();
    const projects = new ProjectRepository(db);
    const repository = new AgentRepository(db);
    const project = projects.create(1, { name: 'Project', description: '' });
    const otherProject = projects.create(1, { name: 'Other', description: '' });
    const service = new AgentService(
      repository,
      projects,
      { getConnectionById: async () => visibleConnection(), isModelVisible: async () => true },
      { listAvailable: async () => [] },
      {
        get: (name) =>
          name === 'run_agent' || name === 'visit_website' ? ({ name } as never) : null,
      },
      () => 1,
    );
    const base = { ...input, skillIds: [], toolNames: [] };
    const target = await service.create(project.id, { ...base, name: 'Target' });
    const otherTarget = await service.create(otherProject.id, { ...base, name: 'Other target' });
    const source = await service.create(project.id, {
      ...base,
      name: 'Source',
      toolConfigurations: [
        { toolName: 'run_agent', preRunInputFile: null, targetAgentId: target!.id },
      ],
    });
    assert.deepEqual(source?.toolNames, []);
    assert.deepEqual(source?.toolConfigurations, [
      { toolName: 'run_agent', preRunInputFile: null, targetAgentId: target!.id },
    ]);

    const enabled = await service.update(project.id, source!.id, {
      ...base,
      name: 'Source',
      toolNames: ['run_agent'],
      toolConfigurations: source!.toolConfigurations,
    });
    assert.deepEqual(enabled?.toolNames, ['run_agent']);
    const disabled = await service.update(project.id, source!.id, {
      ...base,
      name: 'Source',
      toolConfigurations: enabled!.toolConfigurations,
    });
    assert.equal(disabled?.toolConfigurations[0].targetAgentId, target!.id);

    for (const invalid of [
      { toolNames: ['run_agent'], toolConfigurations: [] },
      {
        toolNames: ['run_agent'],
        toolConfigurations: [
          { toolName: 'run_agent', preRunInputFile: null, targetAgentId: source!.id },
        ],
      },
      {
        toolNames: ['run_agent'],
        toolConfigurations: [
          { toolName: 'run_agent', preRunInputFile: null, targetAgentId: otherTarget!.id },
        ],
      },
    ]) {
      await assert.rejects(
        service.update(project.id, source!.id, { ...base, name: 'Source', ...invalid }),
        (error: unknown) =>
          error instanceof AgentError && error.code === 'INVALID_AGENT_RUNNER_TARGET',
      );
    }
    await assert.rejects(
      service.update(project.id, source!.id, {
        ...base,
        name: 'Source',
        toolConfigurations: [
          { toolName: 'visit_website', preRunInputFile: null, targetAgentId: target!.id },
        ],
      }),
      (error: unknown) => error instanceof AgentError && error.code === 'INVALID_INPUT',
    );
    db.close();
  });

  it('allows linear same-Project chains, rejects self/cross-owner/cyclic chains, and cleans deletion', async () => {
    const db = createTestDatabase();
    const projects = new ProjectRepository(db);
    const repository = new AgentRepository(db);
    const project = projects.create(1, { name: 'Own', description: '' });
    const otherProject = projects.create(1, { name: 'Other Project', description: '' });
    const otherUserProject = projects.create(2, { name: 'Other User', description: '' });
    const service = new AgentService(
      repository,
      projects,
      { getConnectionById: async () => visibleConnection(), isModelVisible: async () => true },
      { listAvailable: async () => [] },
      { get: () => ({ name: 'visit_website' } as never) },
      () => 1,
    );
    const value = (name: string, nextAgentId: number | null = null) => ({
      ...input,
      name,
      skillIds: [],
      toolNames: [],
      triggerNextAgent: nextAgentId !== null,
      nextAgentId,
      saveResultToFile: false,
      resultDirectory: '',
      resultFilename: '',
    });
    const a = await service.create(project.id, value('A'));
    const b = await service.create(project.id, value('B'));
    const c = await service.create(project.id, value('C'));
    assert.ok(a && b && c);
    assert.equal((await service.update(project.id, a.id, value('A', b.id)))?.nextAgentId, b.id);
    assert.equal((await service.update(project.id, b.id, value('B', c.id)))?.nextAgentId, c.id);
    await assert.rejects(
      service.update(project.id, a.id, value('A', a.id)),
      (error: unknown) => error instanceof AgentError && error.code === 'INVALID_NEXT_AGENT',
    );
    await assert.rejects(
      service.update(project.id, b.id, value('B', a.id)),
      (error: unknown) => error instanceof AgentError && error.code === 'AGENT_CHAIN_CYCLE',
    );
    await assert.rejects(
      service.update(project.id, c.id, value('C', a.id)),
      (error: unknown) => error instanceof AgentError && error.code === 'AGENT_CHAIN_CYCLE',
    );

    const storedData = {
      name: 'Target',
      description: '',
      instructionSource: 'inline' as const,
      instructions: '',
      instructionFilePath: '',
      assignmentSource: 'inline' as const,
      assignment: 'Complete the target work.',
      assignmentFilePath: '',
      modelConnectionId: 9,
      modelId: 'model-a',
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
    };
    const crossProject = repository.create(otherProject.id, storedData);
    const otherUser = repository.create(otherUserProject.id, storedData);
    for (const targetId of [crossProject.id, otherUser.id]) {
      await assert.rejects(
        service.update(project.id, a.id, value('A', targetId)),
        (error: unknown) => error instanceof AgentError && error.code === 'INVALID_NEXT_AGENT',
      );
    }

    const disabled = await service.update(project.id, a.id, {
      ...value('A', b.id),
      triggerNextAgent: false,
    });
    assert.equal(disabled?.triggerNextAgent, false);
    assert.equal(disabled?.nextAgentId, null);
    await service.update(project.id, a.id, value('A', b.id));
    assert.equal(await service.delete(project.id, b.id), true);
    assert.equal((await service.get(project.id, a.id))?.triggerNextAgent, false);
    assert.equal((await service.get(project.id, a.id))?.nextAgentId, null);
    db.close();
  });

  it('copies persisted Agent definitions without history and inserts deterministic unique copies after the source', async () => {
    const db = createTestDatabase();
    const projects = new ProjectRepository(db);
    const repository = new AgentRepository(db);
    const runs = new AgentRunRepository(db);
    const project = projects.create(1, { name: 'Own', description: '' });
    const otherProject = projects.create(1, { name: 'Other', description: '' });
    const skillId = Number(
      db
        .prepare('INSERT INTO skills (command_name, created_at, updated_at, data) VALUES (?, 1, 1, ?)')
        .run('copy-skill', '{"name":"Copy skill"}').lastInsertRowid,
    );
    let userId = 1;
    const service = new AgentService(
      repository,
      projects,
      { getConnectionById: async () => visibleConnection(), isModelVisible: async () => true },
      { listAvailable: async () => [{ id: skillId, commandName: 'copy-skill', name: 'Copy skill' }] },
      {
        get: (name) =>
          name === 'visit_website' || name === 'duckduckgo_search'
            ? ({ name } as never)
            : null,
      },
      () => userId,
    );
    const target = await service.create(project.id, {
      ...input,
      name: 'A',
      skillIds: [],
      toolNames: [],
    });
    assert.ok(target);
    const sourceInput = {
      ...input,
      name: '3.1.Sector rotation',
      description: 'Persisted description',
      instructionSource: 'file',
      instructions: 'Preserved inline instructions.',
      instructionFilePath: 'prompts/sector.md',
      assignmentSource: 'file',
      assignment: 'Preserved inline assignment.',
      assignmentFilePath: 'tasks/rotation.txt',
      allowModelSelection: true,
      triggerNextAgent: true,
      nextAgentId: target.id,
      saveResultToFile: true,
      resultDirectory: 'reports/rotation',
      resultFilename: 'result.md',
      projectFilesystemPermissions: {
        list: true,
        read: true,
        write: true,
        createDirectory: true,
        rename: false,
        delete: false,
      },
      attachedProjectFiles: ['context/sectors.csv', 'notes/method.md'],
      timeoutMinutes: 45,
      temperature: 0.25,
      topP: 0.75,
      unloadModelAfterRun: true,
      skillIds: [skillId],
      toolNames: ['visit_website'],
      toolConfigurations: [
        { toolName: 'duckduckgo_search', preRunInputFile: 'inputs/searches.json' },
        { toolName: 'visit_website', preRunInputFile: null },
      ],
    };
    const source = await service.create(project.id, sourceInput);
    const following = await service.create(project.id, {
      ...input,
      name: 'C',
      skillIds: [],
      toolNames: [],
    });
    assert.ok(source && following);
    repository.create(otherProject.id, {
      ...repository.get(1, project.id, source.id)!.data,
      name: `${source.name} copy`,
    });

    const sourceRun = runs.create(1, project.id, source.id, 'Historical task');
    assert.ok(sourceRun);
    assert.equal(
      runs.fail(sourceRun.id, { stage: 'inference', code: 'TEST_ERROR', message: 'Historical error' }),
      true,
    );
    assert.ok((runs.listEvents(1, project.id, source.id, sourceRun.id)?.length ?? 0) > 0);
    assert.ok((runs.listExecutionEvents(1, project.id, source.id, sourceRun.id)?.length ?? 0) > 0);
    assert.equal(runs.listErrors(1, project.id, source.id)?.length, 1);

    const sourceBefore = await service.get(project.id, source.id);
    const firstCopy = await service.copy(project.id, source.id);
    assert.ok(sourceBefore && firstCopy);
    assert.notEqual(firstCopy.id, source.id);
    assert.equal(firstCopy.projectId, project.id);
    assert.equal(firstCopy.name, '3.1.Sector rotation copy');
    assert.equal(firstCopy.description, source.description);
    assert.equal(firstCopy.instructionSource, 'file');
    assert.equal(firstCopy.instructions, source.instructions);
    assert.equal(firstCopy.instructionFilePath, source.instructionFilePath);
    assert.equal(firstCopy.assignmentSource, 'file');
    assert.equal(firstCopy.assignment, source.assignment);
    assert.equal(firstCopy.assignmentFilePath, source.assignmentFilePath);
    assert.equal(firstCopy.modelConnectionId, source.modelConnectionId);
    assert.equal(firstCopy.modelId, source.modelId);
    assert.equal(firstCopy.allowModelSelection, true);
    assert.equal(firstCopy.saveResultToFile, true);
    assert.equal(firstCopy.resultDirectory, source.resultDirectory);
    assert.equal(firstCopy.resultFilename, source.resultFilename);
    assert.deepEqual(firstCopy.projectFilesystemPermissions, source.projectFilesystemPermissions);
    assert.deepEqual(firstCopy.attachedProjectFiles, source.attachedProjectFiles);
    assert.equal(firstCopy.timeoutMinutes, 45);
    assert.equal(firstCopy.temperature, 0.25);
    assert.equal(firstCopy.topP, 0.75);
    assert.equal(firstCopy.unloadModelAfterRun, true);
    assert.deepEqual(firstCopy.skillIds, [skillId]);
    assert.deepEqual(firstCopy.toolNames, ['visit_website']);
    assert.deepEqual(firstCopy.toolConfigurations, [
      { toolName: 'duckduckgo_search', preRunInputFile: 'inputs/searches.json' },
      { toolName: 'visit_website', preRunInputFile: null },
    ]);
    assert.equal(firstCopy.nextAgentId, null);
    assert.equal(firstCopy.triggerNextAgent, false);
    assert.equal(runs.getLatest(1, project.id, firstCopy.id), null);
    assert.deepEqual(runs.listErrors(1, project.id, firstCopy.id), []);
    assert.equal(
      (db.prepare('SELECT COUNT(*) AS count FROM agent_run_events e INNER JOIN agent_runs r ON r.id = e.run_id WHERE r.agent_id = ?').get(firstCopy.id) as { count: number }).count,
      0,
    );
    assert.deepEqual(await service.get(project.id, source.id), sourceBefore);
    assert.deepEqual(
      (await service.list(project.id))?.map((agent) => agent.name),
      ['A', source.name, firstCopy.name, 'C'],
    );

    const secondCopy = await service.copy(project.id, source.id);
    const thirdCopy = await service.copy(project.id, source.id);
    assert.equal(secondCopy?.name, '3.1.Sector rotation copy 2');
    assert.equal(thirdCopy?.name, '3.1.Sector rotation copy 3');
    assert.deepEqual(
      (await service.list(project.id))?.map((agent) => ({ name: agent.name, sortOrder: agent.sortOrder })),
      [
        { name: 'A', sortOrder: 0 },
        { name: source.name, sortOrder: 1 },
        { name: thirdCopy?.name, sortOrder: 2 },
        { name: secondCopy?.name, sortOrder: 3 },
        { name: firstCopy.name, sortOrder: 4 },
        { name: 'C', sortOrder: 5 },
      ],
    );
    assert.deepEqual(await service.get(project.id, source.id), sourceBefore);

    const updatedCopy = await service.update(project.id, firstCopy.id, {
      ...sourceInput,
      name: firstCopy.name,
      description: 'Independent copy',
      triggerNextAgent: false,
      nextAgentId: null,
    });
    assert.equal(updatedCopy?.description, 'Independent copy');
    assert.equal((await service.get(project.id, source.id))?.description, source.description);

    userId = 2;
    assert.equal(await service.copy(project.id, source.id), null);
    userId = 1;
    assert.equal(await service.copy(otherProject.id, source.id), null);
    assert.equal(await service.copy(project.id, 1_000_000_000), null);
    db.close();
  });

  it('preserves each persisted instruction source and inline or file assignment source when copying', async () => {
    const db = createTestDatabase();
    const projects = new ProjectRepository(db);
    const project = projects.create(1, { name: 'Project', description: '' });
    const service = new AgentService(
      new AgentRepository(db),
      projects,
      { getConnectionById: async () => visibleConnection(), isModelVisible: async () => true },
      { listAvailable: async () => [] },
      { get: () => null },
      () => 1,
    );
    for (const [index, instructionSource] of (['none', 'inline', 'file'] as const).entries()) {
      const assignmentSource = index % 2 === 0 ? 'inline' : 'file';
      const source = await service.create(project.id, {
        ...input,
        name: `Source ${instructionSource}`,
        instructionSource,
        instructionFilePath: instructionSource === 'file' ? 'prompts/source.md' : 'inactive/value.txt',
        assignmentSource,
        assignmentFilePath: assignmentSource === 'file' ? 'tasks/source.txt' : 'inactive/task.md',
        skillIds: [],
        toolNames: [],
      });
      assert.ok(source);
      const copied = await service.copy(project.id, source.id);
      assert.equal(copied?.instructionSource, instructionSource);
      assert.equal(copied?.instructions, source.instructions);
      assert.equal(copied?.instructionFilePath, source.instructionFilePath);
      assert.equal(copied?.assignmentSource, assignmentSource);
      assert.equal(copied?.assignment, source.assignment);
      assert.equal(copied?.assignmentFilePath, source.assignmentFilePath);
    }
    db.close();
  });

  it('validates reorder input, enforces ownership, and maps persistence failures', async () => {
    const db = createTestDatabase();
    const projects = new ProjectRepository(db);
    const repository = new AgentRepository(db);
    const project = projects.create(1, { name: 'Own', description: '' });
    let userId = 1;
    const service = new AgentService(
      repository,
      projects,
      { getConnectionById: async () => visibleConnection(), isModelVisible: async () => true },
      { listAvailable: async () => [] },
      { get: () => ({ name: 'visit_website' } as never) },
      () => userId,
    );
    const value = { ...input, skillIds: [], toolNames: [] };
    const first = await service.create(project.id, { ...value, name: 'First' });
    const second = await service.create(project.id, { ...value, name: 'Second' });
    assert.ok(first && second);

    for (const invalid of [
      null,
      {},
      { agentIds: [first.id, first.id] },
      { agentIds: [first.id] },
      { agentIds: [first.id, second.id], extra: true },
    ]) {
      await assert.rejects(
        service.reorder(project.id, invalid),
        (error: unknown) => error instanceof AgentError && error.code === 'INVALID_INPUT',
      );
    }

    userId = 2;
    assert.equal(await service.reorder(project.id, { agentIds: [second.id, first.id] }), null);
    userId = 1;
    db.exec(`
      CREATE TRIGGER fail_service_reorder
      BEFORE UPDATE OF sort_order ON agents
      BEGIN
        SELECT RAISE(ABORT, 'forced reorder failure');
      END
    `);
    await assert.rejects(
      service.reorder(project.id, { agentIds: [second.id, first.id] }),
      (error: unknown) => error instanceof AgentError && error.code === 'PERSISTENCE_FAILED',
    );
    db.exec('DROP TRIGGER fail_service_reorder');

    const reordered = await service.reorder(project.id, { agentIds: [second.id, first.id] });
    assert.deepEqual(
      reordered?.map((agent) => ({ id: agent.id, name: agent.name, sortOrder: agent.sortOrder })),
      [
        { id: second.id, name: 'Second', sortOrder: 0 },
        { id: first.id, name: 'First', sortOrder: 1 },
      ],
    );
    db.close();
  });
});
