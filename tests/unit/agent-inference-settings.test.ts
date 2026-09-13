import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createTestDatabase } from '../../src/server/database.js';
import { AgentRepository } from '../../src/server/repositories/agent-repository.js';
import { ProjectRepository } from '../../src/server/repositories/project-repository.js';
import { AgentError, AgentService } from '../../src/server/services/agent-service.js';

const baseInput = {
  name: 'TestAgent',
  description: '',
  instructions: 'Do the task.',
  assignment: 'Implement.',
  modelConnectionId: 9,
  modelId: 'model-a',
  skillIds: [],
  toolNames: [],
};

function visibleConnection() {
  return {
    id: 9,
    userId: 1,
    createdAt: 1,
    updatedAt: 1,
    hasApiKey: false,
    data: {
      name: 'Local',
      baseUrl: 'http://model.test',
      timeoutMinutes: 30,
      modelId: null,
      enabled: true,
      filterConfigured: false,
      visibleModelIds: [],
      modelDescriptions: {},
    },
  };
}

function createService(db?: ReturnType<typeof createTestDatabase>) {
  const testDb = db ?? createTestDatabase();
  const projects = new ProjectRepository(testDb);
  return {
    service: new AgentService(
      new AgentRepository(testDb),
      projects,
      { getConnectionById: async () => visibleConnection(), isModelVisible: async () => true },
      { listAvailable: async () => [] },
      { get: () => null },
      () => 1,
    ),
    projects,
    db: testDb,
  };
}

