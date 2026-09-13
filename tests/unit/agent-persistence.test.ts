import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createTestDatabase } from '../../src/server/database.js';
import { AgentRepository } from '../../src/server/repositories/agent-repository.js';
import { ProjectRepository } from '../../src/server/repositories/project-repository.js';

const defaultPermissions = {
  list: true,
  read: true,
  write: false,
  createDirectory: false,
  rename: false,
  delete: false,
} as const;

const data = {
  name: 'Backend Developer',
  description: 'Owns backend changes',
  instructionSource: 'inline' as const,
  instructions: 'Inspect relevant files first.',
  instructionFilePath: '',
  assignmentSource: 'inline' as const,
  assignment: 'Implement the backend change.',
  assignmentFilePath: '',
  modelConnectionId: 3,
  modelId: 'model-a',
  allowModelSelection: false,
  triggerNextAgent: false,
  saveResultToFile: false,
  resultDirectory: '',
  resultFilename: '',
  projectFilesystemPermissions: defaultPermissions,
  attachedProjectFiles: [] as string[],
  unloadModelAfterRun: false,
};

await describe('AgentRepository', () => {
  it('persists typed shallow JSON and relational Skills/tools without duplicated identity', () => {
    const db = createTestDatabase();
    const projects = new ProjectRepository(db);
    const agents = new AgentRepository(db);
    const project = projects.create(1, { name: 'Project', description: '' });
    const skillIds = ['one', 'two'].map((commandName) =>
      Number(
        db
          .prepare('INSERT INTO skills (command_name, created_at, updated_at, data) VALUES (?, 1, 1, ?)')
          .run(commandName, `{"name":"${commandName}"}`).lastInsertRowid,
      ),
    );
    const created = agents.transaction(() => {
      const record = agents.create(project.id, data);
      agents.replaceSkills(record.id, skillIds);
      agents.replaceTools(record.id, ['duckduckgo_search', 'visit_website']);
      return agents.get(1, project.id, record.id);
    });
    assert.ok(created);
    assert.deepEqual(created.data, data);
    assert.deepEqual(created.skillIds, skillIds);
    assert.deepEqual(created.toolNames, ['duckduckgo_search', 'visit_website']);
    const stored = JSON.parse(
      (db.prepare('SELECT data FROM agents WHERE id = ?').get(created.id) as { data: string }).data,
    ) as Record<string, unknown>;
    assert.deepEqual(stored, data);
    assert.ok(!('id' in stored));
    assert.ok(!('projectId' in stored));
    assert.ok(!('project_id' in stored));
    assert.ok(!('apiKey' in stored));
    assert.ok(!('baseUrl' in stored));
    assert.ok(!('path' in stored));
    assert.equal(agents.delete(1, project.id, created.id), true);
    assert.equal(
      (db.prepare('SELECT COUNT(*) count FROM agent_skills').get() as { count: number }).count,
      0,
    );
    assert.equal(
      (db.prepare('SELECT COUNT(*) count FROM agent_tools').get() as { count: number }).count,
      0,
    );
    db.close();
  });

  it('persists model access and pre-run files independently on Agent-tool relationships', () => {
    const db = createTestDatabase();
    const projects = new ProjectRepository(db);
    const agents = new AgentRepository(db);
    const project = projects.create(1, { name: 'Project', description: '' });
    const agent = agents.create(project.id, data);
    agents.replaceTools(
      agent.id,
      ['duckduckgo_search'],
      [
        { toolName: 'visit_website', preRunInputFile: 'inputs/visits.json' },
        { toolName: 'duckduckgo_search', preRunInputFile: null },
      ],
    );
    assert.deepEqual(agents.get(1, project.id, agent.id)?.toolConfigurations, [
      { toolName: 'duckduckgo_search', preRunInputFile: null },
      { toolName: 'visit_website', preRunInputFile: 'inputs/visits.json' },
    ]);
    assert.deepEqual(agents.get(1, project.id, agent.id)?.toolNames, ['duckduckgo_search']);
    assert.deepEqual(
      (db.prepare('SELECT tool_name, data FROM agent_tools WHERE agent_id = ? ORDER BY tool_name').all(
        agent.id,
      ) as Array<{ tool_name: string; data: string }>).map((row) => ({
        toolName: row.tool_name,
        data: JSON.parse(row.data) as unknown,
      })),
      [
        {
          toolName: 'duckduckgo_search',
          data: { preRunInputFile: null, modelEnabled: true },
        },
        {
          toolName: 'visit_website',
          data: { preRunInputFile: 'inputs/visits.json', modelEnabled: false },
        },
      ],
    );
    db.prepare("UPDATE agent_tools SET data = '{}' WHERE agent_id = ? AND tool_name = ?").run(
      agent.id,
      'duckduckgo_search',
    );
    const withLegacyRow = agents.get(1, project.id, agent.id);
    assert.deepEqual(withLegacyRow?.toolNames, ['duckduckgo_search']);
    assert.equal(withLegacyRow?.toolConfigurations[0].preRunInputFile, null);
    db.close();
  });

  it('round-trips Agent Runner targets without changing legacy tool configuration', () => {
    const db = createTestDatabase();
    const projects = new ProjectRepository(db);
    const agents = new AgentRepository(db);
    const project = projects.create(1, { name: 'Project', description: '' });
    const source = agents.create(project.id, data);
    const target = agents.create(project.id, { ...data, name: 'Target' });
    agents.replaceTools(source.id, [], [
      { toolName: 'run_agent', preRunInputFile: null, targetAgentId: target.id },
      { toolName: 'visit_website', preRunInputFile: 'inputs/visits.json' },
    ]);

    assert.deepEqual(agents.get(1, project.id, source.id)?.toolConfigurations, [
      { toolName: 'run_agent', preRunInputFile: null, targetAgentId: target.id },
      { toolName: 'visit_website', preRunInputFile: 'inputs/visits.json' },
    ]);
    assert.deepEqual(agents.get(1, project.id, source.id)?.toolNames, []);

    db.prepare("UPDATE agent_tools SET data = '{}' WHERE agent_id = ? AND tool_name = ?").run(
      source.id,
      'visit_website',
    );
    assert.deepEqual(
      agents.get(1, project.id, source.id)?.toolConfigurations.find(
        (configuration) => configuration.toolName === 'visit_website',
      ),
      { toolName: 'visit_website', preRunInputFile: null },
    );
    db.close();
  });

  it('scopes every operation by user, Project, and Agent and rolls relationship updates back', () => {
    const db = createTestDatabase();
    const projects = new ProjectRepository(db);
    const agents = new AgentRepository(db);
    const ownProject = projects.create(1, { name: 'Own', description: '' });
    const otherProject = projects.create(2, { name: 'Other', description: '' });
    const own = agents.create(ownProject.id, data);
    const other = agents.create(otherProject.id, data);
    agents.replaceTools(own.id, ['visit_website']);
    assert.deepEqual(agents.list(1, ownProject.id).map((agent) => agent.id), [own.id]);
    assert.equal(agents.get(1, otherProject.id, other.id), null);
    assert.equal(agents.update(1, otherProject.id, other.id, { ...data, name: 'Forbidden' }), null);
    assert.equal(agents.delete(1, otherProject.id, other.id), false);
    assert.throws(() =>
      agents.transaction(() => {
        agents.update(1, ownProject.id, own.id, { ...data, name: 'Rolled back' });
        agents.replaceTools(own.id, ['duckduckgo_search']);
        throw new Error('fail transaction');
      }),
    );
    const persisted = agents.get(1, ownProject.id, own.id);
    assert.equal(persisted?.data.name, data.name);
    assert.deepEqual(persisted?.toolNames, ['visit_website']);
    assert.equal(agents.delete(1, ownProject.id, own.id), true);
    assert.equal((db.prepare('SELECT COUNT(*) count FROM agent_tools').get() as { count: number }).count, 0);
    db.close();
  });

  it('defaults legacy JSON settings and atomically deactivates deleted next-Agent references', () => {
    const db = createTestDatabase();
    const projects = new ProjectRepository(db);
    const agents = new AgentRepository(db);
    const project = projects.create(1, { name: 'Project', description: '' });
    const legacyData = {
      name: 'Legacy',
      description: '',
      instructions: '',
      modelConnectionId: 3,
      modelId: 'model-a',
      allowModelSelection: false,
    };
    const legacyId = Number(
      db
        .prepare('INSERT INTO agents (project_id, created_at, updated_at, data) VALUES (?, 1, 1, ?)')
        .run(project.id, JSON.stringify(legacyData)).lastInsertRowid,
    );
    assert.deepEqual(agents.get(1, project.id, legacyId)?.data, {
      ...legacyData,
      instructionSource: 'inline',
      instructionFilePath: '',
      assignmentSource: 'inline',
      assignment: '',
      assignmentFilePath: '',
      triggerNextAgent: false,
      saveResultToFile: false,
      resultDirectory: '',
      resultFilename: '',
      projectFilesystemPermissions: defaultPermissions,
      attachedProjectFiles: [],
      unloadModelAfterRun: false,
    });

    const target = agents.create(project.id, { ...data, name: 'Target' });
    const source = agents.create(
      project.id,
      { ...data, name: 'Source', triggerNextAgent: true },
      target.id,
    );
    assert.equal(agents.get(1, project.id, source.id)?.nextAgentId, target.id);
    agents.transaction(() => {
      agents.deactivateIncomingReferences(project.id, target.id);
      agents.delete(1, project.id, target.id);
    });
    const updatedSource = agents.get(1, project.id, source.id);
    assert.equal(updatedSource?.nextAgentId, null);
    assert.equal(updatedSource?.data.triggerNextAgent, false);
    db.close();
  });

  it('round-trips none instruction sources without changing inactive values', () => {
    const db = createTestDatabase();
    const projects = new ProjectRepository(db);
    const agents = new AgentRepository(db);
    const project = projects.create(1, { name: 'Project', description: '' });
    const noneData = {
      ...data,
      instructionSource: 'none' as const,
      instructions: 'Preserved inline instructions',
      instructionFilePath: 'missing/inactive.json',
    };
    const created = agents.create(project.id, noneData);
    assert.deepEqual(agents.get(1, project.id, created.id)?.data, noneData);

    const updatedData = {
      ...noneData,
      instructions: 'Updated preserved instructions',
      instructionFilePath: '../still-inactive.md',
    };
    assert.deepEqual(agents.update(1, project.id, created.id, updatedData)?.data, updatedData);

    const invalidId = Number(
      db
        .prepare('INSERT INTO agents (project_id, created_at, updated_at, data) VALUES (?, 1, 1, ?)')
        .run(project.id, JSON.stringify({ ...data, instructionSource: 'disabled' })).lastInsertRowid,
    );
    assert.throws(() => agents.get(1, project.id, invalidId), /Invalid agent data/);
    db.close();
  });

  it('appends order per Project, keeps deterministic ties, and does not reuse deleted positions', () => {
    const db = createTestDatabase();
    const projects = new ProjectRepository(db);
    const agents = new AgentRepository(db);
    const project = projects.create(1, { name: 'Project', description: '' });
    const otherProject = projects.create(1, { name: 'Other', description: '' });
    const first = agents.create(project.id, { ...data, name: 'First' });
    const second = agents.create(project.id, { ...data, name: 'Second' });
    const third = agents.create(project.id, { ...data, name: 'Third' });
    const other = agents.create(otherProject.id, { ...data, name: 'Other' });
    assert.deepEqual(
      [first, second, third, other].map((agent) => agent.sortOrder),
      [0, 1, 2, 0],
    );

    assert.equal(agents.delete(1, project.id, second.id), true);
    const appended = agents.create(project.id, { ...data, name: 'Appended' });
    assert.equal(appended.sortOrder, 3);
    db.prepare('UPDATE agents SET sort_order = 0 WHERE id = ?').run(third.id);
    assert.deepEqual(
      agents.list(1, project.id).map((agent) => agent.id),
      [first.id, third.id, appended.id],
    );
    db.close();
  });

  it('persists an owned complete reorder atomically without changing Agent configuration', () => {
    const db = createTestDatabase();
    const projects = new ProjectRepository(db);
    const agents = new AgentRepository(db);
    const project = projects.create(1, { name: 'Project', description: '' });
    const otherProject = projects.create(2, { name: 'Other owner', description: '' });
    const target = agents.create(project.id, { ...data, name: 'Target' });
    const source = agents.create(
      project.id,
      { ...data, name: 'Source', triggerNextAgent: true },
      target.id,
    );
    const third = agents.create(project.id, { ...data, name: 'Third' });
    const skillId = Number(
      db
        .prepare('INSERT INTO skills (command_name, created_at, updated_at, data) VALUES (?, 1, 1, ?)')
        .run('reorder-skill', '{"name":"Reorder"}').lastInsertRowid,
    );
    agents.replaceSkills(source.id, [skillId]);
    agents.replaceTools(source.id, ['visit_website']);
    const sourceBefore = agents.get(1, project.id, source.id);
    const initialOrder = agents.list(1, project.id).map((agent) => ({
      id: agent.id,
      sortOrder: agent.sortOrder,
      updatedAt: agent.updatedAt,
    }));

    db.exec(`
      CREATE TRIGGER fail_agent_reorder
      BEFORE UPDATE OF sort_order ON agents
      WHEN NEW.id = ${target.id}
      BEGIN
        SELECT RAISE(ABORT, 'forced reorder failure');
      END
    `);
    assert.throws(() => agents.reorder(1, project.id, [third.id, source.id, target.id]));
    assert.deepEqual(
      agents.list(1, project.id).map((agent) => ({
        id: agent.id,
        sortOrder: agent.sortOrder,
        updatedAt: agent.updatedAt,
      })),
      initialOrder,
    );
    db.exec('DROP TRIGGER fail_agent_reorder');

    assert.equal(agents.reorder(2, project.id, [third.id, source.id, target.id]), false);
    assert.equal(agents.reorder(1, project.id, [third.id, source.id, source.id]), false);
    assert.equal(agents.reorder(1, otherProject.id, [third.id, source.id, target.id]), false);
    assert.equal(agents.reorder(1, project.id, [third.id, source.id, target.id]), true);
    const reordered = agents.list(1, project.id);
    assert.deepEqual(
      reordered.map((agent) => ({ id: agent.id, sortOrder: agent.sortOrder })),
      [
        { id: third.id, sortOrder: 0 },
        { id: source.id, sortOrder: 1 },
        { id: target.id, sortOrder: 2 },
      ],
    );
    const sourceAfter = agents.get(1, project.id, source.id);
    assert.deepEqual(sourceAfter?.data, sourceBefore?.data);
    assert.equal(sourceAfter?.nextAgentId, target.id);
    assert.deepEqual(sourceAfter?.skillIds, [skillId]);
    assert.deepEqual(sourceAfter?.toolNames, ['visit_website']);
    db.close();
  });

  it('defaults attachedProjectFiles to empty array and persists supplied paths with order', () => {
    const db = createTestDatabase();
    const projects = new ProjectRepository(db);
    const agents = new AgentRepository(db);
    const project = projects.create(1, { name: 'Project', description: '' });
    const baseData = { ...data, attachedProjectFiles: ['docs/spec.md', 'context/domain.txt'] };
    const created = agents.create(project.id, baseData);
    assert.deepEqual(created.data.attachedProjectFiles, ['docs/spec.md', 'context/domain.txt']);
    const stored = JSON.parse(
      (db.prepare('SELECT data FROM agents WHERE id = ?').get(created.id) as { data: string }).data,
    ) as Record<string, unknown>;
    assert.deepEqual(stored.attachedProjectFiles, ['docs/spec.md', 'context/domain.txt']);
    db.close();
  });

  it('defaults legacy JSON without attachedProjectFiles to empty array', () => {
    const db = createTestDatabase();
    const projects = new ProjectRepository(db);
    const agents = new AgentRepository(db);
    const project = projects.create(1, { name: 'Project', description: '' });
    const legacyData = {
      name: 'Legacy',
      description: '',
      instructions: '',
      modelConnectionId: 3,
      modelId: 'model-a',
      allowModelSelection: false,
    };
    const legacyId = Number(
      db
        .prepare('INSERT INTO agents (project_id, created_at, updated_at, data) VALUES (?, 1, 1, ?)')
        .run(project.id, JSON.stringify(legacyData)).lastInsertRowid,
    );
    const agent = agents.get(1, project.id, legacyId);
    assert.ok(agent);
    assert.deepEqual(agent.data.attachedProjectFiles, []);
    db.close();
  });

  it('rejects invalid attachedProjectFiles data', () => {
    const db = createTestDatabase();
    const projects = new ProjectRepository(db);
    const agents = new AgentRepository(db);
    const project = projects.create(1, { name: 'Project', description: '' });
    const nullData = { ...data, attachedProjectFiles: null };
    const idNull = Number(
      db
        .prepare('INSERT INTO agents (project_id, created_at, updated_at, data) VALUES (?, 1, 1, ?)')
        .run(project.id, JSON.stringify(nullData)).lastInsertRowid,
    );
    assert.throws(() => agents.get(1, project.id, idNull), /Invalid agent data/);
    const objectData = { ...data, attachedProjectFiles: { notAnArray: true } };
    const idObj = Number(
      db
        .prepare('INSERT INTO agents (project_id, created_at, updated_at, data) VALUES (?, 1, 1, ?)')
        .run(project.id, JSON.stringify(objectData)).lastInsertRowid,
    );
    assert.throws(() => agents.get(1, project.id, idObj), /Invalid agent data/);
    const mixedArray = { ...data, attachedProjectFiles: ['valid', 123] };
    const idMix = Number(
      db
        .prepare('INSERT INTO agents (project_id, created_at, updated_at, data) VALUES (?, 1, 1, ?)')
        .run(project.id, JSON.stringify(mixedArray)).lastInsertRowid,
    );
    assert.throws(() => agents.get(1, project.id, idMix), /Invalid agent data/);
    db.close();
  });

  it('defaults unloadModelAfterRun to false for legacy agents', () => {
    const db = createTestDatabase();
    const projects = new ProjectRepository(db);
    const agents = new AgentRepository(db);
    const project = projects.create(1, { name: 'Project', description: '' });
    const agentData = { ...data };
    delete (agentData as Record<string, unknown>).unloadModelAfterRun;
    const id = Number(
      db
        .prepare('INSERT INTO agents (project_id, next_agent_id, sort_order, created_at, updated_at, data) VALUES (?, ?, 0, 1, 1, ?)')
        .run(project.id, null, JSON.stringify(agentData)).lastInsertRowid,
    );
    const agent = agents.get(1, project.id, id);
    assert.equal(agent?.data.unloadModelAfterRun, false);
    db.close();
  });

  it('persists unloadModelAfterRun=true and isolates per-Agent', () => {
    const db = createTestDatabase();
    const projects = new ProjectRepository(db);
    const agents = new AgentRepository(db);
    const project = projects.create(1, { name: 'Project', description: '' });
    const agentWithUnload = agents.create(project.id, { ...data, name: 'UnloadAgent', unloadModelAfterRun: true });
    const agentWithoutUnload = agents.create(project.id, { ...data, name: 'KeepAgent' });
    assert.equal(agentWithUnload.data.unloadModelAfterRun, true);
    assert.equal(agentWithoutUnload.data.unloadModelAfterRun, false);

    const updated = agents.update(1, project.id, agentWithoutUnload.id, {
      ...agentWithoutUnload.data,
      unloadModelAfterRun: true,
    });
    assert.ok(updated);
    assert.equal(updated!.data.unloadModelAfterRun, true);
    const stillTrue = agents.get(1, project.id, agentWithUnload.id);
    assert.equal(stillTrue?.data.unloadModelAfterRun, true);

    db.close();
  });

  it('rejects invalid unloadModelAfterRun types', () => {
    const db = createTestDatabase();
    const projects = new ProjectRepository(db);
    const agents = new AgentRepository(db);
    const project = projects.create(1, { name: 'Project', description: '' });
    for (const badValue of [null, 'true', 1, '', {}]) {
      const badData = { ...data, unloadModelAfterRun: badValue };
      const id = Number(
        db
          .prepare('INSERT INTO agents (project_id, created_at, updated_at, data) VALUES (?, 1, 1, ?)')
          .run(project.id, JSON.stringify(badData)).lastInsertRowid,
      );
      assert.throws(() => agents.get(1, project.id, id), /Invalid agent data/);
    }
    db.close();
  });
});