await describe('Agent inference settings', () => {
  it('legacy Agent without fields resolves to defaults', async () => {
    const { service, projects, db } = createService();
    const project = projects.create(1, { name: 'P', description: '' });
    const agent = await service.create(project.id, baseInput);
    assert.ok(agent);
    assert.equal(agent.timeoutMinutes, undefined);
    assert.equal(agent.temperature, undefined);
    assert.equal(agent.topP, undefined);
    db.close();
  });

  it('new Agent with explicit defaults uses same values', async () => {
    const { service, projects, db } = createService();
    const project = projects.create(1, { name: 'P', description: '' });
    const agent = await service.create(project.id, {
      ...baseInput,
      timeoutMinutes: 30,
      temperature: 0.8,
      topP: 0.8,
    });
    assert.ok(agent);
    assert.equal(agent.timeoutMinutes, 30);
    assert.equal(agent.temperature, 0.8);
    assert.equal(agent.topP, 0.8);
    db.close();
  });

  it('custom values persist and reload', async () => {
    const { service, projects, db } = createService();
    const project = projects.create(1, { name: 'P', description: '' });
    const agent = await service.create(project.id, {
      ...baseInput,
      timeoutMinutes: 45,
      temperature: 0.25,
      topP: 0.65,
    });
    assert.ok(agent);
    assert.equal(agent.timeoutMinutes, 45);
    assert.equal(agent.temperature, 0.25);
    assert.equal(agent.topP, 0.65);

    const reloaded = await service.get(project.id, agent.id);
    assert.ok(reloaded);
    assert.equal(reloaded.timeoutMinutes, 45);
    assert.equal(reloaded.temperature, 0.25);
    assert.equal(reloaded.topP, 0.65);
    db.close();
  });

  it('temperature accepts valid boundary values', async () => {
    const { service, projects, db } = createService();
    const project = projects.create(1, { name: 'P', description: '' });
    for (const temp of [0, 0.25, 0.8, 1]) {
      const agent = await service.create(project.id, { ...baseInput, temperature: temp });
      assert.equal(agent?.temperature, temp);
    }
    db.close();
  });

  it('topP accepts valid boundary values', async () => {
    const { service, projects, db } = createService();
    const project = projects.create(1, { name: 'P', description: '' });
    for (const topP of [0, 0.25, 0.8, 1]) {
      const agent = await service.create(project.id, { ...baseInput, topP });
      assert.equal(agent?.topP, topP);
    }
    db.close();
  });

  it('temperature below 0 is rejected', async () => {
    const { service, projects, db } = createService();
    const project = projects.create(1, { name: 'P', description: '' });
    await assert.rejects(
      service.create(project.id, { ...baseInput, temperature: -0.1 }),
      (error: unknown) => error instanceof AgentError && error.code === 'INVALID_INPUT',
    );
    db.close();
  });

  it('temperature above 1 is rejected', async () => {
    const { service, projects, db } = createService();
    const project = projects.create(1, { name: 'P', description: '' });
    await assert.rejects(
      service.create(project.id, { ...baseInput, temperature: 1.01 }),
      (error: unknown) => error instanceof AgentError && error.code === 'INVALID_INPUT',
    );
    db.close();
  });

  it('topP below 0 is rejected', async () => {
    const { service, projects, db } = createService();
    const project = projects.create(1, { name: 'P', description: '' });
    await assert.rejects(
      service.create(project.id, { ...baseInput, topP: -0.1 }),
      (error: unknown) => error instanceof AgentError && error.code === 'INVALID_INPUT',
    );
    db.close();
  });

  it('topP above 1 is rejected', async () => {
    const { service, projects, db } = createService();
    const project = projects.create(1, { name: 'P', description: '' });
    await assert.rejects(
      service.create(project.id, { ...baseInput, topP: 1.01 }),
      (error: unknown) => error instanceof AgentError && error.code === 'INVALID_INPUT',
    );
    db.close();
  });

  it('NaN temperature is rejected', async () => {
    const { service, projects, db } = createService();
    const project = projects.create(1, { name: 'P', description: '' });
    await assert.rejects(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- intentionally passing NaN
      service.create(project.id, { ...baseInput, temperature: NaN } as any),
      (error: unknown) => error instanceof AgentError && error.code === 'INVALID_INPUT',
    );
    db.close();
  });

  it('NaN topP is rejected', async () => {
    const { service, projects, db } = createService();
    const project = projects.create(1, { name: 'P', description: '' });
    await assert.rejects(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- intentionally passing NaN
      service.create(project.id, { ...baseInput, topP: NaN } as any),
      (error: unknown) => error instanceof AgentError && error.code === 'INVALID_INPUT',
    );
    db.close();
  });

  it('non-numeric timeoutMinutes is rejected', async () => {
    const { service, projects, db } = createService();
    const project = projects.create(1, { name: 'P', description: '' });
    await assert.rejects(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- intentionally passing string
      service.create(project.id, { ...baseInput, timeoutMinutes: '30' } as any),
      (error: unknown) => error instanceof AgentError && error.code === 'INVALID_INPUT',
    );
    db.close();
  });

  it('zero and negative timeoutMinutes are rejected', async () => {
    const { service, projects, db } = createService();
    const project = projects.create(1, { name: 'P', description: '' });
    await assert.rejects(
      service.create(project.id, { ...baseInput, timeoutMinutes: 0 }),
      (error: unknown) => error instanceof AgentError && error.code === 'INVALID_INPUT',
    );
    await assert.rejects(
      service.create(project.id, { ...baseInput, timeoutMinutes: -5 }),
      (error: unknown) => error instanceof AgentError && error.code === 'INVALID_INPUT',
    );
    db.close();
  });

  it('string temperature is rejected', async () => {
    const { service, projects, db } = createService();
    const project = projects.create(1, { name: 'P', description: '' });
    await assert.rejects(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- intentionally passing string
      service.create(project.id, { ...baseInput, temperature: '0.5' } as any),
      (error: unknown) => error instanceof AgentError && error.code === 'INVALID_INPUT',
    );
    db.close();
  });

  it('string topP is rejected', async () => {
    const { service, projects, db } = createService();
    const project = projects.create(1, { name: 'P', description: '' });
    await assert.rejects(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- intentionally passing string
      service.create(project.id, { ...baseInput, topP: '0.5' } as any),
      (error: unknown) => error instanceof AgentError && error.code === 'INVALID_INPUT',
    );
    db.close();
  });

  it('update preserves inference settings across partial updates', async () => {
    const { service, projects, db } = createService();
    const project = projects.create(1, { name: 'P', description: '' });
    const agent = await service.create(project.id, {
      ...baseInput,
      timeoutMinutes: 45,
      temperature: 0.25,
      topP: 0.65,
    });
    assert.ok(agent);

    const updated = await service.update(project.id, agent.id, {
      ...baseInput,
      name: 'Renamed',
      timeoutMinutes: 45,
      temperature: 0.25,
      topP: 0.65,
    });
    assert.equal(updated?.name, 'Renamed');
    assert.equal(updated?.timeoutMinutes, 45);
    assert.equal(updated?.temperature, 0.25);
    assert.equal(updated?.topP, 0.65);
    db.close();
  });

  it('each Agent uses its own settings independently', async () => {
    const { service, projects, db } = createService();
    const project = projects.create(1, { name: 'P', description: '' });
    const agentA = await service.create(project.id, { ...baseInput, temperature: 0.25, topP: 0.3 });
    const agentB = await service.create(project.id, { ...baseInput, temperature: 0.9, topP: 1 });
    assert.ok(agentA && agentB);

    assert.equal(agentA.temperature, 0.25);
    assert.equal(agentA.topP, 0.3);
    assert.equal(agentB.temperature, 0.9);
    assert.equal(agentB.topP, 1);

    const list = await service.list(project.id);
    assert.ok(list);
    const aFromList = list.find((a) => a.id === agentA.id);
    const bFromList = list.find((a) => a.id === agentB.id);
    assert.equal(aFromList?.temperature, 0.25);
    assert.equal(bFromList?.temperature, 0.9);
    db.close();
  });

  it('list includes inference settings for all agents', async () => {
    const { service, projects, db } = createService();
    const project = projects.create(1, { name: 'P', description: '' });
    await service.create(project.id, { ...baseInput, timeoutMinutes: 60, temperature: 0.5, topP: 0.7 });
    const list = await service.list(project.id);
    assert.ok(list && list.length === 1);
    assert.equal(list[0].timeoutMinutes, 60);
    assert.equal(list[0].temperature, 0.5);
    assert.equal(list[0].topP, 0.7);
    db.close();
  });

  it('Infinity temperature is rejected', async () => {
    const { service, projects, db } = createService();
    const project = projects.create(1, { name: 'P', description: '' });
    await assert.rejects(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- intentionally passing Infinity
      service.create(project.id, { ...baseInput, temperature: Infinity } as any),
      (error: unknown) => error instanceof AgentError && error.code === 'INVALID_INPUT',
    );
    db.close();
  });

  it('Infinity topP is rejected', async () => {
    const { service, projects, db } = createService();
    const project = projects.create(1, { name: 'P', description: '' });
    await assert.rejects(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- intentionally passing -Infinity
      service.create(project.id, { ...baseInput, topP: -Infinity } as any),
      (error: unknown) => error instanceof AgentError && error.code === 'INVALID_INPUT',
    );
    db.close();
  });

  it('null timeoutMinutes is rejected', async () => {
    const { service, projects, db } = createService();
    const project = projects.create(1, { name: 'P', description: '' });
    await assert.rejects(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- intentionally passing null
      service.create(project.id, { ...baseInput, timeoutMinutes: null } as any),
      (error: unknown) => error instanceof AgentError && error.code === 'INVALID_INPUT',
    );
    db.close();
  });

  it('null temperature is rejected', async () => {
    const { service, projects, db } = createService();
    const project = projects.create(1, { name: 'P', description: '' });
    await assert.rejects(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- intentionally passing null
      service.create(project.id, { ...baseInput, temperature: null } as any),
      (error: unknown) => error instanceof AgentError && error.code === 'INVALID_INPUT',
    );
    db.close();
  });

  it('null topP is rejected', async () => {
    const { service, projects, db } = createService();
    const project = projects.create(1, { name: 'P', description: '' });
    await assert.rejects(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- intentionally passing null
      service.create(project.id, { ...baseInput, topP: null } as any),
      (error: unknown) => error instanceof AgentError && error.code === 'INVALID_INPUT',
    );
    db.close();
  });

  it('valid timeoutMinutes value is accepted', async () => {
    const { service, projects, db } = createService();
    const project = projects.create(1, { name: 'P', description: '' });
    for (const minutes of [1, 30, 60, 120]) {
      const agent = await service.create(project.id, { ...baseInput, timeoutMinutes: minutes });
      assert.equal(agent?.timeoutMinutes, minutes);
    }
    db.close();
  });

  it('non-integer timeoutMinutes is rejected', async () => {
    const { service, projects, db } = createService();
    const project = projects.create(1, { name: 'P', description: '' });
    await assert.rejects(
      service.create(project.id, { ...baseInput, timeoutMinutes: 30.5 }),
      (error: unknown) => error instanceof AgentError && error.code === 'INVALID_INPUT',
    );
    db.close();
  });

  it('Infinity timeoutMinutes is rejected', async () => {
    const { service, projects, db } = createService();
    const project = projects.create(1, { name: 'P', description: '' });
    await assert.rejects(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- intentionally passing Infinity
      service.create(project.id, { ...baseInput, timeoutMinutes: Infinity } as any),
      (error: unknown) => error instanceof AgentError && error.code === 'INVALID_INPUT',
    );
    db.close();
  });

  it('NaN timeoutMinutes is rejected', async () => {
    const { service, projects, db } = createService();
    const project = projects.create(1, { name: 'P', description: '' });
    await assert.rejects(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- intentionally passing NaN
      service.create(project.id, { ...baseInput, timeoutMinutes: NaN } as any),
      (error: unknown) => error instanceof AgentError && error.code === 'INVALID_INPUT',
    );
    db.close();
  });

  it('update can change inference settings independently', async () => {
    const { service, projects, db } = createService();
    const project = projects.create(1, { name: 'P', description: '' });
    const agent = await service.create(project.id, { ...baseInput });
    assert.ok(agent);

    const updated = await service.update(project.id, agent.id, {
      ...baseInput,
      temperature: 0.5,
      topP: 0.9,
    });
    assert.equal(updated?.temperature, 0.5);
    assert.equal(updated?.topP, 0.9);
    db.close();
  });

  it('update can remove inference settings by omitting them', async () => {
    const { service, projects, db } = createService();
    const project = projects.create(1, { name: 'P', description: '' });
    const agent = await service.create(project.id, {
      ...baseInput,
      timeoutMinutes: 45,
      temperature: 0.25,
      topP: 0.65,
    });
    assert.ok(agent);

    const updated = await service.update(project.id, agent.id, baseInput);
    assert.equal(updated?.timeoutMinutes, undefined);
    assert.equal(updated?.temperature, undefined);
    assert.equal(updated?.topP, undefined);
    db.close();
  });
});
